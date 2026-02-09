<script>
	import { createEventDispatcher, onMount } from "svelte";
	import MemoInputBox from "./MemoInputBox.svelte";
	import {
		splitDraftAndAttachmentPaths,
		renderAttachmentBlock,
	} from "../utils/editor-utils";

	export let value = ""; // The full markdown draft
	export let placeholder = "";
	export let rows = 4;
	export let disabled = false;
	export let saveAttachments; // async (files) => Attachment[]
	export let showCancel = false;
	export let submitLabel = "Publish";
	export let className = "";

	export let resolveResourcePath; // (path) => string
	const dispatch = createEventDispatcher();
	const IMAGE_FILE_EXT_REGEX =
		/\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;

	// ... (existing imports)

	let attachmentInputEl;
	let isUploading = false;
	let errorMessage = "";
	let textBody = "";
	let currentAttachments = []; // Array<{ path: string, isImage: boolean, name: string }>
	let skipNextSync = false;

	function parseValueIntoState(val) {
		const { body, attachmentPaths } = splitDraftAndAttachmentPaths(val);
		textBody = body;
		currentAttachments = attachmentPaths.map((path) => ({
			path,
			name: fileNameFromPath(path),
			isImage: IMAGE_FILE_EXT_REGEX.test(path),
		}));
		console.log("[MemoEditor] Parsed value:", {
			body,
			attachmentPaths,
			currentAttachments,
		});
	}

	function fileNameFromPath(path) {
		const normalized = String(path ?? "").replace(/\\/g, "/");
		const segments = normalized.split("/");
		return segments.length > 0 ? segments[segments.length - 1] : normalized;
	}

	function combineToValue() {
		const paths = currentAttachments.map((a) => a.path);
		const block = paths.length > 0 ? renderAttachmentBlock(paths) : "";
		const cleanBody = textBody.trim();
		if (cleanBody && block) {
			return `${cleanBody}\n\n${block}`;
		}
		return cleanBody || block;
	}

	// Parse initial value on mount
	onMount(() => {
		parseValueIntoState(value);
	});

	// Track the last value we set ourselves to avoid re-parsing our own output
	let lastSyncedValue = "";

	// When value changes from outside (e.g., switching memos), re-parse
	$: {
		if (value !== lastSyncedValue) {
			// This is an external change, parse the new value
			parseValueIntoState(value);
			lastSyncedValue = value;
		}
	}

	// When textBody or currentAttachments change, update value
	function syncValueToParent() {
		const newValue = combineToValue();
		if (newValue !== value) {
			lastSyncedValue = newValue;
			value = newValue;
		}
	}

	// Use afterUpdate pattern to sync after state changes settle
	$: if (textBody !== undefined || currentAttachments.length >= 0) {
		// Only sync if we're not in the middle of parsing
		if (!skipNextSync) {
			syncValueToParent();
		}
		skipNextSync = false;
	}

	async function handleSubmit() {
		if (disabled || isUploading || !value.trim()) {
			return;
		}
		dispatch("submit");
	}

	function handleCancel() {
		dispatch("cancel");
	}

	function triggerAttachmentPicker() {
		attachmentInputEl?.click();
	}

	async function addAttachments(files) {
		const validFiles = Array.from(files ?? []).filter(
			(file) => file instanceof File && file.size > 0,
		);
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

			// Append new attachments to list
			const newAttachments = uploaded.map((att) => ({
				path: att.path,
				name: att.name,
				isImage: att.isImage,
			}));

			currentAttachments = [...currentAttachments, ...newAttachments];
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "Failed to upload attachments.";
			console.error(error);
		} finally {
			isUploading = false;
		}
	}

	function removeAttachment(index) {
		const next = [...currentAttachments];
		next.splice(index, 1);
		currentAttachments = next;
	}

	function handleAttachmentInput(event) {
		const inputEl = event.currentTarget;
		if (!(inputEl instanceof HTMLInputElement) || !inputEl.files) {
			return;
		}
		void addAttachments(inputEl.files);
		inputEl.value = "";
	}

	function handlePaste(event) {
		const items = Array.from(event.clipboardData?.items ?? []);
		const imageFiles = [];
		for (const item of items) {
			if (item.kind === "file" && item.type.startsWith("image/")) {
				const file = item.getAsFile();
				if (file) imageFiles.push(file);
			}
		}

		if (imageFiles.length > 0) {
			event.preventDefault();
			void addAttachments(imageFiles);
		}
	}

	function handleKeydown(event) {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSubmit();
			return;
		}

		if (event.key === "Escape" && showCancel) {
			event.preventDefault();
			handleCancel();
		}
	}
</script>

<div class={`jm-memo-editor ${className}`.trim()}>
	{#if errorMessage}
		<div class="jm-error">{errorMessage}</div>
	{/if}

	<input
		class="jm-attachment-input"
		type="file"
		multiple
		bind:this={attachmentInputEl}
		on:change={handleAttachmentInput}
		style="display: none;"
	/>

	<MemoInputBox
		bind:value={textBody}
		{rows}
		{placeholder}
		{disabled}
		onKeydown={handleKeydown}
		onPaste={handlePaste}
	>
		<svelte:fragment slot="actions">
			<button
				type="button"
				class="jm-secondary-btn"
				on:click={triggerAttachmentPicker}
				disabled={disabled || isUploading}
				title="Attach files"
			>
				<svg
					viewBox="0 0 24 24"
					style="width: 16px; height: 16px;"
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
			</button>
			{#if showCancel}
				<button
					type="button"
					class="jm-secondary-btn"
					on:click={handleCancel}
					disabled={disabled || isUploading}
				>
					Cancel
				</button>
			{/if}
			<button
				type="button"
				class="jm-primary-btn"
				on:click={handleSubmit}
				disabled={disabled ||
					isUploading ||
					(!textBody.trim() && currentAttachments.length === 0)}
				title={submitLabel}
				style="padding: 6px 10px;"
			>
				{#if isUploading}
					<svg
						viewBox="0 0 24 24"
						style="width: 16px; height: 16px; animation: spin 1s linear infinite;"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
					</svg>
				{:else}
					<svg
						viewBox="0 0 24 24"
						style="width: 16px; height: 16px;"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m22 2-7 20-4-9-9-4Z"></path>
						<path d="M22 2 11 13"></path>
					</svg>
				{/if}
			</button>
		</svelte:fragment>
	</MemoInputBox>

	<!-- Visual Attachment Manager -->
	{#if currentAttachments.length > 0}
		<div
			class="jm-editor-attachments"
			style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px;"
		>
			{#each currentAttachments as att, index}
				<div
					class="jm-editor-attachment-item"
					style="position: relative; width: 64px; height: 64px; max-width: 64px; max-height: 64px; border-radius: 6px; overflow: hidden; background: var(--background-secondary); border: 1px solid var(--background-modifier-border);"
				>
					{#if att.isImage}
						<img
							src={resolveResourcePath
								? resolveResourcePath(att.path)
								: att.path}
							alt={att.name}
							class="jm-editor-attachment-thumb"
							style="width: 64px; height: 64px; max-width: 64px; max-height: 64px; object-fit: cover; display: block;"
						/>
					{:else}
						<div
							class="jm-editor-attachment-file"
							style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted);"
						>
							<svg
								viewBox="0 0 24 24"
								style="width: 24px; height: 24px;"
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
						</div>
					{/if}
					<button
						type="button"
						class="jm-editor-attachment-remove"
						on:click={() => removeAttachment(index)}
						title="Remove attachment"
						style="position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; padding: 2px; background: rgba(0,0,0,0.6); color: white; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;"
					>
						<svg
							viewBox="0 0 24 24"
							style="width: 12px; height: 12px;"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.jm-editor-attachments {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
	}
	.jm-editor-attachment-item {
		position: relative;
		width: 64px !important;
		height: 64px !important;
		min-width: 64px !important;
		min-height: 64px !important;
		max-width: 64px !important;
		max-height: 64px !important;
		border-radius: 6px;
		overflow: hidden;
		background-color: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		flex-shrink: 0;
	}
	.jm-editor-attachment-thumb {
		width: 64px !important;
		height: 64px !important;
		max-width: 64px !important;
		max-height: 64px !important;
		object-fit: cover;
		display: block;
	}
	.jm-editor-attachment-file {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
	}
	.jm-editor-attachment-remove {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 16px;
		height: 16px;
		padding: 2px;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		border-radius: 50%;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.jm-editor-attachment-remove:hover {
		background: rgba(0, 0, 0, 0.8);
	}
	.jm-icon {
		width: 16px;
		height: 16px;
	}
</style>
