import {
    App,
    Notice,
    PluginSettingTab,
    Setting,
    ColorComponent,
    Platform,
    setIcon,
} from "obsidian";
import type TerminalPlugin from "./main";

export type NotificationSound = "beep" | "chime" | "ping" | "pop";

export interface TerminalPluginSettings {
    shellPath: string;
    /** CSS font-family value passed to xterm.js (names with spaces must be quoted). */
    fontFamily: string;
    /** ANSI 16-color palette used by xterm.js when apps output basic color codes. */
    colorPalette: "xterm" | "campbell";
    /** Windows backend. ConPTY can improve color fidelity but may be less stable in Obsidian. */
    windowsBackend: "winpty" | "conpty";
    /** Optional background override for the embedded terminal. Empty = default. */
    backgroundColor: string;
    /** Optional Oh My Posh theme config path/URL to apply only in this embedded terminal. Empty = off. */
    ohMyPoshConfigPath: string;
    cursorBlink: boolean;
    scrollback: number;
    ribbonIcon: string;
    defaultLocation: "right" | "bottom";
    notifyOnCompletion: boolean;
    notificationSound: NotificationSound;
    notificationVolume: number;
}

export const DEFAULT_SETTINGS: TerminalPluginSettings = {
    shellPath: "",
    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
    colorPalette: "xterm",
    windowsBackend: "winpty",
    backgroundColor: "",
    ohMyPoshConfigPath: "",
    cursorBlink: true,
    scrollback: 5000,
    ribbonIcon: "terminal",
    defaultLocation: "bottom",
    notifyOnCompletion: false,
    notificationSound: "beep",
    notificationVolume: 50,
};

export class TerminalSettingTab extends PluginSettingTab {
    plugin: TerminalPlugin;

    constructor(app: App, plugin: TerminalPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // --- Binary Management ---
        new Setting(containerEl).setName("Terminal binary").setHeading();

        const bm = this.plugin.binaryManager;
        const { platform, arch } = bm.getPlatformInfo();
        const version = bm.getVersion();
        const status = bm.getStatus();

        let statusDesc: string;
        if (status === "ready") {
            statusDesc = `Installed (v${version}) \u2014 ${platform}-${arch}`;
        } else if (status === "error") {
            statusDesc = `Error: ${bm.getStatusMessage()}`;
        } else if (status === "downloading") {
            statusDesc = `Downloading\u2026 ${bm.getStatusMessage()}`;
        } else {
            statusDesc = `Not installed \u2014 ${platform}-${arch}`;
        }

        new Setting(containerEl).setName("Status").setDesc(statusDesc);

        new Setting(containerEl)
            .setName("Download binaries")
            .setDesc("Download platform-specific node-pty binaries from GitHub")
            .addButton((btn) => {
                btn.setButtonText(
                    status === "downloading" ? "Downloading\u2026" : "Download",
                )
                    .setDisabled(status === "ready" || status === "downloading")
                    .onClick(async () => {
                        btn.setButtonText("Downloading\u2026");
                        btn.setDisabled(true);
                        try {
                            await bm.download();
                            new Notice(
                                "Terminal binaries installed successfully.",
                            );
                        } catch (err: unknown) {
                            const msg =
                                err instanceof Error
                                    ? err.message
                                    : String(err);
                            new Notice(`Failed to download binaries: ${msg}`);
                        }
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName("Remove binaries")
            .setDesc("Delete downloaded node-pty binaries")
            .addButton((btn) => {
                btn.setButtonText("Remove")
                    .setDisabled(status !== "ready")
                    .onClick(() => {
                        bm.remove();
                        new Notice("Terminal binaries removed.");
                        this.display();
                    });
            });

        // --- Appearance & Behavior ---
        new Setting(containerEl).setName("Appearance & behavior").setHeading();

        new Setting(containerEl)
            .setName("Shell path")
            .setDesc("Leave empty to auto-detect your default shell")
            .addText((text) =>
                text
                    .setPlaceholder("Auto-detect")
                    .setValue(this.plugin.settings.shellPath)
                    .onChange(async (value) => {
                        this.plugin.settings.shellPath = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Font family")
            .setDesc(
                'CSS font-family for the embedded terminal. If the font name has spaces, quote it. Example: "BitstromWera Nerd Font Mono", monospace',
            )
            .addText((text) =>
                text
                    .setPlaceholder('"BitstromWera Nerd Font Mono", monospace')
                    .setValue(this.plugin.settings.fontFamily)
                    .onChange(async (value) => {
                        this.plugin.settings.fontFamily = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Color palette")
            .setDesc(
                "Overrides the ANSI 16-color palette. Useful on Windows (winpty) when prompt colors look wrong.",
            )
            .addDropdown((dropdown) => {
                dropdown.addOption("xterm", "Default (xterm.js)");
                dropdown.addOption("campbell", "Windows Terminal (Campbell)");
                dropdown.setValue(this.plugin.settings.colorPalette);
                dropdown.onChange(async (value: string) => {
                    this.plugin.settings.colorPalette = value as
                        | "xterm"
                        | "campbell";
                    await this.plugin.saveSettings();
                });
            });

        if (Platform.isWin) {
            new Setting(containerEl)
                .setName("Windows backend")
                .setDesc(
                    "WinPTY is the default for compatibility. ConPTY can improve color fidelity (truecolor), but may be less stable.",
                )
                .addDropdown((dropdown) => {
                    dropdown.addOption("winpty", "WinPTY (default)");
                    dropdown.addOption("conpty", "ConPTY (experimental)");
                    dropdown.setValue(this.plugin.settings.windowsBackend);
                    dropdown.onChange(async (value: string) => {
                        this.plugin.settings.windowsBackend = value as
                            | "winpty"
                            | "conpty";
                        await this.plugin.saveSettings();
                    });
                });
        }

        new Setting(containerEl)
            .setName("Oh My Posh theme (optional)")
            .setDesc(
                "Path or URL to a .omp.json config to apply only inside the embedded terminal. Leave empty to use your normal profile theme.",
            )
            .addText((text) =>
                text
                    .setPlaceholder(
                        "C:\\path\\to\\theme.omp.json (or https://…/theme.omp.json)",
                    )
                    .setValue(this.plugin.settings.ohMyPoshConfigPath)
                    .onChange(async (value) => {
                        this.plugin.settings.ohMyPoshConfigPath = value.trim();
                        await this.plugin.saveSettings();
                    }),
            );

        const bgSetting = new Setting(containerEl)
            .setName("Background color (optional)")
            .setDesc(
                "Override the terminal background. Leave empty for default.",
            );

        let bgTextInput: HTMLInputElement;
        let bgColorPicker: ColorComponent | undefined;

        bgSetting.addText((text) => {
            bgTextInput = text.inputEl;
            text.setPlaceholder("Default")
                .setValue(this.plugin.settings.backgroundColor)
                .onChange(async (value) => {
                    this.plugin.settings.backgroundColor = value.trim();
                    if (
                        /^#[0-9a-fA-F]{6}$/.test(
                            this.plugin.settings.backgroundColor,
                        ) &&
                        bgColorPicker
                    ) {
                        bgColorPicker.setValue(
                            this.plugin.settings.backgroundColor,
                        );
                    }
                    await this.plugin.saveSettings();
                    this.plugin.updateTerminalBackgrounds();
                });
        });

        bgSetting.addColorPicker((picker) => {
            bgColorPicker = picker;
            const current = this.plugin.settings.backgroundColor;
            if (/^#[0-9a-fA-F]{6}$/.test(current)) {
                picker.setValue(current);
            }
            picker.onChange(async (value) => {
                this.plugin.settings.backgroundColor = value;
                if (bgTextInput) bgTextInput.value = value;
                await this.plugin.saveSettings();
                this.plugin.updateTerminalBackgrounds();
            });
        });

        bgSetting.addButton((btn) => {
            btn.setButtonText("Reset").onClick(async () => {
                this.plugin.settings.backgroundColor = "";
                if (bgTextInput) bgTextInput.value = "";
                if (bgColorPicker) bgColorPicker.setValue("#000000");
                await this.plugin.saveSettings();
                this.plugin.updateTerminalBackgrounds();
            });
        });

        const iconSetting = new Setting(containerEl)
            .setName("Icon")
            .setDesc(
                'Enter a Lucide icon name (e.g. "terminal", "code-2", "zap"). Browse icons at lucide.dev.',
            );

        let previewEl: HTMLElement | null = null;

        iconSetting.addText((text) => {
            text.setValue(this.plugin.settings.ribbonIcon).onChange(
                async (value) => {
                    const name = value.trim();
                    this.plugin.settings.ribbonIcon = name;
                    await this.plugin.saveSettings();
                    this.plugin.updateIcon(name);
                    if (previewEl) setIcon(previewEl, name || "terminal");
                },
            );
        });

        previewEl = iconSetting.controlEl.createSpan({
            cls: "lean-terminal-icon-preview",
        });
        setIcon(previewEl, this.plugin.settings.ribbonIcon);

        iconSetting.addButton((btn) => {
            btn.setButtonText("Reset").onClick(async () => {
                this.plugin.settings.ribbonIcon = DEFAULT_SETTINGS.ribbonIcon;
                await this.plugin.saveSettings();
                this.plugin.updateIcon(DEFAULT_SETTINGS.ribbonIcon);
                this.display();
            });
        });

        new Setting(containerEl).setName("Cursor blink").addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.cursorBlink)
                .onChange(async (value) => {
                    this.plugin.settings.cursorBlink = value;
                    await this.plugin.saveSettings();
                }),
        );

        new Setting(containerEl).setName("Scrollback lines").addText((text) =>
            text
                .setValue(String(this.plugin.settings.scrollback))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.scrollback = num;
                        await this.plugin.saveSettings();
                    }
                }),
        );

        new Setting(containerEl)
            .setName("Default location")
            .setDesc("Where to open new terminal panels")
            .addDropdown((dropdown) => {
                dropdown.addOption("bottom", "Bottom");
                dropdown.addOption("right", "Right");
                dropdown.setValue(this.plugin.settings.defaultLocation);
                dropdown.onChange(async (value: string) => {
                    this.plugin.settings.defaultLocation = value as
                        | "right"
                        | "bottom";
                    await this.plugin.saveSettings();
                });
            });

        // --- Notifications ---
        new Setting(containerEl).setName("Notifications").setHeading();

        new Setting(containerEl)
            .setName("Notify on command completion")
            .setDesc(
                "Play a sound and show a notice when a command finishes in a background tab",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.notifyOnCompletion)
                    .onChange(async (value) => {
                        this.plugin.settings.notifyOnCompletion = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Notification sound")
            .setDesc("Sound to play when a background command finishes")
            .addDropdown((dropdown) => {
                dropdown.addOption("beep", "Beep");
                dropdown.addOption("chime", "Chime");
                dropdown.addOption("ping", "Ping");
                dropdown.addOption("pop", "Pop");
                dropdown.setValue(this.plugin.settings.notificationSound);
                dropdown.onChange(async (value: string) => {
                    this.plugin.settings.notificationSound =
                        value as NotificationSound;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Notification volume")
            .setDesc("Volume for the notification sound (0\u2013100)")
            .addSlider((slider) =>
                slider
                    .setLimits(0, 100, 1)
                    .setValue(this.plugin.settings.notificationVolume)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.notificationVolume = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
