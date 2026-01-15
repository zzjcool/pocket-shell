#!/bin/sh
set -e

# Pocket Shell Installer
# Usage: 
#   Install:  curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh
#   Update:   curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh -s -- --update
#   Check:    curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh -s -- --check

REPO="zzjcool/pocket-shell"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="pocket-shell"

# Parse command line arguments
UPDATE_MODE=false
CHECK_MODE=false
for arg in "$@"; do
    case "$arg" in
        --update) UPDATE_MODE=true ;;
        --check) CHECK_MODE=true ;;
    esac
done

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
    local url="https://api.github.com/repos/${REPO}/releases/latest"
    local max_retries=3
    local retry=0
    local auth_header=""
    
    # Use GitHub token if available (for better rate limits)
    if [ -n "$GITHUB_TOKEN" ]; then
        auth_header="-H \"Authorization: token $GITHUB_TOKEN\""
    fi
    
    while [ $retry -lt $max_retries ]; do
        local response
        
        if command -v curl >/dev/null 2>&1; then
            if [ -n "$auth_header" ]; then
                response=$(curl -fsSL --connect-timeout 5 $auth_header "$url" 2>/dev/null)
            else
                response=$(curl -fsSL --connect-timeout 5 "$url" 2>/dev/null)
            fi
        elif command -v wget >/dev/null 2>&1; then
            response=$(wget -qO- --timeout=5 "$url" 2>/dev/null)
        else
            echo "Error: curl or wget is required" >&2
            exit 1
        fi
        
        if [ -n "$response" ]; then
            local version=$(echo "$response" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | head -1)
            if [ -n "$version" ]; then
                echo "$version"
                return 0
            fi
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $max_retries ]; then
            sleep 1
        fi
    done
    
    return 1
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

# Get installed version
get_installed_version() {
    if [ -f "${INSTALL_DIR}/${BINARY_NAME}" ]; then
        "${INSTALL_DIR}/${BINARY_NAME}" --version 2>/dev/null | awk '{print $2}' || echo ""
    else
        echo ""
    fi
}

# Compare versions (returns 0 if v1 < v2, 1 if v1 >= v2)
version_lt() {
    v1=$(echo "$1" | sed 's/^v//')
    v2=$(echo "$2" | sed 's/^v//')
    
    # Simple version comparison
    if [ "$v1" = "$v2" ]; then
        return 1
    fi
    
    # Use printf and sort to compare
    older=$(printf '%s\n%s' "$v1" "$v2" | sort -V | head -n1)
    if [ "$older" = "$v1" ]; then
        return 0
    else
        return 1
    fi
}

main() {
    # Get latest version from GitHub
    VERSION=$(get_latest_version)
    if [ -z "$VERSION" ]; then
        echo "Error: Failed to get latest version from GitHub" >&2
        echo "This may be due to:" >&2
        echo "  - GitHub API rate limiting (try again in a few minutes)" >&2
        echo "  - Network connectivity issues" >&2
        echo "  - GitHub service unavailability" >&2
        echo "" >&2
        echo "You can:" >&2
        echo "  1. Try again in a few minutes" >&2
        echo "  2. Check https://github.com/zzjcool/pocket-shell/releases for latest version" >&2
        echo "  3. Manually download from https://github.com/zzjcool/pocket-shell/releases" >&2
        exit 1
    fi

    # Get installed version
    INSTALLED_VERSION=$(get_installed_version)

    # Check mode - just display version info
    if [ "$CHECK_MODE" = true ]; then
        if [ -z "$INSTALLED_VERSION" ]; then
            echo "Pocket Shell is not installed"
            echo "Latest version: ${VERSION}"
            echo ""
            echo "Install with:"
            echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh"
        else
            echo "Installed version: ${INSTALLED_VERSION}"
            echo "Latest version:    ${VERSION}"
            echo ""
            if version_lt "$INSTALLED_VERSION" "$VERSION"; then
                echo "✓ Update available!"
                echo ""
                echo "Update with:"
                echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh -s -- --update"
            else
                echo "✓ You are up to date!"
            fi
        fi
        exit 0
    fi

    # Update mode - check if update is needed
    if [ "$UPDATE_MODE" = true ]; then
        if [ -z "$INSTALLED_VERSION" ]; then
            echo "Pocket Shell is not installed. Installing..."
        elif version_lt "$INSTALLED_VERSION" "$VERSION"; then
            echo "Updating Pocket Shell from ${INSTALLED_VERSION} to ${VERSION}..."
        else
            echo "Already at latest version ${VERSION}"
            exit 0
        fi
    fi

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

    INSTALLED_VERSION=$(get_installed_version)
    echo ""
    echo "✓ Pocket Shell ${INSTALLED_VERSION} installed successfully!"
    echo ""
    echo "Run 'pocket-shell -h' to get started."
    echo ""
    echo "Check for updates with:"
    echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh -s -- --check"
}

main "$@"
