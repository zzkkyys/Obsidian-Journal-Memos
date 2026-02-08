import { TFile } from "obsidian";
import type { MemoItem } from "../types";
import { parseCreatedAt } from "../utils/date";

const MEMO_BLOCK_REGEX = /^```memos[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*(?=\r?\n|$)/gm;
const CREATED_LINE_REGEX = /^created:\s*(.+)$/m;

export function extractMemosFromMarkdown(file: TFile, markdown: string): MemoItem[] {
	const memos: MemoItem[] = [];
	MEMO_BLOCK_REGEX.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = MEMO_BLOCK_REGEX.exec(markdown)) !== null) {
		const body = match[1] ?? "";
		const createdMatch = CREATED_LINE_REGEX.exec(body);
		if (!createdMatch?.[1]) {
			continue;
		}

		const createdLabel = createdMatch[1].trim();
		const createdAt = parseCreatedAt(createdLabel);
		if (createdAt < 0) {
			continue;
		}

		const content = body.replace(CREATED_LINE_REGEX, "").trim();
		memos.push({
			id: `${file.path}:${match.index}`,
			filePath: file.path,
			dateKey: file.basename,
			createdAt,
			createdLabel,
			content,
		});
	}

	return memos;
}
