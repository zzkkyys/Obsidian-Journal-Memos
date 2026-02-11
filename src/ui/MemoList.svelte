<script>
	import { createEventDispatcher, onDestroy } from "svelte";
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
	export let searchQuery = ""; // Search query for highlighting

	const dispatch = createEventDispatcher();

	const INITIAL_GROUPS = 15;
	const LOAD_MORE_GROUPS = 10;

	let visibleGroupCount = INITIAL_GROUPS;
	let sentinelEl = null;
	let observer = null;

	function handleEditClick(event) {
		dispatch("edit", event.detail);
	}

	function handleCancelEdit() {
		dispatch("cancelEdit");
	}

	function handleSaveEdit() {
		dispatch("saveEdit");
	}

	function handleDelete(event) {
		dispatch("delete", event.detail);
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

		// Reset visible count when data changes (new filter, reload, etc.)
		visibleGroupCount = INITIAL_GROUPS;
	}

	// Slice groups to only show the visible portion
	$: visibleGroups = memoGroups.slice(0, visibleGroupCount);
	$: hasMore = visibleGroupCount < memoGroups.length;
	$: remainingCount = Math.max(0, memoGroups.length - visibleGroupCount);

	function loadMore() {
		if (visibleGroupCount >= memoGroups.length) return;
		visibleGroupCount = Math.min(
			visibleGroupCount + LOAD_MORE_GROUPS,
			memoGroups.length,
		);
	}

	// IntersectionObserver-based sentinel
	function setupObserver(node) {
		sentinelEl = node;

		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						loadMore();
					}
				}
			},
			{
				rootMargin: "200px 0px", // trigger 200px before reaching the sentinel
			},
		);

		observer.observe(node);

		return {
			destroy() {
				observer?.disconnect();
				observer = null;
				sentinelEl = null;
			},
		};
	}

	function groupStyle(group) {
		if (!group.hasGroupBg) return "";
		const color = group.bgIndex % 2 === 0 ? dayGroupColorA : dayGroupColorB;
		if (color) {
			return `background: ${color};`;
		}
		return "";
	}

	function formatGroupDate(dateKey) {
		const d = new Date(dateKey + "T00:00:00");
		if (isNaN(d.getTime())) return dateKey;
		const month = d.toLocaleString("default", { month: "short" });
		return `${month} ${d.getDate()}`;
	}

	onDestroy(() => {
		observer?.disconnect();
	});
</script>

<div class="memo-list-container">
	{#each visibleGroups as group (group.date)}
		<div
			class="memo-group {group.hasGroupBg
				? group.bgIndex % 2 === 0
					? 'has-group-bg group-bg-a'
					: 'has-group-bg group-bg-b'
				: ''}"
			style={groupStyle(group)}
		>
			{#if group.hasGroupBg}
				<span class="memo-group-date-badge"
					>{formatGroupDate(group.date)}</span
				>
			{/if}
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
						{searchQuery}
						on:edit={handleEditClick}
						on:cancelEdit={handleCancelEdit}
						on:saveEdit={handleSaveEdit}
						on:delete={handleDelete}
					/>
				{/each}
			</div>
		</div>
	{/each}

	{#if hasMore}
		<!-- Sentinel: triggers loading more groups when scrolled into view -->
		<div class="jm-virtual-sentinel" use:setupObserver>
			<div class="jm-load-more-hint">
				<span class="jm-load-more-spinner"></span>
				Loading more… ({remainingCount} groups remaining)
			</div>
		</div>
	{/if}
</div>

<style>
	/* All styling moved to global styles.css for Obsidian compatibility */
</style>
