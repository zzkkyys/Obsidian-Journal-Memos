import { App, PluginSettingTab, Setting } from "obsidian";
import type JournalMemosPlugin from "./main";

export interface JournalMemosSettings {
	dailyNotesFolder: string;
	dailyNotePathFormat: string;
	attachmentsFolder: string;
	streamPageSize: number;
	heatmapDays: number;
	memoImageMaxWidth: number;
	exploreColumnLimit: number;
	dayGroupColorA: string;
	dayGroupAlphaA: number;
	dayGroupColorB: string;
	dayGroupAlphaB: number;
	showHeatmapStrip: boolean;
	qweatherApiKey: string;
	qweatherLocation: string;
	qweatherRefreshInterval: number;
	qweatherIconSet: string;
}

export const DEFAULT_SETTINGS: JournalMemosSettings = {
	dailyNotesFolder: "DailyNotes",
	dailyNotePathFormat: "{folder}/{yyyy}/{MM}/{yyyy-MM-dd}.md",
	attachmentsFolder: "{folder}/_attachments",
	streamPageSize: 100,
	heatmapDays: 140,
	memoImageMaxWidth: 640,
	exploreColumnLimit: 0,
	dayGroupColorA: "",
	dayGroupAlphaA: 100,
	dayGroupColorB: "",
	dayGroupAlphaB: 100,
	showHeatmapStrip: true,
	qweatherApiKey: "",
	qweatherLocation: "",
	qweatherRefreshInterval: 30,
	qweatherIconSet: "qweather",
};

function parsePositiveInt(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

export function clampStreamPageSize(value: number): number {
	const fallback = DEFAULT_SETTINGS.streamPageSize;
	const parsed = Math.floor(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(300, Math.max(20, parsed));
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
			{ id: "weather", label: "🌤  Weather" },
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
			case "weather":
				this.renderWeatherTab(contentContainer);
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
			.setName("Show activity heatmap strip")
			.setDesc("Display the GitHub-style contribution heatmap between the mini calendar and the tag list.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHeatmapStrip)
					.onChange(async (value) => {
						this.plugin.settings.showHeatmapStrip = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("Stream page size")
			.setDesc("How many memos to load per stream page when opening or scrolling.")
			.addText((text) =>
				text
					.setPlaceholder("100")
					.setValue(String(this.plugin.settings.streamPageSize))
					.onChange(async (value) => {
						this.plugin.settings.streamPageSize = clampStreamPageSize(
							parsePositiveInt(
								value,
								DEFAULT_SETTINGS.streamPageSize,
							),
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

	private renderWeatherTab(container: HTMLElement): void {
		container.createEl("p", {
			text: "显示在日历上方的天气卡片，使用和风天气 API 获取实时天气。城市可填写城市名（如「深圳」）、LocationID（如 101280601）或经纬度坐标（如「114.06,22.55」）。",
			cls: "setting-item-description",
		});

		new Setting(container)
			.setName("和风天气 API Key")
			.setDesc("在 dev.qweather.com 注册后获取，免费版使用开发者 API。")
			.addText((text) =>
				text
					.setPlaceholder("your-api-key")
					.setValue(this.plugin.settings.qweatherApiKey)
					.onChange(async (value) => {
						this.plugin.settings.qweatherApiKey = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("城市 / 位置")
			.setDesc("城市名、LocationID 或经纬度坐标（经度,纬度）。")
			.addText((text) =>
				text
					.setPlaceholder("深圳 / 101280601 / 114.06,22.55")
					.setValue(this.plugin.settings.qweatherLocation)
					.onChange(async (value) => {
						this.plugin.settings.qweatherLocation = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("天气图标风格")
			.setDesc("和风天气：官方黑白图标。Meteocons：彩色动态图标（需联网加载）。")
			.addDropdown((drop) =>
				drop
					.addOption("qweather", "和风天气（黑白）")
					.addOption("qweather-s2", "和风天气 S2（彩色）")
					.addOption("meteocons-fill", "Meteocons 填充版（彩色）")
					.addOption("meteocons-line", "Meteocons 线条版（彩色）")
					.setValue(this.plugin.settings.qweatherIconSet)
					.onChange(async (value) => {
						this.plugin.settings.qweatherIconSet = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
					}),
			);

		new Setting(container)
			.setName("自动刷新间隔（分钟）")
			.setDesc("每隔多少分钟自动刷新天气，设为 0 则关闭自动刷新。")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.qweatherRefreshInterval))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						this.plugin.settings.qweatherRefreshInterval =
							isNaN(parsed) || parsed < 0 ? 30 : parsed;
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
