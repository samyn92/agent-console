package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-logr/zapr"
	"github.com/samyn92/agent-console/internal/k8s"
	"github.com/samyn92/agent-console/internal/server"
	"github.com/samyn92/agent-console/internal/telemetry"
	"go.uber.org/zap"
	crlog "sigs.k8s.io/controller-runtime/pkg/log"
)

func main() {
	var (
		addr       = flag.String("addr", ":8080", "HTTP server address")
		otlpAddr   = flag.String("otlp-addr", ":4317", "OTLP gRPC receiver address")
		kubeconfig = flag.String("kubeconfig", "", "Path to kubeconfig (uses in-cluster config if empty)")
		namespace  = flag.String("namespace", "", "Namespace to watch (restricts cache; required for namespace-scoped RBAC)")
		devMode    = flag.Bool("dev", false, "Enable development mode (relaxed CORS)")
		webDir     = flag.String("web-dir", "", "Path to static web files (if serving embedded)")
	)
	flag.Parse()

	// Setup logger
	var logger *zap.Logger
	var err error
	if *devMode {
		logger, err = zap.NewDevelopment()
	} else {
		logger, err = zap.NewProduction()
	}
	if err != nil {
		panic(err)
	}
	defer logger.Sync()

	// Initialize controller-runtime logger to suppress noisy warnings
	crlog.SetLogger(zapr.NewLogger(logger))

	log := logger.Sugar()
	log.Info("Starting Agent Operator Console")

	// Log agent routing mode so operators know which path is active
	if override := os.Getenv("AGENT_URL_OVERRIDE"); override != "" {
		log.Warnw("AGENT_URL_OVERRIDE is set — ALL agents will use the same backend (single-agent mode)",
			"url", override)
	} else if proxyURL := os.Getenv("KUBECTL_PROXY_URL"); proxyURL != "" {
		log.Infow("Using kubectl proxy for per-agent routing (multi-agent mode)",
			"proxyURL", proxyURL)
	} else {
		log.Info("Using in-cluster service DNS for per-agent routing (production mode)")
	}

	// Create context that listens for shutdown signals
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Info("Received shutdown signal")
		cancel()
	}()

	// Initialize trace storage
	traceStorage := telemetry.NewStorage(telemetry.DefaultStorageConfig())
	log.Infow("Trace storage initialized",
		"maxTraces", telemetry.DefaultStorageConfig().MaxTraces,
		"retention", telemetry.DefaultStorageConfig().Retention)

	// Initialize K8s client (don't start yet - just create)
	k8sClient, err := k8s.NewClient(*kubeconfig, *namespace, log)
	if err != nil {
		log.Fatalw("Failed to create K8s client", "error", err)
	}

	// Create HTTP server (but don't block on Run yet)
	srv := server.New(server.Config{
		Addr:         *addr,
		DevMode:      *devMode,
		WebDir:       *webDir,
		K8sClient:    k8sClient,
		TraceStorage: traceStorage,
		Logger:       log,
	})

	// Start HTTP server in background first (so health checks pass)
	go func() {
		if err := srv.Run(ctx); err != nil {
			log.Fatalw("Server error", "error", err)
		}
	}()

	// Start OTLP receiver
	receiver := telemetry.NewReceiver(telemetry.ReceiverConfig{
		GRPCAddr: *otlpAddr,
	}, traceStorage, log)
	if err := receiver.Start(ctx); err != nil {
		log.Fatalw("Failed to start OTLP receiver", "error", err)
	}

	// Start informers (this waits for cache sync)
	if err := k8sClient.Start(ctx); err != nil {
		log.Fatalw("Failed to start K8s informers", "error", err)
	}

	// Wait for shutdown
	<-ctx.Done()

	log.Info("Shutdown complete")
}
