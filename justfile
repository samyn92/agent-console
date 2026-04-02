# Agent Console Development
# Usage: just dev       — runs everything (kubectl proxy + backend + frontend)
#        just dev-back  — runs Go backend only
#        just dev-front — runs Vite frontend only
#
# Multi-agent support:
#   `just dev` uses kubectl proxy so each agent gets its own service URL.
#   This means ALL agents work independently (separate sessions, separate state).
#
# Single-agent override (for simple testing with one agent):
#   AGENT_URL_OVERRIDE=http://localhost:4096 just dev-back
#   (combine with `kubectl port-forward svc/<agent> 4096:4096 -n agents`)

set dotenv-load

default:
    @just --list

# --------------------------------------------------------------------------
# Dev: run all three processes (kubectl proxy, backend, frontend)
# --------------------------------------------------------------------------

# Run full local dev stack with multi-agent support via kubectl proxy
dev:
    #!/usr/bin/env bash
    set -uo pipefail

    # Cleanup function that kills the entire process group
    cleanup() {
        echo ""
        echo "→ Shutting down dev stack..."
        kill -- -$$ 2>/dev/null
        wait 2>/dev/null
    }
    trap cleanup EXIT INT TERM

    # 1. Start kubectl proxy for multi-agent routing
    #    Each agent gets: http://localhost:8001/api/v1/namespaces/{ns}/services/{name}:4096/proxy
    echo "→ Starting kubectl proxy on :8001..."
    kubectl proxy --port=8001 &

    sleep 1

    # 2. Go backend on :9090 with dev flags
    #    KUBECTL_PROXY_URL tells the backend to route per-agent via the proxy
    echo "→ Starting Go backend on :9090..."
    KUBECTL_PROXY_URL=http://localhost:8001 \
      go run ./cmd/console -addr :9090 -otlp-addr :0 -dev -kubeconfig "$HOME/.kube/config" &

    sleep 2

    # 3. Vite frontend
    echo "→ Starting Vite dev server..."
    cd web && pnpm dev &

    echo ""
    echo "✓ Dev stack running (multi-agent):"
    echo "  Frontend       → http://localhost:5173"
    echo "  Backend        → http://localhost:9090"
    echo "  kubectl proxy  → http://localhost:8001"
    echo ""
    echo "  Agents are routed via kubectl proxy — each agent has its own service URL."
    echo "  Press Ctrl+C to stop all."
    wait

# --------------------------------------------------------------------------
# Individual components
# --------------------------------------------------------------------------

# Start kubectl proxy for multi-agent dev
proxy:
    kubectl proxy --port=8001

# Port-forward a single agent (for single-agent testing only)
port-forward agent="platform-agent" ns="agents":
    kubectl port-forward svc/{{agent}} 4096:4096 -n {{ns}}

# Run Go backend in dev mode (multi-agent via kubectl proxy)
dev-back:
    KUBECTL_PROXY_URL=${KUBECTL_PROXY_URL:-http://localhost:8001} \
      go run ./cmd/console -addr :9090 -otlp-addr :0 -dev -kubeconfig "$HOME/.kube/config"

# Run Vite frontend dev server
dev-front:
    cd web && pnpm dev

# Kill any leftover dev processes (port-forward, console, vite)
dev-kill:
    -pkill -f 'port-forward svc/platform-agent'
    -pkill -f 'go run ./cmd/console'
    -pkill -f 'console.*-dev.*-addr :9090'
    -pkill -f 'vite.*agent-console'
    @echo "→ Cleaned up dev processes."

# --------------------------------------------------------------------------
# Build & test
# --------------------------------------------------------------------------

# Install frontend dependencies
install:
    cd web && pnpm install

# Build frontend
build-front:
    cd web && pnpm build

# Build Go binary
build-back:
    go build -o console ./cmd/console

# Build everything
build: build-front build-back

# Type-check frontend
check:
    cd web && npx tsc --noEmit

# Run Go tests
test:
    go test ./...

# --------------------------------------------------------------------------
# Release
# --------------------------------------------------------------------------

# Tag and push a release (usage: just release 0.0.3)
release version:
    git tag v{{version}}
    git push origin v{{version}}
    @echo "→ Tagged and pushed v{{version}}. Watch CI: gh run list --repo samyn92/agent-console"
