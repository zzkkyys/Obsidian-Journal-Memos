<script>
	import { createEventDispatcher } from "svelte";
	import { slide } from "svelte/transition";

	export let nodes = [];
	export let selectedTag = "";

	const dispatch = createEventDispatcher();

	function toggleExpand(node, e) {
		// Prevent triggering select
		e.stopPropagation();
		node.expanded = !node.expanded;
		nodes = nodes; // Trigger reactivity
	}

	function handleSelect(node) {
		// If it's a virtual folder (not a real tag), we might still want to select it
		// if we implement hierarchical search. For now, just dispatch.
		// Or maybe toggle expand if it's just a folder?
		// Let's dispatch anyway, parent component handles logic.
		dispatch("select", node.fullPath);

		// Auto expand/collapse on click? Maybe not.
	}

	function forwardSelect(event) {
		dispatch("select", event.detail);
	}
</script>

<div class="jm-tag-tree">
	{#each nodes as node (node.fullPath)}
		<div class="jm-tag-tree-item">
			<div
				class="jm-tag-tree-row {selectedTag === node.fullPath
					? 'is-active'
					: ''}"
				on:click={() => handleSelect(node)}
				on:keydown={(e) => e.key === "Enter" && handleSelect(node)}
				role="button"
				tabindex="0"
			>
				<button
					type="button"
					class="jm-tree-expander {node.children.length
						? ''
						: 'is-hidden'} {node.expanded ? 'is-expanded' : ''}"
					on:click|stopPropagation={(e) => toggleExpand(node, e)}
					aria-label={node.expanded ? "Collapse" : "Expand"}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</button>

				<span class="jm-tree-label">{node.name}</span>

				{#if node.count !== undefined}
					<span class="jm-tag-count">{node.count}</span>
				{/if}
			</div>

			{#if node.expanded && node.children.length > 0}
				<div
					class="jm-tree-children"
					transition:slide|local={{ duration: 200 }}
				>
					<svelte:self
						nodes={node.children}
						{selectedTag}
						on:select={forwardSelect}
					/>
				</div>
			{/if}
		</div>
	{/each}
</div>
