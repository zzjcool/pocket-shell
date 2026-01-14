.PHONY: all build clean dev web server install-deps

# Default target
all: build

# Install dependencies
install-deps:
	cd web && npm install
	go mod tidy

# Build frontend
web:
	cd web && npm run build
	cp web/static/index.html web/dist/

# Build backend (requires frontend to be built first)
server: web
	go build -o bin/pocket-shell ./cmd/server

# Build everything
build: install-deps server

# Development mode - run server with hot reload
dev: web
	go run ./cmd/server -addr :8080

# Clean build artifacts
clean:
	rm -rf bin/
	rm -rf web/dist/*.js
	rm -rf web/node_modules/

# Run the server
run: build
	./bin/pocket-shell
