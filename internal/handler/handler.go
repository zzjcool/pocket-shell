package handler

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/pocketshell/pocket-shell/internal/auth"
	"github.com/pocketshell/pocket-shell/internal/session"
)

// Handler holds all HTTP handlers
type Handler struct {
	authProvider   auth.Provider
	jwtManager     *auth.JWTManager
	sessionManager *session.Manager
	staticFS       fs.FS
}

// Config holds handler configuration
type Config struct {
	AuthProvider   auth.Provider
	JWTManager     *auth.JWTManager
	SessionManager *session.Manager
	StaticFS       embed.FS
}

// New creates a new handler
func New(cfg Config) (*Handler, error) {
	// Get the dist subdirectory from embedded FS
	staticFS, err := fs.Sub(cfg.StaticFS, "dist")
	if err != nil {
		return nil, err
	}

	return &Handler{
		authProvider:   cfg.AuthProvider,
		jwtManager:     cfg.JWTManager,
		sessionManager: cfg.SessionManager,
		staticFS:       staticFS,
	}, nil
}

// RegisterRoutes registers all routes
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// Static files with cache headers
	mux.Handle("/", h.withCacheHeaders(http.FileServer(http.FS(h.staticFS))))

	// API routes
	mux.HandleFunc("/api/login", h.handleLogin)
	mux.HandleFunc("/api/logout", h.handleLogout)
	mux.HandleFunc("/api/sessions", h.handleSessions)
	mux.HandleFunc("/api/sessions/", h.handleSessionDelete)

	// WebSocket
	mux.HandleFunc("/ws/", h.handleWebSocket)

	// Health check
	mux.HandleFunc("/health", h.handleHealth)
}

// withCacheHeaders wraps a handler to add cache headers and explicit MIME types for static assets
func (h *Handler) withCacheHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Set explicit Content-Type to avoid MIME type issues with reverse proxies
		switch {
		case strings.HasSuffix(path, ".js"):
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(path, ".css"):
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(path, ".woff2"):
			w.Header().Set("Content-Type", "font/woff2")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(path, ".woff"):
			w.Header().Set("Content-Type", "font/woff")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(path, ".ttf"):
			w.Header().Set("Content-Type", "font/ttf")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(path, ".eot"):
			w.Header().Set("Content-Type", "application/vnd.ms-fontobject")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(path, ".png"):
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "public, max-age=86400")
		case strings.HasSuffix(path, ".jpg"), strings.HasSuffix(path, ".jpeg"):
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=86400")
		case strings.HasSuffix(path, ".gif"):
			w.Header().Set("Content-Type", "image/gif")
			w.Header().Set("Cache-Control", "public, max-age=86400")
		case strings.HasSuffix(path, ".svg"):
			w.Header().Set("Content-Type", "image/svg+xml")
			w.Header().Set("Cache-Control", "public, max-age=86400")
		case strings.HasSuffix(path, ".ico"):
			w.Header().Set("Content-Type", "image/x-icon")
			w.Header().Set("Cache-Control", "public, max-age=86400")
		case path == "/" || strings.HasSuffix(path, ".html"):
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
		}

		next.ServeHTTP(w, r)
	})
}

// Pre-allocated static responses to avoid allocations
var healthResponse = []byte(`{"status":"ok"}`)

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(healthResponse)
}
