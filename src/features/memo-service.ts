import { App, Notice, TFile } from "obsidian";
import {
	appendMemoBlock,
	ensureDailyNoteFile,
	getDailyFileByDate,
	getIndexedDailyPaths,
	getRecentDailyFiles,
	isDailyNotePath,
} from "../data/daily-note-repo";
import { extractMemosFromMarkdown } from "../data/memo-parser";
import type { JournalMemosSettings } from "../settings";
import type { HeatmapCell, MemoItem, MemoSnapshot } from "../types";
import { formatDateKey, getRecentDateKeys } from "../utils/date";

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
}
