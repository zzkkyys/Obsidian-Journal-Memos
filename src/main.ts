import {
	addIcon,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownRenderer,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

const JOURNAL_MEMOS_ICON = `<svg viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg" class="jm-color-icon"><rect x="12" y="12" width="76" height="76" rx="12" fill="#FFca28" stroke="#F0C000" stroke-width="4"/><line x1="28" y1="38" x2="72" y2="38" stroke="#795548" stroke-width="6" stroke-linecap="round"/><line x1="28" y1="58" x2="72" y2="58" stroke="#795548" stroke-width="6" stroke-linecap="round"/><line x1="28" y1="78" x2="52" y2="78" stroke="#795548" stroke-width="6" stroke-linecap="round"/><circle cx="72" cy="72" r="14" fill="#66BB6A" stroke="#2E7D32" stroke-width="2"/><polyline points="66,72 70,76 78,66" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
import { registerCommands } from "./commands/register-commands";
import { parseMemoBlockBody } from "./data/memo-parser";
import { MemoService } from "./features/memo-service";
import { DEFAULT_SETTINGS, JournalMemosSettingTab, type JournalMemosSettings } from "./settings";
import { JOURNAL_MEMOS_VIEW_TYPE, JournalMemosView } from "./ui/journal-memos-view";
import { InlineMemoImagePreviewModal, type InlineMemoPreviewItem } from "./ui/InlineMemoImagePreviewModal";

const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)(?:[?#].*)?$/i;



export default class JournalMemosPlugin extends Plugin {
	settings: JournalMemosSettings = DEFAULT_SETTINGS;
	memoService!: MemoService;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.memoService = new MemoService(this.app, () => this.settings, this.manifest.dir ?? "");

		this.registerView(
			JOURNAL_MEMOS_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new JournalMemosView(leaf, this),
		);
		registerCommands(this);
		this.addSettingTab(new JournalMemosSettingTab(this.app, this));
		addIcon("journal-memos-colorful", JOURNAL_MEMOS_ICON);
		const ribbonIconEl = this.addRibbonIcon("journal-memos-colorful", "Open memos view", () => {
			void this.activateView();
		});
		ribbonIconEl.addClass("jm-ribbon-icon-colorful");
		this.registerMarkdownCodeBlockProcessor("memos", (source, el, ctx) => {
			void this.renderInlineMemoBlock(source, el, ctx);
		});

		this.addCommand({
			id: "rebuild-attachment-index",
			name: "Rebuild Attachment Index",
			callback: async () => {
				new Notice("Rebuilding attachment index... This may take a moment.");
				await this.memoService.rebuildAttachmentIndex();
				new Notice("Attachment index rebuilt successfully.");
			},
		});

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

	onunload(): void {
		void this.app.workspace.detachLeavesOfType(JOURNAL_MEMOS_VIEW_TYPE);
	}

	async activateView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");

		await leaf.setViewState({
			type: JOURNAL_MEMOS_VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	openPluginSettings(): void {
		const maybeSetting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } })
			.setting;
		if (!maybeSetting) {
			new Notice("Could not open settings automatically.");
			return;
		}

		maybeSetting.open();
		maybeSetting.openTabById(this.manifest.id);
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

	private async renderInlineMemoBlock(
		source: string,
		containerEl: HTMLElement,
		context: MarkdownPostProcessorContext,
	): Promise<void> {
		const parsed = parseMemoBlockBody(source);
		if (!parsed) {
			containerEl.setText(source);
			return;
		}

		containerEl.empty();
		containerEl.addClass("jm-inline-memo");
		containerEl.dataset.sourcePath = context.sourcePath ?? "";
		containerEl.style.setProperty("--jm-image-max-width", `${Math.max(120, this.settings.memoImageMaxWidth)}px`);
		const renderChild = new MarkdownRenderChild(containerEl);
		context.addChild(renderChild);

		const headerEl = containerEl.createDiv({ cls: "jm-inline-memo-header" });
		headerEl.createSpan({ text: "Memo" });
		headerEl.createSpan({ text: parsed.createdLabel });

		if (parsed.tags.length > 0) {
			const tagsEl = containerEl.createDiv({ cls: "jm-inline-memo-tags" });
			for (const tag of parsed.tags) {
				tagsEl.createSpan({ cls: "jm-inline-memo-tag", text: tag });
			}
		}

		const bodyEl = containerEl.createDiv({ cls: "jm-inline-memo-body" });
		if (parsed.content) {
			await MarkdownRenderer.render(this.app, parsed.content, bodyEl, context.sourcePath, renderChild);
		}

		if (parsed.attachments.length > 0) {
			const attachmentsEl = containerEl.createDiv({ cls: "jm-inline-memo-attachments" });
			for (const attachment of parsed.attachments) {
				const thumbnailEl = attachmentsEl.createDiv({ cls: "jm-attachment-thumb" });
				if (attachment.isImage) {
					const mediaEl = thumbnailEl.createDiv({ cls: "jm-attachment-thumb-media" });
					await MarkdownRenderer.render(
						this.app,
						`![[${attachment.path}]]`,
						mediaEl,
						context.sourcePath,
						renderChild,
					);
					continue;
				}

				const fileEl = thumbnailEl.createDiv({ cls: "jm-attachment-thumb-file" });
				await MarkdownRenderer.render(this.app, `[[${attachment.path}]]`, fileEl, context.sourcePath, renderChild);
			}
		}

		renderChild.registerDomEvent(containerEl, "click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}

			const imageEl = target.closest("img");
			if (!(imageEl instanceof HTMLImageElement) || !containerEl.contains(imageEl)) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			void this.openInlineMemoImagePreview(imageEl, context.sourcePath ?? "");
		});
	}

	private async openInlineMemoImagePreview(imageEl: HTMLImageElement, sourcePath: string): Promise<void> {
		const targetItem = this.createPreviewItemFromImageElement(imageEl, sourcePath);
		if (!targetItem) {
			return;
		}

		const gallery = this.collectPreviewItemsFromView(imageEl);
		const items = gallery.length > 0 ? gallery : [targetItem];
		new InlineMemoImagePreviewModal(this.app, items, targetItem).open();
	}

	private createPreviewItemFromImageElement(imageEl: HTMLImageElement, sourcePath: string): InlineMemoPreviewItem | null {
		const sourceContainer = imageEl.closest(".jm-inline-memo");
		const resolvedSourcePath =
			sourceContainer instanceof HTMLElement
				? String(sourceContainer.dataset.sourcePath ?? sourcePath ?? "")
				: sourcePath;
		const internalPath = this.extractInternalImagePath(imageEl);
		if (internalPath) {
			return {
				key: `internal:${internalPath}`,
				name: this.fileNameFromPath(internalPath),
				sourcePath: resolvedSourcePath,
				markdown: `![[${internalPath}]]`,
				imageSrc: "",
			};
		}

		const imageSrc = String(imageEl.getAttribute("src") ?? "").trim();
		if (!imageSrc) {
			return null;
		}

		const name = String(imageEl.getAttribute("alt") ?? "").trim() || this.fileNameFromPath(imageSrc);
		return {
			key: `src:${imageSrc}`,
			name,
			sourcePath: resolvedSourcePath,
			markdown: "",
			imageSrc,
		};
	}

	private collectPreviewItemsFromView(imageEl: HTMLImageElement): InlineMemoPreviewItem[] {
		const previewRoot =
			imageEl.closest(".markdown-preview-view") ??
			imageEl.closest(".markdown-reading-view") ??
			imageEl.closest(".view-content");
		if (!(previewRoot instanceof HTMLElement)) {
			return [];
		}

		const imageNodes = previewRoot.querySelectorAll(".jm-inline-memo img");
		const items: InlineMemoPreviewItem[] = [];
		const dedupe = new Set<string>();

		imageNodes.forEach((node) => {
			if (!(node instanceof HTMLImageElement)) {
				return;
			}

			const item = this.createPreviewItemFromImageElement(node, "");
			if (!item) {
				return;
			}

			const dedupeKey = `${item.key}::${item.sourcePath}`;
			if (dedupe.has(dedupeKey)) {
				return;
			}
			dedupe.add(dedupeKey);
			items.push(item);
		});

		return items;
	}

	private extractInternalImagePath(imageEl: HTMLImageElement): string {
		const holder = imageEl.closest(".internal-embed, .image-embed");
		const candidates =
			holder instanceof HTMLElement
				? [
					holder.getAttribute("src"),
					holder.getAttribute("data-src"),
					holder.getAttribute("data-href"),
					holder.getAttribute("href"),
					imageEl.getAttribute("alt"),
				]
				: [imageEl.getAttribute("alt")];

		for (const candidate of candidates) {
			const path = this.normalizeInternalImagePathCandidate(candidate);
			if (path) {
				return path;
			}
		}

		return "";
	}

	private normalizeInternalImagePathCandidate(candidate: string | null): string {
		const raw = String(candidate ?? "")
			.replace(/^!\[\[/, "")
			.replace(/\]\]$/, "")
			.trim();
		const withoutAlias = raw.split("|")[0] ?? "";
		const normalized = (withoutAlias.split("#")[0] ?? "").trim();
		if (!normalized) {
			return "";
		}

		if (/^(?:app|http|https|file|blob|data):/i.test(normalized)) {
			return "";
		}

		return IMAGE_FILE_EXT_REGEX.test(normalized) ? normalized : "";
	}

	private fileNameFromPath(path: string): string {
		const normalized = path.replace(/\\/g, "/");
		const segments = normalized.split("/");
		return segments.length > 0 ? segments[segments.length - 1] ?? normalized : normalized;
	}
}
