package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/pocketshell/pocket-shell/internal/auth"
	"github.com/pocketshell/pocket-shell/internal/handler"
	"github.com/pocketshell/pocket-shell/internal/session"
	"github.com/pocketshell/pocket-shell/web"
)

var (
	// Version is set by ldflags during build
	Version = "dev"
)

func main() {
	addr := flag.String("addr", ":8080", "Server address")
	username := flag.String("user", "admin", "Login username")
	password := flag.String("pass", "admin", "Login password")
	jwtSecret := flag.String("secret", "pocket-shell-secret-key", "JWT secret key")
	version := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *version {
		fmt.Printf("pocket-shell %s\n", Version)
		os.Exit(0)
	}

	// Setup auth provider
	authProvider := auth.NewPasswordProvider()
	authProvider.AddUser(*username, *password)

	// Setup JWT manager
	jwtManager := auth.NewJWTManager(*jwtSecret, 24*time.Hour)

	// Setup session manager (sessions persist until manually deleted or server restart)
	sessionManager := session.NewManager()

	// Setup handler
	h, err := handler.New(handler.Config{
		AuthProvider:   authProvider,
		JWTManager:     jwtManager,
		SessionManager: sessionManager,
		StaticFS:       web.StaticFS,
	})
	if err != nil {
		log.Fatalf("Failed to create handler: %v", err)
	}

	// Register routes
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// Start server
	log.Printf("Pocket Shell starting on %s", *addr)
	log.Printf("Login with username: %s, password: %s", *username, *password)

	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
		os.Exit(1)
	}
}
