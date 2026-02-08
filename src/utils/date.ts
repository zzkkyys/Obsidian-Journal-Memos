export function formatDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function formatTime(date: Date): string {
	const hour = String(date.getHours()).padStart(2, "0");
	const minute = String(date.getMinutes()).padStart(2, "0");
	return `${hour}:${minute}`;
}

export function formatCreatedLabel(date: Date): string {
	return `${formatDateKey(date)} ${formatTime(date)}`;
}

export function getRecentDateKeys(days: number, baseDate: Date = new Date()): string[] {
	const safeDays = Math.max(1, Math.floor(days));
	const keys: string[] = [];

	for (let index = 0; index < safeDays; index += 1) {
		const date = new Date(baseDate);
		date.setHours(0, 0, 0, 0);
		date.setDate(date.getDate() - index);
		keys.push(formatDateKey(date));
	}

	return keys;
}

export function parseCreatedAt(raw: string): number {
	const normalized = raw.trim().replace(" ", "T");
	const timestamp = Date.parse(normalized);
	return Number.isNaN(timestamp) ? -1 : timestamp;
}
