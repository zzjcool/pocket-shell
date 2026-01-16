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

On first run, it prints a random password:

```
Pocket Shell v0.0.11
Password: aB3dEf9x
Listening on http://0.0.0.0:8080
```

Open the URL in your phone browser and login with username `admin` and the generated password.

### Examples

```bash
pocket-shell                     # Start with random password
pocket-shell -p 3000             # Use port 3000
pocket-shell -P mypass           # Set password
pocket-shell -u john -P secret   # Custom user and password
pocket-shell -s /bin/zsh         # Use zsh shell
```

## Command Line Options

| Short | Long | Default | Description |
|-------|------|---------|-------------|
| `-p` | `--port` | `8080` | Server port |
| `-h` | `--host` | `0.0.0.0` | Listen address |
| `-u` | `--user` | `admin` | Login username |
| `-P` | `--pass` | Random | Login password |
| `-s` | `--shell` | System default | Shell to use |
| `-v` | `--version` | - | Print version |
| | `--help` | - | Show help |

## Mobile Virtual Keyboard

The floating virtual keyboard provides quick access to special keys:

### Modifier Keys

| Button | Function |
|--------|----------|
| `Ctrl` | Toggle Ctrl modifier (tap to activate, tap again to release) |
| `Alt` | Toggle Alt modifier |
| `Tab` | Send Tab key |
| `Esc` | Send Escape key |

### Arrow Keys with Long-Press Gesture

The arrow keys support a special long-press gesture for continuous navigation:

1. **Long-press** any arrow key to enter gesture mode
2. A circular indicator appears at your finger position  
3. **Swipe** in any direction to send arrow keys continuously
4. The further you swipe, the faster the repeat rate
5. **Release** to exit gesture mode

This is especially useful for:
- Navigating through command history (Up/Down)
- Moving cursor in text editors (vim, nano)
- Scrolling through long outputs

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
