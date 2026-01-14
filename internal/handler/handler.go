package handler

import (
	"embed"
	"io/fs"
	"net/http"

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
	// Static files
	mux.Handle("/", http.FileServer(http.FS(h.staticFS)))

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

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}
