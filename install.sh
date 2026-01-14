#!/bin/sh
set -e

# Pocket Shell Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/pocketshell/pocket-shell/main/install.sh | sh
#    or: wget -qO- https://raw.githubusercontent.com/pocketshell/pocket-shell/main/install.sh | sh

REPO="pocketshell/pocket-shell"
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

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "unsupported" ;;
    esac
}

# Get latest release version
get_latest_version() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
    else
        echo "Error: curl or wget is required" >&2
        exit 1
    fi
}

# Download file
download() {
    url="$1"
    output="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$output"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$output" "$url"
    fi
}

main() {
    OS=$(detect_os)
    ARCH=$(detect_arch)

    if [ "$OS" = "unsupported" ]; then
        echo "Error: Unsupported operating system: $(uname -s)" >&2
        exit 1
    fi

    if [ "$ARCH" = "unsupported" ]; then
        echo "Error: Unsupported architecture: $(uname -m)" >&2
        exit 1
    fi

    echo "Detecting system: ${OS}-${ARCH}"

    VERSION=$(get_latest_version)
    if [ -z "$VERSION" ]; then
        echo "Error: Failed to get latest version" >&2
        exit 1
    fi
    echo "Latest version: ${VERSION}"

    # Build download URL
    EXT=""
    if [ "$OS" = "windows" ]; then
        EXT=".exe"
    fi
    FILENAME="${BINARY_NAME}-${OS}-${ARCH}${EXT}"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${FILENAME}"

    echo "Downloading ${FILENAME}..."
    
    TMP_DIR=$(mktemp -d)
    TMP_FILE="${TMP_DIR}/${BINARY_NAME}${EXT}"
    
    download "$DOWNLOAD_URL" "$TMP_FILE"

    if [ ! -f "$TMP_FILE" ]; then
        echo "Error: Download failed" >&2
        rm -rf "$TMP_DIR"
        exit 1
    fi

    chmod +x "$TMP_FILE"

    # Install
    if [ -w "$INSTALL_DIR" ]; then
        mv "$TMP_FILE" "${INSTALL_DIR}/${BINARY_NAME}${EXT}"
    else
        echo "Installing to ${INSTALL_DIR} (requires sudo)..."
        sudo mv "$TMP_FILE" "${INSTALL_DIR}/${BINARY_NAME}${EXT}"
    fi

    rm -rf "$TMP_DIR"

    echo ""
    echo "✓ Pocket Shell ${VERSION} installed successfully!"
    echo ""
    echo "Run 'pocket-shell -h' to get started."
}

main
