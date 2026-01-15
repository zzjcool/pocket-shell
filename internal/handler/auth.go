package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/pocketshell/pocket-shell/internal/auth"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expires_in"`
}

// Pre-allocated common error responses
var (
	errUnauthorizedJSON      = []byte(`{"error":"Unauthorized"}`)
	errInvalidCredentialsJSON = []byte(`{"error":"Invalid credentials"}`)
	errInvalidRequestJSON    = []byte(`{"error":"Invalid request body"}`)
	errSessionNotFoundJSON   = []byte(`{"error":"Session not found"}`)
	errAccessDeniedJSON      = []byte(`{"error":"Access denied"}`)
	loggedOutJSON            = []byte(`{"message":"Logged out"}`)
	sessionDeletedJSON       = []byte(`{"message":"Session deleted"}`)
)

type errorResponse struct {
	Error string `json:"error"`
}

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONRaw(w, http.StatusBadRequest, errInvalidRequestJSON)
		return
	}

	user, err := h.authProvider.Authenticate(req.Username, req.Password)
	if err != nil {
		writeJSONRaw(w, http.StatusUnauthorized, errInvalidCredentialsJSON)
		return
	}

	token, err := h.jwtManager.Generate(user)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "Failed to generate token"})
		return
	}

	// Set cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(24 * time.Hour / time.Second),
	})

	writeJSON(w, http.StatusOK, loginResponse{
		Token:     token,
		ExpiresIn: int(24 * time.Hour / time.Second),
	})
}

func (h *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	writeJSONRaw(w, http.StatusOK, loggedOutJSON)
}

type sessionInfo struct {
	ID        string `json:"id"`
	CreatedAt string `json:"created_at"`
}

func (h *Handler) handleSessions(w http.ResponseWriter, r *http.Request) {
	claims, err := h.authenticate(r)
	if err != nil {
		writeJSONRaw(w, http.StatusUnauthorized, errUnauthorizedJSON)
		return
	}

	switch r.Method {
	case http.MethodGet:
		sessions := h.sessionManager.List(claims.UserID)
		result := make([]sessionInfo, 0, len(sessions))
		for _, s := range sessions {
			result = append(result, sessionInfo{
				ID:        s.ID,
				CreatedAt: s.CreatedAt.Format(time.RFC3339),
			})
		}
		writeJSON(w, http.StatusOK, result)

	case http.MethodPost:
		session, err := h.sessionManager.Create(claims.UserID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "Failed to create session"})
			return
		}
		writeJSON(w, http.StatusCreated, sessionInfo{
			ID:        session.ID,
			CreatedAt: session.CreatedAt.Format(time.RFC3339),
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	claims, err := h.authenticate(r)
	if err != nil {
		writeJSONRaw(w, http.StatusUnauthorized, errUnauthorizedJSON)
		return
	}

	// Extract session ID from path
	sessionID := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "Session ID required"})
		return
	}

	// Verify session belongs to user
	session, ok := h.sessionManager.Get(sessionID)
	if !ok {
		writeJSONRaw(w, http.StatusNotFound, errSessionNotFoundJSON)
		return
	}

	if session.UserID != claims.UserID {
		writeJSONRaw(w, http.StatusForbidden, errAccessDeniedJSON)
		return
	}

	if err := h.sessionManager.Delete(sessionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "Failed to delete session"})
		return
	}

	writeJSONRaw(w, http.StatusOK, sessionDeletedJSON)
}

func (h *Handler) authenticate(r *http.Request) (*auth.Claims, error) {
	// Try cookie first
	cookie, err := r.Cookie("token")
	if err == nil {
		return h.jwtManager.Verify(cookie.Value)
	}

	// Try Authorization header
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		return h.jwtManager.Verify(token)
	}

	// Try query parameter (for WebSocket)
	token := r.URL.Query().Get("token")
	if token != "" {
		return h.jwtManager.Verify(token)
	}

	return nil, auth.ErrInvalidToken
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeJSONRaw writes pre-allocated JSON bytes directly
func writeJSONRaw(w http.ResponseWriter, status int, data []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(data)
}
