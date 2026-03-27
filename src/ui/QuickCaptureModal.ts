import { Modal, Notice } from "obsidian";
import type JournalMemosPlugin from "../main";
import { DuplicateFileModal } from "./DuplicateFileModal";
import MemoEditor from "./MemoEditor.svelte";

export class QuickCaptureModal extends Modal {
	private readonly plugin: JournalMemosPlugin;
	private component: MemoEditor | null = null;
	private isSubmitting = false;

	constructor(plugin: JournalMemosPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("jm-quick-capture");

		const editorHost = contentEl.createDiv({ cls: "jm-quick-capture-editor" });

		this.component = new MemoEditor({
			target: editorHost,
			props: {
				value: "",
				placeholder: "Write a memo... (Ctrl+Enter to publish)",
				rows: 6,
				disabled: false,
				submitLabel: "Publish",
				showCancel: true,
				existingTags: this.plugin.memoService.getKnownTags(),
				saveAttachments: (attachments: Array<{ name: string; mimeType: string; data: ArrayBuffer }>) =>
					this.plugin.memoService.saveAttachments(attachments, async (name, existingPath, matchType) => {
						return new Promise<"use_existing" | "create_new" | "skip">((resolve) => {
							const modal = new DuplicateFileModal(this.app, name, existingPath, matchType, (action) => {
								resolve(action);
							});
							modal.open();
						});
					}),
				resolveResourcePath: (path: string) => this.app.vault.adapter.getResourcePath(path),
			},
		});

		this.component.$on("submit", () => {
			void this.publishMemo();
		});

		this.component.$on("cancel", () => {
			this.close();
		});

		// Focus the textarea after a tick
		setTimeout(() => {
			const textarea = editorHost.querySelector("textarea");
			textarea?.focus();
		}, 50);
	}

	onClose(): void {
		if (this.component) {
			this.component.$destroy();
			this.component = null;
		}
		this.contentEl.empty();
	}

	private async publishMemo(): Promise<void> {
		if (this.isSubmitting || !this.component) return;

		// With accessors: true, Svelte exposes exported props as getters
		const value = String((this.component as unknown as { value: string }).value ?? "");
		const content = value.trim();
		if (!content) {
			new Notice("Memo content cannot be empty.");
			return;
		}

		this.isSubmitting = true;
		try {
			await this.plugin.memoService.appendMemo(content);
			await this.plugin.refreshOpenViews();
			new Notice("Memo published.");
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error ? error.message : "Failed to publish memo.",
			);
		} finally {
			this.isSubmitting = false;
		}
	}
}
