package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"nhooyr.io/websocket"
)

type wsMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type resizeData struct {
	Rows uint16 `json:"rows"`
	Cols uint16 `json:"cols"`
}

func (h *Handler) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Authenticate
	claims, err := h.authenticate(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract session ID from path
	sessionID := strings.TrimPrefix(r.URL.Path, "/ws/")
	if sessionID == "" {
		http.Error(w, "Session ID required", http.StatusBadRequest)
		return
	}

	// Get session
	session, ok := h.sessionManager.Get(sessionID)
	if !ok {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	// Verify session belongs to user
	if session.UserID != claims.UserID {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// Accept WebSocket connection
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Printf("WebSocket accept error: %v", err)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	session.Touch()

	// Read from PTY and send to WebSocket
	go func() {
		buf := make([]byte, 4096)
		restartCount := 0
		const maxRestarts = 5
		const restartDelay = 500 * time.Millisecond

		for {
			n, err := session.PTY.Read(buf)
			if err != nil {
				// PTY closed, check if we should restart
				select {
				case <-ctx.Done():
					return
				default:
					// Check restart limit to prevent infinite loop
					restartCount++
					if restartCount > maxRestarts {
						errorMsg := "\r\n\x1b[31m[Shell failed to restart after multiple attempts. Please reconnect.]\x1b[0m\r\n"
						dataBytes, _ := json.Marshal(errorMsg)
						msg := wsMessage{
							Type: "output",
							Data: json.RawMessage(dataBytes),
						}
						msgBytes, _ := json.Marshal(msg)
						conn.Write(ctx, websocket.MessageText, msgBytes)
						cancel()
						return
					}

					// Add delay before restart to prevent tight loop
					time.Sleep(restartDelay)

					// Check context again after sleep
					select {
					case <-ctx.Done():
						return
					default:
					}

					// Try to restart the shell
					if restartErr := session.RestartPTY(); restartErr != nil {
						log.Printf("Failed to restart PTY: %v", restartErr)
						cancel()
						return
					}
					// Send a message to the client that shell was restarted
					restartMsg := "\r\n\x1b[33m[Shell exited, restarting...]\x1b[0m\r\n"
					dataBytes, _ := json.Marshal(restartMsg)
					msg := wsMessage{
						Type: "output",
						Data: json.RawMessage(dataBytes),
					}
					msgBytes, _ := json.Marshal(msg)
					if writeErr := conn.Write(ctx, websocket.MessageText, msgBytes); writeErr != nil {
						cancel()
						return
					}
					continue
				}
			}

			// Reset restart counter on successful read
			restartCount = 0

			if n > 0 {
				// Properly encode the output as JSON string
				outputStr := string(buf[:n])
				dataBytes, _ := json.Marshal(outputStr)
				msg := wsMessage{
					Type: "output",
					Data: json.RawMessage(dataBytes),
				}
				msgBytes, _ := json.Marshal(msg)
				if err := conn.Write(ctx, websocket.MessageText, msgBytes); err != nil {
					cancel()
					return
				}
			}
		}
	}()

	// Read from WebSocket and write to PTY
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}

		var msg wsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		session.Touch()

		switch msg.Type {
		case "input":
			var input string
			if err := json.Unmarshal(msg.Data, &input); err != nil {
				continue
			}
			session.PTY.Write([]byte(input))

		case "resize":
			var resize resizeData
			if err := json.Unmarshal(msg.Data, &resize); err != nil {
				continue
			}
			// Resize triggers SIGWINCH which causes fullscreen apps to redraw
			session.PTY.Resize(resize.Rows, resize.Cols)

		case "ping":
			pongData, _ := json.Marshal(time.Now().Format(time.RFC3339))
			msg := wsMessage{Type: "pong", Data: json.RawMessage(pongData)}
			data, _ := json.Marshal(msg)
			conn.Write(ctx, websocket.MessageText, data)
		}
	}
}
