import type { TerminalManager } from './terminal';

interface KeyConfig {
  label: string;
  key: string;
  wide?: boolean;
}

const specialKeys: KeyConfig[] = [
  { label: 'Esc', key: '\x1b' },
  { label: 'Tab', key: '\t' },
  { label: 'Ctrl', key: '' },
  { label: 'Alt', key: '' },
  { label: '|', key: '|' },
  { label: '/', key: '/' },
  { label: '-', key: '-' },
  { label: '~', key: '~' },
];

const arrowKeys: KeyConfig[] = [
  { label: '\u2191', key: '\x1b[A' },
  { label: '\u2193', key: '\x1b[B' },
  { label: '\u2190', key: '\x1b[D' },
  { label: '\u2192', key: '\x1b[C' },
];

const quickCommands: KeyConfig[] = [
  { label: 'ls', key: 'ls -G\n' },
  { label: 'cd', key: 'cd ' },
  { label: 'pwd', key: 'pwd\n' },
  { label: 'clear', key: 'clear\n' },
  { label: 'exit', key: 'exit\n' },
];

export class VirtualKeyboard {
  private container: HTMLElement;
  private terminal: TerminalManager;
  private onLogout: () => void;
  private ctrlActive = false;
  private altActive = false;
  private isDragging = false;
  private isDraggingMinimized = false;  // Separate state for minimized button drag
  private hasDragged = false;  // Track if actual movement occurred
  private dragStartY = 0;
  private dragStartX = 0;
  private dragStartBottom = 0;
  private dragStartRight = 0;
  private isMinimized = false;
  private minimizedButton: HTMLElement | null = null;
  private isMultilineMode = false;  // Multi-line input mode
  private inputArea: HTMLTextAreaElement | null = null;
  private isComposing = false;  // Track IME composition state

  constructor(container: HTMLElement, terminal: TerminalManager, onLogout: () => void) {
    this.container = container;
    this.terminal = terminal;
    this.onLogout = onLogout;
    this.render();
    this.setupDrag();
    this.setupInputInterceptor();
    this.setupGlobalDragListeners();
    this.setupResizeListener();
  }
  
  private setupResizeListener() {
    // Handle window resize to keep keyboard/minimized button in bounds
    window.addEventListener('resize', () => {
      if (this.isMinimized && this.minimizedButton) {
        // Clamp minimized button position
        const currentBottom = parseInt(this.minimizedButton.style.bottom) || 10;
        const currentRight = parseInt(this.minimizedButton.style.right) || 10;
        const maxBottom = window.innerHeight - 60;
        const maxRight = window.innerWidth - 60;
        
        this.minimizedButton.style.bottom = `${Math.max(10, Math.min(maxBottom, currentBottom))}px`;
        this.minimizedButton.style.right = `${Math.max(10, Math.min(maxRight, currentRight))}px`;
      } else if (!this.isMinimized) {
        // Clamp keyboard position
        this.clampPosition();
      }
    });
  }

  private setupGlobalDragListeners() {
    // Global mouse/touch listeners for minimized button drag
    document.addEventListener('mousemove', (e) => {
      if (this.isDraggingMinimized && this.isMinimized && this.minimizedButton) {
        e.preventDefault();
        this.handleMinimizedDragMove(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.isMinimized && this.isDraggingMinimized) {
        this.handleMinimizedDragEnd();
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (this.isDraggingMinimized && this.isMinimized && this.minimizedButton) {
        e.preventDefault();
        this.handleMinimizedDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (this.isMinimized && this.isDraggingMinimized) {
        this.handleMinimizedDragEnd();
      }
    });
  }

  private handleMinimizedDragMove(clientX: number, clientY: number) {
    if (!this.minimizedButton) return;
    
    const deltaY = this.dragStartY - clientY;
    const deltaX = this.dragStartX - clientX;
    
    // Check if actually moved (more than 5px)
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      this.hasDragged = true;
    }
    
    const newBottom = Math.max(10, Math.min(
      window.innerHeight - 60,
      this.dragStartBottom + deltaY
    ));
    const newRight = Math.max(10, Math.min(
      window.innerWidth - 60,
      this.dragStartRight + deltaX
    ));
    
    this.minimizedButton.style.bottom = `${newBottom}px`;
    this.minimizedButton.style.right = `${newRight}px`;
  }

  private handleMinimizedDragEnd() {
    if (!this.minimizedButton) return;
    
    this.minimizedButton.classList.remove('dragging');
    this.isDraggingMinimized = false;
    
    // If it was just a click (no movement), restore the keyboard
    if (!this.hasDragged) {
      this.restore();
    }
    // If dragged, just leave it where it is
  }

  private minimize() {
    this.isMinimized = true;
    this.container.style.display = 'none';
    
    // Create minimized button
    this.minimizedButton = document.createElement('div');
    this.minimizedButton.className = 'keyboard-minimized';
    this.minimizedButton.title = '展开工具栏';
    
    // Position at same bottom as keyboard was
    const computedStyle = getComputedStyle(this.container);
    const bottom = parseInt(computedStyle.bottom) || 10;
    this.minimizedButton.style.bottom = `${bottom}px`;
    this.minimizedButton.style.right = '10px';
    
    // Add to parent
    this.container.parentElement?.appendChild(this.minimizedButton);
    
    // Setup drag for minimized button (must be before click handler)
    this.setupMinimizedDrag();
  }

  private restore() {
    this.isMinimized = false;
    
    // Remove minimized button
    if (this.minimizedButton) {
      // Transfer position from minimized button to keyboard
      // But clamp it to ensure the keyboard stays within screen bounds
      const buttonBottom = parseInt(this.minimizedButton.style.bottom) || 10;
      
      this.minimizedButton.remove();
      this.minimizedButton = null;
      
      // Show the container first so we can measure its height
      this.container.style.display = '';
      
      // Clamp the bottom position to ensure keyboard stays on screen
      const maxBottom = window.innerHeight - this.container.offsetHeight - 10;
      const newBottom = Math.max(0, Math.min(maxBottom, buttonBottom));
      this.container.style.bottom = `${newBottom}px`;
    } else {
      this.container.style.display = '';
    }
    
    // Ensure position is valid after restore
    this.clampPosition();
  }
  
  private clampPosition() {
    // Ensure the keyboard stays within screen bounds
    const currentBottom = parseInt(getComputedStyle(this.container).bottom) || 0;
    const maxBottom = window.innerHeight - this.container.offsetHeight - 10;
    
    if (currentBottom > maxBottom || currentBottom < 0) {
      const clampedBottom = Math.max(0, Math.min(maxBottom, currentBottom));
      this.container.style.bottom = `${clampedBottom}px`;
    }
  }

  private setupMinimizedDrag() {
    if (!this.minimizedButton) return;
    
    const btn = this.minimizedButton;
    
    const onDragStart = (clientX: number, clientY: number) => {
      this.isDraggingMinimized = true;
      this.hasDragged = false;
      this.dragStartY = clientY;
      this.dragStartX = clientX;
      this.dragStartBottom = parseInt(btn.style.bottom) || 10;
      this.dragStartRight = parseInt(btn.style.right) || 10;
      btn.classList.add('dragging');
    };

    // Touch events - only on button
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    // Mouse events - only on button
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onDragStart(e.clientX, e.clientY);
    });
  }

  private setupInputInterceptor() {
    this.terminal.setInputInterceptor((data: string) => {
      console.log('[Interceptor] input:', JSON.stringify(data), 'ctrl:', this.ctrlActive, 'alt:', this.altActive);
      
      // If no modifiers active, pass through unchanged
      if (!this.ctrlActive && !this.altActive) {
        console.log('[Interceptor] no modifiers, passing through');
        return data;
      }

      let result = data;
      let ctrlApplied = false;
      let altApplied = false;

      // Apply Ctrl modifier - only for single printable characters
      if (this.ctrlActive && data.length === 1) {
        const code = data.toUpperCase().charCodeAt(0);
        // A-Z (65-90) -> Ctrl codes 1-26
        if (code >= 65 && code <= 90) {
          result = String.fromCharCode(code - 64);
          ctrlApplied = true;
        } else if (code >= 97 && code <= 122) {
          // lowercase a-z
          result = String.fromCharCode(code - 96);
          ctrlApplied = true;
        }
      }

      // Apply Alt modifier (ESC prefix) - only for single characters
      if (this.altActive && data.length === 1) {
        result = '\x1b' + result;
        altApplied = true;
      }

      // Only reset modifier state if it was actually applied
      if (ctrlApplied) {
        this.ctrlActive = false;
        this.updateModifierButtons();
      }
      if (altApplied) {
        this.altActive = false;
        this.updateModifierButtons();
      }

      console.log('[Interceptor] result:', JSON.stringify(result));
      return result;
    });
  }

  private setupDrag() {
    const handle = this.container.querySelector('.keyboard-header') as HTMLElement;
    if (!handle) return;

    const onDragStart = (clientY: number) => {
      this.isDragging = true;
      this.dragStartY = clientY;
      const computedStyle = getComputedStyle(this.container);
      this.dragStartBottom = parseInt(computedStyle.bottom) || 10;
      this.container.classList.add('dragging');
    };

    const onDragMove = (clientY: number) => {
      if (!this.isDragging) return;
      const deltaY = this.dragStartY - clientY;
      const newBottom = Math.max(0, Math.min(
        window.innerHeight - this.container.offsetHeight - 10,
        this.dragStartBottom + deltaY
      ));
      this.container.style.bottom = `${newBottom}px`;
    };

    const onDragEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.container.classList.remove('dragging');
    };

    // Touch events
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      onDragStart(e.touches[0].clientY);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (this.isDragging) {
        e.preventDefault();
        onDragMove(e.touches[0].clientY);
      }
    }, { passive: false });

    document.addEventListener('touchend', onDragEnd);

    // Mouse events
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onDragStart(e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        e.preventDefault();
        onDragMove(e.clientY);
      }
    });

    document.addEventListener('mouseup', onDragEnd);
  }

  private render() {
    this.container.innerHTML = '';
    this.container.className = 'virtual-keyboard';

    // Header with drag handle only
    const header = document.createElement('div');
    header.className = 'keyboard-header';
    
    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'keyboard-drag-handle';
    header.appendChild(dragHandle);
    
    this.container.appendChild(header);

    // Input row with textarea, mode toggle and send button
    const inputRow = document.createElement('div');
    inputRow.className = 'keyboard-row input-row';
    
    // Create textarea for input
    this.inputArea = document.createElement('textarea');
    this.inputArea.className = 'command-input';
    this.inputArea.placeholder = 'Enter command...';
    this.inputArea.rows = 1;
    this.inputArea.setAttribute('autocomplete', 'off');
    this.inputArea.setAttribute('autocorrect', 'off');
    this.inputArea.setAttribute('autocapitalize', 'off');
    this.inputArea.setAttribute('spellcheck', 'false');
    
    // Handle IME composition events
    this.inputArea.addEventListener('compositionstart', (e) => {
      console.log('[IME] compositionstart:', e.data);
      this.isComposing = true;
    });
    
    this.inputArea.addEventListener('compositionend', (e) => {
      console.log('[IME] compositionend:', e.data);
      // Use setTimeout to ensure this runs after any pending keydown event
      // This fixes Chrome's event order issue where input fires before compositionend
      setTimeout(() => {
        this.isComposing = false;
        console.log('[IME] isComposing set to false (after timeout)');
      }, 0);
    });
    
    // Handle Enter key
    this.inputArea.addEventListener('keydown', (e) => {
      // keyCode 229 means IME is processing the key
      const isIMEProcessing = e.keyCode === 229;
      console.log('[Keyboard] keydown:', e.key, 'keyCode:', e.keyCode, 'e.isComposing:', e.isComposing, 'this.isComposing:', this.isComposing, 'isIMEProcessing:', isIMEProcessing);
      
      // Skip if IME is composing - use multiple checks for compatibility
      if (e.isComposing || this.isComposing || isIMEProcessing) {
        console.log('[Keyboard] skipping - IME active');
        return;
      }
      
      if (e.key === 'Enter') {
        if (!this.isMultilineMode) {
          e.preventDefault();
          this.sendInputCommand();
        }
        // In multiline mode, allow normal Enter behavior
      }
    });
    
    // Auto-resize textarea
    this.inputArea.addEventListener('input', (e) => {
      const target = e.target as HTMLTextAreaElement;
      console.log('[Keyboard] input event, value:', target.value, 'isComposing:', this.isComposing);
      if (this.isMultilineMode && this.inputArea) {
        this.inputArea.style.height = 'auto';
        this.inputArea.style.height = Math.min(this.inputArea.scrollHeight, 100) + 'px';
      }
    });
    
    inputRow.appendChild(this.inputArea);
    
    // Mode toggle button
    const modeBtn = this.createButton('\u2261', () => {
      this.isMultilineMode = !this.isMultilineMode;
      modeBtn.classList.toggle('active', this.isMultilineMode);
      if (this.inputArea) {
        if (this.isMultilineMode) {
          this.inputArea.rows = 3;
          this.inputArea.style.height = 'auto';
        } else {
          this.inputArea.rows = 1;
          this.inputArea.style.height = '';
        }
      }
    });
    modeBtn.className = 'keyboard-btn mode-btn';
    modeBtn.title = 'Toggle multi-line mode';
    inputRow.appendChild(modeBtn);
    
    // Send button
    const sendBtn = this.createButton('\u27A4', () => {
      this.sendInputCommand();
    });
    sendBtn.className = 'keyboard-btn send-btn';
    sendBtn.title = 'Send command';
    inputRow.appendChild(sendBtn);
    
    this.container.appendChild(inputRow);

    // Quick commands row with logout button and minimize button
    const quickRow = this.createRow('quick-row');
    
    // Logout button
    const logoutBtn = this.createButton('Logout', () => {
      this.onLogout();
    });
    logoutBtn.classList.add('quick-btn', 'logout-btn');
    quickRow.appendChild(logoutBtn);
    
    quickCommands.forEach((cmd) => {
      const btn = this.createButton(cmd.label, () => {
        this.terminal.sendKey(cmd.key);
      });
      btn.classList.add('quick-btn');
      quickRow.appendChild(btn);
    });
    
    // Minimize button at the end of quick row (zoom icon)
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'keyboard-btn minimize-btn';
    minimizeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    minimizeBtn.title = '缩小工具栏';
    minimizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.minimize();
    });
    quickRow.appendChild(minimizeBtn);
    
    this.container.appendChild(quickRow);

    // Special keys row
    const specialRow = this.createRow('special-row');
    specialKeys.forEach((key) => {
      const btn = this.createButton(key.label, () => {
        if (key.label === 'Ctrl') {
          this.ctrlActive = !this.ctrlActive;
          btn.classList.toggle('active', this.ctrlActive);
        } else if (key.label === 'Alt') {
          this.altActive = !this.altActive;
          btn.classList.toggle('active', this.altActive);
        } else if (key.key) {
          this.sendWithModifiers(key.key);
        }
      });
      specialRow.appendChild(btn);
    });
    this.container.appendChild(specialRow);

    // Arrow keys row
    const arrowRow = this.createRow('arrow-row');
    arrowKeys.forEach((key) => {
      const btn = this.createButton(key.label, () => {
        this.terminal.sendKey(key.key);
      });
      btn.classList.add('arrow-btn');
      arrowRow.appendChild(btn);
    });
    this.container.appendChild(arrowRow);
  }

  private createRow(className: string): HTMLElement {
    const row = document.createElement('div');
    row.className = `keyboard-row ${className}`;
    return row;
  }

  private createButton(label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'keyboard-btn';
    btn.textContent = label;
    
    // Use only one event to prevent double triggering on touch devices
    let handled = false;
    
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handled = true;
      onClick();
    }, { passive: false });
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // Only handle click if not already handled by touch
      if (!handled) {
        onClick();
      }
      handled = false;
    });
    
    return btn;
  }

  private sendWithModifiers(key: string) {
    let modifiedKey = key;

    if (this.ctrlActive) {
      // Convert to control character
      if (key.length === 1) {
        const code = key.toUpperCase().charCodeAt(0);
        if (code >= 65 && code <= 90) {
          modifiedKey = String.fromCharCode(code - 64);
        }
      }
      this.ctrlActive = false;
      this.updateModifierButtons();
    }

    if (this.altActive) {
      modifiedKey = '\x1b' + modifiedKey;
      this.altActive = false;
      this.updateModifierButtons();
    }

    this.terminal.sendKey(modifiedKey);
  }

  private updateModifierButtons() {
    const buttons = this.container.querySelectorAll('.keyboard-btn');
    buttons.forEach((btn) => {
      if (btn.textContent === 'Ctrl') {
        btn.classList.toggle('active', this.ctrlActive);
      } else if (btn.textContent === 'Alt') {
        btn.classList.toggle('active', this.altActive);
      }
    });
  }

  private sendInputCommand() {
    if (!this.inputArea) return;
    // Fix: Replace non-breaking space (U+00A0) with regular space
    const command = this.inputArea.value.replace(/\u00A0/g, ' ');
    console.log('[Keyboard] sendInputCommand called, value:', JSON.stringify(command), 'isComposing:', this.isComposing);
    if (command.trim()) {
      // Send command with newline
      console.log('[Keyboard] sending via sendKey:', JSON.stringify(command + '\n'));
      this.terminal.sendKey(command + '\n');
      this.inputArea.value = '';
      // Reset height in multiline mode
      if (this.isMultilineMode) {
        this.inputArea.style.height = '';
      }
    } else {
      console.log('[Keyboard] command is empty or whitespace, not sending');
    }
  }
}
