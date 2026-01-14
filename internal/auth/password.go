package auth

import (
	"crypto/subtle"
)

// PasswordProvider implements password-based authentication
type PasswordProvider struct {
	users map[string]string // username -> password hash
}

// NewPasswordProvider creates a new password provider
func NewPasswordProvider() *PasswordProvider {
	return &PasswordProvider{
		users: make(map[string]string),
	}
}

// AddUser adds a user with password
func (p *PasswordProvider) AddUser(username, password string) {
	p.users[username] = password
}

// Authenticate validates username and password
func (p *PasswordProvider) Authenticate(username, password string) (*User, error) {
	storedPassword, ok := p.users[username]
	if !ok {
		return nil, ErrUserNotFound
	}

	if subtle.ConstantTimeCompare([]byte(storedPassword), []byte(password)) != 1 {
		return nil, ErrInvalidCredentials
	}

	return &User{
		ID:       username,
		Username: username,
	}, nil
}

// Name returns the provider name
func (p *PasswordProvider) Name() string {
	return "password"
}
