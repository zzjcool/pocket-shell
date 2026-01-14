package terminal

import (
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

// PTY wraps a pseudo-terminal
type PTY struct {
	cmd  *exec.Cmd
	pty  *os.File
	mu   sync.Mutex
	done chan struct{}
}

// NewPTY creates a new PTY with the given shell
func NewPTY(shell string) (*PTY, error) {
	if shell == "" {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/sh"
		}
	}

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"CLICOLOR=1",
		"CLICOLOR_FORCE=1",
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	return &PTY{
		cmd:  cmd,
		pty:  ptmx,
		done: make(chan struct{}),
	}, nil
}

// Read reads from the PTY
func (p *PTY) Read(buf []byte) (int, error) {
	return p.pty.Read(buf)
}

// Write writes to the PTY
func (p *PTY) Write(data []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.pty.Write(data)
}

// Resize resizes the PTY
func (p *PTY) Resize(rows, cols uint16) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return pty.Setsize(p.pty, &pty.Winsize{
		Rows: rows,
		Cols: cols,
	})
}

// SendSIGWINCH sends SIGWINCH to the PTY process to trigger a redraw
func (p *PTY) SendSIGWINCH() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd.Process != nil {
		// Send SIGWINCH to the foreground process group
		return syscall.Kill(-p.cmd.Process.Pid, syscall.SIGWINCH)
	}
	return nil
}

// Close closes the PTY
func (p *PTY) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	select {
	case <-p.done:
		return nil
	default:
		close(p.done)
	}

	if p.cmd.Process != nil {
		p.cmd.Process.Kill()
	}
	return p.pty.Close()
}

// Done returns a channel that is closed when the PTY is done
func (p *PTY) Done() <-chan struct{} {
	return p.done
}

// Wait waits for the PTY process to exit
func (p *PTY) Wait() error {
	err := p.cmd.Wait()
	select {
	case <-p.done:
	default:
		close(p.done)
	}
	return err
}

// Reader returns an io.Reader for the PTY
func (p *PTY) Reader() io.Reader {
	return p.pty
}

// Writer returns an io.Writer for the PTY
func (p *PTY) Writer() io.Writer {
	return p.pty
}
