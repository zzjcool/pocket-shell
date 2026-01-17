#!/bin/sh
set -e

# Pocket Shell Uninstaller
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/uninstall.sh | sh
#   wget -qO- https://raw.githubusercontent.com/zzjcool/pocket-shell/main/uninstall.sh | sh

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="pocket-shell"

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)  echo "linux" ;;
        Darwin*) echo "darwin" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *) echo "unsupported" ;;
    esac
}

OS=$(detect_os)
EXT=""
if [ "$OS" = "windows" ]; then
    EXT=".exe"
fi

TARGET="${INSTALL_DIR}/${BINARY_NAME}${EXT}"

if [ ! -f "$TARGET" ]; then
    echo "Pocket Shell is not installed at ${TARGET}"
    exit 0
fi

if [ -w "$TARGET" ] || [ -w "$INSTALL_DIR" ]; then
    rm -f "$TARGET"
else
    echo "Removing ${TARGET} (requires sudo)..."
    sudo rm -f "$TARGET"
fi

echo "✓ Pocket Shell uninstalled."
