package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/samyn92/agent-console/internal/handlers"
	"github.com/samyn92/agent-console/internal/k8s"
	"github.com/samyn92/agent-console/internal/telemetry"
	"go.uber.org/zap"
)

// Config holds server configuration
type Config struct {
	Addr         string
	DevMode      bool
	WebDir       string
	K8sClient    *k8s.Client
	TraceStorage *telemetry.Storage
	Logger       *zap.SugaredLogger
}

// Server is the HTTP server
type Server struct {
	cfg    Config
	router chi.Router
	log    *zap.SugaredLogger
}

// New creates a new server
func New(cfg Config) *Server {
	s := &Server{
		cfg: cfg,
		log: cfg.Logger,
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	r := chi.NewRouter()

	// Global middleware (applied to all routes)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS
	corsOpts := cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}
	if !s.cfg.DevMode {
		corsOpts.AllowedOrigins = []string{} // Restrict in production
	}
	r.Use(cors.Handler(corsOpts))

	// Health check
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// API routes
	h := handlers.New(s.cfg.K8sClient, s.cfg.TraceStorage, s.log)
	th := handlers.NewTraceHandlers(s.cfg.TraceStorage)

	r.Route("/api/v1", func(r chi.Router) {
		// SSE endpoints - NO timeout middleware (long-lived connections)
		r.Group(func(r chi.Router) {
			r.Get("/watch", h.Watch)
			r.Get("/watch/traces", th.WatchTraces)
			r.Get("/agents/{namespace}/{name}/events", h.AgentEvents)
		})

		// Regular API endpoints - 60s timeout
		r.Group(func(r chi.Router) {
			r.Use(middleware.Timeout(60 * time.Second))

			// Agents
			r.Get("/agents", h.ListAgents)
			r.Get("/agents/{namespace}/{name}", h.GetAgent)
			r.Post("/agents/{namespace}/{name}/chat", h.ChatWithAgent)
			r.Post("/agents/{namespace}/{name}/question/{requestID}/reply", h.ReplyToQuestion)
			r.Post("/agents/{namespace}/{name}/question/{requestID}/reject", h.RejectQuestion)
			r.Post("/agents/{namespace}/{name}/permission/{permissionID}/reply", h.ReplyToPermission)
			r.Post("/agents/{namespace}/{name}/abort", h.AbortSession)

			// Sessions (chat history)
			r.Get("/agents/{namespace}/{name}/sessions", h.ListSessions)
			r.Post("/agents/{namespace}/{name}/sessions", h.CreateSession)
			r.Get("/agents/{namespace}/{name}/sessions/{sessionID}", h.GetSession)
			r.Delete("/agents/{namespace}/{name}/sessions/{sessionID}", h.DeleteSession)
			r.Get("/agents/{namespace}/{name}/sessions/{sessionID}/messages", h.GetSessionMessages)
			r.Get("/agents/{namespace}/{name}/sessions/{sessionID}/parts", h.GetSessionParts)
			r.Get("/agents/{namespace}/{name}/sessions/{sessionID}/diff", h.GetSessionDiff)

			// VCS & Git context
			r.Get("/agents/{namespace}/{name}/vcs", h.GetAgentVCS)
			r.Get("/agents/{namespace}/{name}/git-context", h.GetAgentGitContext)
			r.Get("/agents/{namespace}/{name}/commits", h.GetAgentCommits)
			r.Get("/agents/{namespace}/{name}/pull-requests", h.GetAgentPRs)
			r.Get("/agents/{namespace}/{name}/pipelines", h.GetAgentPipelines)

			// Workflows
			r.Get("/workflows", h.ListWorkflows)
			r.Get("/workflows/{namespace}/{name}", h.GetWorkflow)
			r.Get("/workflowruns", h.ListWorkflowRuns)

			// Channels
			r.Get("/channels", h.ListChannels)
			r.Get("/channels/{namespace}/{name}", h.GetChannel)

			// Capabilities
			r.Get("/capabilities", h.ListCapabilities)
			r.Get("/capabilities/{namespace}/{name}", h.GetCapability)

			// Repositories (aggregated from agent git capabilities)
			r.Get("/repos", h.ListRepos)
			r.Get("/repos/{owner}/{name}", h.GetRepo)
			r.Get("/repos/{owner}/{name}/detail", h.GetRepoDetail)
			r.Get("/repos/{owner}/{name}/contents", h.GetRepoContents)
			r.Get("/repos/{owner}/{name}/contents/*", h.GetRepoContents)
			r.Get("/repos/{owner}/{name}/file/*", h.GetFileContent)

			// Kubernetes resources (for browsing)
			r.Get("/kubernetes/namespaces", h.ListNamespaces)
			r.Get("/kubernetes/namespaces/{namespace}/workloads", h.ListWorkloads)
			r.Get("/kubernetes/namespaces/{namespace}/workloads/{name}", h.GetWorkload)
			r.Get("/kubernetes/namespaces/{namespace}/workloads/{name}/pods", h.ListWorkloadPods)
			r.Get("/kubernetes/namespaces/{namespace}/pods", h.ListPods)
			r.Get("/kubernetes/namespaces/{namespace}/services", h.ListServices)
			r.Get("/kubernetes/namespaces/{namespace}/events", h.ListEvents)

			// Helm releases
			r.Get("/helm/releases", h.ListHelmReleases)

			// Traces
			r.Get("/traces", th.ListTraces)
			r.Get("/traces/{traceId}", th.GetTrace)
			r.Get("/traces/{traceId}/tree", th.GetTraceTree)
			r.Get("/traces/stats", th.GetStats)

			// Telemetry ingestion (from OpenCode plugin)
			r.Post("/telemetry/spans", th.IngestSpan)
		})
	})

	// Serve static files in production
	if s.cfg.WebDir != "" {
		s.serveStaticFiles(r, s.cfg.WebDir)
	}

	s.router = r
}

func (s *Server) serveStaticFiles(r chi.Router, dir string) {
	// Serve index.html for SPA routing
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dir, r.URL.Path)

		// Check if file exists
		if _, err := os.Stat(path); os.IsNotExist(err) {
			// Serve index.html for SPA routes
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}

		http.ServeFile(w, r, path)
	})
}

// Run starts the server
func (s *Server) Run(ctx context.Context) error {
	srv := &http.Server{
		Addr:         s.cfg.Addr,
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // Disabled: SSE endpoints need unlimited write time
		IdleTimeout:  120 * time.Second,
	}

	// Channel to capture server errors
	errCh := make(chan error, 1)

	go func() {
		s.log.Infow("Starting HTTP server", "addr", s.cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// Wait for context cancellation or error
	select {
	case <-ctx.Done():
		s.log.Info("Shutting down server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

// JSON helper for handlers
func JSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

// Error helper for handlers
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}

// SSE helper for streaming responses
func SSE(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering
}

// WriteSSE writes an SSE event
func WriteSSE(w http.ResponseWriter, event string, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, jsonData)
	if err != nil {
		return err
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return nil
}
