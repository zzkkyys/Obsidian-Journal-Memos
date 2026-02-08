import { App, PluginSettingTab, Setting } from "obsidian";
import type JournalMemosPlugin from "./main";

export interface JournalMemosSettings {
	dailyNotesFolder: string;
	streamDays: number;
	heatmapDays: number;
}

export const DEFAULT_SETTINGS: JournalMemosSettings = {
	dailyNotesFolder: "Daily",
	streamDays: 30,
	heatmapDays: 140,
};

function parsePositiveInt(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

export class JournalMemosSettingTab extends PluginSettingTab {
	private readonly plugin: JournalMemosPlugin;

	constructor(app: App, plugin: JournalMemosPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Daily notes folder")
			.setDesc("Folder containing your YYYY-MM-DD.md daily notes.")
			.addText((text) =>
				text
					.setPlaceholder("Daily")
					.setValue(this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFolder = value.trim();
						await this.plugin.saveSettings();
						this.plugin.memoService.clearCache();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(containerEl)
			.setName("Stream window (days)")
			.setDesc("How many recent days to include in the stream list.")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.streamDays))
					.onChange(async (value) => {
						this.plugin.settings.streamDays = parsePositiveInt(value, DEFAULT_SETTINGS.streamDays);
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(containerEl)
			.setName("Heatmap window (days)")
			.setDesc("How many recent days to render in the activity heatmap.")
			.addText((text) =>
				text
					.setPlaceholder("140")
					.setValue(String(this.plugin.settings.heatmapDays))
					.onChange(async (value) => {
						this.plugin.settings.heatmapDays = parsePositiveInt(value, DEFAULT_SETTINGS.heatmapDays);
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);
	}
}
