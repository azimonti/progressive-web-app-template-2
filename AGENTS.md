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
├── src/
│   ├── App.tsx           # Main React component
│   ├── main.tsx          # React application entry point
│   ├── index.css         # Global styles and Tailwind imports
│   └── assets/           # Static assets (images, icons, etc.)
└── public/
    └── vite.svg         # Vite logo asset
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

## Key Files and Their Purposes

### Configuration Files
- **`vite.config.ts`**: Vite build configuration with React plugin
- **`tsconfig.json`**: Main TypeScript configuration with strict settings
- **`postcss.config.js`**: PostCSS setup for Tailwind CSS v4
- **`eslint.config.js`**: ESLint rules for code quality

### Source Files
- **`src/main.tsx`**: React application bootstrap and rendering
- **`src/App.tsx`**: Main application component (starting point for development)
- **`src/index.css`**: Global styles with Tailwind directives

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

This template provides a solid, modern foundation for PWA development with minimal configuration and maximum developer experience.
