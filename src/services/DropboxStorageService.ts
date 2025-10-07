import { Dropbox } from 'dropbox';
import type { DropboxResponse, files } from 'dropbox';
import { DropboxAuthService } from './DropboxAuthService';
import type { CloudStorage, CloudFileData } from './CloudStorage';
import { CloudSyncError } from './CloudStorage';

export class DropboxSyncError extends CloudSyncError {
  constructor(message: string, options?: ErrorOptions) {
    super('dropbox', message, options);
    this.name = 'DropboxSyncError';
  }
}

export type DropboxFileData = CloudFileData;

type DropboxErrorShape = {
  error?: {
    ['.tag']?: string;
    path?: { ['.tag']?: string };
    path_lookup?: { ['.tag']?: string };
  };
  ['.tag']?: string;
  status?: number;
  error_summary?: string;
  message?: string;
};

/**
 * Handles storing files in Dropbox to mirror local storage.
 */
export class DropboxStorageService implements CloudStorage {
  readonly provider = 'dropbox' as const;
  private readonly authService: DropboxAuthService;
  private dropbox: Dropbox | null = null;
  private currentToken: string | null = null;

  constructor(authService: DropboxAuthService = new DropboxAuthService()) {
    this.authService = authService;
  }

  /**
   * Returns true when the Dropbox app key is available.
   */
  isAvailable(): boolean {
    return this.authService.hasAppKey();
  }

  /**
   * Returns true when the user has an active access token.
   */
  isReady(): boolean {
    return this.authService.isAuthenticated();
  }

  async uploadFile(fileName: string, content: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      throw new DropboxSyncError('Dropbox client not available - check authentication');
    }

    const path = this.buildPath(fileName);
    const mode: files.WriteMode = { '.tag': 'overwrite' };

    try {
      await client.filesUpload({
        path,
        contents: content,
        mode,
        mute: true
      });
    } catch (error) {
      console.error('Dropbox upload error:', error);
      const message = error instanceof Error ? error.message : 'Unknown Dropbox error';
      throw new DropboxSyncError(`Failed to upload file "${fileName}": ${message}`, { cause: error });
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      return;
    }

    const primaryPath = this.buildPath(fileName);

    try {
      await client.filesDeleteV2({ path: primaryPath });
      return;
    } catch (error) {
      if (this.isPathNotFoundError(error)) {
        return;
      }

      // If the direct delete failed, try to resolve the path via listing.
      const resolvedPath = await this.resolvePathByName(client, fileName);
      if (resolvedPath) {
        try {
          await client.filesDeleteV2({ path: resolvedPath });
          return;
        } catch (retryError) {
          if (this.isPathNotFoundError(retryError)) {
            return;
          }
          throw retryError;
        }
      }

      throw error;
    }
  }

  async fetchFiles(): Promise<DropboxFileData[]> {
    const client = this.getClient();
    if (!client) {
      return [];
    }

    const filesData: DropboxFileData[] = [];
    let cursor: string | null = null;

    try {
      do {
        const response: DropboxResponse<files.ListFolderResult> = cursor
          ? await client.filesListFolderContinue({ cursor })
          : await client.filesListFolder({ path: '' });

        const { entries, has_more: hasMore, cursor: nextCursor } = response.result;

        const fileEntries = entries.filter(
          (entry): entry is files.FileMetadataReference => entry['.tag'] === 'file'
        );

        for (const entry of fileEntries) {
          const downloadPath = entry.path_lower ?? entry.path_display ?? this.buildPath(entry.name);
          const identifier = entry.id ?? downloadPath;

          let downloadResult: DropboxDownloadResult | null = null;
          try {
            const downloadResponse = await client.filesDownload({ path: identifier });
            downloadResult = downloadResponse.result as DropboxDownloadResult;
          } catch (downloadError) {
            const missingScopes = this.extractMissingScopes(downloadError);
            if (missingScopes) {
              this.authService.signOut();
              throw new DropboxSyncError(
                `Dropbox access is missing required scopes (${missingScopes.join(', ')}). Please reconnect to Dropbox.`,
                { cause: downloadError instanceof Error ? downloadError : undefined }
              );
            }

            if (this.isPathNotFoundError(downloadError)) {
              console.warn(`Dropbox file missing during download, skipping: ${entry.name}`);
              continue;
            }

            console.error('Dropbox download error:', this.debugError(downloadError));
            continue;
          }

          const blob =
            downloadResult.fileBlob ??
            (downloadResult.fileBinary instanceof ArrayBuffer
              ? new Blob([downloadResult.fileBinary])
              : null);

          if (!blob) {
            console.warn(`Unable to read Dropbox file content for ${entry.name}`);
            continue;
          }

          let content: string;
          try {
            content = await blob.text();
          } catch (blobError) {
            console.error(`Failed to read blob for ${entry.name}:`, blobError);
            continue;
          }

          filesData.push({
            name: entry.name,
            path: downloadPath,
            clientModified: entry.client_modified ?? null,
            size: entry.size,
            content
          });
        }

        cursor = hasMore ? nextCursor ?? null : null;
      } while (cursor);
    } catch (error) {
      const missingScopes = this.extractMissingScopes(error);
      if (missingScopes) {
        this.authService.signOut();
        throw new DropboxSyncError(
          `Dropbox access is missing required scopes (${missingScopes.join(', ')}). Please reconnect to Dropbox.`,
          { cause: error instanceof Error ? error : undefined }
        );
      }

      console.error('Failed to fetch files from Dropbox:', this.debugError(error));
      throw new DropboxSyncError(
        `Failed to fetch files from Dropbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }

    return filesData;
  }

  private getClient(): Dropbox | null {
    const token = this.authService.getAccessToken();
    if (!token) {
      this.dropbox = null;
      this.currentToken = null;
      return null;
    }

    if (!this.dropbox || this.currentToken !== token) {
      console.log('Initializing Dropbox client with token:', token.substring(0, 10) + '...');
      this.dropbox = new Dropbox({ accessToken: token });
      this.currentToken = token;
    }

    return this.dropbox;
  }

  private isPathNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Handle different Dropbox API error structures
    const errorObj = error as DropboxErrorShape;

    // Check for path not found errors in different formats
    const errorTag = errorObj.error?.['.tag'] ?? errorObj?.['.tag'];
    if (errorTag === 'path_lookup' || errorTag === 'path') {
      // Dropbox sometimes nests the actual reason under error.path
      if (errorObj.error?.path?.['.tag'] === 'not_found') {
        return true;
      }
      if (errorObj.error?.path_lookup?.['.tag'] === 'not_found') {
        return true;
      }
      return true;
    }

    // Check for path not found in the main error object
    if (errorObj?.['.tag'] === 'path_lookup' || errorObj?.['.tag'] === 'path') {
      return true;
    }

    // Check for HTTP status and error summaries that indicate a missing folder
    const summary = typeof errorObj.error_summary === 'string' ? errorObj.error_summary.toLowerCase() : '';
    const message = typeof errorObj.message === 'string' ? errorObj.message.toLowerCase() : '';
    if (
      errorObj.status === 404 ||
      (errorObj.status === 409 && summary.includes('not_found')) ||
      summary.includes('not_found') ||
      message.includes('not found')
    ) {
      return true;
    }

    return false;
  }

  private debugError(error: unknown): unknown {
    if (!error || typeof error !== 'object') {
      return error;
    }

    const errorObj = error as DropboxErrorShape & {
      error_summary?: string;
      error?: unknown;
    };

    const summary = errorObj.error_summary;
    const message = errorObj.message;
    const status = errorObj.status;
    const nested = errorObj.error && typeof errorObj.error === 'object'
      ? JSON.stringify(errorObj.error, null, 2)
      : undefined;

    return {
      status,
      summary,
      message,
      nested,
      original: error
    };
  }

  private extractMissingScopes(error: unknown): string[] | null {
    if (!error || typeof error !== 'object') {
      return null;
    }

    const scopes = new Set<string>();
    const extract = (value: unknown): void => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const obj = value as Record<string, unknown>;
      const tag = typeof obj['.tag'] === 'string' ? obj['.tag'] : undefined;

      if (tag === 'missing_scope') {
        const missing = obj['missing_scope'] ?? obj['required_scope'];
        if (typeof missing === 'string') {
          scopes.add(missing);
        } else if (Array.isArray(missing)) {
          missing.forEach(scope => {
            if (typeof scope === 'string') {
              scopes.add(scope);
            }
          });
        }
      }

      if (typeof obj['missing_scope'] === 'string') {
        scopes.add(obj['missing_scope'] as string);
      } else if (Array.isArray(obj['missing_scope'])) {
        (obj['missing_scope'] as unknown[]).forEach(scope => {
          if (typeof scope === 'string') {
            scopes.add(scope);
          }
        });
      }

      // Inspect nested objects that commonly hold error data
      const nestedKeys = ['error', 'reason', 'error_inner', 'cause'];
      for (const key of nestedKeys) {
        if (key in obj) {
          extract(obj[key]);
        }
      }
    };

    const base = error as DropboxErrorShape & { error_summary?: string; error?: unknown };
    const summary = typeof base.error_summary === 'string' ? base.error_summary : '';
    if (summary.startsWith('missing_scope/')) {
      const parts = summary.split('/').slice(1).map(part => part.trim()).filter(Boolean);
      parts.forEach(part => scopes.add(part));
    }

    extract(base.error);

    return scopes.size > 0 ? Array.from(scopes) : null;
  }

  private buildPath(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) {
      throw new DropboxSyncError('File name is required to build a Dropbox path.');
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/');
  }

  private async resolvePathByName(client: Dropbox, fileName: string): Promise<string | null> {
    try {
      const folderPath = '';
      let cursor: string | null = null;

      do {
        const response: DropboxResponse<files.ListFolderResult> = cursor
          ? await client.filesListFolderContinue({ cursor })
          : await client.filesListFolder({ path: folderPath });
        const { entries, has_more: hasMore, cursor: nextCursor } = response.result;

        const match = entries.find(
          (entry): entry is files.FileMetadataReference =>
            entry['.tag'] === 'file' && entry.name === fileName
        );
        if (match) {
          return match.path_display ?? match.path_lower ?? null;
        }

        cursor = hasMore ? nextCursor : null;
      } while (cursor);
    } catch (error) {
      console.warn('Failed to resolve Dropbox path by name:', error);
    }

    return null;
  }

}
type DropboxDownloadResult = files.FileMetadata & {
  fileBlob?: Blob;
  fileBinary?: ArrayBuffer;
};
