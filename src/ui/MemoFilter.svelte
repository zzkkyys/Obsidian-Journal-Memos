<script>
	export let selectedTag = "all";
	export let tagStats = [];
	export let totalMemoCount = 0;

	function selectTag(tag) {
		selectedTag = tag;
	}

	function clearTagFilter() {
		selectedTag = "all";
	}
</script>

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
