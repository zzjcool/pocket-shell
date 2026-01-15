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
  private inputInterceptor: ((data: string) => string | null) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isReconnecting = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 1000,
      overviewRulerWidth: 0,
      // Improve IME support for third-party input methods
      allowProposedApi: true,
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

    // Workaround for iOS Safari predictive text and mobile IME issues
    // xterm.js doesn't always fire onData correctly on mobile browsers
    const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
    let isComposing = false;
    let lastSentData = '';
    let flushTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const clearFlushTimeout = () => {
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
    };
    
    // Flush any pending input in textarea that xterm missed
    const flushPendingInput = () => {
      clearFlushTimeout();
      if (xtermTextarea && xtermTextarea.value) {
        const pendingValue = xtermTextarea.value;
        console.log('[XtermTextarea] FLUSH pending input:', JSON.stringify(pendingValue));
        this.send({ type: 'input', data: pendingValue });
        xtermTextarea.value = '';
      }
    };
    
    if (xtermTextarea) {
      console.log('[Terminal] Found xterm textarea, adding mobile input workaround');
      
      // Track composition state
      xtermTextarea.addEventListener('compositionstart', (e) => {
        console.log('[XtermTextarea] compositionstart:', (e as CompositionEvent).data);
        isComposing = true;
        clearFlushTimeout();
      });
      
      xtermTextarea.addEventListener('compositionend', (e) => {
        const data = (e as CompositionEvent).data;
        console.log('[XtermTextarea] compositionend:', data);
        isComposing = false;
        // Schedule a flush to catch any missed input after composition
        clearFlushTimeout();
        flushTimeout = setTimeout(flushPendingInput, 150);
      });
      
      xtermTextarea.addEventListener('beforeinput', (e) => {
        const inputEvent = e as InputEvent;
        console.log('[XtermTextarea] beforeinput:', JSON.stringify(inputEvent.data), 'inputType:', inputEvent.inputType, 'isComposing:', isComposing);
      });
      
      xtermTextarea.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement;
        const inputEvent = e as InputEvent;
        console.log('[XtermTextarea] input:', JSON.stringify(target.value), 'inputType:', inputEvent.inputType, 'isComposing:', isComposing);
        
        // Skip during active composition
        if (isComposing) {
          return;
        }
        
        // Schedule a flush - if xterm handles it via onData, the flush will find empty textarea
        clearFlushTimeout();
        flushTimeout = setTimeout(flushPendingInput, 150);
      });
    } else {
      console.log('[Terminal] xterm textarea not found');
    }

    // Handle resize with debounce using ResizeObserver
    const debouncedFit = debounce(() => this.fit(), 100);
    
    // Use ResizeObserver to detect container size changes (including virtual keyboard show/hide)
    const resizeObserver = new ResizeObserver(debouncedFit);
    resizeObserver.observe(container);
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', debouncedFit);

    // Handle input - allow interceptor for modifier keys
    this.terminal.onData((data) => {
      console.log('[Terminal] onData:', JSON.stringify(data), 'hasInterceptor:', !!this.inputInterceptor);
      
      // xterm handled this, cancel pending flush
      clearFlushTimeout();
      lastSentData = data;
      
      const processed = this.inputInterceptor ? this.inputInterceptor(data) : data;
      console.log('[Terminal] processed:', JSON.stringify(processed));
      if (processed) {
        this.send({ type: 'input', data: processed });
      }
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
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.doConnect();
  }

  private doConnect() {
    if (!this.sessionId) return;
    
    this.ws = api.createWebSocket(this.sessionId);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
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

    this.ws.onclose = (event) => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      
      // Attempt to reconnect if not a clean close and we haven't exceeded max attempts
      if (!event.wasClean && this.sessionId && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.terminal.writeln('\r\n\x1b[31m[Connection lost. Max reconnection attempts reached. Please refresh the page.]\x1b[0m');
      } else {
        this.terminal.writeln('\r\n\x1b[31m[Connection closed]\x1b[0m');
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private attemptReconnect() {
    if (this.isReconnecting || !this.sessionId) return;
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    this.terminal.writeln(`\r\n\x1b[33m[Connection lost. Reconnecting in ${delay / 1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})]\x1b[0m`);
    
    setTimeout(() => {
      if (this.sessionId) {
        this.doConnect();
      }
    }, delay);
  }

  disconnect() {
    // Clear session ID first to prevent reconnection attempts
    const wasConnected = this.sessionId !== null;
    this.sessionId = null;
    this.isReconnecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private send(msg: WSMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Terminal] send:', msg.type, JSON.stringify(msg.data));
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log('[Terminal] send FAILED - ws not open, readyState:', this.ws?.readyState);
    }
  }

  // Send special key
  sendKey(key: string) {
    console.log('[Terminal] sendKey called:', JSON.stringify(key));
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

  // Set input interceptor for modifier keys (Ctrl, Alt)
  setInputInterceptor(interceptor: ((data: string) => string | null) | null) {
    this.inputInterceptor = interceptor;
  }
}
