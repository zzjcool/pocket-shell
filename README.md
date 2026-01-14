# Pocket Shell

A mobile-optimized web terminal that lets you use the command line smoothly on your phone browser.

[中文文档](./README_zh.md)

## Features

- **Mobile Optimized** - Touch-friendly interaction design
- **TUI Style Interface** - Clean terminal aesthetic
- **Virtual Keyboard** - Quick access to special keys and common commands
- **Gesture Support** - Swipe to scroll, pinch to zoom
- **Multi-Session** - Multiple terminal sessions with tab switching
- **Theme System** - Base16 compatible themes, sync with terminal colors
- **Extensible Auth** - Plugin-based authentication architecture
- **Single Binary** - Compile to single executable with embedded frontend

## Quick Start

Using curl:

```bash
curl -fsSL https://raw.githubusercontent.com/pocketshell/pocket-shell/main/install.sh | sh
```

Using wget:

```bash
wget -qO- https://raw.githubusercontent.com/pocketshell/pocket-shell/main/install.sh | sh
```

After installation, run:

```bash
pocket-shell
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Go 1.21+ |
| WebSocket | nhooyr/websocket |
| PTY | creack/pty |
| Frontend | TypeScript |
| Terminal | xterm.js |
| Build | esbuild |
| Embedding | go:embed |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile Browser                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [1:bash●] [2:vim] [3:htop]              [+] [@]  │  │
│  ├───────────────────────────────────────────────────┤  │
│  │                                                   │  │
│  │                   xterm.js                        │  │
│  │               Terminal Display                    │  │
│  │                                                   │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  [⇥] [Ctrl] [Alt] [Esc] [↑] [↓] [←] [→] [⋮]     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ WebSocket + JWT
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Go Backend                         │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                Auth Middleware                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐    │   │
│  │  │  Password  │ │   LDAP     │ │   OAuth    │    │   │
│  │  │  Provider  │ │  Provider  │ │  Provider  │    │   │
│  │  └────────────┘ └────────────┘ └────────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Session Manager                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │   │
│  │  │ Session1 │ │ Session2 │ │ Session3 │  ...    │   │
│  │  │   PTY    │ │   PTY    │ │   PTY    │         │   │
│  │  └──────────┘ └──────────┘ └──────────┘         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Static Assets (embed)                  │   │
│  │     TypeScript -> esbuild -> embedded binary      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
pocket-shell/
├── cmd/
│   └── server/
│       └── main.go              # Entry point
├── internal/
│   ├── auth/
│   │   ├── auth.go              # Auth interface
│   │   ├── password.go          # Username/password auth
│   │   └── jwt.go               # JWT token management
│   ├── handler/
│   │   ├── handler.go           # HTTP routes
│   │   ├── auth.go              # Login handler
│   │   └── ws.go                # WebSocket handler
│   ├── terminal/
│   │   └── pty.go               # PTY management
│   └── session/
│       ├── session.go           # Single session
│       └── manager.go           # Session manager
├── web/
│   ├── src/                     # TypeScript source
│   │   ├── main.ts              # Entry point
│   │   ├── terminal.ts          # xterm.js wrapper
│   │   ├── session.ts           # Session management
│   │   ├── keyboard.ts          # Virtual keyboard
│   │   ├── api.ts               # HTTP/WebSocket client
│   │   ├── types.ts             # Type definitions
│   │   └── theme/
│   │       ├── types.ts         # Theme interface
│   │       ├── manager.ts       # Theme switching
│   │       └── builtin/         # Built-in themes
│   │           ├── dracula.ts
│   │           ├── nord.ts
│   │           ├── gruvbox.ts
│   │           └── index.ts
│   ├── static/
│   │   └── index.html
│   ├── dist/                    # Build output (gitignore)
│   ├── package.json
│   ├── tsconfig.json
│   └── embed.go                 # Embed dist + static
├── Makefile
├── go.mod
└── README.md
```

## Core Design

### 1. Authentication Architecture

Extensible authentication interface:

```go
// Provider defines the authentication provider interface
type Provider interface {
    // Name returns the provider name
    Name() string
    
    // Authenticate verifies user credentials
    Authenticate(ctx context.Context, credentials map[string]string) (*User, error)
}

// User represents user information
type User struct {
    ID       string
    Username string
    Roles    []string
}

// Default: username/password
// Future: LDAP, OAuth, OIDC
```

### 2. Multi-Session Management

```go
// Session represents a single terminal session
type Session struct {
    ID         string
    UserID     string
    PTY        *os.File
    CreatedAt  time.Time
    LastActive time.Time
}

// Manager handles session lifecycle
type Manager struct {
    sessions     map[string]*Session
    userSessions map[string][]string
    maxPerUser   int
}

func (m *Manager) Create(userID string) (*Session, error)
func (m *Manager) Get(sessionID string) (*Session, error)
func (m *Manager) List(userID string) ([]*Session, error)
func (m *Manager) Close(sessionID string) error
```

### 3. Theme System

Base16 compatible theme system that applies to both xterm.js and UI:

```typescript
// Theme definition (Base16 compatible)
interface Theme {
  name: string;
  colors: {
    base00: string;  // Background
    base01: string;  // Lighter background
    base02: string;  // Selection
    base03: string;  // Comments
    base04: string;  // Dark foreground
    base05: string;  // Foreground
    base06: string;  // Light foreground
    base07: string;  // Lightest foreground
    base08: string;  // Red
    base09: string;  // Orange
    base0A: string;  // Yellow
    base0B: string;  // Green
    base0C: string;  // Cyan
    base0D: string;  // Blue
    base0E: string;  // Purple
    base0F: string;  // Brown
  };
}

// Apply to xterm.js
function applyTerminalTheme(term: Terminal, theme: Theme) {
  term.options.theme = {
    background: theme.colors.base00,
    foreground: theme.colors.base05,
    cursor: theme.colors.base05,
    selectionBackground: theme.colors.base02,
    black: theme.colors.base00,
    red: theme.colors.base08,
    green: theme.colors.base0B,
    yellow: theme.colors.base0A,
    blue: theme.colors.base0D,
    magenta: theme.colors.base0E,
    cyan: theme.colors.base0C,
    white: theme.colors.base05,
    // bright colors...
  };
}

// Apply to UI via CSS variables
function applyUITheme(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.colors.base00);
  root.style.setProperty('--color-bg-light', theme.colors.base01);
  root.style.setProperty('--color-fg', theme.colors.base05);
  root.style.setProperty('--color-border', theme.colors.base03);
  root.style.setProperty('--color-accent', theme.colors.base0D);
  root.style.setProperty('--color-error', theme.colors.base08);
  root.style.setProperty('--color-success', theme.colors.base0B);
}
```

Built-in themes:
- Dracula
- Nord
- Gruvbox Dark
- Solarized Dark
- Tokyo Night
- One Dark

## UI Design

Clean, minimal interface optimized for mobile:

### Login

```
┌─────────────────────────────────────┐
│                                     │
│          POCKET SHELL               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Username                      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Password                      │  │
│  └───────────────────────────────┘  │
│                                     │
│          [ Login ]                  │
│                                     │
└─────────────────────────────────────┘
```

### Main Interface

```
┌─────────────────────────────────────┐
│ [1:bash●] [2:vim] [3]    [⚙] [+]   │  <- Tab bar
├─────────────────────────────────────┤
│ user@host:~$ ls -la                 │
│ total 24                            │
│ drwxr-xr-x  5 user user 4096 .     │
│ drwxr-xr-x 12 user user 4096 ..    │
│ -rw-r--r--  1 user user  220 ...   │
│ user@host:~$ _                      │  <- xterm.js
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [⇥] [^] [⌥] [↑] [↓] [←] [→] [⋮]   │  <- Virtual keys
└─────────────────────────────────────┘
```

### Quick Menu (tap ⋮)

```
┌─────────────────────────────────────┐
│ Commands                            │
│ [ls -la] [cd ..] [pwd] [clear]     │
│ [git status] [docker ps] [top]     │
├─────────────────────────────────────┤
│ Keys                                │
│ [Ctrl+C] [Ctrl+D] [Ctrl+Z]         │
│ [Ctrl+L] [Ctrl+A] [Ctrl+E]         │
├─────────────────────────────────────┤
│ History                             │
│ > npm run build                     │
│ > git commit -m "fix"               │
└─────────────────────────────────────┘
```

### Settings (tap ⚙)

```
┌─────────────────────────────────────┐
│ Settings                     [×]    │
├─────────────────────────────────────┤
│ Theme                               │
│ ┌─────────────────────────────────┐ │
│ │ ● Dracula                       │ │
│ │ ○ Nord                          │ │
│ │ ○ Gruvbox Dark                  │ │
│ │ ○ Tokyo Night                   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Font Size                           │
│ [−]  14px  [+]                      │
├─────────────────────────────────────┤
│ Sessions                            │
│ #1 bash     10:00  ● active  [×]   │
│ #2 vim      10:05  ○ idle    [×]   │
│ #3 htop     10:10  ○ idle    [×]   │
└─────────────────────────────────────┘
```

### Gestures

| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll history |
| Pinch | Zoom font size |
| Long press | Copy selection |
| Double tap | Paste |
| Swipe left on tab | Close session |

## API

### HTTP Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | Main page | ✓ |
| GET | `/login` | Login page | ✗ |
| POST | `/api/login` | User login | ✗ |
| POST | `/api/logout` | User logout | ✓ |
| GET | `/api/sessions` | List sessions | ✓ |
| POST | `/api/sessions` | Create session | ✓ |
| DELETE | `/api/sessions/:id` | Close session | ✓ |
| GET | `/api/settings` | Get user settings | ✓ |
| PUT | `/api/settings` | Update settings | ✓ |
| GET | `/ws/:sessionId` | WebSocket connection | ✓ |
| GET | `/health` | Health check | ✗ |

### WebSocket Messages

```typescript
// Client -> Server
type ClientMessage = 
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number };

// Server -> Client
type ServerMessage = 
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number };
```

## Build

### Prerequisites

- Go 1.21+
- Node.js 18+
- Make

### Build Single Binary

```bash
# Install frontend dependencies
cd web && npm install && cd ..

# Build everything
make build

# Output
ls -lh pocket-shell
# -rwxr-xr-x 1 user user 15M Jan 14 10:00 pocket-shell
```

### Development

```bash
# Terminal 1: Frontend dev server with hot reload
cd web && npm run dev

# Terminal 2: Backend with air (hot reload)
air

# Or run both
make dev
```

### Makefile

```makefile
.PHONY: build dev clean

build: build-frontend build-backend

build-frontend:
	cd web && npm run build

build-backend:
	go build -o pocket-shell ./cmd/server

dev:
	@echo "Starting development servers..."
	cd web && npm run dev &
	air

clean:
	rm -rf pocket-shell web/dist
```

## Configuration

### Command Line

```bash
./pocket-shell \
  -port 8080 \
  -host 0.0.0.0 \
  -user admin \
  -password secret \
  -shell /bin/bash \
  -max-sessions 5 \
  -session-timeout 30m
```

| Argument | Default | Description |
|----------|---------|-------------|
| `-port` | `8080` | Server port |
| `-host` | `0.0.0.0` | Listen address |
| `-user` | `admin` | Default username |
| `-password` | Random | Default password (printed on startup) |
| `-shell` | `/bin/bash` | Default shell |
| `-max-sessions` | `5` | Max sessions per user |
| `-session-timeout` | `30m` | Session idle timeout |
| `-config` | - | Config file path |

### Config File

```yaml
server:
  host: 0.0.0.0
  port: 8080

auth:
  provider: password
  password:
    users:
      - username: admin
        password: $2a$10$...  # bcrypt hash

session:
  max_per_user: 5
  idle_timeout: 30m
  shell: /bin/bash

terminal:
  term: xterm-256color

theme:
  default: dracula
```

## Security

- [x] Username/password authentication
- [x] JWT token authorization
- [x] Session isolation
- [ ] HTTPS (use reverse proxy)
- [ ] Rate limiting
- [ ] Audit logging

## Roadmap

### v0.1 - MVP
- [ ] Basic terminal
- [ ] Password auth
- [ ] Single session
- [ ] Virtual keyboard

### v0.2 - Multi-Session
- [ ] Session management
- [ ] Session tabs
- [ ] Reconnection

### v0.3 - Themes & Settings
- [ ] Theme system
- [ ] User preferences
- [ ] Font size control

### v0.4 - Auth Extensions
- [ ] LDAP support
- [ ] OAuth support

## License

MIT
