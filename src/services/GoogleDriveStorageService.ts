import type { CloudFileData, CloudStorage } from './CloudStorage';
import { CloudSyncError } from './CloudStorage';
import { GoogleDriveAuthService } from './GoogleDriveAuthService';
import { GOOGLE_DRIVE_FOLDER_NAME } from './CloudConfig';

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

export class GoogleDriveSyncError extends CloudSyncError {
  constructor(message: string, options?: ErrorOptions) {
    super('googleDrive', message, options);
    this.name = 'GoogleDriveSyncError';
  }
}

export class GoogleDriveStorageService implements CloudStorage {
  readonly provider = 'googleDrive' as const;
  private readonly authService: GoogleDriveAuthService;
  private readonly fileIdCache = new Map<string, string>();
  private folderId: string | null = null;
  private folderIdPromise: Promise<string> | null = null;

  constructor(authService: GoogleDriveAuthService = new GoogleDriveAuthService()) {
    this.authService = authService;
  }

  isAvailable(): boolean {
    return this.authService.isAvailable();
  }

  isReady(): boolean {
    return this.authService.isAuthenticated();
  }

  async uploadFile(fileName: string, content: string): Promise<void> {
    const token = await this.getAccessToken();
    const folderId = await this.ensureFolderId(token);
    const boundary = `boundary-${Math.random().toString(16).slice(2)}`;

    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    const multipartRequestBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      content,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const fileId = await this.findFileId(fileName, token, folderId);
    const method = fileId ? 'PATCH' : 'POST';
    const uploadUrl = fileId
      ? `${DRIVE_UPLOAD_ENDPOINT}/${fileId}?uploadType=multipart&supportsAllDrives=false`
      : `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&supportsAllDrives=false`;

    const response = await fetch(uploadUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!response.ok) {
      const errorText = await this.safeReadError(response);
      throw new GoogleDriveSyncError(
        `Failed to upload file "${fileName}" to Google Drive: ${errorText}`,
        { cause: errorText }
      );
    }

    const result = await response.json();
    if (result?.id) {
      this.fileIdCache.set(fileName, result.id as string);
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    const token = this.authService.getAccessToken();
    if (!token) {
      return;
    }

    const folderId = await this.ensureFolderId(token);
    const fileId = await this.findFileId(fileName, token, folderId);
    if (!fileId) {
      return;
    }

    const response = await fetch(`${DRIVE_FILES_ENDPOINT}/${fileId}?supportsAllDrives=false`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await this.safeReadError(response);
      throw new GoogleDriveSyncError(
        `Failed to delete file "${fileName}" from Google Drive: ${errorText}`,
        { cause: errorText }
      );
    }

    this.fileIdCache.delete(fileName);
  }

  async fetchFiles(): Promise<CloudFileData[]> {
    const token = await this.getAccessToken();
    const folderId = await this.ensureFolderId(token);
    const files: CloudFileData[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        fields: 'nextPageToken,files(id,name,modifiedTime,size)',
        pageSize: '50'
      });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      params.set('q', `'${folderId}' in parents and trashed = false`);
      params.set('spaces', 'drive');

      const response = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await this.safeReadError(response);
        throw new GoogleDriveSyncError(
          `Failed to list files from Google Drive: ${errorText}`,
          { cause: errorText }
        );
      }

      const payload = await response.json() as {
        nextPageToken?: string;
        files?: Array<{ id: string; name: string; modifiedTime?: string; size?: string | number }>;
      };

      const remoteFiles = payload.files ?? [];
      for (const remote of remoteFiles) {
        this.fileIdCache.set(remote.name, remote.id);

        const downloadUrl = `${DRIVE_FILES_ENDPOINT}/${remote.id}?alt=media`;
        const downloadResponse = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!downloadResponse.ok) {
          const errorText = await this.safeReadError(downloadResponse);
          console.warn(`Failed to download Google Drive file "${remote.name}": ${errorText}`);
          continue;
        }

        const content = await downloadResponse.text();
        const size = typeof remote.size === 'string' ? Number.parseInt(remote.size, 10) : remote.size ?? content.length;

        files.push({
          name: remote.name,
          path: `appDataFolder/${remote.id}`,
          clientModified: remote.modifiedTime ?? null,
          size: Number.isFinite(size) ? Number(size) : content.length,
          content
        });
      }

      pageToken = payload.nextPageToken;
    } while (pageToken);

    return files;
  }

  private async getAccessToken(): Promise<string> {
    try {
      return await this.authService.ensureAccessToken();
    } catch (error) {
      if (error instanceof CloudSyncError) {
        throw error;
      }

      throw new GoogleDriveSyncError(
        error instanceof Error ? error.message : 'Unknown Google Drive authentication error',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async findFileId(fileName: string, token: string, folderId: string): Promise<string | null> {
    const cached = this.fileIdCache.get(fileName);
    if (cached) {
      return cached;
    }

    const query = [
      `name = '${fileName.replace(/'/g, "\\'")}'`,
      `'${folderId}' in parents`,
      'trashed = false'
    ].join(' and ');

    const params = new URLSearchParams({
      spaces: 'drive',
      q: query,
      fields: 'files(id,name)',
      pageSize: '1'
    });

    const response = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await this.safeReadError(response);
      throw new GoogleDriveSyncError(
        `Failed to query Google Drive for "${fileName}": ${errorText}`,
        { cause: errorText }
      );
    }

    const payload = await response.json() as { files?: Array<{ id: string; name: string }> };
    const file = payload.files?.[0];
    if (!file) {
      return null;
    }

    this.fileIdCache.set(fileName, file.id);
    return file.id;
  }

  private async ensureFolderId(token: string): Promise<string> {
    if (this.folderId) {
      return this.folderId;
    }
    if (this.folderIdPromise) {
      return this.folderIdPromise;
    }

    this.folderIdPromise = (async () => {
      const escapedName = GOOGLE_DRIVE_FOLDER_NAME.replace(/'/g, "\\'");
      const params = new URLSearchParams({
        q: `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`,
        fields: 'files(id,name)',
        pageSize: '1',
        spaces: 'drive'
      });

      const lookupResponse = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!lookupResponse.ok) {
        const errorText = await this.safeReadError(lookupResponse);
        throw new GoogleDriveSyncError(
          `Failed to locate Google Drive folder "${GOOGLE_DRIVE_FOLDER_NAME}": ${errorText}`,
          { cause: errorText }
        );
      }

      const lookupPayload = await lookupResponse.json() as { files?: Array<{ id: string }> };
      const existing = lookupPayload.files?.[0]?.id;
      if (existing) {
        this.folderId = existing;
        return existing;
      }

      const createResponse = await fetch(DRIVE_FILES_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: GOOGLE_DRIVE_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root']
        })
      });

      if (!createResponse.ok) {
        const errorText = await this.safeReadError(createResponse);
        throw new GoogleDriveSyncError(
          `Failed to create Google Drive folder "${GOOGLE_DRIVE_FOLDER_NAME}": ${errorText}`,
          { cause: errorText }
        );
      }

      const created = await createResponse.json() as { id?: string };
      if (!created.id) {
        throw new GoogleDriveSyncError(
          `Google Drive did not return an ID for the created folder "${GOOGLE_DRIVE_FOLDER_NAME}".`
        );
      }

      this.folderId = created.id;
      return created.id;
    })();

    try {
      return await this.folderIdPromise;
    } finally {
      this.folderIdPromise = null;
    }
  }

  private async safeReadError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text || response.statusText || 'Unknown error';
    } catch {
      return response.statusText || 'Unknown error';
    }
  }
}
