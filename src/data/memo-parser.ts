import { TFile } from "obsidian";
import type { MemoAttachment, MemoItem } from "../types";
import { parseCreatedAt } from "../utils/date";

const MEMO_BLOCK_REGEX = /^[ \t]*```memos[^\S\r\n]*\r?\n([\s\S]*?)\r?\n[ \t]*```[^\S\r\n]*(?=\r?\n|$)/gm;
const CREATED_LINE_REGEX = /^\s*created:\s*(.+)$/m;
const TAG_REGEX = /(^|[\s(])#([^\s#.,!?()[\]{}"']+)/g;
const TAGS_LINE_REGEX = /^\s*tags:\s*(.*)$/i;
const ATTACHMENT_BLOCK_REGEX = /<!--\s*jm-attachments:start\s*-->\s*([\s\S]*?)\s*<!--\s*jm-attachments:end\s*-->/i;
const ATTACHMENT_LINE_REGEX = /^\s*jm-attachment:\s*(.+?)\s*$/gm;
const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;

export interface ParsedMemoBlock {
	createdAt: number;
	createdLabel: string;
	content: string;
	tags: string[];
	attachments: MemoAttachment[];
}

function extractTags(content: string): string[] {
	const unique = new Set<string>();
	TAG_REGEX.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = TAG_REGEX.exec(content)) !== null) {
		const tagBody = match[2]?.trim();
		if (!tagBody) {
			continue;
		}
		unique.add(`#${tagBody}`);
	}

	return Array.from(unique);
}

function splitMemoContentAndTags(raw: string): { content: string; tags: string[] } {
	const lines = raw.split(/\r?\n/);
	const contentLines: string[] = [];
	const tagSet = new Set<string>();

	for (const line of lines) {
		const tagLineMatch = TAGS_LINE_REGEX.exec(line);
		if (tagLineMatch) {
			for (const tag of extractTags(tagLineMatch[1] ?? "")) {
				tagSet.add(tag);
			}
			continue;
		}
		contentLines.push(line);
	}

	const content = contentLines.join("\n").trim();
	for (const tag of extractTags(content)) {
		tagSet.add(tag);
	}

	return {
		content,
		tags: Array.from(tagSet),
	};
}

function fileNameFromPath(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const segments = normalized.split("/");
	const name = segments.length > 0 ? segments[segments.length - 1]?.trim() ?? "" : "";
	return name || path;
}

function looksLikeImageAttachment(path: string): boolean {
	const normalized = path.split("#")[0]?.split("?")[0]?.trim() ?? "";
	return IMAGE_FILE_EXT_REGEX.test(normalized);
}

function parseAttachmentPath(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.startsWith("![[") && trimmed.endsWith("]]")) {
		const inner = trimmed.slice(3, -2).trim();
		const target = inner.split("|")[0]?.trim();
		return target || null;
	}

	if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) {
		const inner = trimmed.slice(2, -2).trim();
		const target = inner.split("|")[0]?.trim();
		return target || null;
	}

	const markdownLinkMatch = /^\[[^\]]*]\((.+)\)$/.exec(trimmed);
	if (markdownLinkMatch?.[1]) {
		const target = markdownLinkMatch[1].trim();
		return target || null;
	}

	return trimmed;
}

// Extract wiki-links from content as attachments
// Matches both embedded ![[path]] and regular [[path]] links
const WIKI_LINK_REGEX = /!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function extractWikiLinkAttachments(content: string): MemoAttachment[] {
	const attachmentSet = new Set<string>();
	const attachments: MemoAttachment[] = [];

	WIKI_LINK_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = WIKI_LINK_REGEX.exec(content)) !== null) {
		const path = match[1]?.trim();
		if (!path || attachmentSet.has(path)) {
			continue;
		}

		// Only treat as attachment if it looks like an image/file
		if (looksLikeImageAttachment(path)) {
			attachmentSet.add(path);
			attachments.push({
				path,
				name: fileNameFromPath(path),
				isImage: true,
			});
		}
	}

	return attachments;
}

// Legacy: extract attachments from old jm-attachments block format
function extractLegacyAttachmentBlock(raw: string): { content: string; attachments: MemoAttachment[] } {
	const attachmentBlockMatch = ATTACHMENT_BLOCK_REGEX.exec(raw);
	if (!attachmentBlockMatch) {
		return {
			content: raw,
			attachments: [],
		};
	}

	const attachmentSet = new Set<string>();
	const attachments: MemoAttachment[] = [];
	const blockContent = attachmentBlockMatch[1] ?? "";
	ATTACHMENT_LINE_REGEX.lastIndex = 0;

	let lineMatch: RegExpExecArray | null;
	while ((lineMatch = ATTACHMENT_LINE_REGEX.exec(blockContent)) !== null) {
		const path = parseAttachmentPath(lineMatch[1] ?? "");
		if (!path || attachmentSet.has(path)) {
			continue;
		}
		attachmentSet.add(path);
		attachments.push({
			path,
			name: fileNameFromPath(path),
			isImage: looksLikeImageAttachment(path),
		});
	}

	return {
		content: raw.replace(ATTACHMENT_BLOCK_REGEX, "").trim(),
		attachments,
	};
}

export function parseMemoBlockBody(body: string): ParsedMemoBlock | null {
	const createdMatch = CREATED_LINE_REGEX.exec(body);
	if (!createdMatch?.[1]) {
		return null;
	}

	const createdLabel = createdMatch[1].trim();
	const createdAt = parseCreatedAt(createdLabel);
	if (createdAt < 0) {
		return null;
	}

	const rawContent = body.replace(CREATED_LINE_REGEX, "").trim();

	// First, extract legacy attachment block (for backward compatibility)
	const { content: rawBodyContent, attachments: legacyAttachments } = extractLegacyAttachmentBlock(rawContent);

	// Then, extract wiki-link attachments from content
	const wikiLinkAttachments = extractWikiLinkAttachments(rawBodyContent);

	// Merge attachments, avoiding duplicates
	const allPaths = new Set<string>();
	const allAttachments: MemoAttachment[] = [];

	for (const att of [...wikiLinkAttachments, ...legacyAttachments]) {
		if (!allPaths.has(att.path)) {
			allPaths.add(att.path);
			allAttachments.push(att);
		}
	}

	// Remove image wiki-links from content (they'll be shown in attachment area)
	const contentWithoutImageLinks = rawBodyContent
		.replace(/!?\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?))(?:\|[^\]]+)?\]\]\n?/gi, "")
		.trim();

	const { content, tags } = splitMemoContentAndTags(contentWithoutImageLinks);
	return {
		createdAt,
		createdLabel,
		content,
		tags,
		attachments: allAttachments,
	};
}

export function extractMemosFromMarkdown(file: TFile, markdown: string): MemoItem[] {
	const memos: MemoItem[] = [];
	MEMO_BLOCK_REGEX.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = MEMO_BLOCK_REGEX.exec(markdown)) !== null) {
		const parsed = parseMemoBlockBody(match[1] ?? "");
		if (!parsed) {
			continue;
		}

		memos.push({
			id: `${file.path}:${match.index}`,
			filePath: file.path,
			dateKey: file.basename,
			createdAt: parsed.createdAt,
			createdLabel: parsed.createdLabel,
			content: parsed.content,
			tags: parsed.tags,
			attachments: parsed.attachments,
		});
	}

	return memos;
}
