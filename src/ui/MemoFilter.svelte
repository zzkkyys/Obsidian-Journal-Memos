<script>
	import { slide } from "svelte/transition";
	import MemoTagTree from "./MemoTagTree.svelte";
	import { tagBgStyle } from "../utils/tag-color";

	export let selectedTag = "all";
	export let tagStats = [];
	export let totalMemoCount = 0;

	let viewMode = "flat"; // 'flat' | 'tree'
	let tagTree = [];
	let expandedGroups = new Set();

	$: if (viewMode === "tree" && tagStats) {
		tagTree = buildTree(tagStats);
	}

	// Group tagStats by top-level segment for the flat view.
	// Order is preserved from tagStats (sorted by count desc).
	$: flatGroups = buildFlatGroups(tagStats);

	// Auto-expand a group when one of its sub-tags becomes selected.
	$: {
		for (const g of flatGroups) {
			if (g.subs.some((s) => s.tag === selectedTag)) {
				expandedGroups.add(g.key);
				expandedGroups = expandedGroups;
			}
		}
	}

	function buildFlatGroups(stats) {
		const map = new Map(); // key -> { root, subs }
		const order = [];
		for (const item of stats) {
			const bare = item.tag.startsWith("#")
				? item.tag.slice(1)
				: item.tag;
			const topKey = "#" + bare.split("/")[0];
			if (!map.has(topKey)) {
				map.set(topKey, { root: null, subs: [] });
				order.push(topKey);
			}
			if (bare.includes("/")) {
				map.get(topKey).subs.push(item);
			} else {
				map.get(topKey).root = item;
			}
		}
		return order.map((k) => ({ key: k, ...map.get(k) }));
	}

	function toggleGroup(key) {
		if (expandedGroups.has(key)) {
			expandedGroups.delete(key);
		} else {
			expandedGroups.add(key);
		}
		expandedGroups = expandedGroups;
	}

	function selectTag(tag) {
		selectedTag = selectedTag === tag ? "all" : tag;
	}

	function clearTagFilter() {
		selectedTag = "all";
	}

	function toggleViewMode() {
		viewMode = viewMode === "flat" ? "tree" : "flat";
	}

	function buildTree(stats) {
		const root = [];

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
						expanded: false,
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
					{#each flatGroups as group (group.key)}
						{#if group.root}
							<!-- Root tag pill with optional inline chevron -->
							<button
								type="button"
								class={`jm-tag-filter ${selectedTag === group.root.tag ? "is-active" : ""}`}
								style={tagBgStyle(group.root.tag, selectedTag === group.root.tag)}
								on:click={() => selectTag(group.root.tag)}
							>
								<span>{group.root.tag}</span>
								<span class="jm-tag-count">{group.root.count}</span>
								{#if group.subs.length > 0}
									<span
										class="jm-tag-chevron"
										class:is-open={expandedGroups.has(group.key)}
										on:click|stopPropagation={() => toggleGroup(group.key)}
										on:keydown|stopPropagation={(e) => e.key === "Enter" && toggleGroup(group.key)}
										role="button"
										tabindex="-1"
										title={expandedGroups.has(group.key) ? "收起子标签" : "展开子标签"}
									>
										<svg
											viewBox="0 0 24 24"
											width="10"
											height="10"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="9 18 15 12 9 6"></polyline>
										</svg>
									</span>
								{/if}
							</button>

							<!-- Sub-tags: slide in/out -->
							{#if group.subs.length > 0 && expandedGroups.has(group.key)}
								<div
									class="jm-subtag-list"
									transition:slide={{ duration: 180 }}
								>
									{#each group.subs as sub (sub.tag)}
										<button
											type="button"
											class={`jm-tag-filter jm-tag-filter--sub ${selectedTag === sub.tag ? "is-active" : ""}`}
											style={tagBgStyle(sub.tag, selectedTag === sub.tag)}
											on:click={() => selectTag(sub.tag)}
										>
											<span>{sub.tag}</span>
											<span class="jm-tag-count">{sub.count}</span>
										</button>
									{/each}
								</div>
							{/if}
						{:else}
							<!-- Sub-tags with no root tag: show as regular items -->
							{#each group.subs as sub (sub.tag)}
								<button
									type="button"
									class={`jm-tag-filter ${selectedTag === sub.tag ? "is-active" : ""}`}
									style={tagBgStyle(sub.tag, selectedTag === sub.tag)}
									on:click={() => selectTag(sub.tag)}
								>
									<span>{sub.tag}</span>
									<span class="jm-tag-count">{sub.count}</span>
								</button>
							{/each}
						{/if}
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

<style>
	/* Inline chevron inside the tag pill */
	.jm-tag-chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: 3px;
		opacity: 0.6;
		cursor: pointer;
		transition: opacity 0.15s;
		vertical-align: middle;
	}
	.jm-tag-chevron:hover {
		opacity: 1;
	}
	.jm-tag-chevron svg {
		width: 10px;
		height: 10px;
		transition: transform 0.18s ease;
	}
	.jm-tag-chevron.is-open svg {
		transform: rotate(90deg);
	}

	/* Sub-tag list: indented, slightly smaller */
	.jm-subtag-list {
		display: flex;
		flex-direction: column;
		padding-left: 10px;
		overflow: hidden;
	}
	.jm-tag-filter--sub {
		font-size: 0.9em;
		opacity: 0.9;
	}
</style>
