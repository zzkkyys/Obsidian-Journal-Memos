<script>
	import { onMount } from "svelte";
	import MemoInputBox from "./MemoInputBox.svelte";

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

	const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const RAIL_ITEMS = [
		{ id: "avatar", label: "Avatar" },
		{ id: "memos", label: "Memos" },
		{ id: "explore", label: "Explore" },
		{ id: "attachments", label: "Attachments" },
		{ id: "settings", label: "Settings" },
	];
	const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;
	const WIKI_IMAGE_REGEX = /!\[\[([^[\]\n]+)\]\]/g;
	const MARKDOWN_IMAGE_REGEX = /!\[[^\]\n]*\]\((?:\\.|[^()\n]|\([^()\n]*\))*\)/g;
	const HTML_IMAGE_REGEX = /<img\b[^>]*>/gi;
	const MAX_EXPLORE_MEMOS = 12;
	const PREVIEW_SCALE_MIN = 0.5;
	const PREVIEW_SCALE_MAX = 4;
	const PREVIEW_SCALE_STEP = 0.2;
	const CALENDAR_HEAT_THRESHOLDS = [1, 3, 6, 10];
	const ATTACHMENT_BLOCK_START = "<!-- jm-attachments:start -->";
	const ATTACHMENT_BLOCK_END = "<!-- jm-attachments:end -->";
	const ATTACHMENT_LINE_PREFIX = "jm-attachment:";
	const monthFormatter = new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "long",
	});

	let draft = "";
	let isSubmitting = false;
	let isUploading = false;
	let isLoading = false;
	let errorMessage = "";
	let selectedTag = "all";
	let monthCursor = firstDayOfMonth(new Date());
	let railActive = "memos";
	let exploreShuffleSeed = Date.now();
	let layoutEl;
	let attachmentInputEl;
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

	$: heatmapByDate = new Map(heatmap.map((cell) => [cell.dateKey, cell]));
	$: monthCells = buildMonthCells(monthCursor, heatmapByDate);
	$: monthTitle = monthFormatter.format(monthCursor);
	$: tagStats = buildTagStats(stream);
	$: totalMemoCount = stream.length;
	$: maxImageWidthCss = `${Math.max(120, Number(memoImageMaxWidth) || 640)}px`;
	$: previewAttachment = previewIndex >= 0 && previewIndex < previewGallery.length ? previewGallery[previewIndex] : null;
	$: previewHasPrev = previewIndex > 0;
	$: previewHasNext = previewIndex >= 0 && previewIndex < previewGallery.length - 1;
	$: previewIsImage = Boolean(previewAttachment?.isImage);
	$: previewCanScopeToCurrentMemo = previewIsImage && Boolean(previewCurrentGroup);
	$: previewCounterLabel = previewGallery.length > 1 && previewIndex >= 0 ? `${previewIndex + 1} / ${previewGallery.length}` : "";
	$: previewTransformStyle = `--jm-preview-scale: ${previewScale}; --jm-preview-offset-x: ${previewOffsetX}px; --jm-preview-offset-y: ${previewOffsetY}px;`;
	$: filteredStream =
		selectedTag === "all" ? stream : stream.filter((memo) => Array.isArray(memo.tags) && memo.tags.includes(selectedTag));
	$: exploreMemos = buildExploreMemos(filteredStream, exploreShuffleSeed, MAX_EXPLORE_MEMOS);
	$: imageTimeline = buildImageTimeline(filteredStream);
	$: if (selectedTag !== "all" && !tagStats.some((item) => item.tag === selectedTag)) {
		selectedTag = "all";
	}

	function firstDayOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}

	function addDays(date, days) {
		const next = new Date(date);
		next.setDate(next.getDate() + days);
		return next;
	}

	function addMonths(date, months) {
		return new Date(date.getFullYear(), date.getMonth() + months, 1);
	}

	function startOfWeek(date) {
		const dayOffset = (date.getDay() + 6) % 7;
		return addDays(date, -dayOffset);
	}

	function endOfWeek(date) {
		return addDays(startOfWeek(date), 6);
	}

	function toDateKey(date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function buildMonthCells(monthStart, cellMap) {
		const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
		const calendarStart = startOfWeek(monthStart);
		const calendarEnd = endOfWeek(monthEnd);
		const todayKey = toDateKey(new Date());
		const cells = [];

		for (let cursor = new Date(calendarStart); cursor <= calendarEnd; cursor = addDays(cursor, 1)) {
			const dateKey = toDateKey(cursor);
			const source = cellMap.get(dateKey);
			cells.push({
				dateKey,
				day: cursor.getDate(),
				inMonth: cursor.getMonth() === monthStart.getMonth(),
				isToday: dateKey === todayKey,
				count: source?.count ?? 0,
				filePath: source?.filePath ?? null,
			});
		}

		return cells;
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
			.sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
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

		return memos
			.map((memo) => ({
				memo,
				sortKey: hashWithSeed(memo.id, seed),
			}))
			.sort((left, right) => left.sortKey - right.sortKey || right.memo.createdAt - left.memo.createdAt)
			.slice(0, Math.max(1, Math.min(limit, memos.length)))
			.map((item) => item.memo);
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
			.sort((left, right) => left.index - right.index || left.order - right.order)
			.map((item) => item.raw);
	}

	function buildImageTimeline(memos) {
		if (!Array.isArray(memos) || memos.length === 0) {
			return [];
		}

		const orderedMemos = [...memos].sort((left, right) => right.createdAt - left.createdAt);
		const timeline = [];

		for (const memo of orderedMemos) {
			const imageEmbeds = extractImageEmbeds(memo.content);
			const attachmentImageEmbeds = Array.isArray(memo.attachments)
				? memo.attachments.filter((attachment) => attachment?.isImage).map((attachment) => `![[${attachment.path}]]`)
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

	function calendarTitle(cell) {
		return `${cell.dateKey} · ${cell.count} memo${cell.count === 1 ? "" : "s"}`;
	}

	function calendarHeatLevel(count) {
		const safeCount = Number(count) || 0;
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[0]) {
			return 0;
		}
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[1]) {
			return 1;
		}
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[2]) {
			return 2;
		}
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[3]) {
			return 3;
		}
		return 4;
	}

	async function reload() {
		isLoading = true;
		errorMessage = "";
		try {
			const snapshot = await refreshData();
			stream = snapshot.stream;
			heatmap = snapshot.heatmap;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Failed to load memos.";
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
			await reload();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Failed to publish memo.";
		} finally {
			isSubmitting = false;
		}
	}

	function openMemoEditor(memo) {
		if (isSavingEdit) {
			return;
		}
		editingMemo = memo ?? null;
		editDraft = editingMemo?.content ?? "";
		errorMessage = "";
	}

	function findMemoById(memoId) {
		if (!memoId) {
			return null;
		}
		return (
			filteredStream.find((memo) => memo?.id === memoId) ??
			stream.find((memo) => memo?.id === memoId) ??
			null
		);
	}

	function handleStreamPanelClick(event) {
		const target = event?.target;
		if (!(target instanceof Element)) {
			return;
		}

		const trigger = target.closest("button[data-memo-id]");
		if (!(trigger instanceof HTMLButtonElement)) {
			return;
		}

		const memoId = trigger.dataset.memoId ?? "";
		const memo = findMemoById(memoId);
		if (!memo) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		openMemoEditor(memo);
	}

	function delegateMemoEditTrigger(node) {
		const delegatedClick = (event) => handleStreamPanelClick(event);
		node.addEventListener("click", delegatedClick, true);
		return {
			destroy() {
				node.removeEventListener("click", delegatedClick, true);
			},
		};
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

	async function saveMemoEdit() {
		if (!editingMemo || !updateMemo) {
			return;
		}

		const normalized = editDraft.trim();
		if (!normalized && (!Array.isArray(editingMemo.attachments) || editingMemo.attachments.length === 0)) {
			errorMessage = "Memo content cannot be empty.";
			return;
		}

		isSavingEdit = true;
		errorMessage = "";
		try {
			await updateMemo(editingMemo, editDraft);
			editingMemo = null;
			editDraft = "";
			await reload();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Failed to update memo.";
		} finally {
			isSavingEdit = false;
		}
	}

	function handleEditInputKeydown(event) {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void saveMemoEdit();
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			closeMemoEditor();
		}
	}

	function appendTextToMemoDraft(currentText, text) {
		const normalized = String(text ?? "").trim();
		if (!normalized) {
			return currentText;
		}

		const { body, attachmentPaths } = splitDraftAndAttachmentPaths(currentText);
		const nextBody = body ? `${body}\n${normalized}` : normalized;
		if (attachmentPaths.length === 0) {
			return nextBody;
		}

		const block = renderAttachmentBlock(attachmentPaths);
		return `${nextBody}\n\n${block}`;
	}

	function parseAttachmentPathsFromBlock(blockContent) {
		const paths = [];
		const lines = String(blockContent ?? "").split(/\r?\n/);
		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (!line.startsWith(ATTACHMENT_LINE_PREFIX)) {
				continue;
			}
			const path = line.slice(ATTACHMENT_LINE_PREFIX.length).trim();
			if (!path) {
				continue;
			}
			paths.push(path);
		}
		return paths;
	}

	function splitDraftAndAttachmentPaths(draftText) {
		const normalized = String(draftText ?? "").replace(/\r\n/g, "\n");
		const blockRegex = /<!--\s*jm-attachments:start\s*-->\s*([\s\S]*?)\s*<!--\s*jm-attachments:end\s*-->\s*$/;
		const match = blockRegex.exec(normalized);
		if (!match) {
			return {
				body: normalized.trimEnd(),
				attachmentPaths: [],
			};
		}

		const body = normalized.slice(0, match.index).trimEnd();
		const attachmentPaths = parseAttachmentPathsFromBlock(match[1] ?? "");
		return { body, attachmentPaths };
	}

	function upsertAttachmentPathsToMemoDraft(currentText, pathList) {
		if (!Array.isArray(pathList) || pathList.length === 0) {
			return currentText;
		}

		const { body, attachmentPaths } = splitDraftAndAttachmentPaths(currentText);
		const seen = new Set(attachmentPaths);
		const mergedPaths = [...attachmentPaths];
		for (const path of pathList) {
			if (!path || seen.has(path)) {
				continue;
			}
			seen.add(path);
			mergedPaths.push(path);
		}

		const block = renderAttachmentBlock(mergedPaths);
		return body ? `${body}\n\n${block}` : block;
	}

	function renderAttachmentBlock(paths) {
		return [ATTACHMENT_BLOCK_START, ...paths.map((path) => `${ATTACHMENT_LINE_PREFIX} ${path}`), ATTACHMENT_BLOCK_END].join(
			"\n",
		);
	}

	function buildInlineImageMarkdown(path) {
		return `![[${path}]]`;
	}

	function applyUploadedAttachmentsToDraft(currentText, uploaded, mode) {
		let nextText = currentText;
		if (mode === "paste") {
			for (const attachment of uploaded) {
				if (attachment.isImage) {
					nextText = appendTextToMemoDraft(nextText, buildInlineImageMarkdown(attachment.path));
					continue;
				}
				nextText = upsertAttachmentPathsToMemoDraft(nextText, [attachment.path]);
			}
			return nextText;
		}

		return upsertAttachmentPathsToMemoDraft(
			nextText,
			uploaded.map((attachment) => attachment.path),
		);
	}

	async function addAttachments(files, mode = "attach", target = "composer") {
		const validFiles = Array.from(files ?? []).filter((file) => file instanceof File && file.size > 0);
		if (validFiles.length === 0) {
			return;
		}

		if (!saveAttachments) {
			errorMessage = "Attachment upload is not available.";
			return;
		}

		isUploading = true;
		errorMessage = "";
		try {
			const payload = await Promise.all(
				validFiles.map(async (file) => ({
					name: file.name,
					mimeType: file.type ?? "",
					data: await file.arrayBuffer(),
				})),
			);
			const uploaded = await saveAttachments(payload);
			if (target === "editor") {
				editDraft = applyUploadedAttachmentsToDraft(editDraft, uploaded, mode);
				return;
			}
			draft = applyUploadedAttachmentsToDraft(draft, uploaded, mode);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Failed to upload attachments.";
		} finally {
			isUploading = false;
		}
	}

	function handleInputKeydown(event) {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void submit();
		}
	}

	function triggerAttachmentPicker() {
		attachmentInputEl?.click();
	}

	function handleAttachmentInput(event) {
		const inputEl = event.currentTarget;
		if (!(inputEl instanceof HTMLInputElement) || !inputEl.files) {
			return;
		}

		void addAttachments(inputEl.files, "attach", "composer");
		inputEl.value = "";
	}

	function extractImageFilesFromClipboard(event) {
		const clipboardItems = Array.from(event.clipboardData?.items ?? []);
		const imageFiles = [];
		for (const item of clipboardItems) {
			if (item.kind !== "file") {
				continue;
			}
			const file = item.getAsFile();
			if (!file || !file.type.startsWith("image/")) {
				continue;
			}
			imageFiles.push(file);
		}
		return imageFiles;
	}

	function handleComposerPaste(event) {
		const imageFiles = extractImageFilesFromClipboard(event);
		if (imageFiles.length === 0) {
			return;
		}

		event.preventDefault();
		void addAttachments(imageFiles, "paste", "composer");
	}

	function handleEditPaste(event) {
		if (!editingMemo) {
			return;
		}

		const imageFiles = extractImageFilesFromClipboard(event);
		if (imageFiles.length === 0) {
			return;
		}

		event.preventDefault();
		void addAttachments(imageFiles, "paste", "editor");
	}

	function fileNameFromPath(path) {
		const normalized = String(path ?? "").replace(/\\/g, "/");
		const segments = normalized.split("/");
		return segments.length > 0 ? segments[segments.length - 1] || normalized : normalized;
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

	function createPreviewItemFromAttachment(attachment, sourcePath, previewGroup = "") {
		if (!attachment?.path) {
			return null;
		}

		const normalizedSourcePath = sourcePath ?? "";
		const normalizedPath = String(attachment.path).trim();
		const isImage = Boolean(attachment.isImage);
		return {
			key: isImage ? `internal:${normalizedPath}` : `file:${normalizedPath}`,
			name: attachment.name ?? fileNameFromPath(normalizedPath),
			markdown: isImage ? `![[${normalizedPath}]]` : `[[${normalizedPath}]]`,
			imageSrc: "",
			sourcePath: normalizedSourcePath,
			groupKey: previewGroup ?? "",
			isImage,
		};
	}

	function createPreviewItemFromImageElement(imageEl, fallbackSourcePath = "") {
		const sourceContainer = imageEl.closest("[data-source-path]");
		const sourcePath =
			sourceContainer instanceof HTMLElement
				? sourceContainer.dataset.sourcePath ?? fallbackSourcePath
				: fallbackSourcePath;
		const groupKey = sourceContainer instanceof HTMLElement ? sourceContainer.dataset.previewGroup ?? "" : "";
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

		const fallbackName = String(imageEl.getAttribute("alt") ?? "").trim() || fileNameFromPath(imageSrc);
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

	function collectPreviewGallery(fallbackSourcePath = "", restrictGroup = "") {
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
			const previewItem = createPreviewItemFromImageElement(node, fallbackSourcePath);
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
		const targetItem = createPreviewItemFromAttachment(attachment, sourcePath, previewGroup);
		if (!targetItem) {
			return;
		}

		if (!targetItem.isImage) {
			openPreviewGallery([targetItem], 0, { currentGroup: previewGroup, resetOnlyCurrentMemo: true });
			return;
		}

		const gallery = collectPreviewGallery(sourcePath ?? "");
		const startIndex = findPreviewItemIndex(gallery, targetItem);
		if (startIndex >= 0) {
			openPreviewGallery(gallery, startIndex, { currentGroup: previewGroup, resetOnlyCurrentMemo: true });
			return;
		}

		openPreviewGallery([targetItem], 0, { currentGroup: previewGroup, resetOnlyCurrentMemo: true });
	}

	function openRenderedImagePreview(imageEl, sourcePath, previewGroup = "") {
		const targetItem = createPreviewItemFromImageElement(imageEl, sourcePath ?? "");
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
		const finalGallery = nextGallery.length > 0 ? nextGallery : [currentItem];
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
		previewScale = Math.min(PREVIEW_SCALE_MAX, Number((previewScale + PREVIEW_SCALE_STEP).toFixed(2)));
	}

	function zoomPreviewOut() {
		if (!previewIsImage) {
			return;
		}
		previewScale = Math.max(PREVIEW_SCALE_MIN, Number((previewScale - PREVIEW_SCALE_STEP).toFixed(2)));
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
		if (previewDragPointerId === null || event.pointerId !== previewDragPointerId) {
			return;
		}

		previewOffsetX = previewDragOriginX + (event.clientX - previewDragStartX);
		previewOffsetY = previewDragOriginY + (event.clientY - previewDragStartY);
	}

	function handlePreviewPointerUp(event) {
		if (previewDragPointerId === null || event.pointerId !== previewDragPointerId) {
			return;
		}

		const currentTarget = event.currentTarget;
		if (currentTarget instanceof HTMLElement && currentTarget.hasPointerCapture(event.pointerId)) {
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

	function selectTag(tag) {
		selectedTag = tag;
	}

	function clearTagFilter() {
		selectedTag = "all";
	}

	function openCalendarCell(cell) {
		if (!cell.inMonth) {
			return;
		}
		void openOrCreateDaily(cell.dateKey);
	}

	function shiftCalendarMonth(step) {
		monthCursor = addMonths(monthCursor, step);
	}

	function resetCalendarMonth() {
		monthCursor = firstDayOfMonth(new Date());
	}

	function shuffleExplore() {
		exploreShuffleSeed = Date.now() + Math.floor(Math.random() * 100000);
	}

	function handleRailClick(itemId) {
		if (itemId === "avatar") {
			void openOrCreateDaily(toDateKey(new Date()));
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
		let renderVersion = 0;
		let currentSourcePath = params?.sourcePath ?? "";
		let currentPreviewGroup = params?.previewGroup ?? "";

		function handleImageClick(event) {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}

			const imageEl = target.closest("img");
			if (!(imageEl instanceof HTMLImageElement) || !node.contains(imageEl)) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			openRenderedImagePreview(imageEl, currentSourcePath, currentPreviewGroup);
		}

		async function run(currentParams) {
			const currentVersion = ++renderVersion;
			node.replaceChildren();

			const markdown = (currentParams?.markdown ?? "").trim();
			const sourcePath = currentParams?.sourcePath ?? "";
			const previewGroup = currentParams?.previewGroup ?? "";
			currentSourcePath = sourcePath;
			currentPreviewGroup = previewGroup;
			node.dataset.sourcePath = sourcePath;
			node.dataset.previewGroup = previewGroup;
			if (!markdown) {
				return;
			}

			try {
				await renderMemoContent?.(node, markdown, sourcePath);
			} catch {
				if (currentVersion !== renderVersion) {
					return;
				}
				const fallbackEl = document.createElement("p");
				fallbackEl.textContent = markdown;
				node.replaceChildren(fallbackEl);
			}
		}

		node.addEventListener("click", handleImageClick);
		void run(params);

			return {
				update(nextParams) {
					currentSourcePath = nextParams?.sourcePath ?? "";
					currentPreviewGroup = nextParams?.previewGroup ?? "";
					void run(nextParams);
				},
			destroy() {
				renderVersion += 1;
				node.removeEventListener("click", handleImageClick);
				node.replaceChildren();
			},
		};
	}

	onMount(() => {
		void reload();
	});
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="jm-layout" style={`--jm-image-max-width: ${maxImageWidthCss};`} bind:this={layoutEl}>
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
					<svg viewBox="0 0 24 24" class="jm-rail-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="8" r="4"></circle>
						<path d="M4 20a8 8 0 0 1 16 0"></path>
					</svg>
				{:else if item.id === "memos"}
					<svg viewBox="0 0 24 24" class="jm-rail-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
					</svg>
				{:else if item.id === "explore"}
					<svg viewBox="0 0 24 24" class="jm-rail-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"></circle>
						<polygon points="16 8 14 14 8 16 10 10 16 8"></polygon>
					</svg>
				{:else if item.id === "attachments"}
					<svg viewBox="0 0 24 24" class="jm-rail-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48"></path>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" class="jm-rail-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path>
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
				<input
					class="jm-attachment-input"
					type="file"
					multiple
					bind:this={attachmentInputEl}
					on:change={handleAttachmentInput}
				/>
				<MemoInputBox
					bind:value={draft}
					rows={4}
					onKeydown={handleInputKeydown}
					onPaste={handleComposerPaste}
					placeholder="Write a memo. It will be appended to today's daily note."
				>
					<svelte:fragment slot="actions">
						<button
							type="button"
							class="jm-secondary-btn"
							on:click={triggerAttachmentPicker}
							disabled={isSubmitting || isUploading}
						>
							Attach
						</button>
						<button
							type="button"
							class="jm-primary-btn"
							on:click={submit}
							disabled={isSubmitting || isUploading || !draft.trim()}
						>
							{#if isSubmitting}
								Publishing...
							{:else if isUploading}
								Uploading...
							{:else}
								Publish
							{/if}
						</button>
					</svelte:fragment>
				</MemoInputBox>
			</section>

				<section class="jm-panel jm-stream-panel" use:delegateMemoEditTrigger>
				<div class="jm-panel-header">
					<h3>Memos</h3>
					<div class="jm-stream-actions">
						<span class="jm-muted">{filteredStream.length} shown</span>
						<button type="button" class="jm-link" on:click={() => void reload()} disabled={isLoading || isSubmitting}>
							{isLoading ? "Loading..." : "Refresh"}
						</button>
					</div>
				</div>

				{#if selectedTag !== "all"}
					<div class="jm-active-filter">
						<span>Filtered by</span>
						<button type="button" class="jm-tag-chip is-active" on:click={clearTagFilter}>{selectedTag}</button>
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
					{#each filteredStream as memo (memo.id)}
						<article class="jm-card">
							<div class="jm-card-header">
								<span>{memo.createdLabel}</span>
									<button
										type="button"
										class={`jm-icon-button jm-memo-edit-btn ${isEditingMemo(memo) ? "is-active" : ""}`}
										data-memo-id={memo.id}
										aria-label="Edit memo"
										title="Edit memo"
										on:click|preventDefault|stopPropagation={() => openMemoEditor(memo)}
										on:mousedown|preventDefault|stopPropagation={() => openMemoEditor(memo)}
									>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M12 20h9"></path>
										<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
									</svg>
								</button>
							</div>
							<div
								class="jm-card-content"
								use:renderMemo={{ markdown: memo.content, sourcePath: memo.filePath, previewGroup: memo.id }}
							></div>
							{#if Array.isArray(memo.attachments) && memo.attachments.length > 0}
								<div class="jm-card-attachments">
									{#each memo.attachments as attachment (`${memo.id}:${attachment.path}`)}
										<button
											type="button"
											class="jm-attachment-thumb"
											on:click={() => openAttachmentPreview(attachment, memo.filePath, memo.id)}
											title={attachment.name}
										>
											{#if attachment.isImage}
												<div
													class="jm-attachment-thumb-media"
													use:renderMemo={{
														markdown: attachmentThumbnailMarkdown(attachment),
														sourcePath: memo.filePath,
														previewGroup: memo.id
													}}
												></div>
											{:else}
												<div class="jm-attachment-thumb-file">
													<svg viewBox="0 0 24 24" class="jm-attachment-thumb-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
														<path d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48"></path>
													</svg>
													<span class="jm-attachment-thumb-name">{attachment.name}</span>
												</div>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
								{#if isEditingMemo(memo)}
									<div class="jm-edit-inline" role="region" aria-label="Edit memo">
										<div class="jm-edit-inline-header">
											<span>Edit memo</span>
												<button
													type="button"
												class="jm-icon-button jm-memo-edit-btn"
												aria-label="Close editor"
												title="Close editor"
												on:click|preventDefault|stopPropagation={closeMemoEditor}
											>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
												<path d="M18 6 6 18"></path>
												<path d="m6 6 12 12"></path>
											</svg>
										</button>
									</div>
									<MemoInputBox
										className="jm-edit-input-shell"
										bind:value={editDraft}
										rows={10}
										disabled={isSavingEdit}
										onKeydown={handleEditInputKeydown}
										onPaste={handleEditPaste}
										placeholder="Update memo content"
									>
										<svelte:fragment slot="actions">
												<button type="button" class="jm-secondary-btn" on:click|preventDefault|stopPropagation={closeMemoEditor}>Cancel</button>
											<button
												type="button"
												class="jm-primary-btn"
												on:click={() => void saveMemoEdit()}
												disabled={isSavingEdit}
											>
												{isSavingEdit ? "Saving..." : "Save"}
												</button>
											</svelte:fragment>
										</MemoInputBox>
									</div>
								{/if}
						</article>
					{/each}
				{/if}
			</section>
		{:else if railActive === "explore"}
			<section class="jm-panel jm-explore-panel">
				<div class="jm-panel-header">
					<h3>Explore</h3>
					<div class="jm-stream-actions">
						<span class="jm-muted">{exploreMemos.length} random</span>
						<button type="button" class="jm-link" on:click={shuffleExplore}>Shuffle</button>
						<button type="button" class="jm-link" on:click={() => void reload()} disabled={isLoading || isSubmitting}>
							{isLoading ? "Loading..." : "Refresh"}
						</button>
					</div>
				</div>

				{#if exploreMemos.length === 0}
					<p class="jm-empty">No memos available for the current filter.</p>
				{:else}
					<div class="jm-explore-grid">
						{#each exploreMemos as memo (memo.id)}
							<article class="jm-card">
								<div class="jm-card-header jm-card-header-meta">
									<span>{memo.createdLabel}</span>
								</div>
								<div
									class="jm-card-content"
									use:renderMemo={{ markdown: memo.content, sourcePath: memo.filePath, previewGroup: memo.id }}
								></div>
								{#if Array.isArray(memo.attachments) && memo.attachments.length > 0}
									<div class="jm-card-attachments">
										{#each memo.attachments as attachment (`${memo.id}:${attachment.path}`)}
											<button
												type="button"
												class="jm-attachment-thumb"
												on:click={() => openAttachmentPreview(attachment, memo.filePath, memo.id)}
												title={attachment.name}
											>
												{#if attachment.isImage}
													<div
														class="jm-attachment-thumb-media"
														use:renderMemo={{
															markdown: attachmentThumbnailMarkdown(attachment),
															sourcePath: memo.filePath,
															previewGroup: memo.id
														}}
													></div>
												{:else}
													<div class="jm-attachment-thumb-file">
														<svg viewBox="0 0 24 24" class="jm-attachment-thumb-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
															<path d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48"></path>
														</svg>
														<span class="jm-attachment-thumb-name">{attachment.name}</span>
													</div>
												{/if}
											</button>
										{/each}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{:else if railActive === "attachments"}
			<section class="jm-panel jm-attachments-panel">
				<div class="jm-panel-header">
					<h3>Attachments</h3>
					<div class="jm-stream-actions">
						<span class="jm-muted">{imageTimeline.length} images</span>
						<button type="button" class="jm-link" on:click={() => void reload()} disabled={isLoading || isSubmitting}>
							{isLoading ? "Loading..." : "Refresh"}
						</button>
					</div>
				</div>

				{#if imageTimeline.length === 0}
					<p class="jm-empty">No images found in memos for the current filter.</p>
				{:else}
					<div class="jm-attachments-timeline">
						{#each imageTimeline as entry (entry.id)}
							<article class="jm-attachment-item">
								<span class="jm-attachment-dot" aria-hidden="true"></span>
								<div class="jm-attachment-content">
									<div class="jm-card-header">
										<button class="jm-link" type="button" on:click={() => void openDaily(entry.dateKey)}>
											{entry.dateKey}
										</button>
										<span>{entry.createdLabel}</span>
									</div>
									{#if entry.tags.length > 0}
										<div class="jm-card-tags">
											{#each entry.tags as tag (tag)}
												<button
													type="button"
													class={`jm-tag-chip ${selectedTag === tag ? "is-active" : ""}`}
													on:click={() => selectTag(tag)}
												>
													{tag}
												</button>
											{/each}
										</div>
									{/if}
									<div
										class="jm-attachment-media"
										use:renderMemo={{ markdown: entry.imageMarkdown, sourcePath: entry.filePath, previewGroup: entry.id }}
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
		<section class="jm-panel">
			<div class="jm-panel-header">
				<h3>Mini calendar</h3>
				<div class="jm-calendar-actions">
					<button type="button" class="jm-link" on:click={resetCalendarMonth}>Today</button>
					<button type="button" class="jm-icon-button" aria-label="Previous month" on:click={() => shiftCalendarMonth(-1)}>
						‹
					</button>
					<button type="button" class="jm-icon-button" aria-label="Next month" on:click={() => shiftCalendarMonth(1)}>
						›
					</button>
				</div>
			</div>
			<div class="jm-calendar-title">{monthTitle}</div>
			<div class="jm-calendar-weekdays">
				{#each WEEKDAY_LABELS as dayLabel}
					<span>{dayLabel.slice(0, 2)}</span>
				{/each}
			</div>
			<div class="jm-calendar-grid">
				{#each monthCells as cell (cell.dateKey)}
					<button
						type="button"
						class={`jm-calendar-day jm-calendar-heat-${calendarHeatLevel(cell.count)} ${cell.inMonth ? "" : "is-outside"} ${cell.isToday ? "is-today" : ""}`}
						title={calendarTitle(cell)}
						disabled={!cell.inMonth}
						on:click={() => openCalendarCell(cell)}
					>
						<span>{cell.day}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="jm-panel">
			<div class="jm-panel-header">
				<h3>Tags</h3>
				{#if selectedTag !== "all"}
					<button type="button" class="jm-link" on:click={clearTagFilter}>Clear</button>
				{/if}
			</div>
			<div class="jm-tag-list">
				<button
					type="button"
					class={`jm-tag-filter ${selectedTag === "all" ? "is-active" : ""}`}
					on:click={() => selectTag("all")}
				>
					<span>All</span>
					<span class="jm-tag-count">{totalMemoCount}</span>
				</button>
				{#if tagStats.length === 0}
					<p class="jm-empty">No tags found in current stream window.</p>
				{:else}
					{#each tagStats as item (item.tag)}
						<button
							type="button"
							class={`jm-tag-filter ${selectedTag === item.tag ? "is-active" : ""}`}
							on:click={() => selectTag(item.tag)}
						>
							<span>{item.tag}</span>
							<span class="jm-tag-count">{item.count}</span>
						</button>
					{/each}
				{/if}
			</div>
		</section>
	</aside>

	{#if previewAttachment}
		<div class="jm-preview-backdrop" role="presentation" on:click={handlePreviewBackdropClick}>
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
							title="只看当前 memos"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6"></path>
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
						<img src={previewAttachment.imageSrc} alt={previewAttachment.name} />
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
							sourcePath: previewAttachment.sourcePath
						}}
					></div>
				{/if}
					<div class="jm-preview-footer">
						{#if previewCounterLabel}
							<span class="jm-preview-counter">{previewCounterLabel}</span>
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
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="m9 18 6-6-6-6"></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={zoomPreviewOut}
							disabled={!previewIsImage || previewScale <= PREVIEW_SCALE_MIN}
							aria-label="Zoom out"
							title="Zoom out"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
								<path d="M5 12h14"></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={zoomPreviewIn}
							disabled={!previewIsImage || previewScale >= PREVIEW_SCALE_MAX}
							aria-label="Zoom in"
							title="Zoom in"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
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
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M7 12V6a1 1 0 0 1 2 0v6"></path>
								<path d="M11 12V5a1 1 0 0 1 2 0v7"></path>
								<path d="M15 12V7a1 1 0 0 1 2 0v8"></path>
								<path d="M19 12v-2a1 1 0 0 1 2 0v6a5 5 0 0 1-5 5h-4a5 5 0 0 1-4.2-2.3l-2.2-3.3a1 1 0 0 1 1.5-1.3L9 16v-4"></path>
							</svg>
						</button>
						<button
							type="button"
							class="jm-icon-button jm-preview-icon-btn"
							on:click={closeAttachmentPreview}
							aria-label="Close preview"
							title="Close preview"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
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
