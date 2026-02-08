export interface MemoItem {
	id: string;
	filePath: string;
	dateKey: string;
	createdAt: number;
	createdLabel: string;
	content: string;
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
