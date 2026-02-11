import { App, PluginSettingTab, Setting } from "obsidian";
import type JournalMemosPlugin from "./main";

export interface JournalMemosSettings {
	dailyNotesFolder: string;
	dailyNotePathFormat: string;
	attachmentsFolder: string;
	streamDays: number;
	heatmapDays: number;
	memoImageMaxWidth: number;
	exploreColumnLimit: number;
	dayGroupColorA: string;
	dayGroupAlphaA: number;
	dayGroupColorB: string;
	dayGroupAlphaB: number;
}

export const DEFAULT_SETTINGS: JournalMemosSettings = {
	dailyNotesFolder: "DailyNotes",
	dailyNotePathFormat: "{folder}/{yyyy}/{MM}/{yyyy-MM-dd}.md",
	attachmentsFolder: "{folder}/_attachments",
	streamDays: 30,
	heatmapDays: 140,
	memoImageMaxWidth: 640,
	exploreColumnLimit: 0,
	dayGroupColorA: "",
	dayGroupAlphaA: 100,
	dayGroupColorB: "",
	dayGroupAlphaB: 100,
};

function parsePositiveInt(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

export function hexAlphaToRgba(hex: string, alpha: number): string {
	if (!hex) return "";
	const cleanHex = hex.replace("#", "");
	const r = parseInt(cleanHex.substring(0, 2), 16);
	const g = parseInt(cleanHex.substring(2, 4), 16);
	const b = parseInt(cleanHex.substring(4, 6), 16);
	const a = Math.max(0, Math.min(100, alpha)) / 100;
	return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export class JournalMemosSettingTab extends PluginSettingTab {
	private readonly plugin: JournalMemosPlugin;
	private activeTab = "paths";

	constructor(app: App, plugin: JournalMemosPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("jm-settings");

		// ── Tab bar ──
		const tabBar = containerEl.createDiv({ cls: "jm-settings-tab-bar" });
		const tabs: { id: string; label: string }[] = [
			{ id: "paths", label: "📁  Paths" },
			{ id: "views", label: "👁  Views" },
			{ id: "appearance", label: "🎨  Appearance" },
		];

		const contentContainer = containerEl.createDiv({ cls: "jm-settings-content" });

		for (const tab of tabs) {
			const btn = tabBar.createEl("button", {
				text: tab.label,
				cls: `jm-settings-tab-btn ${this.activeTab === tab.id ? "is-active" : ""}`,
			});
			btn.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.display();
			});
		}

		// ── Tab content ──
		switch (this.activeTab) {
			case "paths":
				this.renderPathsTab(contentContainer);
				break;
			case "views":
				this.renderViewsTab(contentContainer);
				break;
			case "appearance":
				this.renderAppearanceTab(contentContainer);
				break;
		}
	}

	private renderPathsTab(container: HTMLElement): void {
		new Setting(container)
			.setName("Daily notes folder")
			.setDesc("Root folder for daily notes.")
			.addText((text) =>
				text
					.setPlaceholder("DailyNotes")
					.setValue(this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFolder = value.trim();
						await this.plugin.saveSettings();
						this.plugin.memoService.clearCache();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("Daily note path format")
			.setDesc(
				"Path pattern for daily notes. Use {folder} for root folder, {yyyy}, {MM}, {dd} for date parts. Example: {folder}/{yyyy}/{MM}/{yyyy-MM-dd}.md",
			)
			.addText((text) =>
				text
					.setPlaceholder("{folder}/{yyyy}/{MM}/{yyyy-MM-dd}.md")
					.setValue(this.plugin.settings.dailyNotePathFormat)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotePathFormat =
							value.trim() || DEFAULT_SETTINGS.dailyNotePathFormat;
						await this.plugin.saveSettings();
						this.plugin.memoService.clearCache();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("Attachments folder")
			.setDesc(
				"Where pasted or uploaded memo attachments are stored. Use {folder} to refer to the daily notes folder.",
			)
			.addText((text) =>
				text
					.setPlaceholder("{folder}/_attachments")
					.setValue(this.plugin.settings.attachmentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderViewsTab(container: HTMLElement): void {
		new Setting(container)
			.setName("Stream window (days)")
			.setDesc("How many recent days to include in the stream list.")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.streamDays))
					.onChange(async (value) => {
						this.plugin.settings.streamDays = parsePositiveInt(
							value,
							DEFAULT_SETTINGS.streamDays,
						);
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("Heatmap window (days)")
			.setDesc("How many recent days to render in the activity heatmap.")
			.addText((text) =>
				text
					.setPlaceholder("140")
					.setValue(String(this.plugin.settings.heatmapDays))
					.onChange(async (value) => {
						this.plugin.settings.heatmapDays = parsePositiveInt(
							value,
							DEFAULT_SETTINGS.heatmapDays,
						);
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("Memo image max width (px)")
			.setDesc(
				"Maximum width for memo images in stream cards and inline memo render.",
			)
			.addText((text) =>
				text
					.setPlaceholder("640")
					.setValue(String(this.plugin.settings.memoImageMaxWidth))
					.onChange(async (value) => {
						this.plugin.settings.memoImageMaxWidth = parsePositiveInt(
							value,
							DEFAULT_SETTINGS.memoImageMaxWidth,
						);
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("Explore view columns")
			.setDesc(
				"Fixed number of columns in Explore view. Set to 0 for responsive auto-layout.",
			)
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.exploreColumnLimit))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						this.plugin.settings.exploreColumnLimit =
							isNaN(parsed) || parsed < 0 ? 0 : parsed;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);
	}

	private renderAppearanceTab(container: HTMLElement): void {
		container.createEl("p", {
			text: "Customize the alternating background colors for same-day memo groups. Groups with only one memo are not colored.",
			cls: "setting-item-description",
		});

		new Setting(container)
			.setName("Day group color A")
			.setDesc("Background for odd day groups (1st, 3rd…). Pick color and adjust opacity.")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.dayGroupColorA || "#e0e0e0")
					.onChange(async (value) => {
						this.plugin.settings.dayGroupColorA = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.dayGroupAlphaA)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.dayGroupAlphaA = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon("reset")
					.setTooltip("Reset to theme default")
					.onClick(async () => {
						this.plugin.settings.dayGroupColorA = "";
						this.plugin.settings.dayGroupAlphaA = 100;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
						this.display();
					}),
			);

		new Setting(container)
			.setName("Day group color B")
			.setDesc("Background for even day groups (2nd, 4th…). Pick color and adjust opacity.")
			.addColorPicker((cp) =>
				cp
					.setValue(this.plugin.settings.dayGroupColorB || "#d8d8d8")
					.onChange(async (value) => {
						this.plugin.settings.dayGroupColorB = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.dayGroupAlphaB)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.dayGroupAlphaB = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon("reset")
					.setTooltip("Reset to theme default")
					.onClick(async () => {
						this.plugin.settings.dayGroupColorB = "";
						this.plugin.settings.dayGroupAlphaB = 100;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
						this.display();
					}),
			);
	}
}

