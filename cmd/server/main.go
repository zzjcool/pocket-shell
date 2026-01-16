package main

import (
	"crypto/rand"
	"encoding/base64"
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
	// Define flags with short versions
	port := flag.String("p", "8080", "Server port")
	host := flag.String("h", "0.0.0.0", "Server host")
	username := flag.String("u", "admin", "Login username")
	password := flag.String("P", "", "Login password (random if empty)")
	shell := flag.String("s", "", "Shell to use (default: system default)")
	version := flag.Bool("v", false, "Print version")
	help := flag.Bool("help", false, "Show help")

	// Long flag aliases
	flag.StringVar(port, "port", "8080", "Server port")
	flag.StringVar(host, "host", "0.0.0.0", "Server host")
	flag.StringVar(username, "user", "admin", "Login username")
	flag.StringVar(password, "pass", "", "Login password")
	flag.StringVar(shell, "shell", "", "Shell to use")
	flag.BoolVar(version, "version", false, "Print version")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Pocket Shell - Mobile-optimized web terminal\n\n")
		fmt.Fprintf(os.Stderr, "Usage: pocket-shell [options]\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		fmt.Fprintf(os.Stderr, "  -p, --port <port>      Server port (default: 8080)\n")
		fmt.Fprintf(os.Stderr, "  -h, --host <host>      Server host (default: 0.0.0.0)\n")
		fmt.Fprintf(os.Stderr, "  -u, --user <name>      Login username (default: admin)\n")
		fmt.Fprintf(os.Stderr, "  -P, --pass <pass>      Login password (random if not set)\n")
		fmt.Fprintf(os.Stderr, "  -s, --shell <path>     Shell to use (default: system shell)\n")
		fmt.Fprintf(os.Stderr, "  -v, --version          Print version and exit\n")
		fmt.Fprintf(os.Stderr, "      --help             Show this help\n")
		fmt.Fprintf(os.Stderr, "\nExamples:\n")
		fmt.Fprintf(os.Stderr, "  pocket-shell                     # Start with random password\n")
		fmt.Fprintf(os.Stderr, "  pocket-shell -p 3000             # Use port 3000\n")
		fmt.Fprintf(os.Stderr, "  pocket-shell -P mypass           # Set password\n")
		fmt.Fprintf(os.Stderr, "  pocket-shell -u john -P secret   # Custom user and password\n")
	}

	flag.Parse()

	if *help {
		flag.Usage()
		os.Exit(0)
	}

	if *version {
		fmt.Printf("pocket-shell %s\n", Version)
		os.Exit(0)
	}

	// Generate random password if not provided
	actualPassword := *password
	if actualPassword == "" {
		actualPassword = generatePassword(8)
	}

	// Setup auth provider
	authProvider := auth.NewPasswordProvider()
	authProvider.AddUser(*username, actualPassword)

	// Setup JWT manager with random secret
	jwtSecret := generatePassword(32)
	jwtManager := auth.NewJWTManager(jwtSecret, 24*time.Hour)

	// Setup session manager
	sessionManager := session.NewManager()

	// Set shell if specified
	if *shell != "" {
		os.Setenv("SHELL", *shell)
	}

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

	// Print startup info
	addr := fmt.Sprintf("%s:%s", *host, *port)
	fmt.Printf("Pocket Shell %s\n", Version)
	if *password == "" {
		fmt.Printf("Password: %s\n", actualPassword)
	}
	fmt.Printf("Listening on http://%s\n", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
		os.Exit(1)
	}
}

// generatePassword generates a random password of given length
func generatePassword(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)[:length]
}
