<script>
	import { createEventDispatcher } from "svelte";
	import MemoEditor from "./MemoEditor.svelte";
	import { memoRenderer } from "./memo-renderer";

	export let memo;
	export let isEditing = false;
	export let editDraft = "";
	export let renderMemoContent; // (el, markdown, sourcePath) => Promise<void>
	export let openAttachmentPreview; // (attachment, sourcePath, previewGroup) => void
	export let openRenderedImagePreview; // (imageEl, sourcePath, previewGroup) => void
	export let saveAttachments; // (files) => Promise<Attachment[]>
	export let resolveResourcePath; // (path) => string
	export let searchQuery = "";

	const dispatch = createEventDispatcher();

	function handleEditClick() {
		dispatch("edit", memo);
	}

	function handleCancelEdit() {
		dispatch("cancelEdit");
	}

	function handleSaveEdit() {
		dispatch("saveEdit");
	}

	let confirmDeleteVisible = false;

	function handleDeleteClick() {
		confirmDeleteVisible = true;
	}

	function confirmDelete() {
		confirmDeleteVisible = false;
		dispatch("delete", memo);
	}

	function cancelDelete() {
		confirmDeleteVisible = false;
	}

	function attachmentThumbnailMarkdown(attachment) {
		if (!attachment?.path || !attachment.isImage) {
			return "";
		}
		return `![[${attachment.path}]]`;
	}

	// Search highlight action: highlights matching text in rendered memo content
	function highlightSearch(node, query) {
		let currentQuery = query;

		function applyHighlight() {
			// Remove previous highlights
			const existingMarks = node.querySelectorAll(
				"mark.jm-search-highlight",
			);
			for (const mark of existingMarks) {
				const parent = mark.parentNode;
				parent.replaceChild(
					document.createTextNode(mark.textContent || ""),
					mark,
				);
				parent.normalize();
			}

			const q = (currentQuery || "").trim().toLowerCase();
			if (!q) return;

			highlightTextNodes(node, q);
		}

		function highlightTextNodes(root, query) {
			const walker = document.createTreeWalker(
				root,
				NodeFilter.SHOW_TEXT,
				null,
			);
			const matches = [];
			let textNode;
			while ((textNode = walker.nextNode())) {
				// Skip nodes inside <mark>, <code>, <pre>, <img>, <svg>
				const parent = textNode.parentElement;
				if (parent && /^(MARK|CODE|PRE|IMG|SVG)$/i.test(parent.tagName))
					continue;

				const text = textNode.textContent || "";
				const lower = text.toLowerCase();
				const idx = lower.indexOf(query);
				if (idx >= 0) {
					matches.push({
						node: textNode,
						index: idx,
						length: query.length,
					});
				}
			}

			// Apply in reverse so indices don't shift
			for (let i = matches.length - 1; i >= 0; i--) {
				const { node: tNode, index, length } = matches[i];
				const before = tNode.textContent.slice(0, index);
				const match = tNode.textContent.slice(index, index + length);
				const after = tNode.textContent.slice(index + length);

				const frag = document.createDocumentFragment();
				if (before) frag.appendChild(document.createTextNode(before));
				const mark = document.createElement("mark");
				mark.className = "jm-search-highlight";
				mark.textContent = match;
				frag.appendChild(mark);
				if (after) frag.appendChild(document.createTextNode(after));
				tNode.parentNode.replaceChild(frag, tNode);
			}
		}

		// Wait a tick for memoRenderer to finish, then highlight
		const timer = setTimeout(applyHighlight, 100);

		return {
			update(newQuery) {
				currentQuery = newQuery;
				// Debounce: wait for content to re-render
				setTimeout(applyHighlight, 100);
			},
			destroy() {
				clearTimeout(timer);
			},
		};
	}
</script>

<article class="jm-card">
	<div class="jm-card-header">
		<span>{memo.createdLabel}</span>
		<div class="jm-card-actions">
			<button
				type="button"
				class={`jm-icon-button jm-memo-edit-btn ${isEditing ? "is-active" : ""}`}
				aria-label="Edit memo"
				title="Edit memo"
				on:click|preventDefault|stopPropagation={handleEditClick}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 20h9"></path>
					<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
					></path>
				</svg>
			</button>
			<button
				type="button"
				class="jm-icon-button jm-memo-delete-btn"
				aria-label="Delete memo"
				title="Delete memo"
				on:click|preventDefault|stopPropagation={handleDeleteClick}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 6h18"></path>
					<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
					<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
				</svg>
			</button>
		</div>
	</div>

	{#if confirmDeleteVisible}
		<div class="jm-confirm-delete">
			<span>Delete this memo?</span>
			<button
				type="button"
				class="jm-confirm-btn jm-confirm-yes"
				on:click={confirmDelete}>Delete</button
			>
			<button
				type="button"
				class="jm-confirm-btn jm-confirm-no"
				on:click={cancelDelete}>Cancel</button
			>
		</div>
	{/if}

	{#if isEditing}
		<!-- Edit Mode -->
		<div class="jm-edit-inline" role="region" aria-label="Edit memo">
			<MemoEditor
				className="jm-edit-input-shell"
				bind:value={editDraft}
				rows={10}
				showCancel={true}
				submitLabel="Save"
				{saveAttachments}
				{resolveResourcePath}
				on:cancel={handleCancelEdit}
				on:submit={handleSaveEdit}
			/>
		</div>
	{:else}
		<!-- Preview Mode -->
		<div
			class="jm-card-content"
			use:memoRenderer={{
				markdown: memo.content,
				sourcePath: memo.filePath,
				previewGroup: memo.id,
				renderMemoContent,
				openRenderedImagePreview,
			}}
			use:highlightSearch={searchQuery}
		></div>
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
								use:memoRenderer={{
									markdown:
										attachmentThumbnailMarkdown(attachment),
									sourcePath: memo.filePath,
									previewGroup: memo.id,
									renderMemoContent,
									openRenderedImagePreview,
								}}
							></div>
						{:else}
							<div class="jm-attachment-thumb-file">
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
								<span class="jm-attachment-thumb-name"
									>{attachment.name}</span
								>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</article>
