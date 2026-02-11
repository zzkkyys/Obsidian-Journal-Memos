<script>
	import { createEventDispatcher } from "svelte";
	import MemoItem from "./MemoItem.svelte";

	export let memos = [];
	export let editingMemo = null;
	export let renderMemoContent; // (el, markdown, sourcePath) => Promise<void>
	export let openAttachmentPreview; // (attachment, sourcePath, previewGroup) => void
	export let openRenderedImagePreview; // (imageEl, sourcePath, previewGroup) => void
	export let saveAttachments; // (files) => Promise<Attachment[]>
	export let editDraft = ""; // Prop from parent
	export let resolveResourcePath; // (path) => string
	export let dayGroupColorA = ""; // Background color A for alternating groups
	export let dayGroupColorB = ""; // Background color B for alternating groups

	const dispatch = createEventDispatcher();

	function handleEditClick(event) {
		console.log("[Journal Memos] Edit click forwarded", event.detail);
		dispatch("edit", event.detail);
	}

	function handleCancelEdit() {
		dispatch("cancelEdit");
	}

	function handleSaveEdit() {
		dispatch("saveEdit");
	}

	// Group memos by date, and assign alternating bg index only to multi-memo groups
	let memoGroups = [];
	$: {
		const groups = new Map();
		for (const memo of memos) {
			const date = memo.dateKey;
			if (!groups.has(date)) {
				groups.set(date, []);
			}
			groups.get(date).push(memo);
		}

		let bgIndex = 0;
		memoGroups = Array.from(groups.entries()).map(([date, items]) => {
			const hasGroupBg = items.length >= 2;
			const result = {
				date,
				items,
				hasGroupBg,
				bgIndex: hasGroupBg ? bgIndex : -1,
			};
			if (hasGroupBg) bgIndex++;
			return result;
		});
	}

	function groupStyle(group) {
		if (!group.hasGroupBg) return "";
		const color = group.bgIndex % 2 === 0 ? dayGroupColorA : dayGroupColorB;
		if (color) {
			return `background: ${color};`;
		}
		return "";
	}
</script>

<div class="memo-list-container">
	{#each memoGroups as group (group.date)}
		<div
			class="memo-group {group.hasGroupBg
				? group.bgIndex % 2 === 0
					? 'has-group-bg group-bg-a'
					: 'has-group-bg group-bg-b'
				: ''}"
			style={groupStyle(group)}
		>
			<div class="memo-group-items">
				{#each group.items as memo (memo.id)}
					<MemoItem
						{memo}
						isEditing={editingMemo?.id === memo.id}
						bind:editDraft
						{renderMemoContent}
						{openAttachmentPreview}
						{openRenderedImagePreview}
						{saveAttachments}
						{resolveResourcePath}
						on:edit={handleEditClick}
						on:cancelEdit={handleCancelEdit}
						on:saveEdit={handleSaveEdit}
					/>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	/* All styling moved to global styles.css for Obsidian compatibility */
</style>
