export interface MemoItem {
	id: string;
	filePath: string;
	dateKey: string;
	createdAt: number;
	createdLabel: string;
	content: string;
	tags: string[];
	attachments: MemoAttachment[];
}

export interface MemoAttachmentInput {
	name: string;
	mimeType: string;
	data: ArrayBuffer;
}

export interface MemoAttachment {
	path: string;
	name: string;
	isImage: boolean;
}

export interface HeatmapCell {
	dateKey: string;
	count: number;
	filePath: string | null;
}

export interface MemoSnapshot {
	stream: MemoItem[];
	heatmap: HeatmapCell[];
}
