import { Dropbox } from 'dropbox';
import type { files } from 'dropbox';
import { DropboxAuthService } from './DropboxAuthService';

export class DropboxSyncError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DropboxSyncError';
  }
}

/**
 * Handles storing files in Dropbox to mirror local storage.
 */
export class DropboxStorageService {
  private readonly authService: DropboxAuthService;
  private readonly basePath: string;
  private dropbox: Dropbox | null = null;
  private currentToken: string | null = null;
  private folderEnsured = false;

  constructor(authService: DropboxAuthService = new DropboxAuthService()) {
    this.authService = authService;
    // Scoped apps can store directly at the root; allow empty base path by default.
    this.basePath = this.normaliseBasePath(import.meta.env.VITE_DROPBOX_BASE_PATH);
    if (this.basePath === '') {
      this.folderEnsured = true;
    }
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

  /**
   * Test the Dropbox connection and permissions
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const client = this.getClient();
    if (!client) {
      return { success: false, message: 'No Dropbox client available - check authentication' };
    }

    const tempFileName = this.buildTempFileName();
    const tempFilePath = this.buildPath(tempFileName);

    try {
      await this.ensureFolder(client);

      // Attempt to write a tiny test file to ensure we have write access.
      const uploadResult = await client.filesUpload({
        path: tempFilePath,
        contents: 'Dropbox connection test',
        mode: { '.tag': 'add' },
        autorename: false,
        mute: true
      });

      const finalPath = uploadResult?.path_display ?? tempFilePath;

      return {
        success: true,
        message: `Dropbox connection verified with write access. Test file created at: ${finalPath}`
      };
    } catch (error) {
      console.error('Dropbox connection test failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Connection test failed: ${message}` };
    }
  }

  async uploadFile(fileName: string, content: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      throw new DropboxSyncError('Dropbox client not available - check authentication');
    }

    try {
      await this.ensureFolder(client);
    } catch (error) {
      console.error('Failed to ensure folder:', error);
      throw new DropboxSyncError(`Failed to create/access folder: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
    }

    const path = this.buildPath(fileName);
    const mode: files.WriteMode = { '.tag': 'overwrite' };

    try {
      console.log(`Attempting to upload file: ${path}`);
      await client.filesUpload({
        path,
        contents: content,
        mode,
        mute: true
      });
      console.log(`Successfully uploaded file: ${path}`);
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

  async clearAll(): Promise<void> {
    const client = this.getClient();
    if (!client) {
      return;
    }

    try {
      if (!this.basePath) {
        console.warn('No base path configured for Dropbox clearAll; skipping remote deletion.');
        return;
      }

      await client.filesDeleteV2({ path: this.basePath });
      this.folderEnsured = false;
    } catch (error) {
      if (!this.isPathNotFoundError(error)) {
        throw error;
      }
    }
  }

  private getClient(): Dropbox | null {
    const token = this.authService.getAccessToken();
    if (!token) {
      this.dropbox = null;
      this.currentToken = null;
      this.folderEnsured = false;
      return null;
    }

    if (!this.dropbox || this.currentToken !== token) {
      console.log('Initializing Dropbox client with token:', token.substring(0, 10) + '...');
      this.dropbox = new Dropbox({ accessToken: token });
      this.currentToken = token;
      this.folderEnsured = false;
    }

    return this.dropbox;
  }

  private async ensureFolder(client: Dropbox): Promise<void> {
    if (this.folderEnsured) {
      return;
    }

    if (this.basePath === '' || this.basePath === '/') {
      this.folderEnsured = true;
      return;
    }

    console.log(`Ensuring Dropbox folder exists: ${this.basePath}`);

    try {
      await client.filesCreateFolderV2({ path: this.basePath, autorename: false });
      console.log(`Successfully created folder: ${this.basePath}`);
      this.folderEnsured = true;
    } catch (error) {
      console.error('Folder creation error:', error);
      if (this.isFolderAlreadyExistsError(error)) {
        console.log(`Folder already exists: ${this.basePath}`);
        this.folderEnsured = true;
        return;
      }

      if (this.isPathNotFoundError(error)) {
        console.log(`Parent path missing for ${this.basePath}`);
      }

      throw error;
    }
  }

  private isPathNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Handle different Dropbox API error structures
    const errorObj = error as any;

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

  private isFolderAlreadyExistsError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorObj = error as any;

    if (errorObj.error?.['.tag'] === 'path' && errorObj.error?.path?.['.tag'] === 'conflict') {
      return true;
    }

    if (errorObj?.status === 409 && errorObj.error_summary?.includes('conflict')) {
      return true;
    }

    return false;
  }

  private buildTempFileName(): string {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    return `connection-test-${random}.txt`;
  }

  private buildPath(fileName: string): string {
    const rawPath = `${this.basePath}/${fileName}`;
    return rawPath === '/' ? `/${fileName}` : rawPath.replace(/\/{2,}/g, '/');
  }

  private async resolvePathByName(client: Dropbox, fileName: string): Promise<string | null> {
    try {
      const folderPath = this.basePath === '' ? '' : this.basePath;
      let cursor: string | null = null;

      do {
        const result = cursor
          ? await client.filesListFolderContinue({ cursor })
          : await client.filesListFolder({ path: folderPath });

        const match = result.entries.find(entry => entry.name === fileName);
        if (match) {
          return match.path_display ?? match.path_lower ?? null;
        }

        cursor = result.has_more ? result.cursor : null;
      } while (cursor);
    } catch (error) {
      console.warn('Failed to resolve Dropbox path by name:', error);
    }

    return null;
  }

  private normaliseBasePath(path: string | undefined | null): string {
    if (!path) {
      return '';
    }

    const trimmed = path.trim();
    if (trimmed === '' || trimmed === '/') {
      return '';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+$/, '');
  }
}
