import { App, TFile, TFolder, normalizePath } from "obsidian";
import { parseMemoBlockBody } from "./memo-parser";
import { formatCreatedLabel, formatDateKey, getRecentDateKeys } from "../utils/date";
import type { MemoAttachment, MemoItem } from "../types";

const DAILY_NOTE_NAME_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;
const MEMO_BLOCK_REGEX = /^```memos[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*(?=\r?\n|$)/gm;
const CREATED_LINE_REGEX = /^created:\s*(.+)$/m;
const ATTACHMENT_BLOCK_REGEX = /<!--\s*jm-attachments:start\s*-->\s*([\s\S]*?)\s*<!--\s*jm-attachments:end\s*-->/i;

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

	return app.vault
		.getMarkdownFiles()
		.filter((file) => {
			if (prefix && !file.path.startsWith(prefix)) {
				return false;
			}
			if (!DAILY_NOTE_NAME_REGEX.test(file.name)) {
				return false;
			}
			return app.metadataCache.getFileCache(file) !== null;
		})
		.map((file) => file.path);
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

function normalizeMemoText(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

function parseMemoOffsetFromId(memoId: string, filePath: string): number | null {
	const prefix = `${filePath}:`;
	if (!memoId.startsWith(prefix)) {
		return null;
	}

	const rawOffset = memoId.slice(prefix.length).trim();
	if (!/^\d+$/.test(rawOffset)) {
		return null;
	}

	const offset = Number.parseInt(rawOffset, 10);
	return Number.isFinite(offset) ? offset : null;
}

function getCreatedLineFromMemoBody(body: string, fallbackCreatedLabel: string): string {
	const createdMatch = CREATED_LINE_REGEX.exec(body);
	if (createdMatch?.[1]) {
		return `created: ${createdMatch[1].trim()}`;
	}
	return `created: ${fallbackCreatedLabel}`;
}

function getAttachmentBlockFromMemoBody(body: string): string {
	const withoutCreated = body.replace(CREATED_LINE_REGEX, "").trim();
	const match = ATTACHMENT_BLOCK_REGEX.exec(withoutCreated);
	return match ? match[0].trim() : "";
}

function getAttachmentPaths(attachments: MemoAttachment[]): string[] {
	return attachments.map((attachment) => attachment.path.trim()).filter(Boolean);
}

function isSameAttachmentList(left: MemoAttachment[], right: MemoAttachment[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	const leftPaths = getAttachmentPaths(left);
	const rightPaths = getAttachmentPaths(right);
	if (leftPaths.length !== rightPaths.length) {
		return false;
	}

	for (let index = 0; index < leftPaths.length; index += 1) {
		if ((leftPaths[index] ?? "") !== (rightPaths[index] ?? "")) {
			return false;
		}
	}
	return true;
}

function buildUpdatedMemoBlock(
	rawMemoBody: string,
	fallbackCreatedLabel: string,
	updatedContent: string,
): string {
	const createdLine = getCreatedLineFromMemoBody(rawMemoBody, fallbackCreatedLabel);
	const attachmentBlock = getAttachmentBlockFromMemoBody(rawMemoBody);
	const normalizedContent = normalizeMemoText(updatedContent);
	const lines = ["```memos", createdLine];

	if (normalizedContent) {
		lines.push(normalizedContent);
	}

	if (attachmentBlock) {
		if (normalizedContent) {
			lines.push("");
		}
		lines.push(attachmentBlock);
	}

	lines.push("```");
	return lines.join("\n");
}

export async function updateMemoBlock(
	app: App,
	file: TFile,
	targetMemo: Pick<MemoItem, "id" | "createdLabel" | "content" | "attachments">,
	updatedContent: string,
): Promise<void> {
	await app.vault.process(file, (existingText) => {
		const expectedOffset = parseMemoOffsetFromId(targetMemo.id, file.path);
		const normalizedExistingContent = normalizeMemoText(targetMemo.content);

		MEMO_BLOCK_REGEX.lastIndex = 0;
		let match: RegExpExecArray | null;
		let selectedStart = -1;
		let selectedEnd = -1;
		let selectedBody = "";

		while ((match = MEMO_BLOCK_REGEX.exec(existingText)) !== null) {
			const rawMemoBody = match[1] ?? "";
			if (expectedOffset !== null && match.index === expectedOffset) {
				selectedStart = match.index;
				selectedEnd = match.index + match[0].length;
				selectedBody = rawMemoBody;
				break;
			}

			const parsed = parseMemoBlockBody(rawMemoBody);
			if (!parsed) {
				continue;
			}

			if (parsed.createdLabel !== targetMemo.createdLabel) {
				continue;
			}

			if (normalizeMemoText(parsed.content) !== normalizedExistingContent) {
				continue;
			}

			if (!isSameAttachmentList(parsed.attachments, targetMemo.attachments)) {
				continue;
			}

			selectedStart = match.index;
			selectedEnd = match.index + match[0].length;
			selectedBody = rawMemoBody;
			break;
		}

		if (selectedStart < 0 || selectedEnd < 0) {
			throw new Error("Could not locate the target memo block in daily note.");
		}

		const nextBlock = buildUpdatedMemoBlock(selectedBody, targetMemo.createdLabel, updatedContent);
		return `${existingText.slice(0, selectedStart)}${nextBlock}${existingText.slice(selectedEnd)}`;
	});
}
