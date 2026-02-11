<script>
	import MemoTagTree from "./MemoTagTree.svelte";

	export let selectedTag = "all";
	export let tagStats = [];
	export let totalMemoCount = 0;

	let viewMode = "flat"; // 'flat' | 'tree'
	let tagTree = [];

	$: if (viewMode === "tree" && tagStats) {
		tagTree = buildTree(tagStats);
	}

	function selectTag(tag) {
		selectedTag = tag;
	}

	function clearTagFilter() {
		selectedTag = "all";
	}

	function toggleViewMode() {
		viewMode = viewMode === "flat" ? "tree" : "flat";
	}

	function buildTree(stats) {
		const root = [];
		// Tag stats are typically sorted by count desc in stats

		for (const { tag, count } of stats) {
			const parts = tag.split("/");
			let currentLevel = root;
			let currentPath = "";

			parts.forEach((part, index) => {
				currentPath = currentPath ? `${currentPath}/${part}` : part;
				let node = currentLevel.find((n) => n.name === part);

				if (!node) {
					node = {
						name: part,
						fullPath: currentPath,
						count: undefined,
						children: [],
						expanded: false, // Default collapsed to "收纳"
						isTag: false,
					};
					currentLevel.push(node);
				}

				if (index === parts.length - 1) {
					node.count = count;
					node.isTag = true;
				}

				currentLevel = node.children;
			});
		}

		// Helper to sort tree: by count (desc), then name (asc)
		function sortNodes(nodes) {
			nodes.sort((a, b) => a.name.localeCompare(b.name));
			nodes.forEach((n) => sortNodes(n.children));
		}

		sortNodes(root);
		return root;
	}
</script>

<section class="jm-panel">
	<div class="jm-panel-header">
		<h3>Tags</h3>
		<div
			class="jm-panel-controls"
			style="display: flex; align-items: center; gap: 8px;"
		>
			{#if selectedTag !== "all"}
				<button
					type="button"
					class="jm-icon-button"
					on:click={clearTagFilter}
					title="Clear filter"
					style="width: 24px; height: 24px; padding: 4px;"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path>
						<line x1="2" y1="2" x2="22" y2="22"></line>
					</svg>
				</button>
			{/if}
			<button
				type="button"
				class="jm-icon-button"
				on:click={toggleViewMode}
				title={viewMode === "flat"
					? "Switch to Tree View"
					: "Switch to List View"}
				style="width: 24px; height: 24px; padding: 4px;"
			>
				{#if viewMode === "flat"}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="8" y1="6" x2="21" y2="6"></line>
						<line x1="8" y1="12" x2="21" y2="12"></line>
						<line x1="8" y1="18" x2="21" y2="18"></line>
						<line x1="3" y1="6" x2="3.01" y2="6"></line>
						<line x1="3" y1="12" x2="3.01" y2="12"></line>
						<line x1="3" y1="18" x2="3.01" y2="18"></line>
					</svg>
				{:else}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="7" height="7"></rect>
						<rect x="14" y="3" width="7" height="7"></rect>
						<rect x="14" y="14" width="7" height="7"></rect>
						<rect x="3" y="14" width="7" height="7"></rect>
					</svg>
				{/if}
			</button>
		</div>
	</div>

	<div class="jm-tag-container">
		{#if viewMode === "flat"}
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
					<p class="jm-empty">No tags found.</p>
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
		{:else}
			<div class="jm-tag-tree-wrapper">
				<div
					class="jm-tag-tree-item jm-tag-tree-all"
					role="button"
					tabindex="0"
					on:click={() => selectTag("all")}
					on:keydown={(e) => e.key === "Enter" && selectTag("all")}
				>
					<div
						class="jm-tag-tree-row {selectedTag === 'all'
							? 'is-active'
							: ''}"
					>
						<span class="jm-tree-label">All</span>
						<span class="jm-tag-count">{totalMemoCount}</span>
					</div>
				</div>
				<MemoTagTree
					nodes={tagTree}
					{selectedTag}
					on:select={(e) => selectTag(e.detail)}
				/>
			</div>
		{/if}
	</div>
</section>
