<script>
	export let heatmap = [];
	export let openOrCreateDaily;

	const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const CALENDAR_HEAT_THRESHOLDS = [1, 3, 6, 10];
	const monthFormatter = new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "long",
	});

	let monthCursor = firstDayOfMonth(new Date());

	$: heatmapByDate = new Map(heatmap.map((cell) => [cell.dateKey, cell]));
	$: monthCells = buildMonthCells(monthCursor, heatmapByDate);
	$: monthTitle = monthFormatter.format(monthCursor);

	function firstDayOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}

	function addDays(date, days) {
		const next = new Date(date);
		next.setDate(next.getDate() + days);
		return next;
	}

	function addMonths(date, months) {
		return new Date(date.getFullYear(), date.getMonth() + months, 1);
	}

	function startOfWeek(date) {
		const dayOffset = (date.getDay() + 6) % 7;
		return addDays(date, -dayOffset);
	}

	function endOfWeek(date) {
		return addDays(startOfWeek(date), 6);
	}

	function toDateKey(date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function buildMonthCells(monthStart, cellMap) {
		const monthEnd = new Date(
			monthStart.getFullYear(),
			monthStart.getMonth() + 1,
			0,
		);
		const calendarStart = startOfWeek(monthStart);
		const calendarEnd = endOfWeek(monthEnd);
		const todayKey = toDateKey(new Date());
		const cells = [];

		for (
			let cursor = new Date(calendarStart);
			cursor <= calendarEnd;
			cursor = addDays(cursor, 1)
		) {
			const dateKey = toDateKey(cursor);
			const source = cellMap.get(dateKey);
			cells.push({
				dateKey,
				day: cursor.getDate(),
				inMonth: cursor.getMonth() === monthStart.getMonth(),
				isToday: dateKey === todayKey,
				count: source?.count ?? 0,
				filePath: source?.filePath ?? null,
			});
		}

		return cells;
	}

	function calendarTitle(cell) {
		return `${cell.dateKey} · ${cell.count} memo${cell.count === 1 ? "" : "s"}`;
	}

	function calendarHeatLevel(count) {
		const safeCount = Number(count) || 0;
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[0]) {
			return 0;
		}
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[1]) {
			return 1;
		}
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[2]) {
			return 2;
		}
		if (safeCount < CALENDAR_HEAT_THRESHOLDS[3]) {
			return 3;
		}
		return 4;
	}

	function openCalendarCell(cell) {
		if (!cell.inMonth) {
			return;
		}
		void openOrCreateDaily(cell.dateKey);
	}

	function shiftCalendarMonth(step) {
		monthCursor = addMonths(monthCursor, step);
	}

	function resetCalendarMonth() {
		monthCursor = firstDayOfMonth(new Date());
	}
</script>

<section class="jm-panel">
	<div class="jm-panel-header">
		<h3>Mini calendar</h3>
		<div class="jm-calendar-actions">
			<button
				type="button"
				class="jm-icon-button"
				aria-label="Previous month"
				on:click={() => shiftCalendarMonth(-1)}
			>
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
			</button>
			<button
				type="button"
				class="jm-icon-button"
				aria-label="Today"
				on:click={resetCalendarMonth}
			>
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2"
					></rect>
					<line x1="16" y1="2" x2="16" y2="6"></line>
					<line x1="8" y1="2" x2="8" y2="6"></line>
					<line x1="3" y1="10" x2="21" y2="10"></line>
					<rect x="11" y="14" width="2" height="2" fill="currentColor"
					></rect>
				</svg>
			</button>
			<button
				type="button"
				class="jm-icon-button"
				aria-label="Next month"
				on:click={() => shiftCalendarMonth(1)}
			>
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</button>
		</div>
	</div>
	<div class="jm-calendar-title">{monthTitle}</div>
	<div class="jm-calendar-weekdays">
		{#each WEEKDAY_LABELS as dayLabel}
			<span>{dayLabel.slice(0, 2)}</span>
		{/each}
	</div>
	<div class="jm-calendar-grid">
		{#each monthCells as cell (cell.dateKey)}
			<button
				type="button"
				class={`jm-calendar-day jm-calendar-heat-${calendarHeatLevel(cell.count)} ${cell.inMonth ? "" : "is-outside"} ${cell.isToday ? "is-today" : ""}`}
				title={calendarTitle(cell)}
				disabled={!cell.inMonth}
				on:click={() => openCalendarCell(cell)}
			>
				<span>{cell.day}</span>
			</button>
		{/each}
	</div>
</section>
