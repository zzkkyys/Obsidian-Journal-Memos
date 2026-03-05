import { App, TFile, TFolder, normalizePath } from "obsidian";
import { MEMO_BLOCK_REGEX, parseMemoBlockBody } from "./memo-parser";
import { formatCreatedLabel, formatDateKey, getRecentDateKeys, parseCreatedAt } from "../utils/date";
import type { MemoAttachment, MemoItem } from "../types";

const DAILY_NOTE_NAME_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;
const CREATED_LINE_REGEX = /^created:\s*(.+)$/m;
const ATTACHMENT_BLOCK_REGEX = /<!--\s*jm-attachments:start\s*-->\s*([\s\S]*?)\s*<!--\s*jm-attachments:end\s*-->/i;

function normalizeDailyFolder(folder: string): string {
	const trimmed = folder.trim();
	if (!trimmed) {
		return "";
	}
	return normalizePath(trimmed).replace(/^\/+|\/+$/g, "");
}

export function buildDailyNotePath(folder: string, dateKey: string, format?: string): string {
	const normalizedFolder = normalizeDailyFolder(folder);

	// If no format specified, use the legacy format
	if (!format) {
		return normalizePath(normalizedFolder ? `${normalizedFolder}/${dateKey}.md` : `${dateKey}.md`);
	}

	// Parse dateKey (expected format: yyyy-MM-dd)
	const [yyyy, MM, dd] = dateKey.split("-");

	// Replace placeholders in format string
	let path = format
		.replace(/\{folder\}/g, normalizedFolder)
		.replace(/\{yyyy\}/g, yyyy || "")
		.replace(/\{MM\}/g, MM || "")
		.replace(/\{dd\}/g, dd || "")
		.replace(/\{yyyy-MM-dd\}/g, dateKey)
		.replace(/\{yyyy-MM\}/g, `${yyyy}-${MM}`);

	// Clean up double slashes and normalize
	path = path.replace(/\/+/g, "/").replace(/^\/+/, "");

	return normalizePath(path);
}

export function getDailyFileByDate(app: App, folder: string, dateKey: string, format?: string): TFile | null {
	const abstractFile = app.vault.getAbstractFileByPath(buildDailyNotePath(folder, dateKey, format));
	return abstractFile instanceof TFile ? abstractFile : null;
}

export function isDailyNotePath(path: string, folder: string): boolean {
	const normalizedFolder = normalizeDailyFolder(folder);
	const prefix = normalizedFolder ? `${normalizedFolder}/` : "";
	if (prefix && !path.startsWith(prefix)) {
		return false;
	}

	// Only check the basename (last path segment) so that nested directory
	// structures like {folder}/{yyyy}/{MM}/{yyyy-MM-dd}.md still match.
	const baseName = path.split("/").pop() ?? "";
	return DAILY_NOTE_NAME_REGEX.test(baseName);
}

export function getRecentDailyFiles(app: App, folder: string, days: number, format?: string): TFile[] {
	return getRecentDateKeys(days)
		.map((dateKey) => getDailyFileByDate(app, folder, dateKey, format))
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
	format?: string,
): Promise<TFile> {
	const path = buildDailyNotePath(folder, dateKey, format);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		return existing;
	}

	// Extract the folder part from the path and ensure it exists
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash > 0) {
		const folderPath = path.slice(0, lastSlash);
		await ensureFolder(app, folderPath);
	}

	// Create empty — Templater only injects if content length is 0
	const file = await app.vault.create(path, "");

	// Apply template: prefer Templater (dynamic), fall back to static copy
	const templaterApplied = await tryApplyTemplaterTemplate(app, file);
	if (!templaterApplied) {
		const staticContent = await getDailyNoteTemplateContent(app);
		if (staticContent) {
			await app.vault.modify(file, staticContent);
		}
	}

	return file;
}

/**
 * Explicitly applies the Templater folder/file template to a newly created file.
 *
 * Templater's automatic "on_file_creation" handler fires after a 300 ms delay
 * and only processes files whose content is still empty at that point.  When
 * we immediately write memo content after creating the file the auto-handler
 * sees a non-empty file and skips it.  Calling write_template_to_file here
 * runs the same logic synchronously so we get dynamic values (tp.date, etc.)
 * before the memo block is appended.  The delayed auto-handler will later see
 * non-empty content and skip — no double-processing.
 */
async function tryApplyTemplaterTemplate(app: App, file: TFile): Promise<boolean> {
	try {
		// @ts-ignore
		const templater = app.plugins?.plugins?.["templater-obsidian"];
		if (!templater?.templater) return false;

		const t = templater.templater;
		if (typeof t.write_template_to_file !== "function") return false;

		// Mirror Templater's own on_file_creation logic:
		// 1. folder templates (walked up from file's parent)
		let templateName: string | undefined =
			typeof t.get_new_file_template_for_folder === "function"
				? t.get_new_file_template_for_folder(file.parent)
				: undefined;

		// 2. file regex templates
		if (!templateName && typeof t.get_new_file_template_for_file === "function") {
			templateName = t.get_new_file_template_for_file(file);
		}

		if (!templateName) return false;

		// Resolve template name → TFile (Templater stores full vault-relative paths)
		const templatePath = templateName.endsWith(".md") ? templateName : `${templateName}.md`;
		const templateFile = app.vault.getAbstractFileByPath(normalizePath(templatePath));
		if (!(templateFile instanceof TFile)) return false;

		await t.write_template_to_file(templateFile, file);
		return true;
	} catch (e) {
		return false;
	}
}

async function getDailyNoteTemplateContent(app: App): Promise<string> {
	try {
		// @ts-ignore
		const internalPlugin = app.internalPlugins?.getPluginById("daily-notes");
		if (internalPlugin?.instance?.options?.template) {
			const templatePath = String(internalPlugin.instance.options.template).trim();
			let path = templatePath;
			if (!path.endsWith(".md")) path += ".md";
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				return await app.vault.cachedRead(file);
			}
		}
	} catch (e) {
		// Ignore
	}

	try {
		// @ts-ignore
		const periodicPlugin = app.plugins?.getPlugin("periodic-notes");
		if (periodicPlugin?.settings?.daily?.template) {
			const templatePath = String(periodicPlugin.settings.daily.template).trim();
			let path = templatePath;
			if (!path.endsWith(".md")) path += ".md";
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				return await app.vault.cachedRead(file);
			}
		}
	} catch (e) {
		// Ignore
	}

	return "";
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

	const MEMOS_HEADING = "## memos";
	const MEMOS_HEADING_REGEX = /^## memos\s*$/im;

	const newTs = createdAt.getTime();

	await app.vault.process(file, (existingText) => {
		const normalized = existingText.replace(/\r\n/g, "\n");

		// Check if ## memos section exists
		const headingMatch = MEMOS_HEADING_REGEX.exec(normalized);

		if (headingMatch) {
			const headingEndIndex = headingMatch.index + headingMatch[0].length;

			// Find the section boundary (stop at the next heading)
			const afterHeading = normalized.slice(headingEndIndex);
			const nextHeadingMatch = /\n(#{1,2}\s+[^\n]+)/m.exec(afterHeading);
			const sectionEnd = nextHeadingMatch
				? headingEndIndex + nextHeadingMatch.index
				: normalized.length;

			// Scan existing memo blocks in the section to find the right insertion point
			const sectionContent = normalized.slice(headingEndIndex, sectionEnd);
			let insertOffset = sectionEnd;

			MEMO_BLOCK_REGEX.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = MEMO_BLOCK_REGEX.exec(sectionContent)) !== null) {
				const body = match[1] ?? "";
				const createdLineMatch = /^created:\s*(.+)$/m.exec(body);
				if (!createdLineMatch?.[1]) continue;
				const existingTs = parseCreatedAt(createdLineMatch[1].trim());
				if (existingTs > newTs) {
					// Insert before this memo (which is newer)
					insertOffset = headingEndIndex + match.index;
					break;
				}
			}

			const beforeInsert = normalized.slice(0, insertOffset);
			const afterInsert = normalized.slice(insertOffset);

			const leadSep = beforeInsert.endsWith("\n\n") ? "" :
				beforeInsert.endsWith("\n") ? "\n" : "\n\n";
			// Ensure a blank line between inserted block and any following content
			const trailSep = afterInsert.length > 0 && !afterInsert.startsWith("\n") ? "\n" : "";

			return `${beforeInsert}${leadSep}${block}${trailSep}${afterInsert}`;
		} else {
			// No ## memos section exists, create it at the end
			const separator = normalized.length > 0 && !normalized.endsWith("\n") ? "\n\n" :
				normalized.length > 0 && !normalized.endsWith("\n\n") ? "\n" : "";
			return `${normalized}${separator}${MEMOS_HEADING}\n\n${block}`;
		}
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
	overrideDate?: Date
): string {
	const createdLine = overrideDate
		? `created: ${formatCreatedLabel(overrideDate)}`
		: getCreatedLineFromMemoBody(rawMemoBody, fallbackCreatedLabel);
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
	overrideDate?: Date
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

		const newBlock = buildUpdatedMemoBlock(selectedBody, targetMemo.createdLabel, updatedContent, overrideDate);
		return `${existingText.slice(0, selectedStart)}${newBlock}${existingText.slice(selectedEnd)}`;
	});
}

export async function deleteMemoBlock(
	app: App,
	file: TFile,
	targetMemo: Pick<MemoItem, "id" | "createdLabel" | "content" | "attachments">,
): Promise<void> {
	await app.vault.process(file, (existingText) => {
		const expectedOffset = parseMemoOffsetFromId(targetMemo.id, file.path);
		const normalizedExistingContent = normalizeMemoText(targetMemo.content);

		MEMO_BLOCK_REGEX.lastIndex = 0;
		let match: RegExpExecArray | null;
		let selectedStart = -1;
		let selectedEnd = -1;

		while ((match = MEMO_BLOCK_REGEX.exec(existingText)) !== null) {
			const rawMemoBody = match[1] ?? "";
			if (expectedOffset !== null && match.index === expectedOffset) {
				selectedStart = match.index;
				selectedEnd = match.index + match[0].length;
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
			break;
		}

		if (selectedStart < 0 || selectedEnd < 0) {
			throw new Error("Could not locate the target memo block to delete.");
		}

		// Remove the memo block and clean up surrounding blank lines
		const before = existingText.slice(0, selectedStart).replace(/\n+$/, "\n");
		const after = existingText.slice(selectedEnd).replace(/^\n+/, "\n");

		const result = (before + after).trim();
		return result ? result + "\n" : "";
	});
}
