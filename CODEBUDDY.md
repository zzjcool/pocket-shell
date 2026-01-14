# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

<<<<<<< HEAD
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
=======
Pocket Shell is a mobile-optimized web terminal that provides command-line access via a phone browser. It consists of a Go backend with embedded TypeScript frontend, using WebSockets for real-time terminal communication.

## Build & Development Commands

```bash
# Install all dependencies (npm + go mod)
make install-deps

# Build complete project (frontend + backend) -> outputs to bin/pocket-shell
make build

# Development mode (builds frontend, then runs server with go run)
>>>>>>> 2a5aa1d (fix Chinese IME error)
make dev

# Build frontend only
make web

# Build backend only (requires frontend built first)
make server

<<<<<<< HEAD
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
=======
# Clean all build artifacts
make clean

# Run the built binary
make run
# Or directly: ./bin/pocket-shell -addr :8080
```

### Frontend-specific commands
```bash
cd web
npm install          # Install dependencies
npm run build        # Production build with esbuild
npm run dev          # Watch mode for development
```

### Running the server with options
```bash
./bin/pocket-shell \
  -addr :8080 \
  -user admin \
  -pass secret \
  -secret "jwt-secret-key"
>>>>>>> 2a5aa1d (fix Chinese IME error)
```

## Architecture

<<<<<<< HEAD
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
=======
### Backend (Go)

```
cmd/server/main.go          # Entry point, wires dependencies
internal/
  auth/
    auth.go                 # Provider interface definition
    password.go             # Username/password authentication implementation
    jwt.go                  # JWT token generation and verification
  handler/
    handler.go              # HTTP route registration, Handler struct
    auth.go                 # Login/logout HTTP handlers
    ws.go                   # WebSocket handler for terminal I/O
  session/
    session.go              # Session + Manager for multi-session support
  terminal/
    pty.go                  # PTY wrapper using creack/pty
web/
  embed.go                  # go:embed directive for static assets
```

**Key Data Flow:**
1. Client authenticates via `POST /api/login` → receives JWT token
2. Client creates session via `POST /api/sessions` → backend spawns PTY with shell
3. Client connects to `GET /ws/{sessionId}` (with JWT in cookie) → bidirectional WebSocket
4. WebSocket handler bridges: PTY stdout → WebSocket output, WebSocket input → PTY stdin

**Authentication Flow:**
- `auth.Provider` interface allows pluggable auth (currently only password provider)
- `JWTManager` generates/verifies tokens stored in `token` cookie
- All authenticated routes check JWT via `handler.authenticate()`

**Session Lifecycle:**
- `session.Manager` maintains map of `sessionID → *Session`
- Each `Session` owns a `terminal.PTY` (shell process)
- Shell auto-restarts on exit (user sees "Shell exited, restarting...")

### Frontend (TypeScript)

```
web/src/
  main.ts                   # App entry, login/terminal view switching
  terminal.ts               # xterm.js wrapper + WebSocket connection
  keyboard.ts               # Virtual keyboard for mobile
  api.ts                    # HTTP/WebSocket client (login, sessions, etc.)
  types.ts                  # TypeScript type definitions
web/static/
  index.html                # HTML template
web/dist/                   # Build output (gitignored)
```

**Build Pipeline:**
- esbuild bundles `src/main.ts` → `dist/app.js`
- `go:embed dist/*` in `web/embed.go` embeds into binary
- Handler serves from embedded FS at runtime

### WebSocket Protocol

```typescript
// Client → Server
{ type: 'input', data: string }    // Terminal input
{ type: 'resize', data: { rows, cols } }  // Terminal resize
{ type: 'ping', data: null }       // Keepalive

// Server → Client  
{ type: 'output', data: string }   // Terminal output
{ type: 'pong', data: timestamp }  // Ping response
{ type: 'error', message: string } // Error
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/login` | No | Authenticate, sets JWT cookie |
| POST | `/api/logout` | Yes | Clear session |
| GET | `/api/sessions` | Yes | List user's sessions |
| POST | `/api/sessions` | Yes | Create new session |
| DELETE | `/api/sessions/:id` | Yes | Close session |
| GET | `/ws/:sessionId` | Yes | WebSocket terminal connection |
| GET | `/health` | No | Health check |

## Key Dependencies

**Go:**
- `nhooyr.io/websocket` - WebSocket library
- `github.com/creack/pty` - PTY allocation
- `github.com/golang-jwt/jwt/v5` - JWT handling
- `github.com/google/uuid` - Session IDs

**TypeScript:**
- `xterm` + `xterm-addon-fit` + `xterm-addon-web-links` - Terminal emulator
- `esbuild` - Bundler
>>>>>>> 2a5aa1d (fix Chinese IME error)
