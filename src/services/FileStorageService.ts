import { DropboxStorageService, DropboxSyncError } from './DropboxStorageService';

interface StoredFile {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  size: number;
}

export class FileStorageService {
  private readonly STORAGE_KEY = 'pwa_files';
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
  private readonly MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total
  private readonly dropboxStorage: DropboxStorageService;

  constructor(dropboxStorage?: DropboxStorageService) {
    this.dropboxStorage = dropboxStorage ?? new DropboxStorageService();
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
      const existingFiles = await this.getStoredFiles();

      // Check if file already exists
      const existingIndex = existingFiles.findIndex(file => file.name === fileName);

      // Check total storage size
      const currentTotalSize = existingFiles.reduce((total, file) => total + file.size, 0);
      if (existingIndex === -1 && currentTotalSize + contentSize > this.MAX_TOTAL_SIZE) {
        throw new Error(`Adding this file would exceed storage limit. Current usage: ${this.formatBytes(currentTotalSize)}, Limit: ${this.formatBytes(this.MAX_TOTAL_SIZE)}`);
      }

      // Create new file object
      const fileObject: StoredFile = {
        id: existingIndex !== -1 ? existingFiles[existingIndex].id : this.generateId(),
        name: fileName,
        content,
        createdAt: existingIndex !== -1 ? existingFiles[existingIndex].createdAt : new Date().toISOString(),
        size: contentSize
      };

      // Update or add file
      if (existingIndex !== -1) {
        existingFiles[existingIndex] = fileObject;
      } else {
        existingFiles.push(fileObject);
      }

      // Save to localStorage
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingFiles));

      // Mirror file to Dropbox if configured
      await this.syncToDropbox(fileName, content);

    } catch (error) {
      if (error instanceof DropboxSyncError) {
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
  async listFiles(): Promise<StoredFile[]> {
    try {
      return await this.getStoredFiles();
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
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

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredFiles));

    try {
      await this.dropboxStorage.deleteFile(fileName);
    } catch (error) {
      console.error('Failed to delete file from Dropbox:', error);
    }
  }

  /**
   * Clear all saved files
   */
  async clearAll(): Promise<void> {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      await this.dropboxStorage.clearAll();
    } catch (error) {
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
   * Private method to get stored files from localStorage
   */
  private async getStoredFiles(): Promise<StoredFile[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return [];
      }

      const files: StoredFile[] = JSON.parse(stored);

      // Validate and clean up corrupted data
      return files.filter(file =>
        file &&
        typeof file === 'object' &&
        file.id &&
        file.name &&
        file.content !== undefined &&
        file.createdAt &&
        file.size !== undefined
      );
    } catch (error) {
      console.error('Error reading stored files:', error);
      // If data is corrupted, clear it and return empty array
      localStorage.removeItem(this.STORAGE_KEY);
      return [];
    }
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

  private async syncToDropbox(fileName: string, content: string): Promise<void> {
    if (!this.dropboxStorage.isReady()) {
      console.warn('Dropbox not ready, skipping sync');
      return;
    }

    try {
      console.log(`Syncing file to Dropbox: ${fileName}`);
      await this.dropboxStorage.uploadFile(fileName, content);
      console.log(`Successfully synced file to Dropbox: ${fileName}`);
    } catch (error) {
      console.error(`Failed to sync file to Dropbox: ${fileName}`, error);
      // Don't throw the error - we still want local storage to work
      // The error will be handled by the calling code if needed
    }
  }
}
