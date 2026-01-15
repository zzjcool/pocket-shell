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

// withCacheHeaders wraps a handler to add cache headers for static assets
func (h *Handler) withCacheHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		// Long cache for immutable assets (JS, CSS with content hash)
		if strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".css") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else if strings.HasSuffix(path, ".woff2") || strings.HasSuffix(path, ".woff") ||
			strings.HasSuffix(path, ".ttf") || strings.HasSuffix(path, ".eot") {
			// Long cache for fonts
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else if strings.HasSuffix(path, ".png") || strings.HasSuffix(path, ".jpg") ||
			strings.HasSuffix(path, ".jpeg") || strings.HasSuffix(path, ".gif") ||
			strings.HasSuffix(path, ".svg") || strings.HasSuffix(path, ".ico") {
			// Long cache for images
			w.Header().Set("Cache-Control", "public, max-age=86400")
		} else if path == "/" || strings.HasSuffix(path, ".html") {
			// Short cache for HTML (revalidate)
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
