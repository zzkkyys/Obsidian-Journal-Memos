<script>
	export let heatmap = [];

	const HEAT_THRESHOLDS = [1, 3, 6, 10];
	const WEEKS = 17; // ~4 months of weeks
	const DAYS_PER_WEEK = 7;
	const WEEKDAY_LABELS = ["M", "", "W", "", "F", "", ""];

	$: heatmapByDate = new Map(heatmap.map((c) => [c.dateKey, c]));
	$: grid = buildGrid(heatmapByDate);
	$: totalInRange = grid.flat().reduce((sum, c) => sum + c.count, 0);

	function toDateKey(d) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	}

	function buildGrid(cellMap) {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Go back to the most recent Monday
		const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
		const endMonday = new Date(today);
		endMonday.setDate(today.getDate() - dayOfWeek);

		// Start from WEEKS-1 weeks before that Monday
		const startDate = new Date(endMonday);
		startDate.setDate(startDate.getDate() - (WEEKS - 1) * 7);

		const weeks = [];
		const cursor = new Date(startDate);
		for (let w = 0; w < WEEKS; w++) {
			const week = [];
			for (let d = 0; d < DAYS_PER_WEEK; d++) {
				const key = toDateKey(cursor);
				const cell = cellMap.get(key);
				const isFuture = cursor > today;
				week.push({
					dateKey: key,
					count: cell?.count ?? 0,
					isFuture,
				});
				cursor.setDate(cursor.getDate() + 1);
			}
			weeks.push(week);
		}
		return weeks;
	}

	function heatLevel(count) {
		if (count < HEAT_THRESHOLDS[0]) return 0;
		if (count < HEAT_THRESHOLDS[1]) return 1;
		if (count < HEAT_THRESHOLDS[2]) return 2;
		if (count < HEAT_THRESHOLDS[3]) return 3;
		return 4;
	}
</script>

<section class="jm-panel jm-heatstrip-panel">
	<div class="jm-heatstrip-header">
		<span class="jm-heatstrip-title">{totalInRange} memos in {WEEKS} weeks</span>
	</div>
	<div class="jm-heatstrip-body">
		<div class="jm-heatstrip-labels">
			{#each WEEKDAY_LABELS as label}
				<span class="jm-heatstrip-label">{label}</span>
			{/each}
		</div>
		<div class="jm-heatstrip-grid">
			{#each grid as week, wi}
				<div class="jm-heatstrip-col">
					{#each week as cell}
						<div
							class="jm-heatstrip-cell jm-heatstrip-heat-{cell.isFuture ? 'future' : heatLevel(cell.count)}"
							title="{cell.dateKey}: {cell.count} memo{cell.count === 1 ? '' : 's'}"
						></div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</section>
