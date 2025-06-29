# Scrum Poker - TypeScript + Vite Migration

This document explains the migration from the original JavaScript single-file application to a modern TypeScript + Vite setup.

## 🚀 What Changed

### Project Structure

The application has been refactored from a single-file approach to a modular TypeScript structure:

```
src/
├── client/                    # Frontend application
│   ├── components/           # TypeScript modules
│   │   ├── GameState.ts     # Game state management
│   │   └── SocketManager.ts # Socket.IO client wrapper
│   ├── styles/              # Modular CSS
│   │   ├── main.css        # Base styles
│   │   ├── components.css  # Component styles
│   │   └── layout.css      # Layout and responsive styles
│   ├── utils/              # Utility functions
│   │   ├── storage.ts      # LocalStorage helpers
│   │   ├── sound.ts        # Sound effects
│   │   └── ui.ts           # UI helper functions
│   ├── index.html          # Main HTML template
│   └── main.ts             # Application entry point
├── server/                  # Backend application
│   ├── utils/              # Server utilities
│   │   ├── sessionStore.ts # Session storage management
│   │   ├── jiraApi.ts      # Jira API integration
│   │   └── sessionHelpers.ts # Session helper functions
│   ├── socketHandlers.ts   # Socket.IO event handlers
│   └── index.ts            # Server entry point
└── shared/                  # Shared types and interfaces
    └── types/
        └── index.ts         # TypeScript type definitions
```

### Technology Stack

- **Frontend**: Vite + TypeScript + Socket.IO Client
- **Backend**: Node.js + TypeScript + Express + Socket.IO
- **Build System**: Vite for client, TypeScript compiler for server
- **Development**: Hot reload for both client and server

## 🛠️ Setup and Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0

### Quick Start

1. **Install dependencies and build:**

   ```bash
   ./setup.sh
   ```

2. **Start development (both client and server with hot reload):**

   ```bash
   npm run dev
   ```

3. **Build for production:**

   ```bash
   npm run build
   ```

4. **Start production server:**
   ```bash
   npm start
   ```

### Development Commands

```bash
# Development with hot reload (client on :5173, server on :3000)
npm run dev

# Build everything
npm run build

# Build only client
npm run build:client

# Build only server
npm run build:server

# Type checking
npm run type-check           # Client
npm run type-check:server    # Server

# Development server only
npm run dev:server

# Development client only
npm run dev:client
```

## 📁 Key Files

### Client Application

- **`src/client/main.ts`** - Main application class with all UI logic
- **`src/client/components/GameState.ts`** - Centralized state management
- **`src/client/components/SocketManager.ts`** - Socket.IO client wrapper with typed events
- **`src/client/utils/`** - Utility functions for storage, sound, and UI

### Server Application

- **`src/server/index.ts`** - Main server setup and basic socket handlers
- **`src/server/socketHandlers.ts`** - All Socket.IO event handlers
- **`src/server/utils/`** - Server utilities for Jira API, session management, etc.

### Shared Types

- **`src/shared/types/index.ts`** - All TypeScript interfaces and types used by both client and server

## 🔧 Configuration

### Vite Configuration (`vite.config.ts`)

- Configured for TypeScript
- Proxy setup for Socket.IO and API routes
- Path aliases for clean imports
- Build output to `dist/public`

### TypeScript Configuration

- **`tsconfig.json`** - Client-side TypeScript config
- **`tsconfig.server.json`** - Server-side TypeScript config
- **`tsconfig.node.json`** - Node.js tools config

## 🚀 Production Deployment

The build process creates:

- `dist/public/` - Built client files (HTML, CSS, JS)
- `dist/server/` - Compiled server files

In production, the server serves the built client files from `dist/public/`.

## 🔄 Migration Notes

### What Stayed the Same

- All functionality is preserved
- Same API endpoints and Socket.IO events
- Same environment variables and configuration
- Same Redis integration
- Same Jira integration

### What Improved

- **Type Safety**: Full TypeScript coverage with strict type checking
- **Modularity**: Code split into logical modules and components
- **Development Experience**: Hot reload for both client and server
- **Build Process**: Optimized production builds with Vite
- **Code Organization**: Clear separation of concerns
- **Maintainability**: Easier to understand and modify

### Breaking Changes

- **File Structure**: Complete reorganization (but functionality unchanged)
- **Build Process**: New build commands (old commands removed)
- **Development**: New development workflow with `npm run dev`

## 🎯 Development Workflow

1. **Start development**: `npm run dev`
2. **Client development**: Edit files in `src/client/`, hot reload active on http://localhost:5173
3. **Server development**: Edit files in `src/server/`, auto-restart on changes
4. **Shared types**: Edit `src/shared/types/index.ts` for type definitions
5. **Build and test**: `npm run build` then `npm start`

The development proxy ensures the client can communicate with the server seamlessly during development.

## 📊 Benefits

- **Type Safety**: Catch errors at compile time
- **Better IDE Support**: IntelliSense, refactoring, navigation
- **Faster Development**: Hot reload and instant feedback
- **Production Ready**: Optimized builds with tree-shaking
- **Scalable**: Easy to add new features and components
- **Maintainable**: Clear code organization and separation of concerns
