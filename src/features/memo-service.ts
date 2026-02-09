import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import {
	appendMemoBlock,
	ensureDailyNoteFile,
	getDailyFileByDate,
	getIndexedDailyPaths,
	getRecentDailyFiles,
	isDailyNotePath,
	updateMemoBlock,
} from "../data/daily-note-repo";
import { extractMemosFromMarkdown } from "../data/memo-parser";
import type { JournalMemosSettings } from "../settings";
import type { HeatmapCell, MemoAttachment, MemoAttachmentInput, MemoItem, MemoSnapshot } from "../types";
import { formatDateKey, getRecentDateKeys } from "../utils/date";

const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;

const MIME_EXTENSION_MAP: Record<string, string> = {
	"image/avif": ".avif",
	"image/bmp": ".bmp",
	"image/gif": ".gif",
	"image/heic": ".heic",
	"image/heif": ".heif",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/svg+xml": ".svg",
	"image/tiff": ".tiff",
	"image/webp": ".webp",
	"application/pdf": ".pdf",
};

interface ParseCacheEntry {
	mtime: number;
	memos: MemoItem[];
}

export class MemoService {
	private readonly parseCache = new Map<string, ParseCacheEntry>();

	constructor(
		private readonly app: App,
		private readonly readSettings: () => JournalMemosSettings,
	) {}

	isTrackedPath(path: string): boolean {
		return isDailyNotePath(path, this.readSettings().dailyNotesFolder);
	}

	invalidate(path: string): void {
		this.parseCache.delete(path);
	}

	clearCache(): void {
		this.parseCache.clear();
	}

	async appendMemo(content: string): Promise<TFile> {
		const settings = this.readSettings();
		const now = new Date();
		const dateKey = formatDateKey(now);

		const file = await ensureDailyNoteFile(this.app, settings.dailyNotesFolder, dateKey);
		await appendMemoBlock(this.app, file, content, now);
		this.invalidate(file.path);
		return file;
	}

	async updateMemo(
		memo: Pick<MemoItem, "id" | "filePath" | "createdLabel" | "content" | "attachments">,
		content: string,
	): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(memo.filePath);
		if (!(abstractFile instanceof TFile)) {
			throw new Error(`Daily note not found: ${memo.filePath}`);
		}

		await updateMemoBlock(this.app, abstractFile, memo, content);
		this.invalidate(abstractFile.path);
	}

	async saveAttachments(attachments: MemoAttachmentInput[]): Promise<MemoAttachment[]> {
		if (attachments.length === 0) {
			return [];
		}

		const dateKey = formatDateKey(new Date());
		const targetFolder = normalizePath(`${this.resolveAttachmentRootFolder()}/${dateKey}`);
		await this.ensureFolderPath(targetFolder);

		const saved: MemoAttachment[] = [];
		for (const attachment of attachments) {
			const path = await this.buildUniqueAttachmentPath(targetFolder, attachment.name, attachment.mimeType);
			await this.app.vault.createBinary(path, attachment.data);
			const isImage = this.isImageAttachment(path, attachment.mimeType);
			saved.push({
				path,
				name: this.getFileName(path),
				isImage,
			});
		}

		return saved;
	}

	async getSnapshot(): Promise<MemoSnapshot> {
		const settings = this.readSettings();
		const [stream, heatmap] = await Promise.all([
			this.getStream(settings.streamDays),
			this.getHeatmap(settings.heatmapDays),
		]);

		return { stream, heatmap };
	}

	async openDailyNote(dateKey: string): Promise<void> {
		const settings = this.readSettings();
		const file = getDailyFileByDate(this.app, settings.dailyNotesFolder, dateKey);
		if (!file) {
			new Notice(`No daily note for ${dateKey}`);
			return;
		}

		await this.app.workspace.getLeaf(true).openFile(file);
	}

	async openOrCreateDailyNote(dateKey: string): Promise<void> {
		const settings = this.readSettings();
		const file = await ensureDailyNoteFile(this.app, settings.dailyNotesFolder, dateKey);
		await this.app.workspace.getLeaf(true).openFile(file);
	}

	async warmCacheFromIndex(): Promise<void> {
		const settings = this.readSettings();
		const indexedPaths = getIndexedDailyPaths(this.app, settings.dailyNotesFolder);
		const files = indexedPaths
			.map((path) => this.app.vault.getAbstractFileByPath(path))
			.filter((file): file is TFile => file instanceof TFile);

		await Promise.all(files.map((file) => this.readMemos(file)));
	}

	private async getStream(days: number): Promise<MemoItem[]> {
		const settings = this.readSettings();
		const files = getRecentDailyFiles(this.app, settings.dailyNotesFolder, days);
		const allMemos = await Promise.all(files.map((file) => this.readMemos(file)));
		return allMemos.flat().sort((left, right) => right.createdAt - left.createdAt);
	}

	private async getHeatmap(days: number): Promise<HeatmapCell[]> {
		const settings = this.readSettings();
		const dateKeys = getRecentDateKeys(days).reverse();
		const recentFiles = getRecentDailyFiles(this.app, settings.dailyNotesFolder, days);
		const fileMap = new Map<string, TFile>(recentFiles.map((file) => [file.basename, file]));

		const cells = await Promise.all(
			dateKeys.map(async (dateKey) => {
				const file = fileMap.get(dateKey) ?? null;
				if (!file) {
					return {
						dateKey,
						count: 0,
						filePath: null,
					};
				}

				const memos = await this.readMemos(file);
				return {
					dateKey,
					count: memos.length,
					filePath: file.path,
				};
			}),
		);

		return cells;
	}

	private async readMemos(file: TFile): Promise<MemoItem[]> {
		const cached = this.parseCache.get(file.path);
		if (cached && cached.mtime === file.stat.mtime) {
			return cached.memos;
		}

		const markdown = await this.app.vault.cachedRead(file);
		const memos = extractMemosFromMarkdown(file, markdown);
		this.parseCache.set(file.path, {
			mtime: file.stat.mtime,
			memos,
		});
		return memos;
	}

	private resolveAttachmentRootFolder(): string {
		const settings = this.readSettings();
		const customFolder = settings.attachmentsFolder.trim();
		if (customFolder) {
			return normalizePath(customFolder).replace(/^\/+|\/+$/g, "");
		}

		const dailyFolder = settings.dailyNotesFolder.trim();
		if (dailyFolder) {
			return normalizePath(`${dailyFolder}/_attachments`).replace(/^\/+|\/+$/g, "");
		}

		return "_attachments";
	}

	private async ensureFolderPath(folderPath: string): Promise<void> {
		const segments = folderPath.split("/").filter(Boolean);
		let currentPath = "";

		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const abstractFile = this.app.vault.getAbstractFileByPath(currentPath);
			if (!abstractFile) {
				await this.app.vault.createFolder(currentPath);
				continue;
			}
			if (!(abstractFile instanceof TFolder)) {
				throw new Error(`Path exists and is not a folder: ${currentPath}`);
			}
		}
	}

	private async buildUniqueAttachmentPath(
		folderPath: string,
		sourceName: string,
		mimeType: string,
	): Promise<string> {
		const fileName = this.normalizeAttachmentFileName(sourceName, mimeType);
		const directPath = normalizePath(`${folderPath}/${fileName}`);
		if (!this.app.vault.getAbstractFileByPath(directPath)) {
			return directPath;
		}

		let duplicateIndex = 1;
		while (true) {
			const duplicateFolderPath = normalizePath(`${folderPath}/_duplicate-${duplicateIndex}`);
			await this.ensureFolderPath(duplicateFolderPath);
			const candidate = normalizePath(`${duplicateFolderPath}/${fileName}`);
			if (!this.app.vault.getAbstractFileByPath(candidate)) {
				return candidate;
			}
			duplicateIndex += 1;
		}
	}

	private normalizeAttachmentFileName(sourceName: string, mimeType: string): string {
		const trimmed = sourceName.trim();
		const normalized = trimmed
			.replace(/[\\/:*?"<>|]/g, "_")
			.replace(/\s+/g, " ")
			.trim();
		if (normalized.length > 0) {
			return normalized;
		}

		const normalizedMime = mimeType.trim().toLowerCase();
		const extension = MIME_EXTENSION_MAP[normalizedMime] ?? ".bin";
		return `attachment${extension}`;
	}

	private isImageAttachment(sourceName: string, mimeType: string): boolean {
		const normalizedMime = mimeType.trim().toLowerCase();
		if (normalizedMime.startsWith("image/")) {
			return true;
		}
		return IMAGE_FILE_EXT_REGEX.test(sourceName);
	}

	private getFileName(path: string): string {
		const normalized = path.replace(/\\/g, "/");
		const segments = normalized.split("/");
		return segments.length > 0 ? segments[segments.length - 1] ?? path : path;
	}
}
