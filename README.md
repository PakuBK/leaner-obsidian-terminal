# Leaner Terminal

Forked from [sdkasper/lean-obsidian-terminal](https://github.com/sdkasper/lean-obsidian-terminal).

An embedded terminal panel for [Obsidian](https://obsidian.md), powered by [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/nicedoc/node-pty).

**Desktop only.** Requires Obsidian 1.5.0+.

## What’s different in this fork

- More “plain wrapper” behavior: removed shell integration injection that could print raw OSC markers (e.g. OSC 133)
- Optional **Oh My Posh config override** for the embedded terminal (local path _or_ URL)
- Windows: optional **ConPTY backend** (experimental) for better truecolor/color fidelity (default remains WinPTY)
- Optional ANSI 16-color palette override (Campbell) to better match Windows Terminal colors
- Keeps Nerd Font support via configurable `fontFamily`
- Optional background color override (with color picker)

## Features

- Full PTY terminal (not a simple command runner) with interactive shell support
- Multiple terminal tabs with rename and color-coding support
- Auto-detects your shell: PowerShell 7 / Windows PowerShell / cmd.exe on Windows, `$SHELL` on macOS/Linux
- Customizable ribbon and panel tab icon (any Lucide icon name)
- Clickable URLs in terminal output
- Auto-resize on panel resize
- Opens at vault root by default
- Clipboard support: Ctrl+V / Cmd+V paste, Ctrl+C / Cmd+C copy (with selection)
- Notification sounds when background tab commands finish (4 sound types, adjustable volume)
- Shift+Enter inserts a newline instead of submitting
- Optional: background override, ANSI palette override, embedded-only Oh My Posh config override, Windows backend selection

## Installation

1. Clone this repository
2. Run `npm install && npm run build`
3. Run `node install.mjs "/path/to/your/vault"`
4. Restart Obsidian and enable the plugin in **Settings > Community Plugins**
5. Go to **Settings > Terminal** and click **Download binaries** (required for the PTY backend)

## Usage

| Action          | How                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------- |
| Open terminal   | Click the terminal icon in the ribbon, or run **Open terminal** from the command palette |
| Toggle terminal | Command palette: **Toggle terminal**, or click the ribbon icon again                     |
| New tab         | Command palette: **New terminal tab**, or click the **+** button in the tab bar          |
| Rename tab      | Right-click the tab label                                                                |
| Close tab       | Click the **x** on the tab                                                               |
| Split pane      | Command palette: **Open terminal in new pane**                                           |

## Settings

| Setting                     | Default                                 | Description                                                                                                                                        |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell path                  | Auto-detect                             | Path to shell executable. Leave empty for auto-detection.                                                                                          |
| Font family                 | Menlo, Monaco, 'Courier New', monospace | CSS `font-family` passed to xterm.js (use a Nerd Font for prompt glyphs).                                                                          |
| Color palette               | Default (xterm.js)                      | Overrides the ANSI 16-color palette used for basic color codes. On Windows, “Windows Terminal (Campbell)” can look closer to your system terminal. |
| Windows backend (Windows)   | WinPTY                                  | Select the PTY backend. ConPTY is experimental but can significantly improve truecolor/color fidelity.                                             |
| Oh My Posh theme (optional) | (empty)                                 | Path or URL to a `.omp.json` config to apply only inside the embedded terminal. Leave empty to use your normal profile theme.                      |
| Background color (optional) | (empty)                                 | Override the terminal background (hex/RGB/etc.). Leave empty for default.                                                                          |
| Icon                        | terminal                                | Lucide icon name for the ribbon and panel tab icon.                                                                                                |
| Cursor blink                | On                                      | Whether the cursor blinks.                                                                                                                         |
| Scrollback                  | 5000                                    | Number of lines kept in scroll history.                                                                                                            |
| Default location            | Bottom                                  | Where new terminal panels open (Bottom or Right).                                                                                                  |
| Notify on completion        | Off                                     | Sound + notice when a background tab command finishes.                                                                                             |
| Notification sound          | Beep                                    | Choose from Beep, Chime, Ping, or Pop.                                                                                                             |
| Notification volume         | 50                                      | Volume for notification sounds (0–100).                                                                                                            |

## How It Works

The plugin uses xterm.js for terminal rendering and node-pty for native pseudo-terminal support. node-pty spawns a real shell process (PowerShell, bash, etc.) and connects its stdin/stdout to xterm.js via Obsidian's Electron runtime. This gives you a fully interactive terminal — not just command execution.

On Windows, the plugin defaults to the WinPTY backend for compatibility. This fork adds an opt-in ConPTY mode (Settings → Terminal → Windows backend) which can improve truecolor/color fidelity, depending on your Obsidian/Electron version.

## License

[MIT](LICENSE)
