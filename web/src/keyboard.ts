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

  constructor(container: HTMLElement, terminal: TerminalManager, onLogout: () => void) {
    this.container = container;
    this.terminal = terminal;
    this.onLogout = onLogout;
    this.render();
  }

  private render() {
    this.container.innerHTML = '';
    this.container.className = 'virtual-keyboard';

    // Quick commands row with logout button
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
}
