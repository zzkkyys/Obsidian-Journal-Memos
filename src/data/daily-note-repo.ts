import { App, TFile, TFolder, normalizePath } from "obsidian";
import { formatCreatedLabel, formatDateKey, getRecentDateKeys } from "../utils/date";

const DAILY_NOTE_NAME_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;

function normalizeDailyFolder(folder: string): string {
	const trimmed = folder.trim();
	if (!trimmed) {
		return "";
	}
	return normalizePath(trimmed).replace(/^\/+|\/+$/g, "");
}

export function buildDailyNotePath(folder: string, dateKey: string): string {
	const normalizedFolder = normalizeDailyFolder(folder);
	return normalizePath(normalizedFolder ? `${normalizedFolder}/${dateKey}.md` : `${dateKey}.md`);
}

export function getDailyFileByDate(app: App, folder: string, dateKey: string): TFile | null {
	const abstractFile = app.vault.getAbstractFileByPath(buildDailyNotePath(folder, dateKey));
	return abstractFile instanceof TFile ? abstractFile : null;
}

export function isDailyNotePath(path: string, folder: string): boolean {
	const normalizedFolder = normalizeDailyFolder(folder);
	const prefix = normalizedFolder ? `${normalizedFolder}/` : "";
	if (prefix && !path.startsWith(prefix)) {
		return false;
	}

	const fileName = prefix ? path.slice(prefix.length) : path;
	return DAILY_NOTE_NAME_REGEX.test(fileName);
}

export function getRecentDailyFiles(app: App, folder: string, days: number): TFile[] {
	return getRecentDateKeys(days)
		.map((dateKey) => getDailyFileByDate(app, folder, dateKey))
		.filter((file): file is TFile => file !== null);
}

export function getIndexedDailyPaths(app: App, folder: string): string[] {
	const normalizedFolder = normalizeDailyFolder(folder);
	const prefix = normalizedFolder ? `${normalizedFolder}/` : "";

	return app.metadataCache.getCachedFiles().filter((path) => {
		if (prefix && !path.startsWith(prefix)) {
			return false;
		}
		const fileName = prefix ? path.slice(prefix.length) : path;
		return DAILY_NOTE_NAME_REGEX.test(fileName);
	});
}

export async function ensureDailyNoteFile(
	app: App,
	folder: string,
	dateKey = formatDateKey(new Date()),
): Promise<TFile> {
	const path = buildDailyNotePath(folder, dateKey);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		return existing;
	}

	const normalizedFolder = normalizeDailyFolder(folder);
	if (normalizedFolder) {
		await ensureFolder(app, normalizedFolder);
	}

	return app.vault.create(path, "");
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const segments = folderPath.split("/").filter(Boolean);
	let currentPath = "";

	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		const abstractFile = app.vault.getAbstractFileByPath(currentPath);
		if (!abstractFile) {
			await app.vault.createFolder(currentPath);
			continue;
		}
		if (!(abstractFile instanceof TFolder)) {
			throw new Error(`Path exists and is not a folder: ${currentPath}`);
		}
	}
}

export async function appendMemoBlock(
	app: App,
	file: TFile,
	content: string,
	createdAt: Date = new Date(),
): Promise<void> {
	const normalizedContent = content.replace(/\r\n/g, "\n").trim();
	if (!normalizedContent) {
		return;
	}

	const block = [
		"```memos",
		`created: ${formatCreatedLabel(createdAt)}`,
		normalizedContent,
		"```",
		"",
	].join("\n");

	await app.vault.process(file, (existingText) => {
		const separator = existingText.length > 0 && !existingText.endsWith("\n") ? "\n" : "";
		return `${existingText}${separator}${block}`;
	});
}
