import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { api } from './api';
import type { WSMessage } from './types';

// Debug mode - only log when ?debug=1 is in URL
const DEBUG = typeof window !== 'undefined' && window.location.search.includes('debug=1');

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// Module-level cache for font size to avoid repeated localStorage access
const FONT_SIZE_KEY = 'pocket-shell-font-size';
let cachedFontSize: number | null = null;

function getCachedFontSize(minSize: number, maxSize: number, defaultSize: number): number {
  if (cachedFontSize !== null) {
    return cachedFontSize;
  }
  try {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
        cachedFontSize = parsed;
        return cachedFontSize;
      }
    }
  } catch {
    // localStorage might be unavailable
  }
  cachedFontSize = defaultSize;
  return cachedFontSize;
}

function setCachedFontSize(size: number): void {
  cachedFontSize = size;
  try {
    localStorage.setItem(FONT_SIZE_KEY, size.toString());
  } catch {
    // localStorage might be unavailable
  }
}

export class TerminalManager {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private webglAddon: WebglAddon | null = null;
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
  private fontSize = 12;
  private readonly minFontSize = 8;
  private readonly maxFontSize = 32;
  
  // For cleanup
  private resizeObserver: ResizeObserver | null = null;
  private debouncedFit: (() => void) | null = null;
  private disposed = false;
  
  // Viewport resize handler for mobile keyboard
  private viewportResizeHandler: (() => void) | null = null;
  
  // Keyboard lock - prevents soft keyboard from appearing
  private keyboardLocked = false;
  
  // Message batching for performance
  private outputBuffer = '';
  private outputFlushScheduled = false;

  constructor(container: HTMLElement) {
    // Load saved font size from cache
    this.fontSize = getCachedFontSize(this.minFontSize, this.maxFontSize, 12);
    this.container = container;
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: this.fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 1000,
      // Disable scrollbar to prevent black border and scrollbar visibility
      scrollOnUserInput: true,
      overviewRulerWidth: 0,
      // Improve IME support for third-party input methods
      allowProposedApi: true,
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#eaeaea',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#3a3a5e',
        // Hide scrollbar by making it transparent
        scrollbarSliderBackground: 'transparent',
        scrollbarSliderHoverBackground: 'transparent',
        scrollbarSliderActiveBackground: 'transparent',
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
    
    // Load WebGL addon for GPU acceleration (must be after terminal.open)
    this.initWebGL();
    
    this.fit();

    // Workaround for iOS Safari predictive text and mobile IME issues
    // xterm.js doesn't always fire onData correctly on mobile browsers
    const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
    let isComposing = false;
    let flushTimeout: ReturnType<typeof setTimeout> | null = null;
    // Track what we've already sent to avoid duplicates
    let lastSentLength = 0;
    
    const clearFlushTimeout = () => {
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
    };
    
    // Clear textarea and reset tracking
    const clearTextarea = () => {
      if (xtermTextarea) {
        xtermTextarea.value = '';
        lastSentLength = 0;
      }
    };
    
    // Flush any pending input in textarea that xterm missed
    const flushPendingInput = () => {
      flushTimeout = null; // Mark as no longer scheduled
      
      debugLog('[XtermTextarea] flushPendingInput called, textareaValue:', JSON.stringify(xtermTextarea?.value));
      
      if (xtermTextarea && xtermTextarea.value) {
        // Only send what hasn't been sent yet
        const currentValue = xtermTextarea.value;
        if (currentValue.length > lastSentLength) {
          let pendingValue = currentValue.substring(lastSentLength);
          // Fix: Replace non-breaking space (U+00A0) with regular space
          // Some mobile keyboards insert NBSP instead of regular spaces
          pendingValue = pendingValue.replace(/\u00A0/g, ' ');
          debugLog('[XtermTextarea] FLUSH pending input:', JSON.stringify(pendingValue));
          this.send({ type: 'input', data: pendingValue });
          lastSentLength = currentValue.length;
        }
        // Clear textarea after flush
        xtermTextarea.value = '';
        lastSentLength = 0;
      }
    };
    
    if (xtermTextarea) {
      debugLog('[Terminal] Found xterm textarea, adding mobile input workaround');
      
      // Track composition state
      xtermTextarea.addEventListener('compositionstart', (e) => {
        debugLog('[XtermTextarea] compositionstart:', (e as CompositionEvent).data);
        isComposing = true;
        clearFlushTimeout();
      });
      
      xtermTextarea.addEventListener('compositionend', (e) => {
        const data = (e as CompositionEvent).data;
        debugLog('[XtermTextarea] compositionend:', data);
        isComposing = false;
        // Schedule a flush to catch any missed input after composition
        clearFlushTimeout();
        flushTimeout = setTimeout(flushPendingInput, 150);
      });
      
      xtermTextarea.addEventListener('beforeinput', (e) => {
        const inputEvent = e as InputEvent;
        debugLog('[XtermTextarea] beforeinput:', JSON.stringify(inputEvent.data), 'inputType:', inputEvent.inputType, 'isComposing:', isComposing);
      });
      
      xtermTextarea.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement;
        const inputEvent = e as InputEvent;
        debugLog('[XtermTextarea] input:', JSON.stringify(target.value), 'inputType:', inputEvent.inputType, 'isComposing:', isComposing);
        
        // Skip during active composition
        if (isComposing) {
          return;
        }
        
        // Schedule a flush - if xterm handles it via onData, the flush will find empty textarea
        clearFlushTimeout();
        flushTimeout = setTimeout(flushPendingInput, 150);
      });
    } else {
      debugLog('[Terminal] xterm textarea not found');
    }
    
    // Helper to clear textarea when xterm handles input
    const onXtermData = clearTextarea;

    // Handle resize with debounce using ResizeObserver
    this.debouncedFit = debounce(() => this.fit(), 100);
    
    // Use ResizeObserver to detect container size changes (including virtual keyboard show/hide)
    this.resizeObserver = new ResizeObserver(this.debouncedFit);
    this.resizeObserver.observe(container);
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', this.debouncedFit);

    // Setup visualViewport listener for mobile keyboard handling
    this.setupViewportResize();

    // Setup pinch-to-zoom for font size adjustment on mobile
    this.setupPinchZoom();

    // Handle input - allow interceptor for modifier keys
    this.terminal.onData((data) => {
      debugLog('[Terminal] onData:', JSON.stringify(data), 'hasInterceptor:', !!this.inputInterceptor);
      
      // xterm handled this, cancel pending flush and clear textarea
      debugLog('[Terminal] onData - canceling pending flush and clearing textarea');
      clearFlushTimeout();
      onXtermData();
      
      // Fix: Replace non-breaking space (U+00A0) with regular space
      let fixedData = data.replace(/\u00A0/g, ' ');
      
      const processed = this.inputInterceptor ? this.inputInterceptor(fixedData) : fixedData;
      debugLog('[Terminal] processed:', JSON.stringify(processed));
      if (processed) {
        this.send({ type: 'input', data: processed });
      }
    });
  }

  // Initialize WebGL with context loss recovery
  private initWebGL() {
    if (this.disposed || this.webglAddon) return;
    
    try {
      this.webglAddon = new WebglAddon();
      this.webglAddon.onContextLoss(() => {
        debugLog('[Terminal] WebGL context lost, attempting recovery...');
        this.webglAddon?.dispose();
        this.webglAddon = null;
        
        // Attempt to recover WebGL after a delay
        if (!this.disposed) {
          setTimeout(() => this.initWebGL(), 1000);
        }
      });
      this.terminal.loadAddon(this.webglAddon);
      debugLog('[Terminal] WebGL renderer enabled');
    } catch (e) {
      console.warn('[Terminal] WebGL not available, using canvas renderer:', e);
      this.webglAddon = null;
    }
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
      
      // Start ping interval (60s to reduce network overhead)
      this.pingInterval = setInterval(() => {
        this.send({ type: 'ping', data: null });
      }, 60000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'output') {
          this.bufferOutput(msg.data as string);
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
      debugLog('[Terminal] send:', msg.type, JSON.stringify(msg.data));
      this.ws.send(JSON.stringify(msg));
    } else {
      debugLog('[Terminal] send FAILED - ws not open, readyState:', this.ws?.readyState);
    }
  }

  // Buffer output and flush on next animation frame for better performance
  private bufferOutput(data: string) {
    this.outputBuffer += data;
    if (!this.outputFlushScheduled) {
      this.outputFlushScheduled = true;
      requestAnimationFrame(() => {
        if (this.outputBuffer) {
          this.terminal.write(this.outputBuffer);
          this.outputBuffer = '';
        }
        this.outputFlushScheduled = false;
      });
    }
  }

  // Send special key
  sendKey(key: string) {
    debugLog('[Terminal] sendKey called:', JSON.stringify(key));
    this.send({ type: 'input', data: key });
    this.terminal.focus();
  }

  focus() {
    this.terminal.focus();
  }

  // Set font size and refit terminal
  setFontSize(size: number) {
    const newSize = Math.max(this.minFontSize, Math.min(this.maxFontSize, Math.round(size)));
    if (newSize === this.fontSize) return;
    
    this.fontSize = newSize;
    this.terminal.options.fontSize = newSize;
    setCachedFontSize(newSize);
    this.fit();
  }

  getFontSize(): number {
    return this.fontSize;
  }

  // Setup visualViewport listener to handle mobile keyboard appearance
  // When keyboard appears, we translate the terminal container upward
  // incrementally as content grows - only moving when cursor would be hidden
  private setupViewportResize() {
    if (!window.visualViewport) {
      debugLog('[Terminal] visualViewport API not available');
      return;
    }

    // Find the terminal container to transform
    const terminalContainer = this.container.closest('.terminal-container') as HTMLElement;
    if (!terminalContainer) {
      debugLog('[Terminal] terminal-container not found');
      return;
    }

    let currentTranslateY = 0;
    let keyboardHeight = 0;
    let initialHeight = window.visualViewport.height;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    
    // Function to calculate and apply translation based on cursor position
    const updateTranslation = () => {
      if (this.disposed || keyboardHeight <= 50) {
        return;
      }
      
      const viewportHeight = window.visualViewport!.height;
      const viewportOffsetTop = window.visualViewport!.offsetTop;
      const lineHeight = this.fontSize * 1.2;
      
      // Get safe area inset bottom for iOS Safari floating address bar
      const safeAreaBottom = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0'
      ) || 0;
      
      // Extra padding for iOS Safari's floating bottom bar (approximately 30-50px)
      const iosSafariBottomBar = 50;
      
      // Get cursor row from terminal buffer
      const cursorY = this.terminal.buffer.active.cursorY;
      
      // Use fixed original position (0) since terminal starts at top
      // Don't use getBoundingClientRect as it's affected by ongoing CSS transitions
      const originalTop = 0;
      
      // Calculate cursor bottom position in screen coordinates
      const cursorBottom = originalTop + (cursorY + 1) * lineHeight;
      
      // How much cursor overlaps with keyboard (keyboard starts at viewportHeight)
      // Subtract safe area and iOS bottom bar to account for Safari UI
      const visibleBottom = viewportHeight + viewportOffsetTop - safeAreaBottom - iosSafariBottomBar;
      const overlap = cursorBottom - visibleBottom;
      
      debugLog('[Terminal] updateTranslation:', { 
        cursorY, cursorBottom, visibleBottom, safeAreaBottom, iosSafariBottomBar, overlap, currentTranslateY 
      });
      
      if (overlap > 0) {
        // Need to translate up - cursor is behind keyboard
        // Round to nearest pixel to avoid sub-pixel jitter
        const newTranslateY = Math.round(Math.min(overlap + 10, keyboardHeight + iosSafariBottomBar));
        if (newTranslateY > currentTranslateY) {
          currentTranslateY = newTranslateY;
          terminalContainer.style.transform = `translateY(-${currentTranslateY}px)`;
          debugLog('[Terminal] applied translateY:', currentTranslateY);
        }
      }
    };
    
    // Debounced version for terminal output
    const debouncedUpdate = () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      updateTimer = setTimeout(updateTranslation, 50);
    };
    
    // Listen to terminal data to detect new content
    this.terminal.onWriteParsed(() => {
      if (keyboardHeight > 50) {
        debouncedUpdate();
      }
    });
    
    this.viewportResizeHandler = () => {
      if (!window.visualViewport || this.disposed) return;
      
      // Debounce to wait for iOS keyboard animation to settle
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      debounceTimer = setTimeout(() => {
        if (!window.visualViewport || this.disposed) return;
        
        const viewportHeight = window.visualViewport.height;
        
        // Update initial height when keyboard is closed (full viewport)
        if (viewportHeight > initialHeight) {
          initialHeight = viewportHeight;
        }
        
        const newKeyboardHeight = initialHeight - viewportHeight;
        
        debugLog('[Terminal] visualViewport stable:', { initialHeight, viewportHeight, newKeyboardHeight });
        
        if (newKeyboardHeight > 50) {
          // Keyboard opened or resized
          keyboardHeight = newKeyboardHeight;
          updateTranslation();
        } else {
          // Keyboard closed - reset translation with animation
          keyboardHeight = 0;
          currentTranslateY = 0;
          terminalContainer.style.transform = '';
        }
      }, 200);
    };

    // Listen to viewport changes
    window.visualViewport.addEventListener('resize', this.viewportResizeHandler);
    window.visualViewport.addEventListener('scroll', this.viewportResizeHandler);
  }

  // Setup pinch-to-zoom gesture for font size adjustment
  // And single-finger swipe for scrolling terminal history
  private setupPinchZoom() {
    let initialDistance = 0;
    let initialFontSize = this.fontSize;
    let isPinching = false;
    
    // Single finger scroll state
    let isScrolling = false;
    let scrollStartY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let momentumId: number | null = null;
    let accumulatedDelta = 0;

    const getDistance = (touches: TouchList): number => {
      if (touches.length < 2) return 0;
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    
    const stopMomentum = () => {
      if (momentumId !== null) {
        cancelAnimationFrame(momentumId);
        momentumId = null;
      }
    };
    
    // Use xterm's scrollLines API for scrolling
    const scrollByLines = (lines: number) => {
      this.terminal.scrollLines(lines);
    };
    
    const applyMomentum = () => {
      if (Math.abs(velocity) < 0.5) {
        momentumId = null;
        return;
      }
      
      // Convert velocity to lines (roughly 16px per line)
      const lines = Math.round(velocity / 2);
      if (lines !== 0) {
        scrollByLines(lines);
      }
      
      velocity *= 0.92; // Friction
      momentumId = requestAnimationFrame(applyMomentum);
    };

    this.container.addEventListener('touchstart', (e: TouchEvent) => {
      stopMomentum();
      
      if (e.touches.length === 2) {
        // Two finger pinch
        isPinching = true;
        isScrolling = false;
        initialDistance = getDistance(e.touches);
        initialFontSize = this.fontSize;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Single finger - prepare for scroll
        isScrolling = true;
        scrollStartY = e.touches[0].clientY;
        lastY = scrollStartY;
        lastTime = Date.now();
        velocity = 0;
        accumulatedDelta = 0;
      }
    }, { passive: false });

    this.container.addEventListener('touchmove', (e: TouchEvent) => {
      if (isPinching && e.touches.length === 2) {
        const currentDistance = getDistance(e.touches);
        const scale = currentDistance / initialDistance;
        const newFontSize = initialFontSize * scale;
        
        this.setFontSize(newFontSize);
        e.preventDefault();
      } else if (isScrolling && e.touches.length === 1 && !isPinching) {
        const currentY = e.touches[0].clientY;
        const currentTime = Date.now();
        const deltaY = lastY - currentY;
        
        // Calculate velocity for momentum
        const timeDelta = currentTime - lastTime;
        if (timeDelta > 0) {
          velocity = deltaY / timeDelta * 16;
        }
        
        // Accumulate delta and scroll by lines when threshold reached
        accumulatedDelta += deltaY;
        const lineHeight = this.fontSize * 1.2; // Approximate line height
        const linesToScroll = Math.trunc(accumulatedDelta / lineHeight);
        
        if (linesToScroll !== 0) {
          scrollByLines(linesToScroll);
          accumulatedDelta -= linesToScroll * lineHeight;
        }
        
        lastY = currentY;
        lastTime = currentTime;
        
        e.preventDefault(); // Prevent page scroll
      }
    }, { passive: false });

    this.container.addEventListener('touchend', (e: TouchEvent) => {
      if (isPinching) {
        isPinching = false;
      }
      if (isScrolling && e.touches.length === 0) {
        isScrolling = false;
        // Apply momentum scrolling
        if (Math.abs(velocity) > 2) {
          momentumId = requestAnimationFrame(applyMomentum);
        }
      }
    });

    this.container.addEventListener('touchcancel', () => {
      isPinching = false;
      isScrolling = false;
      stopMomentum();
    });
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

  // Lock/unlock keyboard to prevent soft keyboard from appearing
  // Uses CSS class to disable pointer events - simple and reliable
  setKeyboardLocked(locked: boolean) {
    this.keyboardLocked = locked;
    debugLog('[Terminal] setKeyboardLocked:', locked);
    
    const xtermTextarea = this.container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
    
    if (locked) {
      // Add CSS class to disable pointer events on the terminal
      this.container.classList.add('keyboard-locked');
      // Make textarea readonly instead of blur - avoids iOS Safari keyboard state issues
      if (xtermTextarea) {
        xtermTextarea.readOnly = true;
        // Move focus away to a non-input element to hide keyboard
        // Using document.body instead of blur() to avoid Safari state issues
        (document.activeElement as HTMLElement)?.blur?.();
      }
    } else {
      // Remove CSS class
      this.container.classList.remove('keyboard-locked');
      // Restore textarea
      if (xtermTextarea) {
        xtermTextarea.readOnly = false;
      }
    }
  }

  isKeyboardLocked(): boolean {
    return this.keyboardLocked;
  }

  // Dispose and cleanup all resources
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    
    // Disconnect WebSocket
    this.disconnect();
    
    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Remove window resize listener
    if (this.debouncedFit) {
      window.removeEventListener('resize', this.debouncedFit);
      this.debouncedFit = null;
    }
    
    // Remove visualViewport listeners
    if (this.viewportResizeHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.viewportResizeHandler);
      window.visualViewport.removeEventListener('scroll', this.viewportResizeHandler);
      this.viewportResizeHandler = null;
    }
    
    // Dispose WebGL addon
    if (this.webglAddon) {
      this.webglAddon.dispose();
      this.webglAddon = null;
    }
    
    // Dispose terminal
    this.terminal.dispose();
  }
}
