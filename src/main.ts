import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { registerCommands } from "./commands/register-commands";
import { MemoService } from "./features/memo-service";
import { DEFAULT_SETTINGS, JournalMemosSettingTab, type JournalMemosSettings } from "./settings";
import { JOURNAL_MEMOS_VIEW_TYPE, JournalMemosView } from "./ui/journal-memos-view";

export default class JournalMemosPlugin extends Plugin {
	settings: JournalMemosSettings = DEFAULT_SETTINGS;
	memoService!: MemoService;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.memoService = new MemoService(this.app, () => this.settings);

		this.registerView(
			JOURNAL_MEMOS_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new JournalMemosView(leaf, this),
		);
		registerCommands(this);
		this.addSettingTab(new JournalMemosSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				this.handleFileChange(file.path);
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) {
					return;
				}
				this.handleFileChange(oldPath);
				this.handleFileChange(file.path);
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (!(file instanceof TFile)) {
					return;
				}
				this.handleFileChange(file.path);
			}),
		);

		window.setTimeout(() => {
			void this.memoService.warmCacheFromIndex();
		}, 0);
	}

	async onunload(): Promise<void> {
		await this.app.workspace.detachLeavesOfType(JOURNAL_MEMOS_VIEW_TYPE);
	}

	async activateView(): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(JOURNAL_MEMOS_VIEW_TYPE)[0];
		const leaf = existingLeaf ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			return;
		}

		await leaf.setViewState({
			type: JOURNAL_MEMOS_VIEW_TYPE,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async refreshOpenViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(JOURNAL_MEMOS_VIEW_TYPE);
		await Promise.all(
			leaves.map(async (leaf) => {
				if (leaf.view instanceof JournalMemosView) {
					await leaf.view.refresh();
				}
			}),
		);
	}

	async loadSettings(): Promise<void> {
		const persisted = (await this.loadData()) as Partial<JournalMemosSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, persisted ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private handleFileChange(path: string): void {
		if (!this.memoService.isTrackedPath(path)) {
			return;
		}
		this.memoService.invalidate(path);
		void this.refreshOpenViews();
	}
}
