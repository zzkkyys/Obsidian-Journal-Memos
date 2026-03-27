<script>
	import { onMount, onDestroy } from "svelte";

	export let apiKey = "";
	export let location = "";
	export let refreshInterval = 30;
	export let iconSet = "qweather";

	let nowData = null;
	let forecastDays = [];
	let locationName = "";
	let loading = false;
	let error = "";
	let lastUpdated = "";

	const WEATHER_API_BASE = "https://devapi.qweather.com/v7";
	const GEO_API_BASE = "https://geoapi.qweather.com/v2";
	const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

	// QWeather icon code → Meteocons icon name
	const QW_TO_METEOCONS = {
		"100": "clear-day",
		"101": "cloudy",
		"102": "partly-cloudy-day",
		"103": "partly-cloudy-day",
		"104": "overcast-day",
		"150": "clear-night",
		"151": "partly-cloudy-night",
		"152": "partly-cloudy-night",
		"153": "partly-cloudy-night",
		"154": "overcast-night",
		// Rain
		"300": "partly-cloudy-day-rain",
		"301": "overcast-day-rain",
		"302": "thunderstorms-day-rain",
		"303": "thunderstorms-day-overcast-rain",
		"304": "hail",
		"305": "drizzle",
		"306": "rain",
		"307": "rain",
		"308": "extreme-rain",
		"309": "drizzle",
		"310": "extreme-rain",
		"311": "extreme-rain",
		"312": "extreme-rain",
		"313": "sleet",
		"314": "rain",
		"315": "rain",
		"316": "extreme-rain",
		"317": "extreme-rain",
		"318": "extreme-rain",
		"399": "rain",
		// Snow
		"400": "snow",
		"401": "snow",
		"402": "snow",
		"403": "extreme-snow",
		"404": "sleet",
		"405": "sleet",
		"406": "partly-cloudy-day-sleet",
		"407": "overcast-day-snow",
		"408": "snow",
		"409": "snow",
		"410": "extreme-snow",
		"499": "snow",
		// Fog / Haze / Dust
		"500": "mist",
		"501": "fog-day",
		"502": "haze-day",
		"503": "dust-wind",
		"504": "dust-day",
		"507": "dust-wind",
		"508": "dust-wind",
		"509": "fog-day",
		"510": "fog-day",
		"511": "haze-day",
		"512": "haze-day",
		"513": "haze-day",
		"514": "fog-day",
		"515": "fog-day",
		// Other
		"900": "thermometer-warmer",
		"901": "thermometer-colder",
		"999": "not-available",
	};

	function getIconUrl(code) {
		if (iconSet === "qweather-s2") {
			return `https://cdn.jsdelivr.net/gh/qwd/WeatherIcon@master/weather-icon-S2/128/${code}.png`;
		}
		if (iconSet === "meteocons-fill" || iconSet === "meteocons-line") {
			const name = QW_TO_METEOCONS[String(code)] ?? "not-available";
			const variant = iconSet === "meteocons-line" ? "line" : "fill";
			return `https://bmcdn.nl/assets/weather-icons/v3.0/${variant}/svg/${name}.svg`;
		}
		return `https://icons.qweather.com/assets/icons/${code}.svg`;
	}

	function getForecastDayLabel(fxDate, index) {
		if (index === 0) return "今天";
		if (index === 1) return "明天";
		const d = new Date(fxDate);
		return DAY_LABELS[d.getDay()];
	}

	function isLocationId(loc) {
		return /^\d+$/.test(loc.trim());
	}

	function isCoordinates(loc) {
		return /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(loc.trim());
	}

	async function resolveLocationId(loc) {
		if (isLocationId(loc) || isCoordinates(loc)) {
			return loc.trim();
		}
		const url = `${GEO_API_BASE}/city/lookup?location=${encodeURIComponent(loc)}&key=${apiKey}`;
		const resp = await fetch(url);
		const data = await resp.json();
		if (data.code !== "200" || !data.location?.length) {
			throw new Error(`找不到城市: ${loc}`);
		}
		locationName = data.location[0].name;
		return data.location[0].id;
	}

	async function fetchWeather() {
		if (!apiKey || !location) return;
		loading = true;
		error = "";
		try {
			const locId = await resolveLocationId(location);
			const [nowResp, forecastResp] = await Promise.all([
				fetch(`${WEATHER_API_BASE}/weather/now?location=${locId}&key=${apiKey}`),
				fetch(`${WEATHER_API_BASE}/weather/3d?location=${locId}&key=${apiKey}`),
			]);
			const [nowJson, forecastJson] = await Promise.all([
				nowResp.json(),
				forecastResp.json(),
			]);
			if (nowJson.code !== "200") {
				const hint = nowJson.code === "404" ? "（请检查 LocationID 是否正确）" : "";
				throw new Error(`天气数据错误 ${nowJson.code}${hint}`);
			}
			nowData = nowJson.now;
			if (forecastJson.code === "200" && forecastJson.daily?.length) {
				forecastDays = forecastJson.daily.slice(0, 3).map((d, i) => ({
					...d,
					label: getForecastDayLabel(d.fxDate, i),
				}));
			}
			if (!locationName) locationName = location;
			const now = new Date();
			lastUpdated = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
		} catch (e) {
			error = e.message || "获取天气失败";
		} finally {
			loading = false;
		}
	}

	let timer = null;

	function startTimer() {
		stopTimer();
		if (refreshInterval > 0) {
			timer = window.setInterval(() => void fetchWeather(), refreshInterval * 60 * 1000);
		}
	}

	function stopTimer() {
		if (timer !== null) {
			window.clearInterval(timer);
			timer = null;
		}
	}

	onMount(() => {
		void fetchWeather();
		startTimer();
	});

	onDestroy(() => {
		stopTimer();
	});

	$: if (refreshInterval !== undefined) {
		startTimer();
	}
</script>

<section class="jm-panel jm-weather-card">
	{#if !apiKey || !location}
		<div class="jm-weather-unconfigured">
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="jm-weather-cloud-icon">
				<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
			</svg>
			<span>在设置中配置和风天气以显示天气</span>
		</div>
	{:else if loading && !nowData}
		<div class="jm-weather-loading">
			<svg class="jm-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
			</svg>
			<span>加载天气...</span>
		</div>
	{:else if error}
		<div class="jm-weather-error-row">
			<span class="jm-weather-error-text">{error}</span>
			<button type="button" class="jm-icon-button" aria-label="Retry" on:click={() => void fetchWeather()}>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="23 4 23 10 17 10"></polyline>
					<polyline points="1 20 1 14 7 14"></polyline>
					<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
				</svg>
			</button>
		</div>
	{:else if nowData}
		<!-- Header: location + refresh -->
		<div class="jm-weather-header">
			<span class="jm-weather-location">{locationName}</span>
			<button
				type="button"
				class="jm-icon-button jm-weather-refresh"
				aria-label="Refresh weather"
				disabled={loading}
				on:click={() => void fetchWeather()}
				title={lastUpdated ? `更新于 ${lastUpdated}` : "刷新"}
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={loading ? "jm-spin" : ""}>
					<polyline points="23 4 23 10 17 10"></polyline>
					<polyline points="1 20 1 14 7 14"></polyline>
					<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
				</svg>
			</button>
		</div>

		<!-- Main: icon + temp on left, stats on right -->
		<div class="jm-weather-now">
			<div class="jm-weather-now-left">
				<img class="jm-weather-icon-lg" class:is-meteocons={iconSet === 'meteocons-fill' || iconSet === 'meteocons-line'} src={getIconUrl(nowData.icon)} alt={nowData.text} />
				<div>
					<div class="jm-weather-temp">{nowData.temp}<span class="jm-weather-unit">°C</span></div>
					<div class="jm-weather-condition">{nowData.text}</div>
				</div>
			</div>
			<div class="jm-weather-stats">
				<div class="jm-weather-stat">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/>
						<circle cx="12" cy="9" r="2.5"/>
					</svg>
					<span class="jm-weather-stat-value">{nowData.feelsLike}°</span>
					<span class="jm-weather-stat-label">体感</span>
				</div>
				<div class="jm-weather-stat">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 2v10"/>
						<path d="M12 22a4 4 0 0 1-4-4c0-1.6 1-3 2-4l2-3 2 3c1 1 2 2.4 2 4a4 4 0 0 1-4 4z"/>
					</svg>
					<span class="jm-weather-stat-value">{nowData.humidity}%</span>
					<span class="jm-weather-stat-label">湿度</span>
				</div>
				<div class="jm-weather-stat">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9.59 4.59A2 2 0 1 1 11 8H2"/>
						<path d="M10.59 19.41A2 2 0 1 0 14 16H2"/>
						<path d="M15.73 8.27A2.5 2.5 0 1 1 19.5 12H2"/>
					</svg>
					<span class="jm-weather-stat-value">{nowData.windScale}级</span>
					<span class="jm-weather-stat-label">风力</span>
				</div>
			</div>
		</div>

		<!-- Forecast strip -->
		{#if forecastDays.length > 0}
			<div class="jm-weather-forecast">
				{#each forecastDays as day}
					<div class="jm-weather-forecast-day">
						<span class="jm-forecast-label">{day.label}</span>
						<img class="jm-forecast-icon" class:is-meteocons={iconSet === 'meteocons-fill' || iconSet === 'meteocons-line'} src={getIconUrl(day.iconDay)} alt={day.textDay} title={day.textDay} />
						<span class="jm-forecast-temps">
							<span class="jm-forecast-high">{day.tempMax}°</span>
							<span class="jm-forecast-sep">/</span>
							<span class="jm-forecast-low">{day.tempMin}°</span>
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>
