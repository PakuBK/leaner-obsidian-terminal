import { Notice } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { PtyManager } from "./pty-manager";
import { getTheme } from "./themes";
import type { TerminalPluginSettings } from "./settings";
import type { BinaryManager } from "./binary-manager";

export const TAB_COLORS = [
  { name: "None", value: "" },
  { name: "Red", value: "#e54d4d" },
  { name: "Orange", value: "#e8a838" },
  { name: "Yellow", value: "#e5d74e" },
  { name: "Green", value: "#4ec955" },
  { name: "Blue", value: "#4e9de5" },
  { name: "Purple", value: "#b04ee5" },
] as const;

export interface TerminalSession {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  pty: PtyManager;
  containerEl: HTMLElement;
  color: string;
  commandRunning: boolean;
}

let sessionCounter = 0;

/** Play a short notification beep via the Web Audio API. */
function playNotificationSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 200);
  } catch {
    // Audio not available — silently ignore
  }
}

export class TerminalTabManager {
  private sessions: TerminalSession[] = [];
  private activeId: string | null = null;
  private tabBarEl: HTMLElement;
  private terminalHostEl: HTMLElement;
  private settings: TerminalPluginSettings;
  private cwd: string;
  private pluginDir: string;
  private binaryManager: BinaryManager;
  private onActiveChange?: () => void;

  constructor(
    tabBarEl: HTMLElement,
    terminalHostEl: HTMLElement,
    settings: TerminalPluginSettings,
    cwd: string,
    pluginDir: string,
    binaryManager: BinaryManager,
    onActiveChange?: () => void
  ) {
    this.tabBarEl = tabBarEl;
    this.terminalHostEl = terminalHostEl;
    this.settings = settings;
    this.cwd = cwd;
    this.pluginDir = pluginDir;
    this.binaryManager = binaryManager;
    this.onActiveChange = onActiveChange;
  }

  createTab(): TerminalSession {
    sessionCounter++;
    const id = `terminal-${sessionCounter}`;
    const name = `Terminal ${sessionCounter}`;

    // Create container for this session
    const containerEl = this.terminalHostEl.createDiv({ cls: "terminal-session" });

    // Create xterm.js instance
    const theme = getTheme(this.settings.theme);
    const terminal = new Terminal({
      fontSize: this.settings.fontSize,
      fontFamily: this.settings.fontFamily,
      cursorBlink: this.settings.cursorBlink,
      scrollback: this.settings.scrollback,
      theme,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerEl);

    const pty = new PtyManager(this.pluginDir);
    const session: TerminalSession = {
      id, name, terminal, fitAddon, pty, containerEl, color: "", commandRunning: false,
    };
    this.sessions.push(session);
    this.switchTab(id);
    this.renderTabBar();

    // Register OSC 133 handler for shell integration (command detection)
    terminal.parser.registerOscHandler(133, (data: string) => {
      if (data.startsWith("B")) {
        // Command is about to execute
        session.commandRunning = true;
      } else if (data.startsWith("D")) {
        // Command finished — notify if this tab is in the background
        if (session.commandRunning && session.id !== this.activeId) {
          const exitCode = parseInt(data.split(";")[1], 10) || 0;
          this.notifyCompletion(session, exitCode);
        }
        session.commandRunning = false;
      }
      return false; // don't consume — let xterm handle it
    });

    // Defer PTY spawn until DOM is laid out so fitAddon gets correct dimensions
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }

      const cols = terminal.cols || 80;
      const rows = terminal.rows || 24;

      if (!this.binaryManager.isReady()) {
        terminal.write("\r\n\x1b[33mTerminal binaries not installed.\x1b[0m\r\n");
        terminal.write("Go to Settings \u2192 Terminal to download them.\r\n");
        return;
      }

      try {
        pty.spawn(this.settings.shellPath, this.cwd, cols, rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error("Terminal: failed to spawn shell", err);
        terminal.write(`\r\nFailed to spawn shell: ${message}\r\n`);
        return;
      }

      // Wire data: PTY -> xterm
      pty.onData((data: string) => {
        terminal.write(data);
      });

      // Wire data: xterm -> PTY
      terminal.onData((data: string) => {
        pty.write(data);
      });

      pty.onExit(() => {
        terminal.write("\r\n[Process exited]\r\n");
      });
    }, 100);

    return session;
  }

  switchTab(id: string): void {
    this.activeId = id;

    // Clear blink notification on the tab being switched to
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const tabs = this.tabBarEl.querySelectorAll(".terminal-tab");
      if (tabs[idx]) tabs[idx].classList.remove("terminal-tab-blink");
    }

    for (const session of this.sessions) {
      if (session.id === id) {
        session.containerEl.style.display = "";
        // Fit after showing
        setTimeout(() => {
          try {
            session.fitAddon.fit();
            session.pty.resize(session.terminal.cols, session.terminal.rows);
            session.terminal.focus();
          } catch {
            // ignore
          }
        }, 10);
      } else {
        session.containerEl.style.display = "none";
      }
    }

    this.renderTabBar();
    this.onActiveChange?.();
  }

  closeTab(id: string): void {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const session = this.sessions[idx];
    session.pty.kill();
    session.terminal.dispose();
    session.containerEl.remove();
    this.sessions.splice(idx, 1);

    // Switch to adjacent tab if we closed the active one
    if (this.activeId === id) {
      if (this.sessions.length > 0) {
        const newIdx = Math.min(idx, this.sessions.length - 1);
        this.switchTab(this.sessions[newIdx].id);
      } else {
        this.activeId = null;
      }
    }

    this.renderTabBar();
  }

  fitActive(): void {
    const active = this.getActiveSession();
    if (!active) return;
    try {
      active.fitAddon.fit();
      active.pty.resize(active.terminal.cols, active.terminal.rows);
    } catch {
      // ignore
    }
  }

  getActiveSession(): TerminalSession | null {
    return this.sessions.find((s) => s.id === this.activeId) || null;
  }

  getSessions(): TerminalSession[] {
    return this.sessions;
  }

  destroyAll(): void {
    for (const session of this.sessions) {
      session.pty.kill();
      session.terminal.dispose();
      session.containerEl.remove();
    }
    this.sessions = [];
    this.activeId = null;
  }

  private notifyCompletion(session: TerminalSession, exitCode: number): void {
    const mode = this.settings.notifyOnCompletion;
    if (mode === "off") return;

    const status = exitCode === 0 ? "done" : `exit ${exitCode}`;

    if (mode === "blink" || mode === "both") {
      // Find the tab element and add blink class
      const tabs = this.tabBarEl.querySelectorAll(".terminal-tab");
      const idx = this.sessions.indexOf(session);
      if (idx >= 0 && tabs[idx]) {
        tabs[idx].classList.add("terminal-tab-blink");
      }
    }

    if (mode === "sound" || mode === "both") {
      playNotificationSound();
    }

    // Always show an Obsidian notice for background completions
    new Notice(`${session.name}: ${status}`);
  }

  private renameTab(id: string, labelEl: HTMLElement): void {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) return;

    const input = document.createElement("input");
    input.type = "text";
    input.value = session.name;
    input.className = "terminal-tab-rename-input";

    labelEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim() || session.name;
      session.name = newName;
      this.renderTabBar();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = session.name;
        input.blur();
      }
    });
  }

  private showTabContextMenu(e: MouseEvent, sessionId: string, labelEl: HTMLElement): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // Remove any existing context menu
    document.querySelector(".terminal-tab-context-menu")?.remove();

    const menu = document.createElement("div");
    menu.className = "terminal-tab-context-menu";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    // Rename option
    const renameItem = menu.createDiv({ cls: "terminal-ctx-item", text: "Rename" });
    renameItem.addEventListener("click", () => {
      menu.remove();
      this.renameTab(sessionId, labelEl);
    });

    // Color submenu
    const colorLabel = menu.createDiv({ cls: "terminal-ctx-item terminal-ctx-color-label", text: "Color" });
    const colorRow = menu.createDiv({ cls: "terminal-ctx-color-row" });

    for (const c of TAB_COLORS) {
      const swatch = colorRow.createDiv({ cls: "terminal-ctx-swatch" });
      if (c.value) {
        swatch.style.background = c.value;
      } else {
        swatch.classList.add("terminal-ctx-swatch-none");
      }
      if (session.color === c.value) {
        swatch.classList.add("active");
      }
      swatch.title = c.name;
      swatch.addEventListener("click", () => {
        session.color = c.value;
        this.renderTabBar();
        menu.remove();
      });
    }

    document.body.appendChild(menu);

    // Close on click outside
    const close = (evt: MouseEvent) => {
      if (!menu.contains(evt.target as Node)) {
        menu.remove();
        document.removeEventListener("click", close, true);
      }
    };
    setTimeout(() => document.addEventListener("click", close, true), 0);
  }

  private renderTabBar(): void {
    this.tabBarEl.empty();

    for (const session of this.sessions) {
      const tab = this.tabBarEl.createDiv({
        cls: `terminal-tab ${session.id === this.activeId ? "active" : ""}`,
      });

      // Apply tab color as left border
      if (session.color) {
        tab.style.borderLeft = `3px solid ${session.color}`;
      }

      const label = tab.createSpan({ cls: "terminal-tab-label", text: session.name });
      tab.addEventListener("click", () => this.switchTab(session.id));
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTabContextMenu(e, session.id, label);
      });

      const closeBtn = tab.createSpan({ cls: "terminal-tab-close", text: "\u00d7" });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(session.id);
      });
    }

    const addBtn = this.tabBarEl.createDiv({ cls: "terminal-new-tab", text: "+" });
    addBtn.addEventListener("click", () => this.createTab());
  }
}
