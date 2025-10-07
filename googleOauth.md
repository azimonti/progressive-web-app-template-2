# Google OAuth Setup (Drive integration) — Google Cloud Console only

This guide covers only the **Google Cloud** side to create an OAuth 2.0 Client ID and configure scopes for a web app (SPA/PWA). It assumes you already know your app’s dev and prod URLs.

## 1) Select the correct project
1. Open **https://console.cloud.google.com/**
2. Use the project selector on the top bar and pick your app’s Google Cloud project (the one linked to your Firebase project, if applicable).


## 2) Enable required APIs
1. Go to **APIs & Services → Library**.
2. Enable:
   - **Google Drive API**
   - *(Optional)* **Google Picker API** if you plan to use Google’s file picker UI.


## 3) Configure the OAuth consent screen
1. Go to **APIs & Services → OAuth consent screen**.
2. **User type:** `External` (unless you use Google Workspace and want Internal).
3. **App information:** set App name, User support email, Developer contact email.
4. **Scopes:** click *Add or Remove Scopes* and add these:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
   - `https://www.googleapis.com/auth/drive.appdata`
   > These provide app-limited Drive access, metadata read, and a hidden app data store.
5. **Test users:** add your Google account(s) for development.
6. Save.


## 4) Create the OAuth 2.0 Client ID (Web app)
1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. **Application type:** `Web application`.
4. **Authorized JavaScript origins:** add your web app origins, for example:
   - `http://localhost:5173`
   - `https://youraddress.web.app`
5. **Authorized redirect URIs:** add the exact callback URLs your app will use, for example:
   - `http://localhost:5173/auth/callback`
   - `https://youraddress.web.app/auth/callback`
6. Click **Create**. Copy the **Client ID**.

> For SPAs that use PKCE, you only need the **Client ID** in the frontend. Do not expose a client secret in the browser.


## 5) What to use at runtime
When you initialize Google Identity Services (GIS), request the scopes above at runtime.

**Example runtime scope string:**
```
openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.appdata
```


## 6) Notes on domains and testing
- Google accepts `http://localhost` or `http://127.0.0.1` for dev.
- All non-local hosts must be **HTTPS** with a public TLD (e.g. `.com`, `.dev`, `.app`, `.net`, `.org`, etc.).
- Private or non-public suffixes like `.local`, `.home`, `.lan`, and bare IPs will be rejected as **Invalid Origin**.


## 7) Troubleshooting quick reference
- **`invalid_origin: must end with a public top-level domain`**
  - Use `http://localhost` for local desktop testing, or a real public domain/tunnel for cross-device.
- **`origin_mismatch`**
  - The page’s `location.origin` is not in *Authorized JavaScript origins*. Add the exact scheme/host/port.
- **`redirect_uri_mismatch`**
  - The `redirect_uri` used by your app is not in *Authorized redirect URIs*. Add the exact URL including path and port.
- **Token fails after edits**
  - Hard-refresh the app and retry. Console changes can take ~30–60 seconds to propagate.


## 8) What you do **not** need to change for folder placement
Changing where you store files (hidden appData vs. real folder like `/pwa`) does **not** require new OAuth credentials or new scopes. Keep the same OAuth client and scopes; only your Drive API `parents` parameter changes in code.

