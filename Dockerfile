# Build frontend — Node produces platform-independent JS bundles
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-builder

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Build backend — runs natively on the build host, cross-compiles for TARGETARCH
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS backend-builder

ARG TARGETARCH

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -a -installsuffix cgo -o console ./cmd/console

# Runtime stage
FROM gcr.io/distroless/static:nonroot

WORKDIR /

COPY --from=backend-builder /app/console .
COPY --from=frontend-builder /app/web/dist /web

USER 65532:65532

EXPOSE 8080

ENTRYPOINT ["/console", "-addr", ":8080", "-web-dir", "/web"]
