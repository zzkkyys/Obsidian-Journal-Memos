// Wiki-link based attachment system
const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;
const WIKI_LINK_REGEX = /!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

// Legacy attachment block patterns (for backward compatibility)
export const ATTACHMENT_BLOCK_START = "<!-- jm-attachments:start -->";
export const ATTACHMENT_BLOCK_END = "<!-- jm-attachments:end -->";
export const ATTACHMENT_LINE_PREFIX = "jm-attachment:";

function isImagePath(path: string): boolean {
	const normalized = path.split("#")[0]?.split("?")[0]?.trim() ?? "";
	return IMAGE_FILE_EXT_REGEX.test(normalized);
}

export function parseAttachmentPathsFromBlock(blockContent: string): string[] {
	const paths: string[] = [];
	const ns = String(blockContent ?? "");
	const re = new RegExp(`^\\s*${ATTACHMENT_LINE_PREFIX}\\s*(.+)$`, "gm");
	let m;
	while ((m = re.exec(ns)) !== null) {
		if (m[1]) {
			paths.push(m[1].trim());
		}
	}
	return paths;
}

// Extract wiki-link image paths from content
export function extractWikiLinkPaths(content: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();

	WIKI_LINK_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = WIKI_LINK_REGEX.exec(content)) !== null) {
		const path = match[1]?.trim();
		if (path && !seen.has(path) && isImagePath(path)) {
			seen.add(path);
			paths.push(path);
		}
	}

	return paths;
}

// Parse memo content and extract attachment paths (supports both wiki-links and legacy blocks)
// Image wiki-links are removed from the body and shown only in attachment preview
export function splitDraftAndAttachmentPaths(draftText: string): { body: string; attachmentPaths: string[] } {
	const normalized = String(draftText ?? "").replace(/\r\n/g, "\n");

	// First, extract wiki-link paths from content
	const wikiLinkPaths = extractWikiLinkPaths(normalized);

	// Also check for legacy attachment blocks and extract paths
	const blockRegex = /<!--\s*jm-attachments:start\s*-->\s*([\s\S]*?)\s*<!--\s*jm-attachments:end\s*-->/g;
	const legacyPaths: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = blockRegex.exec(normalized)) !== null) {
		const blockPaths = parseAttachmentPathsFromBlock(match[1] ?? "");
		for (const path of blockPaths) {
			if (!legacyPaths.includes(path)) {
				legacyPaths.push(path);
			}
		}
	}

	// Remove legacy attachment blocks from the body
	let body = normalized
		.replace(/<!--\s*jm-attachments:start\s*-->\s*[\s\S]*?\s*<!--\s*jm-attachments:end\s*-->\s*/g, "");

	// Also remove image wiki-links from the body (they'll be shown in attachment preview)
	// This matches ![[path]] where path is an image file
	body = body
		.replace(/!?\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?))(?:\|[^\]]+)?\]\]\n?/gi, "")
		.trimEnd();

	// Merge all paths, preferring wiki-link paths first
	const allPaths: string[] = [];
	const seen = new Set<string>();

	for (const path of [...wikiLinkPaths, ...legacyPaths]) {
		if (!seen.has(path)) {
			seen.add(path);
			allPaths.push(path);
		}
	}

	return { body, attachmentPaths: allPaths };
}

// Render wiki-links for attachments (new format)
export function renderWikiLinksForAttachments(paths: string[]): string {
	return paths.map(path => `![[${path}]]`).join("\n");
}

// Legacy: render attachment block (kept for compatibility)
export function renderAttachmentBlock(paths: string[]): string {
	// Now we just render as wiki-links instead
	return renderWikiLinksForAttachments(paths);
}

export function appendTextToMemoDraft(currentText: string, text: string): string {
	const normalized = String(text ?? "").trim();
	if (!normalized) {
		return currentText;
	}

	// Simply append text to the body
	const trimmed = currentText.trimEnd();
	return trimmed ? `${trimmed}\n${normalized}` : normalized;
}

export function upsertAttachmentPathsToMemoDraft(currentText: string, pathList: string[]): string {
	if (!Array.isArray(pathList) || pathList.length === 0) {
		return currentText;
	}

	const { body, attachmentPaths } = splitDraftAndAttachmentPaths(currentText);
	const seen = new Set(attachmentPaths);

	// Add new wiki-links for new attachments
	const newLinks: string[] = [];
	for (const path of pathList) {
		if (path && !seen.has(path)) {
			seen.add(path);
			newLinks.push(`![[${path}]]`);
		}
	}

	if (newLinks.length === 0) {
		return currentText;
	}

	const trimmed = body.trimEnd();
	return trimmed ? `${trimmed}\n\n${newLinks.join("\n")}` : newLinks.join("\n");
}

export function buildInlineImageMarkdown(path: string): string {
	return `![[${path}]]`;
}

export function extractImageFilesFromClipboard(event: ClipboardEvent): File[] {
	const clipboardItems = Array.from(event.clipboardData?.items ?? []);
	const imageFiles: File[] = [];
	for (const item of clipboardItems) {
		if (item.kind !== "file") {
			continue;
		}
		const file = item.getAsFile();
		if (!file || !file.type.startsWith("image/")) {
			continue;
		}
		imageFiles.push(file);
	}
	return imageFiles;
}
