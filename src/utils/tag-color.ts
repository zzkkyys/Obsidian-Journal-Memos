/**
 * Deterministically maps a tag to a hue (0–359) based on its top-level
 * segment, so "#work" and "#work/project" always share the same colour.
 */
export function tagHue(tag: string): number {
	// Strip leading '#' then take only the first path segment.
	const bare = tag.startsWith("#") ? tag.slice(1) : tag;
	const top = bare.split("/")[0] ?? bare;
	let h = 0;
	for (let i = 0; i < top.length; i++) {
		h = (h * 31 + top.charCodeAt(i)) & 0xffff;
	}
	return h % 360;
}

/** Inline style string for a tag chip background. */
export function tagBgStyle(tag: string, active = false): string {
	const hue = tagHue(tag);
	const alpha = active ? 0.28 : 0.14;
	return `background: hsla(${hue}, 65%, 50%, ${alpha});`;
}
