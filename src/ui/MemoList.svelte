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

	// Group memos by date
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

		memoGroups = Array.from(groups.entries()).map(([date, items]) => ({
			date,
			items,
		}));
	}

	function formatDateHeader(dateKey) {
		// Basic format, can be improved to "Today", "Yesterday", etc.
		if (!dateKey) return "Unknown Date";
		return dateKey;
	}
</script>

<div class="memo-list-container">
	{#each memoGroups as group (group.date)}
		<div class="memo-group">
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
	.memo-list-container {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.memo-group {
		/* Remove group background for separated card look */
		background-color: transparent !important;
		border-radius: 0;
		padding: 0;
		position: relative;
	}

	/* Remove accent bar */
	.memo-group::before {
		display: none;
	}

	.memo-group-items {
		display: flex;
		flex-direction: column;
		gap: 16px !important; /* Space between memos */
	}

	/* Restore individual card styles */
	:global(.memo-group-items .jm-card) {
		background-color: var(--background-secondary) !important;
		border: 1px solid var(--background-modifier-border) !important; /* Visible border */
		border-radius: 8px !important;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06) !important;
	}

	:global(.theme-dark .memo-group-items .jm-card) {
		background-color: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
	}
</style>
