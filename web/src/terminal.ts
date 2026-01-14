import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { api } from './api';
import type { WSMessage } from './types';

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export class TerminalManager {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private container: HTMLElement;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastRows = 0;
  private lastCols = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 1000,
      overviewRulerWidth: 0,
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#eaeaea',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#3a3a5e',
        black: '#1a1a2e',
        red: '#ff6b6b',
        green: '#4ecdc4',
        yellow: '#ffe66d',
        blue: '#4a90d9',
        magenta: '#c56cf0',
        cyan: '#7bed9f',
        white: '#eaeaea',
        brightBlack: '#666666',
        brightRed: '#ff8787',
        brightGreen: '#6ee7de',
        brightYellow: '#ffed8a',
        brightBlue: '#6aa9e9',
        brightMagenta: '#d98bf0',
        brightCyan: '#98f5c6',
        brightWhite: '#ffffff',
      },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    this.terminal.open(container);
    this.fit();

    // Handle resize with debounce using ResizeObserver
    const debouncedFit = debounce(() => this.fit(), 100);
    
    // Use ResizeObserver to detect container size changes (including virtual keyboard show/hide)
    const resizeObserver = new ResizeObserver(debouncedFit);
    resizeObserver.observe(container);
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', debouncedFit);

    // Handle input
    this.terminal.onData((data) => {
      this.send({ type: 'input', data });
    });
  }

  fit() {
    // Calculate dimensions manually to ignore scrollbar width
    const core = (this.terminal as unknown as { _core: { _renderService: { dimensions: { css: { cell: { width: number; height: number } } } } } })._core;
    const dims = core._renderService.dimensions;
    if (!dims?.css?.cell) {
      this.fitAddon.fit();
      return;
    }
    
    const cellWidth = dims.css.cell.width;
    const cellHeight = dims.css.cell.height;
    
    // Get container dimensions minus padding
    const style = getComputedStyle(this.container.querySelector('.xterm')!);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    
    const availableWidth = this.container.clientWidth - paddingX;
    const availableHeight = this.container.clientHeight - paddingY;
    
    const newCols = Math.max(2, Math.floor(availableWidth / cellWidth));
    const newRows = Math.max(1, Math.floor(availableHeight / cellHeight));
    
    this.terminal.resize(newCols, newRows);
    // Only send resize if dimensions actually changed
    if (newRows !== this.lastRows || newCols !== this.lastCols) {
      this.lastRows = newRows;
      this.lastCols = newCols;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'resize',
          data: { rows: newRows, cols: newCols },
        });
      }
    }
  }

  // Force a terminal refresh by sending a resize to trigger SIGWINCH on fullscreen apps
  private forceRefresh() {
    const core = (this.terminal as unknown as { _core: { _renderService: { dimensions: { css: { cell: { width: number; height: number } } } } } })._core;
    const dims = core._renderService.dimensions;
    if (!dims?.css?.cell) {
      this.fitAddon.fit();
      return;
    }
    
    const cellWidth = dims.css.cell.width;
    const cellHeight = dims.css.cell.height;
    
    const style = getComputedStyle(this.container.querySelector('.xterm')!);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    
    const availableWidth = this.container.clientWidth - paddingX;
    const availableHeight = this.container.clientHeight - paddingY;
    
    const newCols = Math.max(2, Math.floor(availableWidth / cellWidth));
    const newRows = Math.max(1, Math.floor(availableHeight / cellHeight));
    
    this.terminal.resize(newCols, newRows);
    this.lastRows = newRows;
    this.lastCols = newCols;
    
    // Send a slightly different size first, then the correct size
    // This triggers a full redraw in fullscreen apps like htop
    this.send({
      type: 'resize',
      data: { rows: Math.max(1, newRows - 1), cols: Math.max(2, newCols - 1) },
    });
    
    // Then send the correct size after a short delay
    setTimeout(() => {
      this.send({
        type: 'resize',
        data: { rows: newRows, cols: newCols },
      });
    }, 50);
  }

  async connect(sessionId: string) {
    if (this.ws) {
      this.disconnect();
    }

    this.sessionId = sessionId;
    this.ws = api.createWebSocket(sessionId);

    this.ws.onopen = () => {
      // Don't clear terminal - we want to receive the refreshed screen from server
      // Trigger a resize to force fullscreen apps like htop to redraw
      this.forceRefresh();
      
      // Send Ctrl+L after a short delay to trigger a screen redraw in fullscreen apps
      // This helps apps like htop properly reinitialize the alternate screen buffer
      setTimeout(() => {
        this.send({ type: 'input', data: '\x0c' }); // Ctrl+L
      }, 100);
      
      // Start ping interval
      this.pingInterval = setInterval(() => {
        this.send({ type: 'ping', data: null });
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'output') {
          this.terminal.write(msg.data as string);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      this.terminal.writeln('\r\n\x1b[31m[Connection closed]\x1b[0m');
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.sessionId = null;
  }

  private send(msg: WSMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Send special key
  sendKey(key: string) {
    this.send({ type: 'input', data: key });
    this.terminal.focus();
  }

  focus() {
    this.terminal.focus();
  }

  getTerminal(): Terminal {
    return this.terminal;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
