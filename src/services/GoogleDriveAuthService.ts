import { CloudSyncError } from './CloudStorage';
import { GOOGLE_DRIVE_CLIENT_ID } from './CloudConfig';

const TOKEN_STORAGE_KEY = 'google_drive_token';
const SCRIPT_ID = 'google-oauth-script';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

type GoogleTokenClient = {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (options?: { prompt?: '' | 'consent' }) => void;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type StoredToken = {
  accessToken: string;
  expiresAt: number | null;
};

type GoogleNamespace = {
  accounts?: {
    oauth2?: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: unknown) => void;
      }): GoogleTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

export class GoogleDriveAuthService {
  private readonly clientId: string | undefined;
  private readonly scopes = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file'
  ].join(' ');

  private tokenClient: GoogleTokenClient | null = null;
  private scriptPromise: Promise<void> | null = null;

  constructor(clientId?: string) {
    const configured = GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_ID.trim().length > 0
      ? GOOGLE_DRIVE_CLIENT_ID.trim()
      : undefined;
    this.clientId = clientId ?? configured ?? this.resolveClientId();
  }

  hasClientId(): boolean {
    return Boolean(this.clientId);
  }

  isAvailable(): boolean {
    return this.hasClientId();
  }

  isAuthenticated(): boolean {
    const token = this.getStoredToken();
    if (!token) {
      return false;
    }

    if (token.expiresAt && token.expiresAt <= Date.now()) {
      this.clearStoredToken();
      return false;
    }

    return Boolean(token.accessToken);
  }

  /**
   * Returns a valid access token if present, otherwise null.
   */
  getAccessToken(): string | null {
    const token = this.getStoredToken();
    if (!token) {
      return null;
    }

    if (token.expiresAt && token.expiresAt <= Date.now() + 30_000) {
      this.clearStoredToken();
      return null;
    }

    return token.accessToken;
  }

  /**
   * Ensures a usable access token exists, prompting the user if necessary.
   */
  async ensureAccessToken(options: { prompt?: boolean } = {}): Promise<string> {
    const existing = this.getAccessToken();
    if (existing) {
      return existing;
    }

    const tokenClient = await this.ensureTokenClient();

    return new Promise<string>((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error) {
          const message = response.error_description || response.error;
          reject(new CloudSyncError('googleDrive', `Google Drive authentication failed: ${message}`));
          return;
        }

        const expiresInSeconds = typeof response.expires_in === 'number' ? response.expires_in : 3600;
        const expiresAt = Number.isFinite(expiresInSeconds)
          ? Date.now() + expiresInSeconds * 1000
          : null;

        this.storeToken({
          accessToken: response.access_token,
          expiresAt
        });
        resolve(response.access_token);
      };

      try {
        tokenClient.requestAccessToken({ prompt: options.prompt ? 'consent' : '' });
      } catch (error) {
        reject(
          new CloudSyncError(
            'googleDrive',
            error instanceof Error ? error.message : 'Failed to request Google Drive access token',
            { cause: error instanceof Error ? error : undefined }
          )
        );
      }
    });
  }

  startAuthentication(): void {
    if (typeof window === 'undefined' || !this.clientId) {
      return;
    }

    void this.ensureAccessToken({ prompt: true });
  }

  signOut(): void {
    this.clearStoredToken();
  }

  private async ensureTokenClient(): Promise<GoogleTokenClient> {
    if (!this.clientId) {
      throw new CloudSyncError('googleDrive', 'Google Drive client ID is not configured.');
    }

    if (this.tokenClient) {
      return this.tokenClient;
    }

    await this.loadScript();

    const google = window.google;
    const init = google?.accounts?.oauth2?.initTokenClient;
    if (typeof init !== 'function') {
      throw new CloudSyncError('googleDrive', 'Google OAuth 2.0 client is not available.');
    }

    this.tokenClient = init({
      client_id: this.clientId,
      scope: this.scopes,
      callback: () => {
        // This callback will be overridden per request.
      }
    });

    return this.tokenClient;
  }

  private async loadScript(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new CloudSyncError('googleDrive', 'Google OAuth cannot initialise outside the browser.');
    }

    if (window.google?.accounts?.oauth2) {
      return;
    }

    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load Google OAuth script')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google OAuth script'));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }

  private getStoredToken(): StoredToken | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as StoredToken;
      if (!parsed?.accessToken) {
        return null;
      }

      return parsed;
    } catch (error) {
      console.error('Failed to parse stored Google Drive token:', error);
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
  }

  private storeToken(token: StoredToken): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  }

  private clearStoredToken(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  private resolveClientId(): string | undefined {
    if (typeof import.meta === 'undefined') {
      return undefined;
    }

    const meta = import.meta as unknown as { env?: Record<string, unknown> };
    const value = meta.env?.VITE_GOOGLE_DRIVE_CLIENT_ID;
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }
}
