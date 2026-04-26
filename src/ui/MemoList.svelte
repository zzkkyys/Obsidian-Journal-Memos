<script>
	import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";
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
	export let existingTags = [];
	export let resetKey = "";
	export let hasMoreSource = false;
	export let isLoadingSource = false;

	const dispatch = createEventDispatcher();

	const ESTIMATED_MEMO_HEIGHT = 180;
	const ROW_GAP = 20;
	const OVERSCAN_MEMOS = 12;
	const LOAD_MORE_THRESHOLD = 12;

	let previousResetKey = resetKey;
	let containerEl = null;
	let scrollParent = null;
	let viewportOffset = 0;
	let viewportHeight = 800;
	let lastRequestedSourceLength = -1;
	let measuredHeights = new Map();
	let measurementVersion = 0;

	function handleEditClick(event) {
		dispatch("edit", event.detail);
	}

	function handleCancelEdit() {
		dispatch("cancelEdit");
	}

	function handleSaveEdit(event) {
		dispatch("saveEdit", event.detail);
	}

	function handleDelete(event) {
		dispatch("delete", event.detail);
	}

	$: measurementVersion;
	$: memoHeights = memos.map(
		(memo, index) =>
			(measuredHeights.get(memo.id) ?? ESTIMATED_MEMO_HEIGHT) +
			getRowGap(memos, index),
	);
	$: prefixHeights = buildPrefixHeights(memoHeights);
	$: groupMeta = buildGroupMeta(memos);
	$: totalListHeight = prefixHeights[prefixHeights.length - 1] ?? 0;
	$: virtualStartIndex = findIndexForOffset(
		prefixHeights,
		Math.max(0, viewportOffset - OVERSCAN_MEMOS * ESTIMATED_MEMO_HEIGHT),
	);
	$: virtualEndIndex = Math.min(
		memos.length,
		findIndexForOffset(
			prefixHeights,
			viewportOffset + viewportHeight + OVERSCAN_MEMOS * ESTIMATED_MEMO_HEIGHT,
		) + 1,
	);
	$: visibleRows = buildVisibleRows(memos, virtualStartIndex, virtualEndIndex);
	$: topSpacerHeight = prefixHeights[virtualStartIndex] ?? 0;
	$: bottomSpacerHeight = Math.max(0, totalListHeight - (prefixHeights[virtualEndIndex] ?? 0));
	$: hasMore = hasMoreSource;
	$: if (resetKey !== previousResetKey) {
		previousResetKey = resetKey;
		lastRequestedSourceLength = -1;
		measuredHeights = new Map();
		measurementVersion += 1;
		void resetScrollPosition();
	}
	$: if (
		hasMoreSource &&
		!isLoadingSource &&
		memos.length > 0 &&
		virtualEndIndex >= memos.length - LOAD_MORE_THRESHOLD &&
		lastRequestedSourceLength !== memos.length
	) {
		lastRequestedSourceLength = memos.length;
		dispatch("needMore");
	}

	function buildPrefixHeights(heights) {
		const prefix = [0];
		for (const height of heights) {
			prefix.push(prefix[prefix.length - 1] + height);
		}
		return prefix;
	}

	function findIndexForOffset(prefixHeights, offset) {
		let low = 0;
		let high = Math.max(0, prefixHeights.length - 1);
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (prefixHeights[mid + 1] <= offset) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}

	function buildVisibleRows(memos, startIndex, endIndex) {
		return memos.slice(startIndex, endIndex).map((memo, localIndex) => {
			const index = startIndex + localIndex;
			const previous = memos[index - 1] ?? null;
			const next = memos[index + 1] ?? null;
			const meta = groupMeta.get(memo.dateKey) ?? { count: 1, bgIndex: -1 };
			return {
				memo,
				index,
				showDateBadge: meta.count >= 2 && previous?.dateKey !== memo.dateKey,
				hasGroupBg: meta.count >= 2,
				isFirstInGroup: previous?.dateKey !== memo.dateKey,
				isLastInGroup: next?.dateKey !== memo.dateKey,
				bgIndex: meta.bgIndex,
			};
		});
	}

	function buildGroupMeta(memos) {
		const counts = new Map();
		const meta = new Map();
		for (const memo of memos) {
			counts.set(memo.dateKey, (counts.get(memo.dateKey) ?? 0) + 1);
		}

		let bgIndex = 0;
		for (const memo of memos) {
			if (meta.has(memo.dateKey)) {
				continue;
			}
			const count = counts.get(memo.dateKey) ?? 0;
			meta.set(memo.dateKey, {
				count,
				bgIndex: count >= 2 ? bgIndex : -1,
			});
			if (count >= 2) {
				bgIndex += 1;
			}
		}
		return meta;
	}

	function getRowGap(memos, index) {
		const memo = memos[index];
		const next = memos[index + 1];
		if (memo && next && memo.dateKey === next.dateKey) {
			return 0;
		}
		return ROW_GAP;
	}

	function loadMore() {
		if (hasMoreSource && !isLoadingSource) {
			dispatch("needMore");
		}
	}

	function findScrollParent(node) {
		let current = node?.parentElement;
		while (current) {
			const style = getComputedStyle(current);
			if (/(auto|scroll)/.test(style.overflowY)) {
				return current;
			}
			current = current.parentElement;
		}
		return window;
	}

	function updateViewport() {
		if (!(containerEl instanceof HTMLElement)) {
			return;
		}

		const containerRect = containerEl.getBoundingClientRect();
		if (scrollParent instanceof HTMLElement) {
			const parentRect = scrollParent.getBoundingClientRect();
			viewportOffset = Math.max(0, parentRect.top - containerRect.top);
			viewportHeight = scrollParent.clientHeight || viewportHeight;
			return;
		}

		viewportOffset = Math.max(0, -containerRect.top);
		viewportHeight = window.innerHeight || viewportHeight;
	}

	async function resetScrollPosition() {
		await tick();
		if (containerEl instanceof HTMLElement) {
			containerEl.scrollIntoView({ block: "start" });
		}
		updateViewport();
	}

	function measureMemo(node, memoId) {
		let resizeObserver = null;

		function updateHeight() {
			const nextHeight = Math.max(
				1,
				Math.ceil(node.getBoundingClientRect().height),
			);
			const previousHeight = measuredHeights.get(memoId);
			if (previousHeight === nextHeight) {
				return;
			}
			measuredHeights.set(memoId, nextHeight);
			measurementVersion += 1;
		}

		void tick().then(updateHeight);
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(updateHeight);
			resizeObserver.observe(node);
		}

		return {
			update(nextMemoId) {
				memoId = nextMemoId;
				void tick().then(updateHeight);
			},
			destroy() {
				resizeObserver?.disconnect();
			},
		};
	}

	function rowStyle(row) {
		if (!row.hasGroupBg) return "";
		const color = row.bgIndex % 2 === 0 ? dayGroupColorA : dayGroupColorB;
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
		if (scrollParent instanceof HTMLElement) {
			scrollParent.removeEventListener("scroll", updateViewport);
		} else {
			window.removeEventListener("scroll", updateViewport);
		}
		window.removeEventListener("resize", updateViewport);
	});

	onMount(() => {
		if (!(containerEl instanceof HTMLElement)) {
			return;
		}

		scrollParent = findScrollParent(containerEl);
		if (scrollParent instanceof HTMLElement) {
			scrollParent.addEventListener("scroll", updateViewport, { passive: true });
		} else {
			window.addEventListener("scroll", updateViewport, { passive: true });
		}
		window.addEventListener("resize", updateViewport);
		updateViewport();
	});
</script>

<div class="memo-list-container" bind:this={containerEl}>
	{#if topSpacerHeight > 0}
		<div class="jm-virtual-spacer" style={`height: ${topSpacerHeight}px;`}></div>
	{/if}

	{#each visibleRows as row (row.memo.id)}
		<div
			class="jm-virtual-row memo-group {row.hasGroupBg
				? row.bgIndex % 2 === 0
					? 'has-group-bg group-bg-a'
					: 'has-group-bg group-bg-b'
				: ''} {row.isFirstInGroup
				? 'is-first-in-group'
				: ''} {row.isLastInGroup ? 'is-last-in-group' : ''}"
			style={rowStyle(row)}
			use:measureMemo={row.memo.id}
		>
			{#if row.showDateBadge}
				<span class="memo-group-date-badge"
					>{formatGroupDate(row.memo.dateKey)}</span
				>
			{/if}
			<div class="memo-group-items">
				<MemoItem
					memo={row.memo}
					isEditing={editingMemo?.id === row.memo.id}
					bind:editDraft
					{renderMemoContent}
					{openAttachmentPreview}
					{openRenderedImagePreview}
					{saveAttachments}
					{resolveResourcePath}
					{searchQuery}
					{existingTags}
					on:edit={handleEditClick}
					on:cancelEdit={handleCancelEdit}
					on:saveEdit={handleSaveEdit}
					on:delete={handleDelete}
				/>
			</div>
		</div>
	{/each}

	{#if bottomSpacerHeight > 0}
		<div class="jm-virtual-spacer" style={`height: ${bottomSpacerHeight}px;`}></div>
	{/if}

	{#if hasMore}
		<div class="jm-virtual-sentinel">
			<div class="jm-load-more-hint">
				<span class="jm-load-more-spinner"></span>
				{#if isLoadingSource}
					Loading older memos…
				{:else}
					<button type="button" class="jm-load-more-button" on:click={loadMore}>
						Load older memos
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* All styling moved to global styles.css for Obsidian compatibility */
</style>
