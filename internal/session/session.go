package session

import (
	"bytes"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/pocketshell/pocket-shell/internal/terminal"
)

// Default output buffer size (64KB should capture recent terminal output)
const DefaultOutputBufferSize = 64 * 1024

// RingBuffer is a simple ring buffer for storing output history
type RingBuffer struct {
	data  []byte
	size  int
	start int
	len   int
	mu    sync.Mutex
}

// NewRingBuffer creates a new ring buffer with the given size
func NewRingBuffer(size int) *RingBuffer {
	return &RingBuffer{
		data: make([]byte, size),
		size: size,
	}
}

// Write appends data to the ring buffer
func (r *RingBuffer) Write(p []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, b := range p {
		pos := (r.start + r.len) % r.size
		r.data[pos] = b
		if r.len < r.size {
			r.len++
		} else {
			r.start = (r.start + 1) % r.size
		}
	}
}

// Bytes returns all data in the buffer in order
func (r *RingBuffer) Bytes() []byte {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.len == 0 {
		return nil
	}

	result := make([]byte, r.len)
	for i := 0; i < r.len; i++ {
		result[i] = r.data[(r.start+i)%r.size]
	}
	return result
}

// Len returns the current length of data in the buffer
func (r *RingBuffer) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.len
}

// MouseMode tracks the current mouse tracking mode state
// These correspond to xterm mouse tracking modes:
// - 1000: Basic mouse tracking (clicks)
// - 1002: Button event tracking (drags)
// - 1003: All mouse motion tracking
// - 1006: SGR extended mouse mode (coordinates > 223)
type MouseMode struct {
	Mode1000        bool // Basic mouse tracking
	Mode1002        bool // Button event tracking
	Mode1003        bool // All motion tracking
	Mode1006        bool // SGR extended mode
	AlternateScreen bool // Whether in alternate screen buffer (vim, zellij, etc.)
	mu              sync.Mutex
}

// Mouse mode escape sequence patterns
var (
	mouseMode1000Enable  = []byte("\x1b[?1000h")
	mouseMode1000Disable = []byte("\x1b[?1000l")
	mouseMode1002Enable  = []byte("\x1b[?1002h")
	mouseMode1002Disable = []byte("\x1b[?1002l")
	mouseMode1003Enable  = []byte("\x1b[?1003h")
	mouseMode1003Disable = []byte("\x1b[?1003l")
	mouseMode1006Enable  = []byte("\x1b[?1006h")
	mouseMode1006Disable = []byte("\x1b[?1006l")
	// Alternate screen buffer sequences
	alternateScreenEnable  = []byte("\x1b[?1049h")
	alternateScreenDisable = []byte("\x1b[?1049l")
)

// Update parses output data for mouse mode escape sequences and updates state
func (m *MouseMode) Update(data []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for alternate screen buffer sequences
	if bytes.Contains(data, alternateScreenEnable) {
		m.AlternateScreen = true
	}
	if bytes.Contains(data, alternateScreenDisable) {
		m.AlternateScreen = false
	}

	// Check for mode enable/disable sequences
	if bytes.Contains(data, mouseMode1000Enable) {
		m.Mode1000 = true
	}
	if bytes.Contains(data, mouseMode1000Disable) {
		m.Mode1000 = false
	}
	if bytes.Contains(data, mouseMode1002Enable) {
		m.Mode1002 = true
	}
	if bytes.Contains(data, mouseMode1002Disable) {
		m.Mode1002 = false
	}
	if bytes.Contains(data, mouseMode1003Enable) {
		m.Mode1003 = true
	}
	if bytes.Contains(data, mouseMode1003Disable) {
		m.Mode1003 = false
	}
	if bytes.Contains(data, mouseMode1006Enable) {
		m.Mode1006 = true
	}
	if bytes.Contains(data, mouseMode1006Disable) {
		m.Mode1006 = false
	}
}

// DebugState returns a string describing the current state
func (m *MouseMode) DebugState() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fmt.Sprintf("1000=%v 1002=%v 1003=%v 1006=%v alt=%v", m.Mode1000, m.Mode1002, m.Mode1003, m.Mode1006, m.AlternateScreen)
}

// GetEnableSequence returns the escape sequence to restore current mouse mode
// If in alternate screen but no explicit mouse mode was detected, enable all mouse modes
// (this handles apps like zellij that may not send standard mouse mode sequences)
func (m *MouseMode) GetEnableSequence() string {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If we have explicit mouse modes set, use them
	if m.Mode1000 || m.Mode1002 || m.Mode1003 || m.Mode1006 {
		var seq string
		if m.Mode1000 {
			seq += "\x1b[?1000h"
		}
		if m.Mode1002 {
			seq += "\x1b[?1002h"
		}
		if m.Mode1003 {
			seq += "\x1b[?1003h"
		}
		if m.Mode1006 {
			seq += "\x1b[?1006h"
		}
		return seq
	}

	// If in alternate screen but no mouse mode detected, enable full mouse support
	// This handles apps like zellij that use mouse but may not send standard sequences
	if m.AlternateScreen {
		return "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"
	}

	return ""
}

// IsEnabled returns true if any mouse mode is enabled
func (m *MouseMode) IsEnabled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.Mode1000 || m.Mode1002 || m.Mode1003 || m.Mode1006
}

// Reset clears all mouse mode states
func (m *MouseMode) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Mode1000 = false
	m.Mode1002 = false
	m.Mode1003 = false
	m.Mode1006 = false
	m.AlternateScreen = false
}

// IsAlternateScreen returns true if in alternate screen buffer
func (m *MouseMode) IsAlternateScreen() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.AlternateScreen
}

// GetModeRestoreSequence returns all escape sequences needed to restore terminal state
// This includes alternate screen mode and mouse tracking modes
func (m *MouseMode) GetModeRestoreSequence() string {
	m.mu.Lock()
	defer m.mu.Unlock()

	var seq string

	// First, restore alternate screen if active
	if m.AlternateScreen {
		seq += "\x1b[?1049h"
	}

	// Then restore mouse modes
	if m.Mode1000 || m.Mode1002 || m.Mode1003 || m.Mode1006 {
		if m.Mode1000 {
			seq += "\x1b[?1000h"
		}
		if m.Mode1002 {
			seq += "\x1b[?1002h"
		}
		if m.Mode1003 {
			seq += "\x1b[?1003h"
		}
		if m.Mode1006 {
			seq += "\x1b[?1006h"
		}
	} else if m.AlternateScreen {
		// If in alternate screen but no explicit mouse mode, enable full mouse support
		seq += "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"
	}

	return seq
}

// Session represents a terminal session
type Session struct {
	ID           string
	UserID       string
	PTY          *terminal.PTY
	CreatedAt    time.Time
	lastUsed     atomic.Int64 // Unix nano timestamp for lock-free access
	mu           sync.Mutex
	OutputBuffer *RingBuffer // Stores recent output for reconnection
	MouseMode    *MouseMode  // Tracks current mouse mode state
}

// NewSession creates a new session
func NewSession(userID string) (*Session, error) {
	pty, err := terminal.NewPTY("")
	if err != nil {
		return nil, err
	}

	return &Session{
		ID:           uuid.New().String(),
		UserID:       userID,
		PTY:          pty,
		CreatedAt:    time.Now(),
		lastUsed:     func() atomic.Int64 { var v atomic.Int64; v.Store(time.Now().UnixNano()); return v }(),
		OutputBuffer: NewRingBuffer(DefaultOutputBufferSize),
		MouseMode:    &MouseMode{},
	}, nil
}

// Touch updates the last used time (lock-free)
func (s *Session) Touch() {
	s.lastUsed.Store(time.Now().UnixNano())
}

// GetLastUsed returns the last used time
func (s *Session) GetLastUsed() time.Time {
	return time.Unix(0, s.lastUsed.Load())
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
	// Reset output buffer and mouse mode for new shell
	s.OutputBuffer = NewRingBuffer(DefaultOutputBufferSize)
	s.MouseMode = &MouseMode{}
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
		lastUsed := session.GetLastUsed()

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
