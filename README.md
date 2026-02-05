# Forklift Log Inspector

A browser-based tool for visualizing Forklift/MTV (Migration Toolkit for Virtualization) migration logs. All processing happens client-side - no server required.

## Features

- **Log Upload**: Drag-and-drop or file picker to upload Forklift controller logs
- **Plan Overview**: View all migration plans with their status (Running, Succeeded, Failed, Archived)
- **Pipeline Visualization**: See VM migration progress through all pipeline phases (Warm, Cold, OnlyConversion)
- **Error & Panic Display**: View reconciliation errors and panics with stack traces
- **Phase Logs**: Click on pipeline phases to view detailed logs for each migration step
- **Search & Filter**: Filter plans by status and search by name, namespace, or VM name
- **Dark/Light Mode**: Toggle between dark and light themes

## Tech Stack

- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Zustand for state management
- All parsing done client-side in the browser

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Static Deployment

The built files in `dist/` can be deployed to any static hosting service (GitHub Pages, Netlify, Vercel, etc.).

## Usage

1. Open the web UI in your browser
2. Drag and drop a Forklift controller log file (.log, .txt, or .json)
3. View the parsed migration plans and their status
4. Click on a plan card to expand and see VM details
5. Click on pipeline phases to view detailed phase logs

## Log Format

The inspector parses JSON-lines formatted logs from the Forklift controller. Each line should be a JSON object with fields like:
- `level`: Log level (info, error, warning)
- `ts`: Timestamp
- `logger`: Logger name (e.g., `plan|migration-ns/plan-name`)
- `msg`: Log message
- `plan`: Plan reference object
- `vm` or `vmRef`: VM reference
- `phase`: Current migration phase
