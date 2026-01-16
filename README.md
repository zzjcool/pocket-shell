# Pocket Shell

A mobile-optimized web terminal that lets you use the command line smoothly on your phone browser.

[中文文档](./README_zh.md)

## Features

- **Mobile Optimized** - Touch-friendly interface designed for phones
- **Virtual Keyboard** - Quick access to Ctrl, Alt, Tab, arrow keys and common shortcuts
- **Gesture Support** - Long-press arrow keys for continuous input, swipe to scroll
- **Selection Mode** - Easy text selection and copy on touch devices
- **Single Binary** - One executable file with embedded frontend, no dependencies
- **Secure** - Password authentication with JWT tokens

## Quick Start

### Install

```bash
# Using curl
curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh

# Using wget
wget -qO- https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh
```

### Run

```bash
pocket-shell
```

On first run, it will print a random password:

```
Pocket Shell v0.0.10
Password: aB3dEf9x
Listening on http://0.0.0.0:8080
```

Open the URL in your phone browser and login with username `admin` and the generated password.

### Custom Settings

```bash
# Custom port and password
pocket-shell -port 3000 -password mypassword

# Custom username
pocket-shell -user john -password secret

# Use specific shell
pocket-shell -shell /bin/zsh

# Show help
pocket-shell -help
```

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `-port` | `8080` | Server port |
| `-host` | `0.0.0.0` | Listen address |
| `-user` | `admin` | Login username |
| `-password` | Random | Login password |
| `-shell` | System default | Shell to use (bash/zsh/sh) |
| `-version` | - | Show version |
| `-help` | - | Show help |

## Mobile Keyboard Shortcuts

The virtual keyboard provides quick access to special keys:

| Button | Function |
|--------|----------|
| `Ctrl` | Toggle Ctrl modifier (tap once to activate, tap again to deactivate) |
| `Alt` | Toggle Alt modifier |
| `Tab` | Send Tab key |
| `Esc` | Send Escape key |
| `↑` `↓` `←` `→` | Arrow keys (long-press for continuous input) |

### Shortcut Bar

Swipe horizontally to access more shortcuts:

- `Ctrl+C` - Interrupt current process
- `Ctrl+D` - Send EOF / Exit
- `Ctrl+Z` - Suspend process
- `Ctrl+L` - Clear screen
- `Ctrl+A` - Move cursor to line start
- `Ctrl+E` - Move cursor to line end
- `Ctrl+U` - Clear line before cursor
- `Ctrl+K` - Clear line after cursor
- `Ctrl+R` - Search command history
- `Ctrl+W` - Delete word before cursor

## Update

```bash
# Check for updates
curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh -s -- --check

# Update to latest
curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh -s -- --update
```

## Build from Source

Requirements: Go 1.21+, Node.js 18+

```bash
git clone https://github.com/zzjcool/pocket-shell.git
cd pocket-shell
make build
./pocket-shell
```

## Security Notes

- Always use a strong password in production
- For public internet access, put behind a reverse proxy with HTTPS (nginx, caddy, etc.)
- The default user runs commands with the same permissions as the pocket-shell process

## License

MIT
