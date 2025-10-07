import { DropboxAuth } from 'dropbox';
import { DROPBOX_APP_KEY } from './CloudConfig';

const TOKEN_STORAGE_KEY = 'dropbox_token';
const STATE_STORAGE_KEY = 'dropbox_auth_state';
const CODE_VERIFIER_STORAGE_KEY = 'dropboxCodeVerifier';

interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export type DropboxRedirectResult =
  | { status: 'none' }
  | { status: 'success' }
  | { status: 'error'; message: string };

/**
 * Handles Dropbox OAuth (PKCE) and token persistence.
 */
export class DropboxAuthService {
  private readonly appKey: string | undefined;
  private auth: DropboxAuth | null = null;

  constructor() {
    this.appKey = DROPBOX_APP_KEY;
  }

  hasAppKey(): boolean {
    return Boolean(this.appKey);
  }

  isAuthenticated(): boolean {
    const token = this.getStoredToken();
    if (!token) {
      return false;
    }

    if (token.expiresAt && Date.now() > token.expiresAt) {
      this.clearStoredData();
      return false;
    }

    return Boolean(token.accessToken);
  }

  getAccessToken(): string | null {
    const token = this.getStoredToken();
    if (!token) {
      return null;
    }

    if (token.expiresAt && Date.now() > token.expiresAt) {
      this.clearStoredData();
      return null;
    }

    return token.accessToken;
  }

  startAuthentication(): void {
    if (typeof window === 'undefined' || !this.appKey) {
      return;
    }

    const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    window.sessionStorage.setItem(STATE_STORAGE_KEY, state);

    void this.beginPkceAuthentication(state);
  }

  signOut(): void {
    this.clearStoredData();
  }

  clearStoredData(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
    this.auth = null;
  }

  async processRedirectResult(): Promise<DropboxRedirectResult> {
    if (typeof window === 'undefined') {
      return { status: 'none' };
    }

    const { pathname, search } = window.location;
    if (!search || (!search.includes('code=') && !search.includes('error='))) {
      return { status: 'none' };
    }

    const params = new URLSearchParams(search);
    const code = params.get('code');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const state = params.get('state');

    this.removeAuthQueryParams(pathname, params);

    const storedState = window.sessionStorage.getItem(STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(STATE_STORAGE_KEY);

    if (state && storedState && state !== storedState) {
      return { status: 'error', message: 'State mismatch during Dropbox authentication.' };
    }

    if (error) {
      return { status: 'error', message: errorDescription || error };
    }

    if (!code) {
      return { status: 'none' };
    }

    const codeVerifier = window.sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY);
    window.sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
    if (!codeVerifier) {
      return { status: 'error', message: 'Missing PKCE code verifier. Please try connecting again.' };
    }

    const auth = this.ensureAuth();
    try {
      auth.setCodeVerifier(codeVerifier);
      const redirectUri = this.getResolvedRedirectUri();
      const response = await auth.getAccessTokenFromCode(redirectUri, code);
      const { accessToken, refreshToken, expiresIn } = this.parseTokenExchangeResult(response.result);
      const expiresAt = typeof expiresIn === 'number' ? Date.now() + expiresIn * 1000 : null;

      this.storeToken({ accessToken, refreshToken, expiresAt });
      auth.setAccessToken(accessToken);
      if (refreshToken) {
        auth.setRefreshToken(refreshToken);
      }
      if (typeof expiresIn === 'number') {
        auth.setAccessTokenExpiresAt(new Date(Date.now() + expiresIn * 1000));
      }

      return { status: 'success' };
    } catch (exchangeError) {
      const message = exchangeError instanceof Error
        ? exchangeError.message
        : 'Failed to exchange authorization code for tokens.';
      return { status: 'error', message };
    }
  }

  private ensureAuth(): DropboxAuth {
    if (!this.appKey) {
      throw new Error('Dropbox app key is not configured.');
    }

    if (!this.auth) {
      this.auth = new DropboxAuth({ clientId: this.appKey });
      const stored = this.getStoredToken();
      if (stored?.accessToken) {
        this.auth.setAccessToken(stored.accessToken);
      }
      if (stored?.refreshToken) {
        this.auth.setRefreshToken(stored.refreshToken);
      }
      if (stored?.expiresAt) {
        this.auth.setAccessTokenExpiresAt(new Date(stored.expiresAt));
      }
    }

    return this.auth;
  }

  private async beginPkceAuthentication(state: string): Promise<void> {
    try {
      const codeVerifier = this.generateCodeVerifier();
      window.sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, codeVerifier);
      const { challenge, method } = await this.createPkceChallenge(codeVerifier);
      const redirectUri = this.getResolvedRedirectUri();
      const scopes = [
        'files.content.read',
        'files.content.write',
        'files.metadata.read'
      ].join(' ');

      const params = new URLSearchParams({
        client_id: this.appKey!,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: method,
        token_access_type: 'offline',
        include_granted_scopes: 'user'
      });

      params.set('state', state);
      params.set('scope', scopes);

      window.location.href = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
    } catch (error) {
      console.error('Failed to initiate Dropbox authentication:', error);
      window.sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
    }
  }

  private getStoredToken(): StoredToken | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored) as StoredToken;
      return parsed.accessToken ? parsed : null;
    } catch (error) {
      console.error('Failed to parse stored Dropbox token:', error);
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

  private getResolvedRedirectUri(): string {
    if (typeof window !== 'undefined') {
      const { origin, pathname } = window.location;
      return `${origin}${pathname}`;
    }

    return 'http://localhost:5173/';
  }

  private removeAuthQueryParams(pathname: string, params: URLSearchParams): void {
    params.delete('code');
    params.delete('state');
    params.delete('error');
    params.delete('error_description');

    const remaining = params.toString();
    const newUrl = remaining ? `${pathname}?${remaining}` : pathname;
    window.history.replaceState(null, '', newUrl);
  }

  private generateCodeVerifier(length = 128): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const charactersLength = characters.length;

    if (typeof window !== 'undefined' && window.crypto && 'getRandomValues' in window.crypto) {
      const randomValues = new Uint8Array(length);
      window.crypto.getRandomValues(randomValues);
      let verifier = '';
      for (let i = 0; i < length; i++) {
        verifier += characters.charAt(randomValues[i] % charactersLength);
      }
      return verifier;
    }

    let fallback = '';
    for (let i = 0; i < length; i++) {
      fallback += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return fallback;
  }

  private async createPkceChallenge(
    verifier: string
  ): Promise<{ challenge: string; method: 'S256' | 'plain' }> {
    if (this.canUseS256()) {
      try {
        const hashed = await this.sha256(verifier);
        return {
          challenge: this.base64UrlEncode(hashed),
          method: 'S256'
        };
      } catch (error) {
        console.warn('Falling back to plain PKCE challenge after digest failure:', error);
      }
    }

    return {
      challenge: verifier,
      method: 'plain'
    };
  }

  private async sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API is not available in this environment.');
    }
    return window.crypto.subtle.digest('SHA-256', data);
  }

  private canUseS256(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean(window.crypto) &&
      Boolean(window.crypto.subtle) &&
      typeof window.crypto.subtle.digest === 'function'
    );
  }

  private base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private parseTokenExchangeResult(result: unknown): {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number | null;
  } {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid Dropbox token response.');
    }

    const data = result as Record<string, unknown>;
    const accessToken = data.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('Dropbox token response is missing an access token.');
    }

    const refreshCandidate = data.refresh_token;
    const refreshToken =
      typeof refreshCandidate === 'string' && refreshCandidate.trim().length > 0
        ? refreshCandidate
        : null;

    const expiresCandidate = data.expires_in;
    let expiresIn: number | null = null;
    if (typeof expiresCandidate === 'number' && Number.isFinite(expiresCandidate)) {
      expiresIn = expiresCandidate;
    } else if (typeof expiresCandidate === 'string') {
      const parsed = Number.parseInt(expiresCandidate, 10);
      if (Number.isFinite(parsed)) {
        expiresIn = parsed;
      }
    }

    return { accessToken, refreshToken, expiresIn };
  }
}
