import { App, PluginSettingTab, Setting } from "obsidian";
import type JournalMemosPlugin from "./main";

export interface JournalMemosSettings {
	dailyNotesFolder: string;
	attachmentsFolder: string;
	streamDays: number;
	heatmapDays: number;
	memoImageMaxWidth: number;
}

export const DEFAULT_SETTINGS: JournalMemosSettings = {
	dailyNotesFolder: "Daily",
	attachmentsFolder: "",
	streamDays: 30,
	heatmapDays: 140,
	memoImageMaxWidth: 640,
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
			.setDesc("Folder containing daily notes named yyyy-mm-dd.md.")
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
			.setName("Attachments folder")
			.setDesc("Where pasted or uploaded memo attachments are stored. Leave empty to use <daily folder>/_attachments.")
			.addText((text) =>
				text
					.setPlaceholder("Daily/_attachments")
					.setValue(this.plugin.settings.attachmentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolder = value.trim();
						await this.plugin.saveSettings();
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

		new Setting(containerEl)
			.setName("Memo image max width (px)")
			.setDesc("Maximum width for memo images in stream cards and inline memo render.")
			.addText((text) =>
				text
					.setPlaceholder("640")
					.setValue(String(this.plugin.settings.memoImageMaxWidth))
					.onChange(async (value) => {
						this.plugin.settings.memoImageMaxWidth = parsePositiveInt(value, DEFAULT_SETTINGS.memoImageMaxWidth);
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);
	}
}
