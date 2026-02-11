import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import type JournalMemosPlugin from "../main";
import type { MemoSnapshot } from "../types";
import { hexAlphaToRgba } from "../settings";
import { DuplicateFileModal } from "./DuplicateFileModal";
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
		return "Journal memos";
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
			memoImageMaxWidth: this.plugin.settings.memoImageMaxWidth,
			exploreColumnLimit: this.plugin.settings.exploreColumnLimit,
			dayGroupColorA: hexAlphaToRgba(this.plugin.settings.dayGroupColorA, this.plugin.settings.dayGroupAlphaA),
			dayGroupColorB: hexAlphaToRgba(this.plugin.settings.dayGroupColorB, this.plugin.settings.dayGroupAlphaB),
		});
	}

	private async renderMemoContent(el: HTMLElement, markdown: string, sourcePath: string): Promise<void> {
		el.replaceChildren();
		if (!markdown.trim()) {
			return;
		}
		await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this);
	}

	private createProps(snapshot: MemoSnapshot) {
		return {
			stream: snapshot.stream,
			heatmap: snapshot.heatmap,
			memoImageMaxWidth: this.plugin.settings.memoImageMaxWidth,
			exploreColumnLimit: this.plugin.settings.exploreColumnLimit,
			dayGroupColorA: hexAlphaToRgba(this.plugin.settings.dayGroupColorA, this.plugin.settings.dayGroupAlphaA),
			dayGroupColorB: hexAlphaToRgba(this.plugin.settings.dayGroupColorB, this.plugin.settings.dayGroupAlphaB),
			refreshData: () => this.plugin.memoService.getSnapshot(),
			publishMemo: async (content: string) => {
				await this.plugin.memoService.appendMemo(content);
			},
			updateMemo: async (memo: { id: string; filePath: string; createdLabel: string; content: string; attachments: Array<{ path: string; name: string; isImage: boolean }> }, content: string) => {
				await this.plugin.memoService.updateMemo(memo, content);
			},
			deleteMemo: async (memo: { id: string; filePath: string; createdLabel: string; content: string; attachments: Array<{ path: string; name: string; isImage: boolean }> }) => {
				await this.plugin.memoService.deleteMemo(memo);
			},
			saveAttachments: async (
				attachments: Array<{ name: string; mimeType: string; data: ArrayBuffer }>,
			) => this.plugin.memoService.saveAttachments(attachments, async (name, existingPath, matchType) => {
				// Show confirmation dialog for duplicate files
				return new Promise<"use_existing" | "create_new" | "skip">((resolve) => {
					const modal = new DuplicateFileModal(this.app, name, existingPath, matchType, (action) => {
						resolve(action);
					});
					modal.open();
				});
			}),
			openDaily: (dateKey: string) => this.plugin.memoService.openDailyNote(dateKey),
			openOrCreateDaily: (dateKey: string) => this.plugin.memoService.openOrCreateDailyNote(dateKey),
			openPluginSettings: () => this.plugin.openPluginSettings(),
			renderMemoContent: (el: HTMLElement, markdown: string, sourcePath: string) =>
				this.renderMemoContent(el, markdown, sourcePath),
			notice: (message: string, timeout?: number) => new Notice(message, timeout),
			resolveResourcePath: (path: string) => this.app.vault.adapter.getResourcePath(path),
		};
	}
}
