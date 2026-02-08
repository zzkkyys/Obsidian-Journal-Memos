import { ItemView, WorkspaceLeaf } from "obsidian";
import type JournalMemosPlugin from "../main";
import type { MemoSnapshot } from "../types";
import JournalMemosApp from "./JournalMemosApp.svelte";

export const JOURNAL_MEMOS_VIEW_TYPE = "journal-memos-view";

export class JournalMemosView extends ItemView {
	private component: JournalMemosApp | null = null;
	private readonly plugin: JournalMemosPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: JournalMemosPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return JOURNAL_MEMOS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Journal Memos";
	}

	getIcon(): string {
		return "calendar-check";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		const snapshot = await this.plugin.memoService.getSnapshot();
		this.component = new JournalMemosApp({
			target: this.contentEl,
			props: this.createProps(snapshot),
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}

	async refresh(): Promise<void> {
		if (!this.component) {
			return;
		}

		const snapshot = await this.plugin.memoService.getSnapshot();
		this.component.$set({
			stream: snapshot.stream,
			heatmap: snapshot.heatmap,
		});
	}

	private createProps(snapshot: MemoSnapshot) {
		return {
			stream: snapshot.stream,
			heatmap: snapshot.heatmap,
			refreshData: () => this.plugin.memoService.getSnapshot(),
			publishMemo: async (content: string) => {
				await this.plugin.memoService.appendMemo(content);
				await this.refresh();
			},
			openDaily: (dateKey: string) => this.plugin.memoService.openDailyNote(dateKey),
		};
	}
}
