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
- ☁️ Optional Dropbox sync for saved files (configure with access token)

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

### Optional: Dropbox Cloud Sync

1. Create a scoped Dropbox app in the [Dropbox App Console](https://www.dropbox.com/developers/apps) requesting these permissions: `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write`.
2. Add your development URL (e.g. `http://localhost:5173/`) to the app's redirect URIs.
3. Create a `.env` file in the project root and add:

   ```env
   VITE_DROPBOX_APP_KEY=your_app_key_here
   VITE_DROPBOX_REDIRECT_URI=http://localhost:5173/
   # Optional: customise the folder inside your Dropbox app folder (defaults to /DropboxSync)
   VITE_DROPBOX_BASE_PATH=/YourFolder
   # Optional: override the scopes that are requested during OAuth (space-separated)
   VITE_DROPBOX_SCOPES=files.metadata.read files.metadata.write files.content.read files.content.write
   ```

4. Start the app (`pnpm dev`) and click **Connect Dropbox** in the UI to complete the OAuth flow.

Once connected, saving or deleting files mirrors the changes in Dropbox.

---

## 📦 Directory Structure

```
.
├── index.html
├── postcss.config.js
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── assets/
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
