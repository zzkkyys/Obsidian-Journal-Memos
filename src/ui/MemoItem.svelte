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

	function attachmentThumbnailMarkdown(attachment) {
		if (!attachment?.path || !attachment.isImage) {
			return "";
		}
		return `![[${attachment.path}]]`;
	}
</script>

<article class="jm-card">
	<div class="jm-card-header">
		<span>{memo.createdLabel}</span>
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
				<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
			</svg>
		</button>
	</div>

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
