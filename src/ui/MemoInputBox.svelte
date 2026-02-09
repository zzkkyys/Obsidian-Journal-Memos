<script>
	export let value = "";
	export let rows = 4;
	export let placeholder = "";
	export let disabled = false;
	export let className = "";
	export let onKeydown;
	export let onPaste;
</script>

<div class={`jm-input-shell ${className}`.trim()}>
	<textarea
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
