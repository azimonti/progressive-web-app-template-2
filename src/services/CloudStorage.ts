export type CloudProvider = 'dropbox' | 'googleDrive';

export interface CloudFileData {
  name: string;
  path: string;
  clientModified: string | null;
  size: number;
  content: string;
}

export interface CloudStorage {
  readonly provider: CloudProvider;
  isAvailable(): boolean;
  isReady(): boolean;
  uploadFile(fileName: string, content: string): Promise<void>;
  deleteFile(fileName: string): Promise<void>;
  fetchFiles(): Promise<CloudFileData[]>;
}

export class CloudSyncError extends Error {
  readonly provider: CloudProvider;

  constructor(provider: CloudProvider, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CloudSyncError';
    this.provider = provider;
  }
}
