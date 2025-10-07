import type { CloudProvider, CloudStorage } from './CloudStorage';
import { CloudSyncError } from './CloudStorage';

export interface StoredFile {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  size: number;
  syncedProvider: CloudProvider | null;
  syncedToDropbox: boolean;
}

export type ListFilesResult = {
  files: StoredFile[];
  conflicts: StoredFile[];
};

export class FileStorageService {
  private readonly STORAGE_KEY = 'pwa_files';
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
  private readonly MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total
  private cloudStorage: CloudStorage | null;

  constructor(cloudStorage?: CloudStorage) {
    this.cloudStorage = cloudStorage ?? null;
  }

  setCloudStorage(storage?: CloudStorage | null): void {
    this.cloudStorage = storage ?? null;
  }

  getCloudStorage(): CloudStorage | null {
    return this.cloudStorage;
  }

  /**
   * Save a file to localStorage
   */
  async saveFile(fileName: string, content: string): Promise<void> {
    // Validate input
    if (!fileName || !fileName.trim()) {
      throw new Error('File name is required');
    }

    if (!content || !content.trim()) {
      throw new Error('File content is required');
    }

    // Check file size
    const contentSize = new Blob([content]).size;
    if (contentSize > this.MAX_FILE_SIZE) {
      throw new Error(`File size (${this.formatBytes(contentSize)}) exceeds maximum allowed size (${this.formatBytes(this.MAX_FILE_SIZE)})`);
    }

    try {
      // Get existing files
      const { files: existingFiles } = await this.getSyncedFiles();

      // Check if file already exists
      const existingIndex = existingFiles.findIndex(file => file.name === fileName);

      // Check total storage size
      const currentTotalSize = existingFiles.reduce((total, file) => total + file.size, 0);
      if (existingIndex === -1 && currentTotalSize + contentSize > this.MAX_TOTAL_SIZE) {
        throw new Error(`Adding this file would exceed storage limit. Current usage: ${this.formatBytes(currentTotalSize)}, Limit: ${this.formatBytes(this.MAX_TOTAL_SIZE)}`);
      }

      const previousProvider = existingIndex !== -1
        ? existingFiles[existingIndex].syncedProvider ??
          (existingFiles[existingIndex].syncedToDropbox ? 'dropbox' : null)
        : null;

      // Create new file object
      const fileObject: StoredFile = {
        id: existingIndex !== -1 ? existingFiles[existingIndex].id : this.generateId(),
        name: fileName,
        content,
        createdAt: existingIndex !== -1 ? existingFiles[existingIndex].createdAt : new Date().toISOString(),
        size: contentSize,
        syncedProvider: previousProvider,
        syncedToDropbox: previousProvider === 'dropbox'
      };

      // Update or add file
      if (existingIndex !== -1) {
        existingFiles[existingIndex] = fileObject;
      } else {
        existingFiles.push(fileObject);
      }

      // Save to localStorage
      this.writeToLocalStorage(existingFiles);

      // Mirror file to active cloud provider if configured
      const syncResult = await this.syncToCloud(fileName, content);
      const previousSyncedProvider = fileObject.syncedProvider ?? null;

      if (syncResult.status === 'synced') {
        fileObject.syncedProvider = syncResult.provider;
      } else if (syncResult.status === 'failed') {
        fileObject.syncedProvider = null;
      }

      fileObject.syncedToDropbox = fileObject.syncedProvider === 'dropbox';

      if (
        previousSyncedProvider !== fileObject.syncedProvider ||
        fileObject.syncedToDropbox !== (previousSyncedProvider === 'dropbox')
      ) {
        this.writeToLocalStorage(existingFiles);
      }

      if (syncResult.status === 'failed') {
        throw syncResult.error;
      }

    } catch (error) {
      if (error instanceof CloudSyncError) {
        throw error;
      }

      if (error instanceof Error) {
        // Check for storage quota exceeded
        if (error.name === 'QuotaExceededError' || error.message.includes('storage')) {
          throw new Error('Storage quota exceeded. Please delete some files and try again.');
        }
        throw error;
      }
      throw new Error('Failed to save file');
    }
  }

  /**
   * Load a file from localStorage
   */
  async loadFile(fileName: string): Promise<string> {
    if (!fileName || !fileName.trim()) {
      throw new Error('File name is required');
    }

    const files = await this.getStoredFiles();
    const file = files.find(f => f.name === fileName);

    if (!file) {
      throw new Error(`File "${fileName}" not found`);
    }

    return file.content;
  }

  /**
   * List all saved files
   */
  async listFiles(): Promise<ListFilesResult> {
    try {
      return await this.getSyncedFiles();
    } catch (error) {
      console.error('Error listing files:', error);
      return { files: [], conflicts: [] };
    }
  }

  /**
   * Delete a specific file
   */
  async deleteFile(fileName: string): Promise<void> {
    if (!fileName || !fileName.trim()) {
      throw new Error('File name is required');
    }

    const files = await this.getStoredFiles();
    const filteredFiles = files.filter(file => file.name !== fileName);

    if (filteredFiles.length === files.length) {
      throw new Error(`File "${fileName}" not found`);
    }

    this.writeToLocalStorage(filteredFiles);

    const storage = this.getAvailableCloudStorage();
    if (!storage) {
      return;
    }

    try {
      await storage.deleteFile(fileName);
    } catch (error) {
      console.error(`Failed to delete file from ${storage.provider}:`, error);
    }
  }

  /**
   * Clear all saved files
   */
  async clearAll(): Promise<void> {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      throw new Error('Failed to clear files');
    }
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    used: number;
    available: number;
    total: number;
    fileCount: number;
  }> {
    const files = await this.getStoredFiles();
    const used = files.reduce((total, file) => total + file.size, 0);
    const fileCount = files.length;

    // Estimate available space (this is approximate)
    const available = Math.max(0, this.MAX_TOTAL_SIZE - used);

    return {
      used,
      available,
      total: this.MAX_TOTAL_SIZE,
      fileCount
    };
  }

  /**
   * Check if a file exists
   */
  async fileExists(fileName: string): Promise<boolean> {
    const files = await this.getStoredFiles();
    return files.some(file => file.name === fileName);
  }

  /**
   * Get file metadata
   */
  async getFileInfo(fileName: string): Promise<StoredFile | null> {
    const files = await this.getStoredFiles();
    return files.find(file => file.name === fileName) || null;
  }

  /**
   * Upload a locally stored file that is missing remotely.
   */
  async uploadLocalOnlyFile(file: StoredFile): Promise<void> {
    const storage = this.getAvailableCloudStorage();
    if (!storage || !storage.isReady()) {
      throw new CloudSyncError(
        storage?.provider ?? 'dropbox',
        'Cloud storage is not connected. Please connect before uploading.'
      );
    }

    try {
      await storage.uploadFile(file.name, file.content);
      await this.getSyncedFiles();
    } catch (error) {
      if (error instanceof CloudSyncError) {
        throw error;
      }

      throw new CloudSyncError(
        storage.provider,
        error instanceof Error ? error.message : 'Unknown cloud storage error during upload',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Discard a locally stored file that is missing remotely.
   */
  discardLocalOnlyFile(fileName: string): void {
    const localFiles = this.readLocalStorage().filter(file => file.name !== fileName);
    this.writeToLocalStorage(localFiles);
  }

  /**
   * Private method to get stored files from localStorage and ensure Dropbox sync.
   */
  private async getStoredFiles(): Promise<StoredFile[]> {
    const { files } = await this.getSyncedFiles();
    return files;
  }

  private async getSyncedFiles(): Promise<ListFilesResult> {
    const localFiles = this.readLocalStorage();
    return this.syncFromCloud(localFiles);
  }

  private readLocalStorage(): StoredFile[] {
    let localFiles: StoredFile[] = [];

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed: StoredFile[] = JSON.parse(stored);
        localFiles = parsed
          .filter(file =>
            file &&
            typeof file === 'object' &&
            typeof file.id === 'string' &&
            typeof file.name === 'string' &&
            typeof file.content === 'string' &&
            typeof file.createdAt === 'string' &&
            typeof file.size === 'number'
          )
          .map(file => {
            const stored = file as Partial<StoredFile>;
            const inferredProvider = stored.syncedProvider ??
              (stored.syncedToDropbox ? 'dropbox' : null);
            return {
              ...file,
              syncedProvider: inferredProvider ?? null,
              syncedToDropbox: inferredProvider === 'dropbox'
            };
          });
      }
    } catch (error) {
      console.error('Error reading stored files:', error);
      localStorage.removeItem(this.STORAGE_KEY);
      localFiles = [];
    }

    return localFiles;
  }

  private writeToLocalStorage(files: StoredFile[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(files));
  }

  /**
   * Generate a unique ID for files
   */
  private generateId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format bytes into human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private getAvailableCloudStorage(): CloudStorage | null {
    if (!this.cloudStorage) {
      return null;
    }

    if (!this.cloudStorage.isAvailable()) {
      return null;
    }

    return this.cloudStorage;
  }

  private async syncToCloud(
    fileName: string,
    content: string
  ): Promise<
    | { status: 'skipped' }
    | { status: 'synced'; provider: CloudProvider }
    | { status: 'failed'; error: CloudSyncError }
  > {
    const storage = this.getAvailableCloudStorage();
    if (!storage || !storage.isReady()) {
      console.warn('Cloud storage not ready, skipping sync');
      return { status: 'skipped' };
    }

    try {
      console.log(`Syncing file to ${storage.provider}: ${fileName}`);
      await storage.uploadFile(fileName, content);
      console.log(`Successfully synced file to ${storage.provider}: ${fileName}`);
      return { status: 'synced', provider: storage.provider };
    } catch (error) {
      console.error(`Failed to sync file to ${storage.provider}: ${fileName}`, error);
      const cloudError = error instanceof CloudSyncError
        ? error
        : new CloudSyncError(
          storage.provider,
          error instanceof Error ? error.message : 'Unknown cloud storage error',
          { cause: error instanceof Error ? error : undefined }
        );
      return { status: 'failed', error: cloudError };
    }
  }

  private async syncFromCloud(existingFiles: StoredFile[]): Promise<ListFilesResult> {
    const storage = this.getAvailableCloudStorage();
    if (!storage || !storage.isReady()) {
      return {
        files: existingFiles,
        conflicts: []
      };
    }

    try {
      const remoteFiles = await storage.fetchFiles();

      const localFilesMap = new Map(existingFiles.map(file => [file.name, file]));
      const remoteFilesMap = new Map(remoteFiles.map(file => [file.name, file]));

      const mergedFiles: StoredFile[] = [];
      const conflicts: StoredFile[] = [];

      for (const localFile of existingFiles) {
        const remoteFile = remoteFilesMap.get(localFile.name);

        if (remoteFile) {
          mergedFiles.push({
            ...localFile,
            content: remoteFile.content,
            size: remoteFile.size,
            createdAt: localFile.createdAt ?? remoteFile.clientModified ?? new Date().toISOString(),
            syncedProvider: storage.provider,
            syncedToDropbox: storage.provider === 'dropbox'
          });
        } else {
          const conflictEntry: StoredFile = {
            ...localFile,
            syncedProvider: null,
            syncedToDropbox: false
          };

          conflicts.push(conflictEntry);
          mergedFiles.push(conflictEntry);
        }

        localFilesMap.delete(localFile.name);
        remoteFilesMap.delete(localFile.name);
      }

      for (const remoteFile of remoteFilesMap.values()) {
        mergedFiles.push({
          id: this.generateId(),
          name: remoteFile.name,
          content: remoteFile.content,
          createdAt: remoteFile.clientModified ?? new Date().toISOString(),
          size: remoteFile.size,
          syncedProvider: storage.provider,
          syncedToDropbox: storage.provider === 'dropbox'
        });
      }

      this.writeToLocalStorage(mergedFiles);

      return { files: mergedFiles, conflicts };
    } catch (error) {
      console.error('Failed to sync files from cloud storage:', error);
      return {
        files: existingFiles,
        conflicts: []
      };
    }
  }
}
