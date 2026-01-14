# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

Pocket Shell is a mobile-optimized web terminal that provides command-line access through a phone browser. It features a Go backend with WebSocket-based PTY management and a TypeScript frontend using xterm.js.

## Tech Stack

- **Backend**: Go 1.24+
- **Frontend**: TypeScript with esbuild
- **Terminal**: xterm.js
- **WebSocket**: nhooyr.io/websocket
- **PTY**: github.com/creack/pty
- **Auth**: JWT tokens (github.com/golang-jwt/jwt/v5)

## Common Commands

```bash
# Install dependencies
make install-deps

# Build everything (frontend + backend)
make build

# Development mode (builds frontend, runs server)
make dev

# Build frontend only
make web

# Build backend only (requires frontend built first)
make server

# Run the server after build
make run

# Clean build artifacts
make clean
```

### Running the Server

```bash
./bin/pocket-shell -addr :8080 -user admin -pass admin
```

Server flags:
- `-addr`: Server address (default `:8080`)
- `-user`: Login username (default `admin`)
- `-pass`: Login password (default `admin`)
- `-secret`: JWT secret key

### Frontend Development

```bash
cd web
npm install
npm run build   # Production build
npm run dev     # Watch mode with auto-rebuild
```

## Architecture

```
pocket-shell/
├── cmd/server/main.go     # Entry point - sets up auth, sessions, HTTP server
├── internal/
│   ├── auth/              # Authentication layer
│   │   ├── auth.go        # Provider interface
│   │   ├── password.go    # Username/password provider
│   │   └── jwt.go         # JWT token management
│   ├── handler/           # HTTP handlers
│   │   ├── handler.go     # Route registration, static file serving
│   │   ├── auth.go        # Login/logout endpoints
│   │   └── ws.go          # WebSocket handler for terminal I/O
│   ├── session/
│   │   └── session.go     # Session + Manager for multi-session support
│   └── terminal/
│       └── pty.go         # PTY wrapper with resize/signal support
└── web/
    ├── embed.go           # Embeds dist/ into Go binary
    ├── src/
    │   ├── main.ts        # App entry - login flow, terminal setup
    │   ├── terminal.ts    # xterm.js wrapper with WebSocket connection
    │   ├── keyboard.ts    # Virtual keyboard for mobile
    │   ├── api.ts         # HTTP/WebSocket client
    │   └── types.ts       # TypeScript types
    └── static/index.html  # HTML template
```

## Key Concepts

### Data Flow

1. User authenticates via `/api/login` → receives JWT token
2. Frontend creates session via `/api/sessions` POST
3. WebSocket connection established at `/ws/{sessionId}`
4. Terminal input/output flows bidirectionally over WebSocket as JSON messages:
   - Client → Server: `{type: "input"|"resize"|"ping", data: ...}`
   - Server → Client: `{type: "output"|"pong"|"error", data: ...}`

### Authentication

The `auth.Provider` interface allows pluggable authentication:

```go
type Provider interface {
    Authenticate(username, password string) (*User, error)
    Name() string
}
```

Currently only password authentication is implemented. JWT tokens are used for session authorization.

### Session Management

`session.Manager` handles terminal sessions:
- `Create(userID)` - spawns new PTY with user's shell
- `Get(sessionID)` - retrieves existing session
- `Delete(sessionID)` - closes PTY and removes session
- `List(userID)` - returns all sessions for a user

### PTY Handling

The `terminal.PTY` wrapper:
- Starts a shell process with TERM=xterm-256color
- Provides Read/Write for terminal I/O
- Supports `Resize(rows, cols)` which triggers SIGWINCH
- Thread-safe operations with mutex

### Frontend Structure

- `TerminalManager` wraps xterm.js with WebSocket connection, handles resize with ResizeObserver
- `VirtualKeyboard` provides mobile-friendly special key buttons (Ctrl, Alt, arrow keys, etc.)
- FitAddon used for terminal dimension calculations

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | Authenticate, returns JWT |
| POST | `/api/logout` | Clear session |
| GET | `/api/sessions` | List user sessions |
| POST | `/api/sessions` | Create new session |
| DELETE | `/api/sessions/:id` | Close session |
| GET | `/ws/:sessionId` | WebSocket connection |
| GET | `/health` | Health check |

## Build Output

The final binary is at `bin/pocket-shell`. It embeds the frontend from `web/dist/` via Go's embed directive, resulting in a single self-contained executable.
