# Agent Console - Web Frontend

The web frontend for Agent Console, built with [SolidJS](https://solidjs.com/) and [Tailwind CSS](https://tailwindcss.com/).

## Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build
```

The frontend connects to the console backend at `http://localhost:9090` during development. Use `just dev-console` from the project root to start the full development stack (backend + frontend + kubectl proxy).
