# Agent Console Development
# Usage: just dev       — runs everything (port-forward + backend + frontend)
#        just dev-back  — runs Go backend only
#        just dev-front — runs Vite frontend only

set dotenv-load

default:
    @just --list

# --------------------------------------------------------------------------
# Dev: run all three processes (port-forward, backend, frontend)
# --------------------------------------------------------------------------

# Run full local dev stack (port-forward + Go backend + Vite frontend)
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

    # 1. Port-forward the agent service
    echo "→ Port-forwarding platform-agent (agents/platform-agent:4096 → localhost:4096)..."
    kubectl port-forward svc/platform-agent 4096:4096 -n agents &

    sleep 1

    # 2. Go backend on :9090 with dev flags
    #    - Use a random high port for OTLP to avoid conflicts with cluster receivers
    echo "→ Starting Go backend on :9090..."
    AGENT_URL_OVERRIDE=http://localhost:4096 \
      go run ./cmd/console -addr :9090 -otlp-addr :0 -dev -kubeconfig "$HOME/.kube/config" &

    sleep 2

    # 3. Vite frontend
    echo "→ Starting Vite dev server..."
    cd web && pnpm dev &

    echo ""
    echo "✓ Dev stack running:"
    echo "  Frontend → http://localhost:5173"
    echo "  Backend  → http://localhost:9090"
    echo "  Agent    → http://localhost:4096 (port-forward)"
    echo ""
    echo "Press Ctrl+C to stop all."
    wait

# --------------------------------------------------------------------------
# Individual components
# --------------------------------------------------------------------------

# Port-forward the platform-agent service from the cluster
port-forward:
    kubectl port-forward svc/platform-agent 4096:4096 -n agents

# Run Go backend in dev mode (expects port-forward or AGENT_URL_OVERRIDE)
dev-back:
    AGENT_URL_OVERRIDE=${AGENT_URL_OVERRIDE:-http://localhost:4096} \
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
