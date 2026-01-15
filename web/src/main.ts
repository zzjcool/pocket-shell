import '@xterm/xterm/css/xterm.css';
import './types'; // Import for Wake Lock API type declarations
import { api } from './api';
import { TerminalManager } from './terminal';
import { VirtualKeyboard } from './keyboard';
import './debug';  // Initialize debug panel if ?debug=1

class App {
  private terminal: TerminalManager | null = null;
  private keyboard: VirtualKeyboard | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  async init() {
    // Check if already logged in
    const token = api.getToken();
    if (token) {
      try {
        // Try to list sessions to verify token is valid
        await api.listSessions();
        this.showTerminalView();
        return;
      } catch {
        // Token invalid, show login
        api.setToken(null);
      }
    }
    this.showLoginView();
  }

  private showLoginView() {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h1 class="login-title">Pocket Shell</h1>
          <form id="login-form">
            <div class="form-group">
              <input type="text" id="username" placeholder="Username" autocomplete="username" required>
            </div>
            <div class="form-group">
              <input type="password" id="password" placeholder="Password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="login-btn">Login</button>
            <p id="error-msg" class="error-msg"></p>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const errorMsg = document.getElementById('error-msg')!;

      try {
        await api.login(username, password);
        this.showTerminalView();
      } catch (err) {
        errorMsg.textContent = err instanceof Error ? err.message : 'Login failed';
      }
    });
  }

  private async showTerminalView() {
    const app = document.getElementById('app')!;
    // Note: keyboard-area is outside terminal-container so it won't move
    // when the terminal is translated up for mobile keyboard
    app.innerHTML = `
      <div class="terminal-container">
        <div id="terminal-area"></div>
      </div>
      <div id="keyboard-area"></div>
    `;

    const terminalArea = document.getElementById('terminal-area')!;
    const keyboardArea = document.getElementById('keyboard-area')!;

    this.terminal = new TerminalManager(terminalArea);
    this.keyboard = new VirtualKeyboard(keyboardArea, this.terminal, () => this.logout());

    // Create or get session
    try {
      const sessions = await api.listSessions();
      let sessionId: string;

      if (sessions.length > 0) {
        sessionId = sessions[0].id;
      } else {
        const session = await api.createSession();
        sessionId = session.id;
      }

      await this.terminal.connect(sessionId);
      this.terminal.focus();

      // Request wake lock to keep screen on
      await this.requestWakeLock();
    } catch (err) {
      console.error('Failed to connect:', err);
      api.setToken(null);
      this.showLoginView();
      return;
    }

    // Logout handler moved to keyboard
  }

  private async logout() {
    await this.releaseWakeLock();
    this.terminal?.dispose();
    this.terminal = null;
    this.keyboard?.dispose();
    this.keyboard = null;
    await api.logout();
    this.showLoginView();
  }

  private async requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      console.log('Wake Lock API not supported');
      return;
    }

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock acquired');

      // Re-acquire wake lock when page becomes visible again
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    } catch (err) {
      console.error('Failed to acquire Wake Lock:', err);
    }
  }

  private handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && this.terminal) {
      await this.requestWakeLock();
    }
  };

  private async releaseWakeLock() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
      console.log('Wake Lock released');
    }
  }
}

// Start app
const app = new App();
app.init();
