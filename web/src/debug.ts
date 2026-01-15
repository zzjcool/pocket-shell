// Debug panel for mobile debugging
// Enable by adding ?debug=1 to URL

class DebugPanel {
  private container: HTMLElement | null = null;
  private logContainer: HTMLElement | null = null;
  private maxLogs = 100;
  private logs: string[] = [];
  private isEnabled = false;
  private isMinimized = false;

  constructor() {
    // Check if debug mode is enabled via URL parameter
    const params = new URLSearchParams(window.location.search);
    this.isEnabled = params.get('debug') === '1';

    if (this.isEnabled) {
      this.init();
      this.interceptConsole();
    }
  }

  private init() {
    // Create debug panel container
    this.container = document.createElement('div');
    this.container.id = 'debug-panel';
    this.container.innerHTML = `
      <div class="debug-header">
        <span class="debug-title">Debug</span>
        <div class="debug-actions">
          <button class="debug-btn" id="debug-clear">Clear</button>
          <button class="debug-btn" id="debug-toggle">_</button>
        </div>
      </div>
      <div class="debug-logs" id="debug-logs"></div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #debug-panel {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-height: 40vh;
        background: rgba(0, 0, 0, 0.9);
        border-top: 1px solid #444;
        z-index: 10000;
        font-family: monospace;
        font-size: 11px;
        display: flex;
        flex-direction: column;
      }
      #debug-panel.minimized {
        max-height: none;
      }
      #debug-panel.minimized .debug-logs {
        display: none;
      }
      .debug-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #333;
        border-bottom: 1px solid #444;
        flex-shrink: 0;
      }
      .debug-title {
        color: #0f0;
        font-weight: bold;
      }
      .debug-actions {
        display: flex;
        gap: 4px;
      }
      .debug-btn {
        background: #555;
        border: none;
        color: #fff;
        padding: 2px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      }
      .debug-btn:active {
        background: #777;
      }
      .debug-logs {
        overflow-y: auto;
        padding: 4px 8px;
        flex: 1;
        min-height: 0;
      }
      .debug-log {
        padding: 2px 0;
        border-bottom: 1px solid #333;
        word-break: break-all;
        white-space: pre-wrap;
      }
      .debug-log.log { color: #fff; }
      .debug-log.info { color: #0af; }
      .debug-log.warn { color: #fa0; }
      .debug-log.error { color: #f55; }
      .debug-log .time {
        color: #888;
        margin-right: 8px;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.container);

    this.logContainer = document.getElementById('debug-logs');

    // Event listeners
    document.getElementById('debug-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('debug-toggle')?.addEventListener('click', () => this.toggle());
  }

  private interceptConsole() {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      this.addLog('log', args);
      originalLog.apply(console, args);
    };

    console.info = (...args) => {
      this.addLog('info', args);
      originalInfo.apply(console, args);
    };

    console.warn = (...args) => {
      this.addLog('warn', args);
      originalWarn.apply(console, args);
    };

    console.error = (...args) => {
      this.addLog('error', args);
      originalError.apply(console, args);
    };
  }

  private formatArg(arg: unknown): string {
    if (typeof arg === 'string') {
      return arg;
    }
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  private addLog(level: string, args: unknown[]) {
    if (!this.logContainer) return;

    const time = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    
    const message = args.map(arg => this.formatArg(arg)).join(' ');
    
    const logEntry = document.createElement('div');
    logEntry.className = `debug-log ${level}`;
    logEntry.innerHTML = `<span class="time">${time}</span>${this.escapeHtml(message)}`;
    
    this.logContainer.appendChild(logEntry);
    
    // Limit number of logs
    while (this.logContainer.children.length > this.maxLogs) {
      this.logContainer.removeChild(this.logContainer.firstChild!);
    }
    
    // Auto scroll to bottom
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private clear() {
    if (this.logContainer) {
      this.logContainer.innerHTML = '';
    }
  }

  private toggle() {
    if (this.container) {
      this.isMinimized = !this.isMinimized;
      this.container.classList.toggle('minimized', this.isMinimized);
      const btn = document.getElementById('debug-toggle');
      if (btn) {
        btn.textContent = this.isMinimized ? '+' : '_';
      }
    }
  }
}

// Initialize debug panel
export const debugPanel = new DebugPanel();
