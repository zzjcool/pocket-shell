package session

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pocketshell/pocket-shell/internal/terminal"
)

// Session represents a terminal session
type Session struct {
	ID        string
	UserID    string
	PTY       *terminal.PTY
	CreatedAt time.Time
	LastUsed  time.Time
	mu        sync.Mutex
}

// NewSession creates a new session
func NewSession(userID string) (*Session, error) {
	pty, err := terminal.NewPTY("")
	if err != nil {
		return nil, err
	}

	return &Session{
		ID:        uuid.New().String(),
		UserID:    userID,
		PTY:       pty,
		CreatedAt: time.Now(),
		LastUsed:  time.Now(),
	}, nil
}

// Touch updates the last used time
func (s *Session) Touch() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastUsed = time.Now()
}

// RestartPTY restarts the PTY with a new shell
func (s *Session) RestartPTY() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Close old PTY
	if s.PTY != nil {
		s.PTY.Close()
	}

	// Create new PTY
	pty, err := terminal.NewPTY("")
	if err != nil {
		return err
	}

	s.PTY = pty
	return nil
}

// Close closes the session
func (s *Session) Close() error {
	return s.PTY.Close()
}

// Manager manages multiple sessions
type Manager struct {
	sessions    map[string]*Session
	mu          sync.RWMutex
	stopCleanup chan struct{}
}

// NewManager creates a new session manager
func NewManager() *Manager {
	return &Manager{
		sessions:    make(map[string]*Session),
		stopCleanup: make(chan struct{}),
	}
}

// StartCleanup starts a background goroutine that periodically cleans up stale sessions
func (m *Manager) StartCleanup(interval, timeout time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				m.cleanupStale(timeout)
			case <-m.stopCleanup:
				return
			}
		}
	}()
}

// StopCleanup stops the background cleanup goroutine
func (m *Manager) StopCleanup() {
	select {
	case <-m.stopCleanup:
		// Already closed
	default:
		close(m.stopCleanup)
	}
}

// cleanupStale removes sessions that haven't been used within the timeout duration
func (m *Manager) cleanupStale(timeout time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for id, session := range m.sessions {
		session.mu.Lock()
		lastUsed := session.LastUsed
		session.mu.Unlock()

		if now.Sub(lastUsed) > timeout {
			session.Close()
			delete(m.sessions, id)
		}
	}
}

// Create creates a new session for a user
func (m *Manager) Create(userID string) (*Session, error) {
	session, err := NewSession(userID)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	m.sessions[session.ID] = session
	m.mu.Unlock()

	return session, nil
}

// Get returns a session by ID
func (m *Manager) Get(sessionID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session, ok := m.sessions[sessionID]
	return session, ok
}

// Delete removes a session
func (m *Manager) Delete(sessionID string) error {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if ok {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	if ok {
		return session.Close()
	}
	return nil
}

// List returns all sessions for a user
func (m *Manager) List(userID string) []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*Session
	for _, session := range m.sessions {
		if session.UserID == userID {
			result = append(result, session)
		}
	}
	return result
}

// CloseAll closes all sessions
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, session := range m.sessions {
		session.Close()
	}
	m.sessions = make(map[string]*Session)
}
