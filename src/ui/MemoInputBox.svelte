<script>
	import { onMount, onDestroy } from "svelte";

	export let value = "";
	export let rows = 4;
	export let placeholder = "";
	export let disabled = false;
	export let className = "";
	export let onKeydown;
	export let onPaste;

	let textareaEl;

	// Obsidian intercepts Ctrl+Enter at the window level before it reaches
	// the textarea. Use a capture-phase listener on window to catch it first.
	function captureCtrlEnter(e) {
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && e.target === textareaEl) {
			e.stopImmediatePropagation();
			e.preventDefault();
			onKeydown?.(e);
		}
	}

	onMount(() => {
		window.addEventListener("keydown", captureCtrlEnter, { capture: true });
	});

	onDestroy(() => {
		window.removeEventListener("keydown", captureCtrlEnter, { capture: true });
	});
</script>

<div class={`jm-input-shell ${className}`.trim()}>
	<textarea
		bind:this={textareaEl}
		class="jm-input jm-input-elevated jm-input-with-actions"
		{rows}
		{placeholder}
		{disabled}
		bind:value
		on:keydown={onKeydown}
		on:paste={onPaste}
	></textarea>
	<div class="jm-input-actions">
		<slot name="actions"></slot>
	</div>
</div>
