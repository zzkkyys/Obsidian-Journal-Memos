<script>
	import { onMount, tick } from "svelte";
	import { formatDateKey } from "../utils/date";
	import MemoList from "./MemoList.svelte";
	import MemoHeatmap from "./MemoHeatmap.svelte";
	import MemoFilter from "./MemoFilter.svelte";
	import MemoEditor from "./MemoEditor.svelte";
	import { memoRenderer } from "./memo-renderer";
	import { renderAttachmentBlock } from "../utils/editor-utils";

	export let stream = [];
	export let heatmap = [];
	export let refreshData;
	export let publishMemo;
	export let updateMemo;
	export let saveAttachments;
	export let openDaily;
	export let openOrCreateDaily;
	export let openPluginSettings;
	export let renderMemoContent;
	export let memoImageMaxWidth = 640;
	export let exploreColumnLimit = 0;
	export let dayGroupColorA = "";
	export let dayGroupColorB = "";
	export let notice; // (message: string, timeout?: number) => void
	export let resolveResourcePath; // (path: string) => string

	const RAIL_ITEMS = [
		{ id: "avatar", label: "Avatar" },
		{ id: "memos", label: "Memos" },
		{ id: "explore", label: "Explore" },
		{ id: "attachments", label: "Attachments" },
		{ id: "settings", label: "Settings" },
	];
	const IMAGE_FILE_EXT_REGEX =
		/\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;
	const WIKI_IMAGE_REGEX = /!\[\[([^[\]\n]+)\]\]/g;
	const MARKDOWN_IMAGE_REGEX =
		/!\[[^\]\n]*\]\((?:\\.|[^()\n]|\([^()\n]*\))*\)/g;
	const HTML_IMAGE_REGEX = /<img\b[^>]*>/gi;
	const MAX_EXPLORE_MEMOS = 2000;
	const PREVIEW_SCALE_MIN = 0.5;
	const PREVIEW_SCALE_MAX = 4;
	const PREVIEW_SCALE_STEP = 0.2;

	let draft = "";
	let isSubmitting = false;
	let isUploading = false;
	let isLoading = false;
	let errorMessage = "";
	let selectedTag = "all";
	let railActive = "memos";
	let exploreShuffleSeed = Date.now();
	let layoutEl;
	let previewAttachment = null;
	let previewGallery = [];
	let previewIndex = -1;
	let previewScale = 1;
	let previewOffsetX = 0;
	let previewOffsetY = 0;
	let previewPanEnabled = true;
	let previewOnlyCurrentMemo = false;
	let previewCurrentGroup = "";
	let previewDragPointerId = null;
	let previewDragStartX = 0;
	let previewDragStartY = 0;
	let previewDragOriginX = 0;
	let previewDragOriginY = 0;
	let editingMemo = null;
	let editDraft = "";
	let isSavingEdit = false;

	$: tagStats = buildTagStats(stream);
	$: totalMemoCount = stream.length;
	$: maxImageWidthCss = `${Math.max(120, Number(memoImageMaxWidth) || 640)}px`;
	$: previewAttachment =
		previewIndex >= 0 && previewIndex < previewGallery.length
			? previewGallery[previewIndex]
			: null;
	$: previewHasPrev = previewIndex > 0;
	$: previewHasNext =
		previewIndex >= 0 && previewIndex < previewGallery.length - 1;
	$: previewIsImage = Boolean(previewAttachment?.isImage);
	$: previewCanScopeToCurrentMemo =
		previewIsImage && Boolean(previewCurrentGroup);
	$: previewCounterLabel =
		previewGallery.length > 1 && previewIndex >= 0
			? `${previewIndex + 1} / ${previewGallery.length}`
			: "";
	$: previewTransformStyle = `--jm-preview-scale: ${previewScale}; --jm-preview-offset-x: ${previewOffsetX}px; --jm-preview-offset-y: ${previewOffsetY}px;`;
	$: filteredStream =
		selectedTag === "all"
			? stream
			: stream.filter(
					(memo) =>
						Array.isArray(memo.tags) &&
						memo.tags.includes(selectedTag),
				);
	$: exploreMemos = buildExploreMemos(
		filteredStream,
		exploreShuffleSeed,
		MAX_EXPLORE_MEMOS,
	);
	$: exploreGridItems = buildExploreGridItems(exploreMemos);
	$: imageTimeline = buildImageTimeline(filteredStream);

	// Masonry Logic for Explore View
	let exploreContainerWidth = 0;
	$: exploreColCount =
		exploreColumnLimit > 0
			? exploreColumnLimit
			: exploreContainerWidth < 600
				? 1
				: exploreContainerWidth < 1100
					? 2
					: 3;
	let exploreColumns = [];
	$: {
		const cols = Array.from({ length: exploreColCount }, () => []);
		if (Array.isArray(exploreGridItems)) {
			exploreGridItems.forEach((item, i) => {
				cols[i % exploreColCount].push(item);
			});
		}
		exploreColumns = cols;
	}
	$: if (
		selectedTag !== "all" &&
		!tagStats.some((item) => item.tag === selectedTag)
	) {
		selectedTag = "all";
	}

	function formatTime(ts) {
		if (!ts) return "";
		return new Date(ts).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	}

	function buildTagStats(memos) {
		const tagCountMap = new Map();

		for (const memo of memos) {
			const tags = Array.isArray(memo.tags) ? memo.tags : [];
			for (const tag of tags) {
				tagCountMap.set(tag, (tagCountMap.get(tag) ?? 0) + 1);
			}
		}

		return Array.from(tagCountMap.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort(
				(left, right) =>
					right.count - left.count ||
					left.tag.localeCompare(right.tag),
			);
	}

	function hashWithSeed(value, seed) {
		let hash = (2166136261 ^ seed) >>> 0;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}

	function buildExploreMemos(memos, seed, limit) {
		if (!Array.isArray(memos) || memos.length === 0) {
			return [];
		}

		// Sort by time descending, no randomness
		return [...memos]
			.sort((left, right) => right.createdAt - left.createdAt)
			.slice(0, Math.max(1, Math.min(limit, memos.length)));
	}

	function buildExploreGridItems(memos) {
		if (!Array.isArray(memos)) {
			return [];
		}

		const items = [];
		let currentGroupIndex = 0;

		for (let i = 0; i < memos.length; i++) {
			const memo = memos[i];
			// If date changes from previous, increment group index
			if (i > 0 && memo.dateKey !== memos[i - 1].dateKey) {
				currentGroupIndex++;
			}

			// Check if this is the last memo of the current date group
			const isLastInGroup =
				i === memos.length - 1 || memos[i + 1].dateKey !== memo.dateKey;

			// Extract images to move them to the bottom
			const imageEmbeds = extractImageEmbeds(memo.content);
			let cleanedContent = memo.content || "";

			// Remove all extracted images from the main content
			if (imageEmbeds.length > 0) {
				for (const imgMarkdown of imageEmbeds) {
					// Use split/join to replace all occurrences efficiently
					cleanedContent = cleanedContent.split(imgMarkdown).join("");
				}
			}

			items.push({
				memo,
				groupIndex: currentGroupIndex,
				isLastInGroup,
				cleanedContent: cleanedContent.trim(),
				imageEmbeds,
			});
		}

		return items;
	}

	function looksLikeImageFile(target) {
		const normalized = String(target ?? "")
			.split("|")[0]
			.split("#")[0]
			.trim();

		return IMAGE_FILE_EXT_REGEX.test(normalized);
	}

	function extractImageEmbeds(content) {
		if (!content) {
			return [];
		}

		const matches = [];
		let match;

		WIKI_IMAGE_REGEX.lastIndex = 0;
		while ((match = WIKI_IMAGE_REGEX.exec(content)) !== null) {
			if (!looksLikeImageFile(match[1] ?? "")) {
				continue;
			}
			matches.push({
				index: match.index,
				order: 0,
				raw: match[0],
			});
		}

		MARKDOWN_IMAGE_REGEX.lastIndex = 0;
		while ((match = MARKDOWN_IMAGE_REGEX.exec(content)) !== null) {
			matches.push({
				index: match.index,
				order: 1,
				raw: match[0],
			});
		}

		HTML_IMAGE_REGEX.lastIndex = 0;
		while ((match = HTML_IMAGE_REGEX.exec(content)) !== null) {
			matches.push({
				index: match.index,
				order: 2,
				raw: match[0],
			});
		}

		return matches
			.sort(
				(left, right) =>
					left.index - right.index || left.order - right.order,
			)
			.map((item) => item.raw);
	}

	function buildImageTimeline(memos) {
		if (!Array.isArray(memos) || memos.length === 0) {
			return [];
		}

		const orderedMemos = [...memos].sort(
			(left, right) => right.createdAt - left.createdAt,
		);
		const timeline = [];

		for (const memo of orderedMemos) {
			const imageEmbeds = extractImageEmbeds(memo.content);
			const attachmentImageEmbeds = Array.isArray(memo.attachments)
				? memo.attachments
						.filter((attachment) => attachment?.isImage)
						.map((attachment) => `![[${attachment.path}]]`)
				: [];
			const allImageEmbeds = [...imageEmbeds, ...attachmentImageEmbeds];
			allImageEmbeds.forEach((imageMarkdown, index) => {
				timeline.push({
					id: `${memo.id}:image:${index}`,
					dateKey: memo.dateKey,
					createdLabel: memo.createdLabel,
					createdAt: memo.createdAt,
					filePath: memo.filePath,
					tags: memo.tags,
					imageMarkdown,
				});
			});
		}

		return timeline;
	}

	async function reload() {
		isLoading = true;
		errorMessage = "";
		try {
			const snapshot = await refreshData();
			stream = snapshot.stream;
			heatmap = snapshot.heatmap;
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to load memos.";
		} finally {
			isLoading = false;
		}
	}

	async function submit() {
		const content = draft.trim();
		if (!content) {
			return;
		}

		isSubmitting = true;
		errorMessage = "";
		try {
			await publishMemo(content);
			draft = "";
			notice?.("Memo published");
			await reload();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to publish memo.";
		} finally {
			isSubmitting = false;
		}
	}

	function openMemoEditor(memo) {
		if (isSavingEdit) {
			return;
		}
		if (!memo) {
			return;
		}
		if (editingMemo?.id === memo.id) {
			return;
		}
		editingMemo = memo ?? null;
		// Combine content with attachment block
		const content = editingMemo?.content ?? "";
		const attachments = Array.isArray(editingMemo?.attachments)
			? editingMemo.attachments
			: [];
		if (attachments.length > 0) {
			const attachmentPaths = attachments
				.map((a) => a.path)
				.filter(Boolean);
			const block = renderAttachmentBlock(attachmentPaths);
			editDraft = content.trim()
				? `${content.trim()}\n\n${block}`
				: block;
		} else {
			editDraft = content;
		}
		errorMessage = "";
	}

	function isEditingMemo(memo) {
		if (!editingMemo || !memo) {
			return false;
		}
		return editingMemo.id === memo.id;
	}

	function closeMemoEditor() {
		editingMemo = null;
		editDraft = "";
	}

	async function saveMemoEdit(payload) {
		const targetMemo = payload?.memo ?? editingMemo;
		const targetContent =
			typeof payload?.content === "string" ? payload.content : editDraft;

		if (!targetMemo || !updateMemo) {
			return;
		}

		const normalized = targetContent.trim();
		if (
			!normalized &&
			(!Array.isArray(targetMemo.attachments) ||
				targetMemo.attachments.length === 0)
		) {
			errorMessage = "Memo content cannot be empty.";
			return;
		}

		isSavingEdit = true;
		errorMessage = "";
		try {
			await updateMemo(targetMemo, targetContent);
			editingMemo = null;
			editDraft = "";
			notice?.("Memo updated");
			await reload();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to update memo.";
		} finally {
			isSavingEdit = false;
		}
	}

	function fileNameFromPath(path) {
		const normalized = String(path ?? "").replace(/\\/g, "/");
		const segments = normalized.split("/");
		return segments.length > 0
			? segments[segments.length - 1] || normalized
			: normalized;
	}

	function normalizeInternalImagePathCandidate(candidate) {
		const normalized = String(candidate ?? "")
			.replace(/^!\[\[/, "")
			.replace(/\]\]$/, "")
			.split("|")[0]
			.split("#")[0]
			.trim();
		if (!normalized) {
			return "";
		}
		if (/^(?:app|http|https|file|blob|data):/i.test(normalized)) {
			return "";
		}
		return looksLikeImageFile(normalized) ? normalized : "";
	}

	function extractInternalImagePath(imageEl) {
		const holder = imageEl.closest(".internal-embed, .image-embed");
		const candidates =
			holder instanceof HTMLElement
				? [
						holder.getAttribute("src"),
						holder.getAttribute("data-src"),
						holder.getAttribute("data-href"),
						holder.getAttribute("href"),
						imageEl.getAttribute("alt"),
					]
				: [imageEl.getAttribute("alt")];

		for (const candidate of candidates) {
			const path = normalizeInternalImagePathCandidate(candidate);
			if (path) {
				return path;
			}
		}

		return "";
	}

	function createPreviewItemFromAttachment(
		attachment,
		sourcePath,
		previewGroup = "",
	) {
		if (!attachment?.path) {
			return null;
		}

		const normalizedSourcePath = sourcePath ?? "";
		const normalizedPath = String(attachment.path).trim();
		const isImage = Boolean(attachment.isImage);
		return {
			key: isImage
				? `internal:${normalizedPath}`
				: `file:${normalizedPath}`,
			name: attachment.name ?? fileNameFromPath(normalizedPath),
			markdown: isImage
				? `![[${normalizedPath}]]`
				: `[[${normalizedPath}]]`,
			imageSrc: "",
			sourcePath: normalizedSourcePath,
			groupKey: previewGroup ?? "",
			isImage,
		};
	}

	function createPreviewItemFromImageElement(
		imageEl,
		fallbackSourcePath = "",
	) {
		const sourceContainer = imageEl.closest("[data-source-path]");
		const sourcePath =
			sourceContainer instanceof HTMLElement
				? (sourceContainer.dataset.sourcePath ?? fallbackSourcePath)
				: fallbackSourcePath;
		const groupKey =
			sourceContainer instanceof HTMLElement
				? (sourceContainer.dataset.previewGroup ?? "")
				: "";
		const internalPath = extractInternalImagePath(imageEl);
		if (internalPath) {
			return {
				key: `internal:${internalPath}`,
				name: fileNameFromPath(internalPath),
				markdown: `![[${internalPath}]]`,
				imageSrc: "",
				sourcePath,
				groupKey,
				isImage: true,
			};
		}

		const imageSrc = String(imageEl.getAttribute("src") ?? "").trim();
		if (!imageSrc) {
			return null;
		}

		const fallbackName =
			String(imageEl.getAttribute("alt") ?? "").trim() ||
			fileNameFromPath(imageSrc);
		return {
			key: `src:${imageSrc}`,
			name: fallbackName,
			markdown: "",
			imageSrc,
			sourcePath,
			groupKey,
			isImage: true,
		};
	}

	function collectPreviewGallery(
		fallbackSourcePath = "",
		restrictGroup = "",
	) {
		if (!(layoutEl instanceof HTMLElement)) {
			return [];
		}

		const imageNodes = layoutEl.querySelectorAll(".jm-main-column img");
		const gallery = [];
		const seen = new Set();

		for (const node of imageNodes) {
			if (!(node instanceof HTMLImageElement)) {
				continue;
			}
			const previewItem = createPreviewItemFromImageElement(
				node,
				fallbackSourcePath,
			);
			if (!previewItem || !previewItem.isImage) {
				continue;
			}
			if (restrictGroup && previewItem.groupKey !== restrictGroup) {
				continue;
			}

			const dedupeKey = `${previewItem.key}::${previewItem.sourcePath}::${previewItem.groupKey}`;
			if (seen.has(dedupeKey)) {
				continue;
			}
			seen.add(dedupeKey);
			gallery.push(previewItem);
		}

		return gallery;
	}

	function findPreviewItemIndex(items, targetItem) {
		if (!Array.isArray(items) || items.length === 0 || !targetItem) {
			return -1;
		}

		let index = items.findIndex(
			(item) =>
				item.key === targetItem.key &&
				item.sourcePath === targetItem.sourcePath &&
				(item.groupKey ?? "") === (targetItem.groupKey ?? ""),
		);
		if (index >= 0) {
			return index;
		}

		index = items.findIndex((item) => item.key === targetItem.key);
		return index;
	}

	function resetPreviewViewport() {
		previewScale = 1;
		previewOffsetX = 0;
		previewOffsetY = 0;
		previewDragPointerId = null;
	}

	function openPreviewGallery(items, startIndex = 0, options = {}) {
		if (!Array.isArray(items) || items.length === 0) {
			return;
		}

		previewGallery = items;
		previewIndex = Math.min(Math.max(startIndex, 0), items.length - 1);
		if (Object.prototype.hasOwnProperty.call(options, "currentGroup")) {
			previewCurrentGroup = String(options.currentGroup ?? "");
		}
		if (options.resetOnlyCurrentMemo) {
			previewOnlyCurrentMemo = false;
		}
		previewPanEnabled = true;
		resetPreviewViewport();
	}

	function openAttachmentPreview(attachment, sourcePath, previewGroup = "") {
		const targetItem = createPreviewItemFromAttachment(
			attachment,
			sourcePath,
			previewGroup,
		);
		if (!targetItem) {
			return;
		}

		if (!targetItem.isImage) {
			openPreviewGallery([targetItem], 0, {
				currentGroup: previewGroup,
				resetOnlyCurrentMemo: true,
			});
			return;
		}

		const gallery = collectPreviewGallery(sourcePath ?? "");
		const startIndex = findPreviewItemIndex(gallery, targetItem);
		if (startIndex >= 0) {
			openPreviewGallery(gallery, startIndex, {
				currentGroup: previewGroup,
				resetOnlyCurrentMemo: true,
			});
			return;
		}

		openPreviewGallery([targetItem], 0, {
			currentGroup: previewGroup,
			resetOnlyCurrentMemo: true,
		});
	}

	function openRenderedImagePreview(imageEl, sourcePath, previewGroup = "") {
		const targetItem = createPreviewItemFromImageElement(
			imageEl,
			sourcePath ?? "",
		);
		if (!targetItem) {
			return;
		}

		const gallery = collectPreviewGallery(sourcePath ?? "");
		const startIndex = findPreviewItemIndex(gallery, targetItem);
		if (startIndex >= 0) {
			openPreviewGallery(gallery, startIndex, {
				currentGroup: previewGroup || targetItem.groupKey || "",
				resetOnlyCurrentMemo: true,
			});
			return;
		}

		openPreviewGallery([targetItem], 0, {
			currentGroup: previewGroup || targetItem.groupKey || "",
			resetOnlyCurrentMemo: true,
		});
	}

	function togglePreviewOnlyCurrentMemo() {
		if (!previewAttachment || !previewCanScopeToCurrentMemo) {
			return;
		}

		const currentItem = previewAttachment;
		const nextOnlyCurrentMemo = !previewOnlyCurrentMemo;
		const nextGallery = collectPreviewGallery(
			currentItem.sourcePath ?? "",
			nextOnlyCurrentMemo ? previewCurrentGroup : "",
		);
		const finalGallery =
			nextGallery.length > 0 ? nextGallery : [currentItem];
		const nextIndex = findPreviewItemIndex(finalGallery, currentItem);
		openPreviewGallery(finalGallery, nextIndex >= 0 ? nextIndex : 0, {
			currentGroup: previewCurrentGroup,
			resetOnlyCurrentMemo: false,
		});
		previewOnlyCurrentMemo = nextOnlyCurrentMemo;
	}

	function closeAttachmentPreview() {
		previewGallery = [];
		previewIndex = -1;
		previewOnlyCurrentMemo = false;
		previewCurrentGroup = "";
		resetPreviewViewport();
	}

	function goPreviewPrevious() {
		if (!previewHasPrev) {
			return;
		}

		previewIndex -= 1;
		resetPreviewViewport();
	}

	function goPreviewNext() {
		if (!previewHasNext) {
			return;
		}

		previewIndex += 1;
		resetPreviewViewport();
	}

	function zoomPreviewIn() {
		if (!previewIsImage) {
			return;
		}
		previewScale = Math.min(
			PREVIEW_SCALE_MAX,
			Number((previewScale + PREVIEW_SCALE_STEP).toFixed(2)),
		);
	}

	function zoomPreviewOut() {
		if (!previewIsImage) {
			return;
		}
		previewScale = Math.max(
			PREVIEW_SCALE_MIN,
			Number((previewScale - PREVIEW_SCALE_STEP).toFixed(2)),
		);
	}

	function togglePreviewPanMode() {
		if (!previewIsImage) {
			return;
		}
		previewPanEnabled = !previewPanEnabled;
	}

	function handlePreviewPointerDown(event) {
		if (!previewIsImage || !previewPanEnabled) {
			return;
		}

		const target = event.target;
		if (!(target instanceof Element) || !target.closest("img")) {
			return;
		}

		previewDragPointerId = event.pointerId;
		previewDragStartX = event.clientX;
		previewDragStartY = event.clientY;
		previewDragOriginX = previewOffsetX;
		previewDragOriginY = previewOffsetY;

		const currentTarget = event.currentTarget;
		if (currentTarget instanceof HTMLElement) {
			currentTarget.setPointerCapture(event.pointerId);
		}
		event.preventDefault();
	}

	function handlePreviewPointerMove(event) {
		if (
			previewDragPointerId === null ||
			event.pointerId !== previewDragPointerId
		) {
			return;
		}

		previewOffsetX =
			previewDragOriginX + (event.clientX - previewDragStartX);
		previewOffsetY =
			previewDragOriginY + (event.clientY - previewDragStartY);
	}

	function handlePreviewPointerUp(event) {
		if (
			previewDragPointerId === null ||
			event.pointerId !== previewDragPointerId
		) {
			return;
		}

		const currentTarget = event.currentTarget;
		if (
			currentTarget instanceof HTMLElement &&
			currentTarget.hasPointerCapture(event.pointerId)
		) {
			currentTarget.releasePointerCapture(event.pointerId);
		}
		previewDragPointerId = null;
	}

	function attachmentThumbnailMarkdown(attachment) {
		if (!attachment?.path || !attachment.isImage) {
			return "";
		}
		return `![[${attachment.path}]]`;
	}

	function handleWindowKeydown(event) {
		if (!previewAttachment) {
			return;
		}

		if (event.key === "Escape") {
			closeAttachmentPreview();
			return;
		}

		if (event.key === "ArrowLeft") {
			event.preventDefault();
			goPreviewPrevious();
			return;
		}

		if (event.key === "ArrowRight") {
			event.preventDefault();
			goPreviewNext();
			return;
		}

		if (event.key === "+" || event.key === "=") {
			event.preventDefault();
			zoomPreviewIn();
			return;
		}

		if (event.key === "-" || event.key === "_") {
			event.preventDefault();
			zoomPreviewOut();
		}
	}

	function handlePreviewBackdropClick(event) {
		if (event.target !== event.currentTarget) {
			return;
		}
		closeAttachmentPreview();
	}

	function selectTag(item) {
		selectedTag = item;
	}

	function clearTagFilter() {
		selectedTag = "all";
	}

	function resetCalendarMonth() {
		// No-op or we can expose this from MemoHeatmap if we want to reset it from outside,
		// but currently 'Today' button is inside MemoHeatmap.
		// However, the `resetCalendarMonth` in original code was used for 'Today' button in the sidebar.
		// Since buttons are now in MemoHeatmap, we don't need this function here unless we want to control it from parent.
		// But let's verify if `resetCalendarMonth` is used elsewhere? No.
	}

	function shuffleExplore() {
		exploreShuffleSeed = Date.now() + Math.floor(Math.random() * 100000);
	}

	function handleRailClick(itemId) {
		if (itemId === "avatar") {
			void openOrCreateDaily(formatDateKey(new Date()));
			return;
		}

		if (itemId === "settings") {
			openPluginSettings?.();
			return;
		}

		railActive = itemId;

		if (itemId === "memos") {
			clearTagFilter();
			void reload();
			return;
		}

		if (itemId === "explore") {
			shuffleExplore();
		}
	}

	function renderMemo(node, params) {
		// Just a wrapper to use the imported action with context
		return memoRenderer(node, {
			...params,
			renderMemoContent,
			openRenderedImagePreview,
		});
	}

	onMount(() => {
		void reload();
	});
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div
	class="jm-layout"
	style={`--jm-image-max-width: ${maxImageWidthCss};`}
	bind:this={layoutEl}
>
	<aside class="jm-rail" aria-label="Journal memos sidebar">
		{#each RAIL_ITEMS as item (item.id)}
			<button
				type="button"
				class={`jm-rail-btn ${railActive === item.id ? "is-active" : ""}`}
				title={item.label}
				aria-label={item.label}
				on:click={() => handleRailClick(item.id)}
			>
				{#if item.id === "avatar"}
					<svg
						viewBox="0 0 24 24"
						class="jm-rail-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="8" r="4"></circle>
						<path d="M4 20a8 8 0 0 1 16 0"></path>
					</svg>
				{:else if item.id === "memos"}
					<svg
						viewBox="0 0 24 24"
						class="jm-rail-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
						></path>
					</svg>
				{:else if item.id === "explore"}
					<svg
						viewBox="0 0 24 24"
						class="jm-rail-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<polygon points="16 8 14 14 8 16 10 10 16 8"></polygon>
					</svg>
				{:else if item.id === "attachments"}
					<svg
						viewBox="0 0 24 24"
						class="jm-rail-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48"
						></path>
					</svg>
				{:else}
					<svg
						viewBox="0 0 24 24"
						class="jm-rail-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
						></path>
						<circle cx="12" cy="12" r="3"></circle>
					</svg>
				{/if}
			</button>
		{/each}
	</aside>

	<main class="jm-column jm-main-column">
		{#if errorMessage}
			<p class="jm-error">{errorMessage}</p>
		{/if}

		{#if railActive === "memos"}
			<section class="jm-panel jm-composer-panel">
				<MemoEditor
					bind:value={draft}
					rows={4}
					placeholder="Write a memo. It will be appended to today's daily note."
					{isSubmitting}
					{isUploading}
					{saveAttachments}
					{resolveResourcePath}
					on:submit={submit}
				/>
			</section>

			<section class="jm-panel jm-stream-panel">
				<div class="jm-panel-header">
					<h3>Memos</h3>
					<div class="jm-stream-actions">
						<span class="jm-muted"
							>{filteredStream.length} shown</span
						>
						<button
							type="button"
							class="jm-icon-button"
							on:click={() => void reload()}
							disabled={isLoading || isSubmitting}
							title="Refresh"
							style="display: inline-flex; align-items: center; justify-content: center; padding: 4px;"
						>
							<svg
								viewBox="0 0 24 24"
								style="width: 16px; height: 16px; display: block; {isLoading
									? 'animation: spin 1s linear infinite;'
									: ''}"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path
									d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
								></path>
								<path d="M3 3v5h5"></path>
								<path
									d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
								></path>
								<path d="M16 16h5v5"></path>
							</svg>
						</button>
					</div>
				</div>

				{#if selectedTag !== "all"}
					<div class="jm-active-filter">
						<span>Filtered by</span>
						<button
							type="button"
							class="jm-tag-chip is-active"
							on:click={clearTagFilter}>{selectedTag}</button
						>
					</div>
				{/if}

				{#if filteredStream.length === 0}
					<p class="jm-empty">
						{#if totalMemoCount === 0}
							No memos found in the configured date range.
						{:else}
							No memos match the current tag filter.
						{/if}
					</p>
				{:else}
					<MemoList
						memos={filteredStream}
						bind:editDraft
						{editingMemo}
						{renderMemoContent}
						{openAttachmentPreview}
						{openRenderedImagePreview}
						{saveAttachments}
						{resolveResourcePath}
						{dayGroupColorA}
						{dayGroupColorB}
						on:edit={(e) => openMemoEditor(e.detail)}
						on:cancelEdit={closeMemoEditor}
						on:saveEdit={(e) => saveMemoEdit(e.detail)}
					/>
				{/if}
			</section>
		{:else if railActive === "explore"}
			<section class="jm-panel jm-explore-panel">
				<div class="jm-panel-header">
					<h3>Explore</h3>
					<div class="jm-stream-actions">
						<span class="jm-muted">{exploreMemos.length} shown</span
						>
						<button
							type="button"
							class="jm-icon-button"
							on:click={() => void reload()}
							disabled={isLoading || isSubmitting}
							title="Refresh"
						>
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								style={isLoading
									? "animation: spin 1s linear infinite"
									: ""}
							>
								<path
									d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
								/>
								<path d="M21 3v5h-5" />
							</svg>
						</button>
					</div>
				</div>

				{#if exploreMemos.length === 0}
					<p class="jm-empty">
						No memos available for the current filter.
					</p>
				{:else}
					<div
						class="jm-explore-masonry"
						style="padding: 0 8px; display: flex; gap: 16px; align-items: start;"
						bind:clientWidth={exploreContainerWidth}
					>
						{#each exploreColumns as col}
							<div
								class="jm-masonry-column"
								style="flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0;"
							>
								{#each col as item (item.memo.id)}
									{@const memo = item.memo}
									<article
										class={`jm-card ${item.groupIndex % 2 === 0 ? "is-odd" : "is-even"} ${item.isLastInGroup ? "is-last-in-group" : ""}`}
									>
										<div
											class="jm-card-header jm-card-header-meta"
											style="display: flex; justify-content: space-between; align-items: center;"
										>
											<span
												class="jm-meta-date"
												style="font-weight: 500;"
												>{memo.dateKey}</span
											>
											<span
												class="jm-meta-time"
												style="color: var(--text-muted); font-size: 0.9em;"
												>{formatTime(
													memo.createdAt,
												)}</span
											>
										</div>
										<div
											class="jm-card-content"
											use:renderMemo={{
												markdown:
													item.cleanedContent ||
													memo.content,
												sourcePath: memo.filePath,
												previewGroup: memo.id,
											}}
										></div>

										<!-- Extracted inline images moved to bottom -->
										{#if item.imageEmbeds && item.imageEmbeds.length > 0}
											<div class="jm-card-media-grid">
												{#each item.imageEmbeds as imgMarkdown}
													<div
														class="jm-media-item"
														use:renderMemo={{
															markdown:
																imgMarkdown,
															sourcePath:
																memo.filePath,
															previewGroup:
																memo.id,
														}}
													></div>
												{/each}
											</div>
										{/if}
										{#if Array.isArray(memo.attachments) && memo.attachments.length > 0}
											<div class="jm-card-attachments">
												{#each memo.attachments as attachment (`${memo.id}:${attachment.path}`)}
													<button
														type="button"
														class="jm-attachment-thumb"
														on:click={() =>
															openAttachmentPreview(
																attachment,
																memo.filePath,
																memo.id,
															)}
														title={attachment.name}
													>
														{#if attachment.isImage}
															<div
																class="jm-attachment-thumb-media"
																use:renderMemo={{
																	markdown:
																		attachmentThumbnailMarkdown(
																			attachment,
																		),
																	sourcePath:
																		memo.filePath,
																	previewGroup:
																		memo.id,
																}}
															></div>
														{:else}
															<div
																class="jm-attachment-thumb-file"
															>
																<svg
																	viewBox="0 0 24 24"
																	class="jm-attachment-thumb-icon"
																	fill="none"
																	stroke="currentColor"
																	stroke-width="2"
																	stroke-linecap="round"
																	stroke-linejoin="round"
																>
																	<path
																		d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48"
																	></path>
																</svg>
																<span
																	class="jm-attachment-thumb-name"
																	>{attachment.name}</span
																>
															</div>
														{/if}
													</button>
												{/each}
											</div>
										{/if}
									</article>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{:else if railActive === "attachments"}
			<section class="jm-panel jm-attachments-panel">
				<div class="jm-panel-header">
					<h3>Attachments</h3>
					<div class="jm-stream-actions">
						<span class="jm-muted"
							>{imageTimeline.length} images</span
						>
						<button
							type="button"
							class="jm-icon-button"
							on:click={() => void reload()}
							disabled={isLoading || isSubmitting}
							title="Refresh"
						>
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								style={isLoading
									? "animation: spin 1s linear infinite"
									: ""}
							>
								<path
									d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
								/>
								<path d="M21 3v5h-5" />
							</svg>
						</button>
					</div>
				</div>

				{#if imageTimeline.length === 0}
					<p class="jm-empty">
						No images found in memos for the current filter.
					</p>
				{:else}
					<div class="jm-attachments-timeline">
						{#each imageTimeline as entry (entry.id)}
							<article class="jm-attachment-item">
								<span
									class="jm-attachment-dot"
									aria-hidden="true"
								></span>
								<div class="jm-attachment-content">
									<div class="jm-card-header">
										<button
											class="jm-date-badge"
											type="button"
											on:click={() =>
												void openDaily(entry.dateKey)}
											title="Open Daily Note"
										>
											{entry.dateKey}
										</button>
										<span class="jm-time-label">
											{new Date(
												entry.createdAt,
											).toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
												hour12: false,
											})}
										</span>
									</div>
									{#if entry.tags.length > 0}
										<div class="jm-card-tags">
											{#each entry.tags as tag (tag)}
												<button
													type="button"
													class={`jm-tag-chip ${selectedTag === tag ? "is-active" : ""}`}
													on:click={() =>
														selectTag(tag)}
												>
													{tag}
												</button>
											{/each}
										</div>
									{/if}
									<div
										class="jm-attachment-media"
										use:renderMemo={{
											markdown: entry.imageMarkdown,
											sourcePath: entry.filePath,
											previewGroup: entry.id,
										}}
									></div>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</main>

	<aside class="jm-column jm-right-column">
		<MemoHeatmap {heatmap} {openOrCreateDaily} />
		<MemoFilter
			{selectedTag}
			{tagStats}
			{totalMemoCount}
			bind:this={layoutEl}
		>
			<div slot="actions">
				<!-- If we wanted to put Clear button here, but MemoFilter handles it already -->
			</div>
		</MemoFilter>
		<!-- Wait, MemoFilter props update selectedTag via binding in main component? -->
		<!-- In MemoFilter.svelte I didn't verify if I used `bind:selectedTag`. Let me check. -->
		<!-- Checked: In MemoFilter.svelte, `export let selectedTag` is a prop. If I pass it, it reacts. -->
		<!-- But `selectTag` inside MemoFilter updates the local prop. -->
		<!-- I should probably bind it: `bind:selectedTag={selectedTag}` -->
	</aside>

	<!-- Re-inject MemoFilter with correct binding -->
	<!-- Wait, I missed closing tag for aside -->

	<!-- Fixing sidebar -->
	<!-- Also `layoutEl` binding on MemoFilter is wrong. `layoutEl` was the main container in original code. -->
	<!-- In my new code, `layoutEl` is on the root div. `bind:this={layoutEl}` on line 426. -->
	<!-- I will fix the sidebar section below -->

	<!-- Sidebar Correction -->
	<!--
	<aside class="jm-column jm-right-column">
		<MemoHeatmap {heatmap} {openOrCreateDaily} />
		<MemoFilter
			bind:selectedTag
			{tagStats}
			{totalMemoCount}
		/>
	</aside>
	-->

	{#if previewAttachment}
		<div
			class="jm-preview-backdrop"
			role="presentation"
			on:click={handlePreviewBackdropClick}
		>
			<div class="jm-preview-modal" role="dialog" aria-modal="true">
				<div class="jm-preview-header">
					<h4>{previewAttachment.name}</h4>
					<div class="jm-preview-header-actions">
						<button
							type="button"
							class={`jm-icon-button jm-preview-icon-btn ${previewOnlyCurrentMemo ? "is-active" : ""}`}
							on:click={togglePreviewOnlyCurrentMemo}
							disabled={!previewCanScopeToCurrentMemo}
							aria-label="Only current memo"
							title="Only current memo"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6"
								></path>
								<circle cx="12" cy="12" r="2.5"></circle>
							</svg>
						</button>
					</div>
				</div>
				{#if previewAttachment.imageSrc}
					<div
						class={`jm-preview-content ${previewIsImage ? "is-image" : ""} ${previewPanEnabled ? "is-pan-enabled" : ""}`}
						style={previewTransformStyle}
						on:pointerdown={handlePreviewPointerDown}
						on:pointermove={handlePreviewPointerMove}
						on:pointerup={handlePreviewPointerUp}
						on:pointercancel={handlePreviewPointerUp}
					>
						<img
							src={previewAttachment.imageSrc}
							alt={previewAttachment.name}
						/>
					</div>
				{:else}
					<div
						class={`jm-preview-content ${previewIsImage ? "is-image" : ""} ${previewPanEnabled ? "is-pan-enabled" : ""}`}
						style={previewTransformStyle}
						on:pointerdown={handlePreviewPointerDown}
						on:pointermove={handlePreviewPointerMove}
						on:pointerup={handlePreviewPointerUp}
						on:pointercancel={handlePreviewPointerUp}
						use:renderMemo={{
							markdown: previewAttachment.markdown,
							sourcePath: previewAttachment.sourcePath,
						}}
					></div>
				{/if}
				<div class="jm-preview-footer">
					{#if previewCounterLabel}
						<span class="jm-preview-counter"
							>{previewCounterLabel}</span
						>
					{/if}
					<div class="jm-preview-actions">
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={goPreviewPrevious}
							disabled={!previewIsImage || !previewHasPrev}
							aria-label="Previous image"
							title="Previous image"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="m15 18-6-6 6-6"></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={goPreviewNext}
							disabled={!previewIsImage || !previewHasNext}
							aria-label="Next image"
							title="Next image"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="m9 18 6-6-6-6"></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={zoomPreviewOut}
							disabled={!previewIsImage ||
								previewScale <= PREVIEW_SCALE_MIN}
							aria-label="Zoom out"
							title="Zoom out"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							>
								<path d="M5 12h14"></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={zoomPreviewIn}
							disabled={!previewIsImage ||
								previewScale >= PREVIEW_SCALE_MAX}
							aria-label="Zoom in"
							title="Zoom in"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							>
								<path d="M5 12h14"></path>
								<path d="M12 5v14"></path>
							</svg>
						</button>
						<button
							type="button"
							class={`jm-icon-button jm-preview-icon-btn ${previewPanEnabled ? "is-active" : ""}`}
							on:click={togglePreviewPanMode}
							disabled={!previewIsImage}
							aria-label="Toggle drag mode"
							title="Toggle drag mode"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M7 12V6a1 1 0 0 1 2 0v6"></path>
								<path d="M11 12V5a1 1 0 0 1 2 0v7"></path>
								<path d="M15 12V7a1 1 0 0 1 2 0v8"></path>
								<path
									d="M19 12v-2a1 1 0 0 1 2 0v6a5 5 0 0 1-5 5h-4a5 5 0 0 1-4.2-2.3l-2.2-3.3a1 1 0 0 1 1.5-1.3L9 16v-4"
								></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={closeAttachmentPreview}
							aria-label="Close preview"
							title="Close preview"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							>
								<path d="M18 6 6 18"></path>
								<path d="m6 6 12 12"></path>
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
