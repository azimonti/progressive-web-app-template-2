# Progressive Web App Template

A modern **Progressive Web App (PWA)** template built with **Vite**, **React**, **TypeScript**, and **Tailwind CSS v4**.
Designed for fast startup, clean structure, and zero config overhead — ideal for creating installable, offline-capable web apps.

---

## 🚀 Stack

| Tool | Purpose |
|------|----------|
| [Vite](https://vite.dev) | Lightning-fast development and build tooling |
| [React](https://react.dev) | UI library |
| [TypeScript](https://www.typescriptlang.org/) | Static typing |
| [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS framework (no config required) |
| [pnpm](https://pnpm.io/) | Fast, disk-efficient package manager |

---

## 🧩 Features

- ⚡ Instant startup with Vite
- 🎨 Tailwind CSS v4 (config-free setup)
- 📱 PWA-ready: add manifest and service worker easily
- 🧱 TypeScript-first React components
- 🔥 Hot Module Replacement (HMR) out of the box
- 🧼 Clean, flat project structure (no unnecessary scaffolding)
- ✨ **Font Awesome** icons ready to use across the UI (brands + solid packs)
- ☁️ **Full cloud storage integration** with Dropbox and Google Drive
  - 🔐 Secure OAuth authentication (PKCE for Dropbox, Google Identity Services for Drive)
  - 🔄 Automatic file synchronization between local and cloud storage
  - ⚖️ Intelligent conflict resolution for local vs. remote files
  - 📊 Storage quota management (5MB per file, 50MB total)
  - 🔁 Token refresh and persistent authentication
  - 🌐 Cross-platform file access and backup

---

## 🛠️ Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
````

Open [http://localhost:5173](http://localhost:5173) in your browser.

### UI Icons with Font Awesome

- Font Awesome core is configured in `src/main.tsx` (`config.autoAddCss = false`) and styles are imported once via `@fortawesome/fontawesome-svg-core/styles.css`.
- Import icons directly where they are used, e.g.

  ```tsx
  import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
  import { faDropbox } from '@fortawesome/free-brands-svg-icons';

  <FontAwesomeIcon icon={faDropbox} className="h-5 w-5 text-sky-500" />
  ```

- The template already uses brand icons for the cloud provider dropdown and solid icons for toast notifications and chevrons. Add additional icons on a per-component basis—no central icon registry is necessary.

### Optional: Cloud Sync

The template can mirror saved files to a cloud provider. Once configured, use the dropdown in the UI to choose Dropbox or Google Drive and connect.

#### Dropbox

1. Create a scoped Dropbox app in the [Dropbox App Console](https://www.dropbox.com/developers/apps) requesting these permissions: `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write`.
2. Add your development URL (e.g. `http://localhost:5173/`) to the app's redirect URIs.
3. Open `src/services/CloudConfig.ts` and set `DROPBOX_APP_KEY` to your Dropbox app key.
4. Start the app (`pnpm dev`) and click **Connect Dropbox** to complete the OAuth flow. The redirect URI automatically matches the current origin (e.g. `http://localhost:5173/` or your production URL), so make sure each is added to your Dropbox app configuration.

#### Google Drive

1. Create or reuse a Google Cloud project and [enable the Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
2. Configure an OAuth 2.0 **Web application** client ID in the Google Cloud Console. Add your dev and production URLs (e.g. `http://localhost:5173/`) to **Authorized JavaScript origins** and **Authorized redirect URIs**.
3. Open `src/services/CloudConfig.ts` and set `GOOGLE_DRIVE_CLIENT_ID` to your Google OAuth client ID.
4. (Optional) Adjust `GOOGLE_DRIVE_FOLDER_NAME` in the same file if you want a different target folder.
5. Start the app (`pnpm dev`) and click **Connect Google Drive**. Sign in with an account that has access to the Drive API for the project.

Synced files are created inside a Drive folder named after `GOOGLE_DRIVE_FOLDER_NAME` (defaults to `pwa-template`) at the root of the user's Drive, so they can be managed manually if needed.

---

## 📦 Directory Structure

```
.
├── index.html
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
├── firebase.json
├── .firebaserc
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── img/
│       ├── social-card.jpg
│       └── icons/
│           ├── pwa-template-32x32.png
│           ├── pwa-template-180x180.png
│           ├── pwa-template-192x192.png
│           ├── pwa-template-512x512-maskable.png
│           ├── pwa-template-512x512.png
│           └── pwa-template.ico
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── i18n.ts
│   ├── components/
│   │   ├── ConfirmationDialog.tsx
│   │   ├── LanguageSwitcher.tsx
│   │   └── Toast.tsx
│   ├── locales/
│   │   ├── en.json
│   │   └── ja.json
│   └── services/
│       ├── CloudConfig.ts
│       ├── CloudStorage.ts
│       ├── DropboxAuthService.ts
│       ├── DropboxStorageService.ts
│       ├── FileStorageService.ts
│       ├── GoogleDriveAuthService.ts
│       └── GoogleDriveStorageService.ts
└── package.json
```

---

## 🧰 PWA Notes

To make this a full PWA:

1. Add a `manifest.webmanifest` in the project root.
2. Register a service worker (e.g., using [Workbox](https://developer.chrome.com/docs/workbox)).
3. Configure Vite’s [PWA plugin](https://vite-pwa-org.netlify.app/).

Example minimal service worker:

```ts
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('fetch', () => {});
```

---

## 🧑‍💻 Author

**Marco Azimonti**
[https://github.com/azimonti](https://github.com/azimonti)

---

## 🪪 License

This project is licensed under the [MIT License](./LICENSE).
