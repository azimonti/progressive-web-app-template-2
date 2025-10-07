# Progressive Web App Template - AI Development Guide

## Project Overview

This is a modern **Progressive Web App (PWA)** template designed for fast startup and clean development. Built with cutting-edge web technologies to create installable, offline-capable web applications with zero configuration overhead.

**Core Purpose**: Provide a solid foundation for building PWAs with modern tooling and best practices.

## Technology Stack

### Core Technologies
- **Vite** (`^7.1.7`): Lightning-fast build tool and development server with HMR
- **React** (`^19.1.1`): Modern React with concurrent features and automatic batching
- **TypeScript** (`~5.9.3`): Static typing with latest TS features
- **Tailwind CSS v4** (`^4.1.14`): Utility-first CSS framework, config-free setup
- **Font Awesome** (`@fortawesome/*`): Icon library with solid + brand packs, globally configured

### Package Manager
- **pnpm**: Fast, disk-efficient package manager (preferred over npm)

## Project Structure

```
├── index.html              # Main HTML entry point
├── postcss.config.js       # PostCSS configuration for Tailwind
├── tsconfig.json          # Main TypeScript configuration
├── tsconfig.app.json      # Application-specific TS config
├── tsconfig.node.json     # Node.js tooling TS config
├── vite.config.ts         # Vite configuration
├── eslint.config.js       # ESLint configuration
├── firebase.json          # Firebase hosting configuration
├── .firebaserc           # Firebase project configuration
├── public/
│   ├── manifest.webmanifest # PWA manifest file
│   ├── sw.js             # Service worker for PWA functionality
│   └── img/              # Static assets
│       ├── social-card.jpg
│       └── icons/        # PWA icons in multiple sizes
├── src/
│   ├── App.tsx           # Main React component with cloud storage
│   ├── main.tsx          # React application entry point
│   ├── index.css         # Global styles with Tailwind imports
│   ├── i18n.ts           # Internationalization setup
│   ├── components/       # Reusable UI components
│   │   ├── ConfirmationDialog.tsx
│   │   ├── LanguageSwitcher.tsx
│   │   └── Toast.tsx
│   ├── locales/          # Translation files
│   │   ├── en.json
│   │   └── ja.json
│   └── services/         # Cloud storage and utility services
│       ├── CloudConfig.ts
│       ├── CloudStorage.ts
│       ├── DropboxAuthService.ts
│       ├── DropboxStorageService.ts
│       ├── FileStorageService.ts
│       ├── GoogleDriveAuthService.ts
│       └── GoogleDriveStorageService.ts
└── package.json
```

## Development Workflow

### Essential Commands
```bash
# Install dependencies
pnpm install

# Start development server (HMR enabled)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Lint code
pnpm lint
```

### Development Server
- Runs on `http://localhost:5173` by default
- Hot Module Replacement (HMR) enabled out of the box
- Fast refresh for instant updates during development

### Cloud Storage Integration

The application features a comprehensive cloud storage system with full OAuth integration for both Dropbox and Google Drive providers.

#### Architecture Overview
- **FileStorageService**: Central orchestrator managing local storage and cloud synchronization
- **CloudStorage Interface**: Common abstraction for all cloud providers
- **Provider-Specific Services**: Dedicated authentication and storage services for each provider
- **Automatic Synchronization**: Files are mirrored between local storage and active cloud provider
- **Conflict Resolution**: Intelligent handling of local vs. remote file differences

#### Authentication & Security
- **Dropbox**: PKCE-based OAuth 2.0 with secure token storage and automatic refresh
- **Google Drive**: Google Identity Services integration with token client management
- **Token Persistence**: Secure localStorage-based token storage with expiration handling
- **Error Handling**: Comprehensive CloudSyncError system for provider-specific errors

#### Storage Features
- **File Size Limits**: 5MB per file, 50MB total storage capacity
- **Quota Management**: Real-time storage usage tracking and enforcement
- **Cross-Platform Access**: Files accessible from any device with cloud provider access
- **Offline Support**: Local file storage with cloud sync when connection available
- **Conflict Detection**: Identifies and resolves discrepancies between local and remote files

#### Configuration
- **Dropbox**: Set `DROPBOX_APP_KEY` in `src/services/CloudConfig.ts`
- **Google Drive**: Set `GOOGLE_DRIVE_CLIENT_ID` and optionally `GOOGLE_DRIVE_FOLDER_NAME`
- **Provider Selection**: UI dropdown allows switching between providers or local-only storage

## Key Files and Their Purposes

### Configuration Files
- **`vite.config.ts`**: Vite build configuration with React plugin
- **`tsconfig.json`**: Main TypeScript configuration with strict settings
- **`tsconfig.app.json`**: Application-specific TypeScript configuration
- **`tsconfig.node.json`**: Node.js tooling TypeScript configuration
- **`postcss.config.js`**: PostCSS setup for Tailwind CSS v4
- **`eslint.config.js`**: ESLint rules for code quality
- **`firebase.json`** / **`.firebaserc`**: Firebase hosting configuration

### Source Files
- **`src/main.tsx`**: React application bootstrap and rendering
- **`src/App.tsx`**: Main application component with cloud storage integration
- **`src/index.css`**: Global styles with Tailwind directives
- **`src/i18n.ts`**: Internationalization setup for multi-language support

### Cloud Storage Services
- **`src/services/CloudStorage.ts`**: Core interfaces and types for cloud storage abstraction
- **`src/services/CloudConfig.ts`**: Configuration constants for cloud provider credentials
- **`src/services/FileStorageService.ts`**: Central service orchestrating local storage and cloud sync
- **`src/services/DropboxAuthService.ts`**: Complete OAuth PKCE implementation for Dropbox
- **`src/services/DropboxStorageService.ts`**: Dropbox API integration for file operations
- **`src/services/GoogleDriveAuthService.ts`**: Google Identity Services OAuth implementation
- **`src/services/GoogleDriveStorageService.ts`**: Google Drive API integration for file operations

### UI Components
- **`src/components/ConfirmationDialog.tsx`**: Reusable confirmation dialog component
- **`src/components/LanguageSwitcher.tsx`**: Multi-language toggle component
- **`src/components/Toast.tsx`**: Notification toast component for user feedback
  - These components consume Font Awesome icons via `@fortawesome/react-fontawesome`

### Localization
- **`src/locales/en.json`** / **`src/locales/ja.json`**: Translation files for English and Japanese

## Coding Standards and Conventions

### TypeScript
- Strict mode enabled (`"strict": true`)
- Latest ECMAScript target (`"target": "ES2022"`)
- Module resolution: `"bundler"`
- JSX preserved (`"jsx": "react-jsx"`)

### ESLint Configuration
- Uses `@eslint/js` for core rules
- React Hooks plugin for React-specific linting
- React Refresh for development experience

### File Organization
- Flat structure preferred (no deep nesting)
- Feature-based organization when scaling
- Assets co-located with components when possible

## PWA Implementation Guide

### Current State
This template provides the foundation for PWA development but requires additional setup:

### Required PWA Files
1. **Web App Manifest** (`manifest.webmanifest` or `manifest.json`)
   ```json
   {
     "name": "Your App Name",
     "short_name": "App",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#000000",
     "icons": [...]
   }
   ```

2. **Service Worker** (register in main.tsx or App.tsx)
   ```typescript
   if ('serviceWorker' in navigator) {
     window.addEventListener('load', () => {
       navigator.serviceWorker.register('/sw.js')
         .then(registration => console.log('SW registered'))
         .catch(error => console.log('SW registration failed'));
     });
   }
   ```

### Recommended PWA Libraries
- **vite-plugin-pwa**: For automatic PWA setup with Vite
- **workbox-webpack-plugin**: For service worker generation
- **vite-plugin-pwa** (recommended): Zero-config PWA plugin for Vite

## Dependencies Breakdown

### Production Dependencies
- `react` & `react-dom`: Core React functionality
- All other dependencies are development-only

### Development Dependencies
- **Build Tools**: `vite`, `@vitejs/plugin-react`, `typescript`
- **Styling**: `tailwindcss`, `@tailwindcss/postcss`
- **Code Quality**: `eslint`, `typescript-eslint`, `globals`
- **Type Definitions**: `@types/react`, `@types/react-dom`, `@types/node`

## Development Best Practices

### Font Awesome Usage
- Core setup resides in `src/main.tsx`: `config.autoAddCss = false` and the shared stylesheet import (`@fortawesome/fontawesome-svg-core/styles.css`).
- Import icons directly in the components that render them (e.g., `faDropbox`, `faGoogleDrive`, `faChevronDown`) and pass to `<FontAwesomeIcon icon={...} />`.
- Keep icon imports local; no shared icon registry is required. Prefer Font Awesome over inline SVGs for consistency with the existing UI.

### Code Organization
1. Keep components small and focused
2. Use functional components with hooks
3. Implement proper TypeScript interfaces for props
4. Follow React's rules of hooks

### Styling Guidelines
1. Use Tailwind utility classes for styling
2. Create component-specific CSS modules when needed
3. Maintain consistent spacing and color schemes
4. Use semantic class names

### Performance Considerations
1. Code splitting enabled by default with Vite
2. Tree shaking for optimal bundle sizes
3. Lazy loading for route-based components
4. Image optimization for production builds

## Getting Started for AI Development

When working with this codebase:

1. **Start the dev server**: `pnpm dev`
2. **Edit `src/App.tsx`**: Main component for feature development
3. **Add styles**: Use Tailwind classes in `src/index.css`
4. **Add assets**: Place in `src/assets/` or `public/`
5. **Build for production**: `pnpm build` to test production builds

## Extension Points

### Adding New Features
1. Create new components in `src/`
2. Add routes using React Router if needed
3. Implement state management (Context API, Zustand, or Redux Toolkit)
4. Add API integration with proper TypeScript types

### PWA Enhancements
1. Install and configure `vite-plugin-pwa`
2. Add push notification support
3. Implement offline data caching
4. Add background sync capabilities

## Cloud Storage Integration Notes

The services under `src/services/` abstract storage concerns so additional providers can be plugged in with minimal friction.

- **Dropbox**: PKCE-based OAuth via the official SDK. Tokens persist in localStorage/sessionStorage and errors bubble as `CloudSyncError` (`provider: 'dropbox'`).
- **Google Drive**: Uses Google Identity Services token client. Tokens refresh on demand; failures also surface as `CloudSyncError` (`provider: 'googleDrive'`). Files are listed, downloaded, and uploaded via authenticated REST calls into a named Drive folder (defaults to `pwa-template`).
- **FileStorageService**: Maintains local metadata, enforces per-file/total size limits, and reconciles local data with whichever provider is active. Conflicts enqueue for user resolution in the UI.

When extending cloud support:
1. Implement the `CloudStorage` interface (see `src/services/CloudStorage.ts`).
2. Emit provider-specific `CloudSyncError` subclasses for consistent UI handling.
3. Register the provider in the UI (dropdown + connect/disconnect lifecycle) and update translations in `src/locales/`.

This template provides a solid, modern foundation for PWA development with minimal configuration and maximum developer experience.
