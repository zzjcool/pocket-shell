package auth

import "errors"

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserNotFound       = errors.New("user not found")
)

// User represents an authenticated user
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

// Provider defines the authentication provider interface
type Provider interface {
	// Authenticate validates credentials and returns a user
	Authenticate(username, password string) (*User, error)
	// Name returns the provider name
	Name() string
}
