window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		const { useState, useEffect, useMemo, useRef, useCallback } = react;
		const { jsx, jsxs } = react_jsx_runtime;
		// Portal host (react-dom) — renders the dashboard overlay onto <body>
		// so `position: fixed` always covers the viewport and clicks outside
		// the panel reliably reach the backdrop, regardless of any
		// transform/filter on the composer dock.
		let react_dom = null;
		try {
			react_dom = require("react-dom");
		} catch (error) {
			react_dom = null;
		}

		// ────────────────────────────────────────────────────────────────
		// DeepSeek 峰谷分时计费 (effective 2026-08-17, Beijing time)
		// Peak windows: 9:00–12:00 and 14:00–18:00; everything else is valley.
		// Prices are 元 per 1M tokens. Cache writes bill at the input
		// (cache-miss) rate; cache reads bill at the cache-hit rate.
		// ────────────────────────────────────────────────────────────────
		const HOUR = 3600000;
		const SEGMENTS = [
			{ start: 0, end: 9 * HOUR, peak: false },
			{ start: 9 * HOUR, end: 12 * HOUR, peak: true },
			{ start: 12 * HOUR, end: 14 * HOUR, peak: false },
			{ start: 14 * HOUR, end: 18 * HOUR, peak: true },
			{ start: 18 * HOUR, end: 24 * HOUR, peak: false }
		];
		const BOUNDARIES = [
			{ at: 9 * HOUR, next: "peak" },
			{ at: 12 * HOUR, next: "valley" },
			{ at: 14 * HOUR, next: "peak" },
			{ at: 18 * HOUR, next: "valley" }
		];

		const DEFAULT_PRICES = {
			"deepseek-v4-pro": {
				peak: { input: 9.0, cacheRead: 0.3, output: 27.0 },
				valley: { input: 4.5, cacheRead: 0.15, output: 13.5 }
			},
			"deepseek-v4-flash": {
				peak: { input: 3.0, cacheRead: 0.1, output: 9.0 },
				valley: { input: 1.5, cacheRead: 0.05, output: 4.5 }
			}
		};
		const DEFAULT_ROW = {
			peak: { input: 9.0, cacheRead: 0.3, output: 27.0 },
			valley: { input: 4.5, cacheRead: 0.15, output: 13.5 }
		};
		/** Built-in rate table: known models plus a fallback row for unlisted ids. */
		const PRICE_TABLE = { default: DEFAULT_ROW, ...DEFAULT_PRICES };
		const PEAK_COLOR = "#f97316";
		const VALLEY_COLOR = "#10b981";
		/** Chart palette. */
		const PALETTE = ["#4f7cff", "#10b981", "#f97316", "#8b5cf6", "#eab308", "#06b6d4"];
		/** Host route prefix served by the node half. */
		const API_BASE = "/dsh-client-ui-usage";

		const bjFormatter = typeof Intl !== "undefined" && Intl.DateTimeFormat
			? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
			: null;

		function num(value) {
			const n = typeof value === "number" ? value : Number(value);
			return Number.isFinite(n) && n >= 0 ? n : 0;
		}

		function bjMsOfDay(ms) {
			if (bjFormatter === null) {
				const d = new Date(ms);
				return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) * 1000;
			}
			let hour = 0, minute = 0, second = 0;
			for (const part of bjFormatter.formatToParts(new Date(ms))) {
				if (part.type === "hour") hour = Number(part.value);
				else if (part.type === "minute") minute = Number(part.value);
				else if (part.type === "second") second = Number(part.value);
			}
			return (hour * 3600 + minute * 60 + second) * 1000;
		}

		function segmentAt(ms) {
			const m = bjMsOfDay(ms);
			for (const seg of SEGMENTS) if (m >= seg.start && m < seg.end) return seg;
			return SEGMENTS[0];
		}

		function periodAt(ms) {
			const seg = segmentAt(ms);
			const m = bjMsOfDay(ms);
			const total = seg.end - seg.start;
			const elapsed = Math.min(Math.max(m - seg.start, 0), total);
			return {
				peak: seg.peak,
				start: seg.start,
				end: seg.end,
				percent: total > 0 ? elapsed / total : 0
			};
		}

		function nextBoundary(ms) {
			const m = bjMsOfDay(ms);
			for (const b of BOUNDARIES) if (b.at > m) return { at: b.at, delta: b.at - m, next: b.next };
			return { at: 9 * HOUR, delta: 24 * HOUR - m + 9 * HOUR, next: "peak" };
		}

		/** Beijing midnight of the day containing `ms`, in epoch ms. */
		function bjDayStart(ms) {
			return Math.floor((ms + 8 * HOUR) / (24 * HOUR)) * (24 * HOUR) - 8 * HOUR;
		}

		function fmtClock(msOfDay) {
			const h = Math.floor(msOfDay / HOUR);
			const m = Math.floor((msOfDay % HOUR) / 60000);
			return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
		}

		function fmtLeft(ms) {
			const total = Math.max(0, Math.floor(ms / 1000));
			const h = Math.floor(total / 3600);
			const m = Math.floor((total % 3600) / 60);
			if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
			return `${m}m${Math.floor((total % 60)) > 0 ? "s" : ""}`;
		}

		function fmtCost(value) {
			const v = num(value);
			if (v <= 0) return "¥0";
			if (v >= 100) return `¥${v.toFixed(2)}`;
			if (v >= 0.01) return `¥${v.toFixed(4)}`;
			return `¥${v.toFixed(6)}`;
		}

		function fmtCostShort(value) {
			const v = num(value);
			if (v <= 0) return "¥0";
			if (v >= 1) return `¥${v.toFixed(2)}`;
			return `¥${v.toFixed(3)}`;
		}

		function fmtTokens(value) {
			const n = num(value);
			if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
			if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
			if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
			return String(Math.round(n));
		}

		function fmtDateTime(ms) {
			if (bjFormatter === null) return new Date(ms).toLocaleString();
			const d = new Date(ms);
			const day = `${String(d.getDate()).padStart(2, "0")}`;
			const month = `${String(d.getMonth() + 1).padStart(2, "0")}`;
			let hour = 0, minute = 0;
			for (const part of bjFormatter.formatToParts(d)) {
				if (part.type === "hour") hour = Number(part.value);
				else if (part.type === "minute") minute = Number(part.value);
			}
			return `${month}-${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
		}

		function fmtPrice(value) {
			const v = num(value);
			return String(parseFloat(v.toFixed(3)));
		}

		function rowFor(table, model) {
			if (table[model] !== void 0) return table[model];
			return table["default"] ?? DEFAULT_ROW;
		}

		function priceAt(table, model, ms) {
			const row = rowFor(table, model);
			return periodAt(ms).peak ? row.peak : row.valley;
		}

		function stepCost(usage, price) {
			if (!usage || typeof usage !== "object") return 0;
			const input = num(usage.inputTokens);
			const cacheRead = num(usage.cacheReadTokens);
			const cacheWrite = num(usage.cacheWriteTokens);
			const output = num(usage.outputTokens);
			return (input + cacheWrite) * price.input / 1e6 + cacheRead * price.cacheRead / 1e6 + output * price.output / 1e6;
		}

		function computeCosts(nodes, fallbackModel, table, modelsByStep) {
			const byTurn = new Map();
			let nodeTokens = 0;
			const sessionModels = [];
			const sessionModelIndex = new Map();
			for (const node of nodes ?? []) {
				if (!node || node.kind !== "assistant") continue;
				const usage = node.usage;
				if (!usage || typeof usage !== "object") continue;
				const stepKey = `${node.turn}:${node.step}`;
				const stepModel = modelsByStep !== void 0 && modelsByStep !== null && typeof modelsByStep === "object" && typeof modelsByStep[stepKey] === "string"
					? modelsByStep[stepKey]
					: fallbackModel;
				if (!sessionModelIndex.has(stepModel)) {
					sessionModelIndex.set(stepModel, true);
					sessionModels.push(stepModel);
				}
				const price = priceAt(table, stepModel, typeof node.time === "number" ? node.time : Date.now());
				const input = num(usage.inputTokens);
				const cacheRead = num(usage.cacheReadTokens);
				const cacheWrite = num(usage.cacheWriteTokens);
				const output = num(usage.outputTokens);
				nodeTokens += input + cacheRead + cacheWrite + output;
				const cost = stepCost(usage, price);
				const turn = typeof node.turn === "number" ? node.turn : 0;
				let entry = byTurn.get(turn);
				if (entry === void 0) {
					entry = { turn, cost: 0, time: Infinity, models: [] };
					byTurn.set(turn, entry);
				}
				entry.cost += cost;
				if (typeof node.time === "number" && node.time < entry.time) entry.time = node.time;
				if (!entry.models.includes(stepModel)) entry.models.push(stepModel);
			}
			const turns = [...byTurn.values()]
				.sort((left, right) => left.turn - right.turn)
				.map((entry) => ({ ...entry, time: Number.isFinite(entry.time) ? entry.time : Date.now() }));
			let total = 0;
			let max = 0;
			let min = Infinity;
			for (const turn of turns) {
				total += turn.cost;
				if (turn.cost > max) max = turn.cost;
				if (turn.cost < min) min = turn.cost;
			}
			if (!Number.isFinite(min)) min = 0;
			const avg = turns.length > 0 ? total / turns.length : 0;
			const latest = turns.length > 0 ? turns[turns.length - 1] : null;
			return { turns, total, nodeTokens, max, min, avg, latest, models: sessionModels };
		}

		function shortModel(model) {
			if (typeof model !== "string" || model.length === 0) return "";
			return model.replace(/^deepseek-/, "");
		}

		// ────────────────────────────────────────────────────────────────
		// Dictionaries
		// ────────────────────────────────────────────────────────────────
		const NS = "usage";
		const zh = {
			"period.peak": "峰时",
			"period.valley": "谷时",
			"countdown": "距{next} {left}",
			"price.peak": "波峰",
			"price.valley": "波谷",
			"price.current": "当前{period}适用",
			"price.input": "输入·未命中",
			"price.cache": "输入·命中",
			"price.output": "输出",
			"price.unit": "元/百万 tokens",
			"cost.session": "会话累计",
			"cost.turn": "本次对话",
			"cost.peak": "单次波峰",
			"cost.valley": "单次波谷",
			"cost.avg": "单次均值",
			"note.windows": "峰时 9:00–12:00 / 14:00–18:00（北京时间），其余为谷时",
			"note.approx": "费用按各步骤完成时间所处时段的峰谷价、以及各步骤实际使用的模型计价，缓存写入按输入价计",
			"turn.item": "第{turn}轮",
			"models.session": "本会话模型",
			"empty.turns": "暂无对话计费数据",
			"title.dashboard": "用量分析",
			"balance.title": "账户余额",
			"balance.total": "总余额",
			"balance.topped": "充值",
			"balance.granted": "赠送",
			"balance.unavailable": "余额不可用",
			"balance.failed": "余额获取失败",
			"balance.updated": "更新于 {time}",
			"balance.retry": "重试",
			"stat.cost": "成本",
			"stat.tokens": "Tokens",
			"stat.steps": "轮次",
			"stat.cacheHit": "缓存命中率",
			"stat.saved": "谷时节省",
			"chart.trend": "成本趋势",
			"chart.models": "模型分布",
			"chart.tokenMix": "Token 结构",
			"chart.peakValley": "峰谷对比",
			"period.today": "今天",
			"period.7d": "7 天",
			"period.30d": "30 天",
			"period.90d": "90 天",
			"period.all": "全部",
			"scope.all": "全部会话",
			"scope.session": "本会话",
			"filter.allModels": "全部模型",
			"stat.avg": "单步均值",
			"stat.costHint": "峰 {peak} · 谷 {valley}",
			"stat.tokensHint": "输入 {input} · 输出 {output}",
			"stat.stepsHint": "峰 {peak} · 谷 {valley}",
			"stat.cacheHint": "命中 {hit}",
			"stat.savedHint": "谷时 {steps} 步",
			"stat.avgHint": "共 {steps} 步",
			"mix.all": "全部",
			"range.caption": "统计范围：{scope} · {period} · {model} · 共 {n} 步",
			"note.upgrade": "会话/模型筛选与按模型查看 Token 结构需要重启 dsh web 后生效",
			"recent.stepUnit": "步",
			"recent.turnUnit": "轮",
			"recent.expandAll": "展开全部",
			"recent.collapseAll": "收起全部",
			"recent.foot": "显示最近 {turns} 轮共 {shown} 步，统计范围共 {total} 步",
			"recent.title": "最近记录",
			"recent.time": "时间",
			"recent.session": "会话",
			"recent.turn": "轮次",
			"recent.step": "步骤",
			"recent.model": "模型",
			"recent.input": "输入·未命中",
			"recent.inputHint": "未命中输入（缓存命中见「缓存」列）",
			"recent.cache": "缓存",
			"recent.cacheRead": "命中",
			"recent.output": "输出",
			"recent.cost": "成本",
			"empty.history": "暂无历史记录，开始对话后会自动记录",
			"token.cacheWrite": "缓存写入",
			"token.total": "共 {n} tokens",
			"tooltip.tokens": "{n} tokens",
			"tooltip.steps": "{n} 步",
			"tooltip.peak": "峰 {v}",
			"tooltip.valley": "谷 {v}",
			"note.storage": "历史保存在本机 ~/.dsh/storages/usage-history.jsonl"
		};
		const en = {
			"period.peak": "Peak",
			"period.valley": "Valley",
			"countdown": "{next} in {left}",
			"price.peak": "Peak",
			"price.valley": "Valley",
			"price.current": "{period} rate now",
			"price.input": "Input·miss",
			"price.cache": "Input·hit",
			"price.output": "Output",
			"price.unit": "¥ / 1M tokens",
			"cost.session": "Session",
			"cost.turn": "This turn",
			"cost.peak": "Turn max",
			"cost.valley": "Turn min",
			"cost.avg": "Turn avg",
			"note.windows": "Peak 9:00–12:00 / 14:00–18:00 (Beijing), valley otherwise",
			"note.approx": "Costs use the peak/valley rate at each step's completion time and the model that actually served each step; cache writes bill at the input rate",
			"turn.item": "Turn {turn}",
			"models.session": "Models used",
			"empty.turns": "No billable turns yet",
			"title.dashboard": "Usage",
			"balance.title": "Balance",
			"balance.total": "Total",
			"balance.topped": "Top-up",
			"balance.granted": "Granted",
			"balance.unavailable": "Unavailable",
			"balance.failed": "Balance fetch failed",
			"balance.updated": "Updated {time}",
			"balance.retry": "Retry",
			"stat.cost": "Cost",
			"stat.tokens": "Tokens",
			"stat.steps": "Steps",
			"stat.cacheHit": "Cache hit",
			"stat.saved": "Valley saved",
			"chart.trend": "Cost trend",
			"chart.models": "By model",
			"chart.tokenMix": "Token mix",
			"chart.peakValley": "Peak vs valley",
			"period.today": "Today",
			"period.7d": "7d",
			"period.30d": "30d",
			"period.90d": "90d",
			"period.all": "All",
			"scope.all": "All sessions",
			"scope.session": "This session",
			"filter.allModels": "All models",
			"stat.avg": "Step avg",
			"stat.costHint": "Peak {peak} · Valley {valley}",
			"stat.tokensHint": "In {input} · Out {output}",
			"stat.stepsHint": "Peak {peak} · Valley {valley}",
			"stat.cacheHint": "Hit {hit}",
			"stat.savedHint": "{steps} valley steps",
			"stat.avgHint": "{steps} steps total",
			"mix.all": "All",
			"range.caption": "Range: {scope} · {period} · {model} · {n} steps",
			"note.upgrade": "Session/model filters and per-model token mix require a dsh web restart",
			"recent.stepUnit": "steps",
			"recent.turnUnit": "turns",
			"recent.expandAll": "Expand all",
			"recent.collapseAll": "Collapse all",
			"recent.foot": "Latest {turns} turns · {shown} steps · {total} steps in range",
			"recent.title": "Recent activity",
			"recent.time": "Time",
			"recent.session": "Session",
			"recent.turn": "Turn",
			"recent.step": "Step",
			"recent.model": "Model",
			"recent.input": "In·miss",
			"recent.inputHint": "uncached input (cache hits are in the Cache column)",
			"recent.cache": "Cache",
			"recent.cacheRead": "hit",
			"recent.output": "Out",
			"recent.cost": "Cost",
			"empty.history": "No history yet — it fills in as you chat",
			"token.cacheWrite": "Cache write",
			"token.total": "{n} tokens total",
			"tooltip.tokens": "{n} tokens",
			"tooltip.steps": "{n} steps",
			"tooltip.peak": "Peak {v}",
			"tooltip.valley": "Valley {v}",
			"note.storage": "History is stored locally at ~/.dsh/storages/usage-history.jsonl"
		};

		function makeTr(t) {
			return (key, params) => {
				if (typeof t === "function") return t(key, params);
				let text = zh[key] ?? key;
				if (params) {
					for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
				}
				return text;
			};
		}

		// ────────────────────────────────────────────────────────────────
		// Charts (self-contained SVG/div primitives)
		// ────────────────────────────────────────────────────────────────
		function Sparkline({ values, width, height, peakFill, valleyFill }) {
			const min = Math.min(...values);
			const max = Math.max(...values);
			let peakIndex = 0;
			let valleyIndex = 0;
			for (let i = 1; i < values.length; i++) {
				if (values[i] > values[peakIndex]) peakIndex = i;
				if (values[i] < values[valleyIndex]) valleyIndex = i;
			}
			const pad = 2;
			const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
			const points = values.map((value, index) => {
				const span = max - min || 1;
				const x = pad + index * stepX;
				const y = height - pad - ((value - min) / span) * (height - pad * 2);
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			});
			const peak = sparkPointOf(values, peakIndex, width, height, min, max, pad);
			const valley = sparkPointOf(values, valleyIndex, width, height, min, max, pad);
			return jsx("svg", {
				width,
				height,
				viewBox: `0 0 ${width} ${height}`,
				style: { display: "block", flex: "none", overflow: "visible" },
				children: [
					jsx("polyline", {
						key: "line",
						points: points.join(" "),
						fill: "none",
						stroke: "var(--dsw-alias-label-tertiary)",
						strokeWidth: 1.2,
						strokeLinejoin: "round",
						strokeLinecap: "round"
					}),
					jsx("circle", { key: "peak", cx: peak.x.toFixed(1), cy: peak.y.toFixed(1), r: 1.8, fill: peakFill ?? PEAK_COLOR }),
					jsx("circle", { key: "valley", cx: valley.x.toFixed(1), cy: valley.y.toFixed(1), r: 1.8, fill: valleyFill ?? VALLEY_COLOR })
				]
			});
		}
		function sparkPointOf(values, index, width, height, min, max, pad) {
			const span = max - min || 1;
			const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
			const x = pad + index * stepX;
			const y = height - pad - ((values[index] - min) / span) * (height - pad * 2);
			return { x, y };
		}

		/** Daily cost trend: area + line + hover guide, with peak/valley split in the tooltip. */
		function TrendChart({ buckets, tr }) {
			const W = 640, H = 190, padL = 46, padR = 14, padT = 16, padB = 26;
			const [hover, setHover] = useState(null);
			if (buckets === void 0 || buckets === null || buckets.length === 0) {
				return jsx("div", { style: { color: "var(--dsw-alias-label-tertiary)", padding: "28px 0", textAlign: "center", fontSize: 12 }, children: tr("empty.history") });
			}
			const maxCost = Math.max(...buckets.map((b) => b.cost), 0.0001);
			const stepX = buckets.length > 1 ? (W - padL - padR) / (buckets.length - 1) : 0;
			const x = (i) => buckets.length > 1 ? padL + i * stepX : (padL + W - padR) / 2;
			const y = (v) => H - padB - (v / maxCost) * (H - padT - padB);
			const points = buckets.map((b, i) => `${x(i).toFixed(1)},${y(b.cost).toFixed(1)}`).join(" ");
			const area = `${x(0).toFixed(1)},${(H - padB).toFixed(1)} ${points} ${x(buckets.length - 1).toFixed(1)},${(H - padB).toFixed(1)}`;
			const ticks = [0, 0.25, 0.5, 0.75, 1];
			const onMove = (event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return;
				const px = ((event.clientX - rect.left) / rect.width) * W;
				const i = buckets.length > 1 ? Math.min(buckets.length - 1, Math.max(0, Math.round((px - padL) / stepX))) : 0;
				setHover(i);
			};
			const hb = hover !== null ? buckets[hover] : null;
			const tooltipLeft = hover !== null ? Math.min(Math.max((x(hover) / W) * 100, 12), 88) : 0;
			return jsxs("div", { style: { position: "relative" }, onMouseLeave: () => setHover(null), children: [
				jsx("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: "auto", display: "block", minHeight: 90 }, onMouseMove: onMove, children: [
					jsx("defs", { children: jsx("linearGradient", { id: "usageAreaGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [
						jsx("stop", { offset: "0%", stopColor: PEAK_COLOR, stopOpacity: 0.26 }),
						jsx("stop", { offset: "100%", stopColor: PEAK_COLOR, stopOpacity: 0.02 })
					] }) }),
					ticks.map((tick) => {
						const ty = padT + tick * (H - padT - padB);
						return [
							jsx("line", { key: `gl${tick}`, x1: padL, y1: ty, x2: W - padR, y2: ty, stroke: "var(--dsw-alias-border-l2)", strokeWidth: 1 }),
							jsx("text", { key: `gt${tick}`, x: padL - 8, y: ty + 3.5, textAnchor: "end", fontSize: 10, fill: "var(--dsw-alias-label-tertiary)", children: fmtCostShort(maxCost * (1 - tick)) })
						];
					}),
					jsx("text", { x: padL, y: H - 8, fontSize: 10, fill: "var(--dsw-alias-label-tertiary)", children: buckets[0].day }),
					jsx("text", { x: (padL + W - padR) / 2, y: H - 8, textAnchor: "middle", fontSize: 10, fill: "var(--dsw-alias-label-tertiary)", children: buckets.length > 1 ? buckets[Math.floor((buckets.length - 1) / 2)].day : "" }),
					jsx("text", { x: W - padR, y: H - 8, textAnchor: "end", fontSize: 10, fill: "var(--dsw-alias-label-tertiary)", children: buckets.length > 1 ? buckets[buckets.length - 1].day : "" }),
					jsx("polygon", { points: area, fill: "url(#usageAreaGrad)" }),
					jsx("polyline", { points, fill: "none", stroke: PEAK_COLOR, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }),
					buckets.map((b, i) => jsx("circle", {
						key: i,
						cx: x(i),
						cy: y(b.cost),
						r: hover === i ? 3.6 : 2,
						fill: hover === i ? PEAK_COLOR : "var(--dsw-alias-bg-base)",
						stroke: PEAK_COLOR,
						strokeWidth: 1.4
					})),
					hover !== null
						? jsx("line", { x1: x(hover), y1: padT, x2: x(hover), y2: H - padB, stroke: "var(--dsw-alias-label-tertiary)", strokeWidth: 1, strokeDasharray: "3 3" })
						: null
				] }),
				hb !== null
					? jsxs("div", { style: {
							position: "absolute",
							top: 2,
							left: `${tooltipLeft}%`,
							transform: hover !== null && x(hover) < 90 ? "none" : "translateX(-100%)",
							background: "var(--dsw-specific-menu)",
							border: "1px solid var(--dsw-alias-border-l1)",
							boxShadow: "var(--dsw-shadow-lv2)",
							borderRadius: 8,
							padding: "6px 10px",
							fontSize: 11,
							lineHeight: "17px",
							color: "var(--dsw-alias-label-secondary)",
							pointerEvents: "none",
							whiteSpace: "nowrap",
							zIndex: 3
						}, children: [
						jsx("div", { style: { color: "var(--dsw-alias-label-primary)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: `${hb.day} · ${fmtCost(hb.cost)}` }),
						jsx("div", { children: tr("tooltip.tokens", { n: fmtTokens(hb.tokens) }) + " · " + tr("tooltip.steps", { n: hb.steps }) }),
						jsxs("div", { children: [
							jsx("span", { style: { color: PEAK_COLOR }, children: tr("tooltip.peak", { v: fmtCost(hb.peakCost) }) }),
							" · ",
							jsx("span", { style: { color: VALLEY_COLOR }, children: tr("tooltip.valley", { v: fmtCost(hb.valleyCost) }) })
						] })
					] })
					: null
			] });
		}

		/** Horizontal bar list: cost share per model, with the full model name on its own line. */
		function ModelBars({ models, tr }) {
			if (models === void 0 || models === null || models.length === 0) {
				return jsx("div", { style: { color: "var(--dsw-alias-label-tertiary)", padding: "20px 0", textAlign: "center", fontSize: 12 }, children: tr("empty.history") });
			}
			const max = models[0].cost || 0.0001;
			return jsx("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: models.slice(0, 10).map((m, i) => {
				const pct = Math.max(2, (m.cost / max) * 100);
				const name = typeof m.model === "string" && m.model.length > 0 ? m.model : "?";
				return jsxs("div", { key: name, style: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }, children: [
					jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }, children: [
						jsx("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dsw-alias-label-primary)", fontSize: 12, fontWeight: 600 }, title: name, children: name }),
						jsx("span", { style: { flex: "none", color: "var(--dsw-alias-label-secondary)", fontSize: 12, fontVariantNumeric: "tabular-nums" }, children: `${fmtCost(m.cost)} · ${fmtTokens(m.tokens)}` })
					] }),
					jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 }, children: [
						jsx("div", { style: { flex: 1, height: 8, borderRadius: 999, background: "var(--dsw-alias-interactive-bg-hover)", overflow: "hidden" }, children: jsx("div", { style: { width: `${pct}%`, height: "100%", borderRadius: 999, background: PALETTE[i % PALETTE.length], transition: "width .4s ease" } }) }),
						jsx("span", { style: { flex: "none", width: 40, textAlign: "right", color: "var(--dsw-alias-label-tertiary)", fontSize: 11, fontVariantNumeric: "tabular-nums" }, children: `${Math.round((m.cost / max) * 100)}%` })
					] })
				] });
			}) });
		}

		/** Donut of the four token buckets with a legend. */
		function TokenDonut({ tokens, tr }) {
			const parts = [
				{ key: "input", label: tr("price.input"), value: num(tokens?.input), color: "#4f7cff" },
				{ key: "cacheRead", label: tr("price.cache"), value: num(tokens?.cacheRead), color: VALLEY_COLOR },
				{ key: "cacheWrite", label: tr("token.cacheWrite"), value: num(tokens?.cacheWrite), color: "#8b5cf6" },
				{ key: "output", label: tr("price.output"), value: num(tokens?.output), color: PEAK_COLOR }
			];
			const total = parts.reduce((sum, part) => sum + part.value, 0);
			if (total <= 0) {
				return jsx("div", { style: { color: "var(--dsw-alias-label-tertiary)", padding: "20px 0", textAlign: "center", fontSize: 12 }, children: tr("empty.history") });
			}
			const R = 52;
			const C = 2 * Math.PI * R;
			let offset = 0;
			const arcs = parts.filter((part) => part.value > 0).map((part) => {
				const len = (part.value / total) * C;
				const arc = jsx("circle", {
					key: part.key,
					cx: 76,
					cy: 76,
					r: R,
					fill: "none",
					stroke: part.color,
					strokeWidth: 16,
					strokeDasharray: `${len} ${C - len}`,
					strokeDashoffset: -offset,
					transform: "rotate(-90 76 76)"
				});
				offset += len;
				return arc;
			});
			return jsxs("div", { style: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }, children: [
				jsx("svg", { width: 152, height: 152, viewBox: "0 0 152 152", style: { flex: "none" }, children: [
					arcs,
					jsx("text", { x: 76, y: 72, textAnchor: "middle", fontSize: 17, fontWeight: 700, fill: "var(--dsw-alias-label-primary)", fontVariantNumeric: "tabular-nums", children: fmtTokens(total) }),
					jsx("text", { x: 76, y: 90, textAnchor: "middle", fontSize: 10, fill: "var(--dsw-alias-label-tertiary)", children: tr("stat.tokens") })
				] }),
				jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 }, children: parts.map((part) => {
					const pct = Math.round((part.value / total) * 100);
					return jsxs("div", { key: part.key, style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12 }, children: [
						jsx("span", { style: { width: 8, height: 8, borderRadius: 999, background: part.color, flex: "none" } }),
						jsx("span", { style: { flex: 1, color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: part.label }),
						jsx("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: 34, textAlign: "right" }, children: `${pct}%` }),
						jsx("span", { style: { color: "var(--dsw-alias-label-primary)", fontVariantNumeric: "tabular-nums", flex: "none", width: 48, textAlign: "right" }, children: fmtTokens(part.value) })
					] });
				}) })
			] });
		}

		/** Peak vs valley cost split with the valley savings callout. */
		function PeakValley({ peak, valley, savings, tr }) {
			const p = { cost: num(peak?.cost), steps: num(peak?.steps) };
			const v = { cost: num(valley?.cost), steps: num(valley?.steps) };
			const max = Math.max(p.cost, v.cost, 0.0001);
			const row = (label, color, data) => jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
				jsx("span", { style: { flex: "none", width: 34, color: color, fontSize: 12, fontWeight: 600 }, children: label }),
				jsx("div", { style: { flex: 1, height: 10, borderRadius: 999, background: "var(--dsw-alias-interactive-bg-hover)", overflow: "hidden" }, children: jsx("div", { style: { width: `${Math.max(2, (data.cost / max) * 100)}%`, height: "100%", borderRadius: 999, background: color, transition: "width .4s ease" } }) }),
				jsx("span", { style: { flex: "none", minWidth: 108, textAlign: "right", color: "var(--dsw-alias-label-primary)", fontSize: 12, fontVariantNumeric: "tabular-nums" }, children: `${fmtCost(data.cost)} · ${data.steps} ${tr("stat.steps").toLowerCase()}` })
			] });
			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
				row(tr("price.peak"), PEAK_COLOR, p),
				row(tr("price.valley"), VALLEY_COLOR, v),
				jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, background: "color-mix(in srgb, " + VALLEY_COLOR + " 10%, transparent)", border: "1px solid color-mix(in srgb, " + VALLEY_COLOR + " 30%, transparent)", borderRadius: 8, padding: "6px 10px", fontSize: 12 }, children: [
					jsx("span", { style: { color: VALLEY_COLOR, fontWeight: 600 }, children: tr("stat.saved") }),
					jsx("span", { style: { color: "var(--dsw-alias-label-primary)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }, children: fmtCost(num(savings)) }),
					jsx("span", { style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary)" }, children: "≈50%" })
				] })
			] });
		}

		// ────────────────────────────────────────────────────────────────
		// Styles
		// ────────────────────────────────────────────────────────────────
		const styles = {
			root: {
				position: "relative",
				display: "inline-flex",
				alignItems: "center",
				flexWrap: "wrap",
				gap: 8,
				minWidth: 0,
				maxWidth: "100%",
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-tertiary)",
				cursor: "pointer",
				userSelect: "none"
			},
			group: { display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 },
			dot: { width: 7, height: 7, borderRadius: "50%", flex: "none" },
			periodLabel: { fontWeight: 600 },
			muted: { color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums" },
			num: { color: "var(--dsw-alias-label-primary)", fontVariantNumeric: "tabular-nums" },
			sep: { color: "var(--dsw-alias-border-l3)", userSelect: "none" },
			track: {
				width: 44,
				height: 4,
				borderRadius: 999,
				background: "var(--dsw-alias-interactive-bg-hover)",
				overflow: "hidden",
				flex: "none",
				display: "inline-block",
				verticalAlign: "middle"
			},
			fill: { display: "block", height: "100%", borderRadius: 999, transition: "width 0.5s linear" },
			balanceChip: {
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-specific-tip)",
				borderRadius: 999,
				padding: "1px 8px",
				fontSize: 11,
				fontVariantNumeric: "tabular-nums"
			},
			iconBtn: {
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 18,
				height: 18,
				borderRadius: 999,
				border: "none",
				background: "transparent",
				color: "var(--dsw-alias-label-tertiary)",
				cursor: "pointer",
				fontSize: 12,
				padding: 0
			},
			overlay: {
				position: "fixed",
				inset: 0,
				zIndex: 150,
				display: "flex",
				alignItems: "flex-end",
				justifyContent: "center"
			},
			backdrop: {
				position: "absolute",
				inset: 0,
				background: "color-mix(in srgb, var(--dsw-alias-bg-base) 45%, transparent)"
			},
			panel: {
				position: "relative",
				width: "min(980px, calc(100vw - 24px))",
				maxHeight: "min(76vh, 820px)",
				marginBottom: 88,
				display: "flex",
				flexDirection: "column",
				background: "var(--dsw-specific-menu)",
				border: "1px solid var(--dsw-alias-border-l1)",
				boxShadow: "var(--dsw-shadow-lv3)",
				borderRadius: 16,
				overflow: "hidden"
			},
			panelHeader: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "13px 16px 11px",
				borderBottom: "1px solid var(--dsw-alias-border-l2)",
				flex: "none"
			},
			panelTitle: { color: "var(--dsw-alias-label-primary)", fontWeight: 600, fontSize: 14, flex: 1 },
			close: {
				marginLeft: "auto",
				cursor: "pointer",
				border: "none",
				background: "transparent",
				color: "var(--dsw-alias-label-tertiary)",
				padding: "3px 9px",
				borderRadius: 6,
				fontSize: 13
			},
			panelBody: { overflowY: "auto", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 },
			grid: { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 },
			card: {
				background: "var(--dsw-alias-bg-base)",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 12,
				padding: 12,
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			cardTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: 12, fontWeight: 600, lineHeight: "18px", display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
			statChips: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 },
			statChip: {
				background: "var(--dsw-alias-bg-base)",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 10,
				padding: "7px 10px",
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				gap: 1
			},
			statLabel: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11, lineHeight: "16px" },
			statValue: { color: "var(--dsw-alias-label-primary)", fontSize: 15, fontWeight: 700, lineHeight: "20px", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
			statHint: { color: "var(--dsw-alias-label-tertiary)", fontSize: 10.5, lineHeight: "15px", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
			headerControls: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end" },
			select: {
				marginLeft: 0,
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-specific-menu)",
				color: "var(--dsw-alias-label-secondary)",
				borderRadius: 999,
				fontSize: 11,
				lineHeight: "18px",
				padding: "1px 6px",
				cursor: "pointer",
				maxWidth: 180
			},
			periodBtns: { display: "inline-flex", marginLeft: "auto", gap: 2, background: "var(--dsw-alias-interactive-bg-hover)", borderRadius: 999, padding: 2 },
			periodBtn: {
				border: "none",
				background: "transparent",
				color: "var(--dsw-alias-label-tertiary)",
				fontSize: 11,
				lineHeight: "18px",
				padding: "1px 10px",
				borderRadius: 999,
				cursor: "pointer"
			},
			periodBtnActive: { background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)", fontWeight: 600, boxShadow: "var(--dsw-shadow-lv1)" },
			table: { width: "100%", borderCollapse: "collapse", fontSize: 11.5, lineHeight: "18px" },
			th: { textAlign: "left", color: "var(--dsw-alias-label-tertiary)", fontWeight: 500, padding: "3px 8px", borderBottom: "1px solid var(--dsw-alias-border-l2)", whiteSpace: "nowrap" },
			td: { padding: "3px 8px", borderBottom: "1px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 },
			badge: { display: "inline-block", borderRadius: 999, padding: "0 7px", fontSize: 10.5, lineHeight: "16px", fontWeight: 600 },
			footnote: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11, lineHeight: "16px" }
		};

		// ────────────────────────────────────────────────────────────────
		// Dashboard
		// ────────────────────────────────────────────────────────────────
		function BalanceCard({ tr, balance, balanceError, balanceAt, onRefresh }) {
			const infos = balance !== null && balance !== void 0 && Array.isArray(balance.balance_infos) ? balance.balance_infos : [];
			const row = infos[0];
			return jsx("div", { style: { ...styles.card, gridColumn: "span 12", flexDirection: "row", alignItems: "center", gap: 12, padding: "8px 12px", flexWrap: "wrap" }, children: [
				jsxs("div", { style: { ...styles.cardTitle, gap: 6, flex: "none" }, children: [
					jsx("span", { children: tr("balance.title") }),
					jsx("span", { style: styles.iconBtn, onClick: onRefresh, title: tr("balance.retry"), children: "⟳" })
				] }),
				balanceError !== null && balanceError !== void 0
					? jsx("span", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 }, children: tr("balance.failed") + " · " + String(balanceError) })
					: balance === null || row === void 0
						? jsx("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12 }, children: "…" })
						: [
							jsx("span", { key: "total", style: { color: "var(--dsw-alias-label-primary)", fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: "24px" }, children: `${row.currency ?? "¥"} ${row.total_balance ?? "0"}` }),
							balance.is_available === false
								? jsx("span", { key: "badge", style: { ...styles.badge, color: "var(--dsw-alias-state-error-primary)", border: "1px solid var(--dsw-alias-state-error-primary)" }, children: tr("balance.unavailable") })
								: jsx("span", { key: "badge", style: { ...styles.badge, color: VALLEY_COLOR, border: `1px solid ${VALLEY_COLOR}` }, children: "●" }),
							jsx("span", { key: "split", style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11 }, children: `${tr("balance.topped")} ${row.topped_up_balance ?? "0"} · ${tr("balance.granted")} ${row.granted_balance ?? "0"}` }),
							balanceAt > 0
								? jsx("span", { key: "updated", style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary)", fontSize: 10.5 }, children: tr("balance.updated", { time: fmtDateTime(balanceAt) }) })
								: null
						]
			] });
		}

		function StatChip({ label, value, accent, hint }) {
			return jsxs("div", { style: styles.statChip, children: [
				jsx("span", { style: styles.statLabel, children: label }),
				jsx("span", { style: { ...styles.statValue, color: accent ?? "var(--dsw-alias-label-primary)" }, children: value }),
				hint !== void 0 && hint !== null && hint !== ""
					? jsx("span", { style: styles.statHint, children: hint })
					: null
			] });
		}

		function RecentTable({ tr, recent, totalSteps }) {
			/** All steps of the latest turns returned by the host (turns=20). */
			const rows = recent ?? [];
			// Group by turn (recent is newest-first), keep turns newest-first.
			const groups = [];
			const byTurn = new Map();
			for (const record of rows) {
				let group = byTurn.get(record.turn);
				if (group === void 0) {
					group = { turn: record.turn, records: [], models: [], cost: 0, minTime: Infinity, maxTime: 0, peak: 0, valley: 0 };
					byTurn.set(record.turn, group);
					groups.push(group);
				}
				group.records.push(record);
				if (!group.models.includes(record.model)) group.models.push(record.model);
				group.cost += record.cost;
				if (record.time < group.minTime) group.minTime = record.time;
				if (record.time > group.maxTime) group.maxTime = record.time;
				record.peak ? group.peak += 1 : group.valley += 1;
			}
			groups.sort((left, right) => right.turn - left.turn);
			/** Latest 20 turns only (newest first). */
			const shownGroups = groups.slice(0, 20);
			const shownSteps = shownGroups.reduce((sum, group) => sum + group.records.length, 0);
			/** Turns the user expanded; empty set = every turn collapsed (default). */
			const [expanded, setExpanded] = useState(new Set());
			const toggle = (turn) => setExpanded((previous) => {
				const next = new Set(previous);
				next.has(turn) ? next.delete(turn) : next.add(turn);
				return next;
			});
			const allOpen = shownGroups.length > 0 && expanded.size === shownGroups.length;
			const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(shownGroups.map((group) => group.turn)));

			const stepRow = (record, i) => {
				const peak = record.peak === true;
				const cacheTotal = num(record.cacheReadTokens) + num(record.cacheWriteTokens);
				const badge = jsx("span", {
					style: {
						...styles.badge,
						color: peak ? PEAK_COLOR : VALLEY_COLOR,
						border: `1px solid ${peak ? PEAK_COLOR : VALLEY_COLOR}`
					},
					children: peak ? tr("period.peak") : tr("period.valley")
				});
				return jsxs("tr", { key: `${record.sessionId}|${record.turn}|${record.step}|${i}`, children: [
					jsx("td", { style: styles.td, children: fmtDateTime(record.time) }),
					jsx("td", { style: { ...styles.td, maxWidth: 110 }, title: `${record.sessionLabel !== void 0 && record.sessionLabel !== null && record.sessionLabel !== "" ? record.sessionLabel : ""} · ${record.sessionId}`, children: (record.sessionLabel !== void 0 && record.sessionLabel !== null && record.sessionLabel !== "" && record.sessionLabel !== "?")
					? record.sessionLabel
					: String(record.sessionId ?? "").slice(0, 8) }),
					jsx("td", { style: styles.td, children: `#${record.step}` }),
					jsx("td", { style: styles.td, children: shortModel(record.model) || record.model }),
					jsx("td", { style: { ...styles.td, textAlign: "right" }, children: fmtTokens(record.inputTokens) }),
					jsx("td", { style: { ...styles.td, textAlign: "right", color: "var(--dsw-alias-label-tertiary)" }, title: `${tr("recent.cache")}: ${tr("recent.cacheRead")} ${fmtTokens(record.cacheReadTokens)} · ${tr("token.cacheWrite")} ${fmtTokens(record.cacheWriteTokens)}`, children: cacheTotal > 0 ? fmtTokens(cacheTotal) : "—" }),
					jsx("td", { style: { ...styles.td, textAlign: "right" }, children: fmtTokens(record.outputTokens) }),
					jsx("td", { style: { ...styles.td, textAlign: "right", color: "var(--dsw-alias-label-primary)" }, children: fmtCost(record.cost) }),
					jsx("td", { style: { ...styles.td, textAlign: "right" }, children: badge })
				] });
			};

			return jsx("div", { style: { ...styles.card, gridColumn: "span 12" }, children: [
				jsxs("div", { style: styles.cardTitle, children: [
					jsx("span", { children: tr("recent.title") }),
					jsx("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontWeight: 400, fontVariantNumeric: "tabular-nums" }, children: `· ${shownGroups.length} ${tr("recent.turnUnit")} · ${shownSteps} ${tr("recent.stepUnit")}` }),
					rows.length > 0
						? jsx("button", { style: { ...styles.periodBtn, marginLeft: "auto", ...(allOpen ? styles.periodBtnActive : {}) }, onClick: toggleAll, children: allOpen ? tr("recent.collapseAll") : tr("recent.expandAll") })
						: null
				] }),
				rows.length === 0
					? jsx("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, padding: "8px 0" }, children: tr("empty.history") })
					: jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto", paddingRight: 4, overscrollBehavior: "contain" }, children: shownGroups.map((group) => {
							const isOpen = expanded.has(group.turn);
							const mixed = group.peak > 0 && group.valley > 0;
							return jsxs("div", { key: group.turn, style: { border: "1px solid var(--dsw-alias-border-l3)", borderRadius: 10, overflow: "hidden", flex: "none" }, children: [
								jsx("div", {
									onClick: () => toggle(group.turn),
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8,
										padding: "5px 10px",
										cursor: "pointer",
										background: "var(--dsw-alias-interactive-bg-hover)",
										fontSize: 12,
										lineHeight: "20px",
										userSelect: "none"
									},
									children: [
										jsx("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 10, width: 12, flex: "none", textAlign: "center" }, children: isOpen ? "▾" : "▸" }),
										jsx("span", { style: { flex: "none", color: "var(--dsw-alias-label-primary)", fontWeight: 600 }, children: tr("turn.item", { turn: group.turn }) }),
										jsx("span", { style: { flex: "none", color: "var(--dsw-alias-label-tertiary)" }, children: tr("tooltip.steps", { n: group.records.length }) }),
										group.models.map((m) => jsx("span", {
											key: m,
											title: m,
											style: { flex: "none", ...styles.badge, color: "var(--dsw-alias-label-primary)", border: "1px solid var(--dsw-alias-border-l2)" },
											children: shortModel(m) || m
										})),
										jsx("span", { style: { flex: "none", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums" }, children: `${fmtDateTime(group.minTime)} – ${fmtDateTime(group.maxTime)}` }),
										mixed
											? jsx("span", { style: { flex: "none", color: "var(--dsw-alias-label-tertiary)" }, children: `${tr("period.peak")}+${tr("period.valley")}` })
											: jsx("span", {
													style: {
														...styles.badge,
														flex: "none",
														color: group.peak > 0 ? PEAK_COLOR : VALLEY_COLOR,
														border: `1px solid ${group.peak > 0 ? PEAK_COLOR : VALLEY_COLOR}`
													},
													children: group.peak > 0 ? tr("period.peak") : tr("period.valley")
												}),
										jsx("span", { style: { marginLeft: "auto", flex: "none", color: "var(--dsw-alias-label-primary)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }, children: fmtCost(group.cost) })
									]
								}),
								isOpen
									? jsx("table", { style: { ...styles.table, marginTop: 2 }, children: [
											jsx("thead", { children: jsxs("tr", { children: [
												jsx("th", { style: styles.th, children: tr("recent.time") }),
												jsx("th", { style: styles.th, children: tr("recent.session") }),
												jsx("th", { style: styles.th, children: tr("recent.step") }),
												jsx("th", { style: styles.th, children: tr("recent.model") }),
												jsx("th", { style: { ...styles.th, textAlign: "right" }, title: tr("recent.inputHint"), children: tr("recent.input") }),
												jsx("th", { style: { ...styles.th, textAlign: "right" }, title: tr("recent.inputHint"), children: tr("recent.cache") }),
												jsx("th", { style: { ...styles.th, textAlign: "right" }, children: tr("recent.output") }),
												jsx("th", { style: { ...styles.th, textAlign: "right" }, children: tr("recent.cost") }),
												jsx("th", { style: styles.th, children: "" })
											] }) }),
											jsx("tbody", { children: group.records.map(stepRow) })
										] })
									: null
							] });
						}) }),
				rows.length > 0
					? jsx("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11, lineHeight: "16px", paddingTop: 2 }, children: tr("recent.foot", { turns: String(shownGroups.length), shown: String(shownSteps), total: String(num(totalSteps) > 0 ? num(totalSteps) : shownSteps) }) })
					: null
			] });
		}

		/** Token mix card with a per-model dimension selector. */
		function TokenMixCard({ tr, modelsAll, tokens }) {
			const options = (modelsAll ?? []).filter((m) => m !== null && m !== void 0 && typeof m === "object" && m.mix !== void 0 && m.mix !== null);
			const optionKey = options.map((m) => m.model).join("|");
			const [modelKey, setModelKey] = useState("all");
			useEffect(() => {
				if (modelKey !== "all" && !options.some((m) => m.model === modelKey)) setModelKey("all");
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [optionKey]);
			const data = modelKey === "all"
				? tokens
				: (options.find((m) => m.model === modelKey)?.mix ?? null);
			return jsx("div", { style: { ...styles.card, gridColumn: "span 5" }, children: [
				jsxs("div", { style: styles.cardTitle, children: [
					jsx("span", { children: tr("chart.tokenMix") }),
					options.length > 0
						? jsx("select", { style: { ...styles.select, marginLeft: "auto" }, value: modelKey, onChange: (event) => setModelKey(event.target.value), children: [
								jsx("option", { key: "all", value: "all", children: tr("mix.all") }),
								options.map((m) => jsx("option", { key: m.model, value: m.model, children: shortModel(m.model) || m.model }))
							] })
						: null
				] }),
				jsx(TokenDonut, { tokens: data, tr })
			] });
		}

		function Dashboard(props) {
			const { tr, balance, balanceError, balanceAt, onRefreshBalance, summary, periodKey, onPeriodChange, scopeKey, onScopeChange, modelFilter, onModelFilterChange, capsFilters, onClose } = props;
			const PERIODS = [
				{ key: "today", label: tr("period.today") },
				{ key: "7d", label: tr("period.7d") },
				{ key: "30d", label: tr("period.30d") },
				{ key: "90d", label: tr("period.90d") },
				{ key: "all", label: tr("period.all") }
			];
			const SCOPES = [
				{ key: "all", label: tr("scope.all") },
				{ key: "session", label: tr("scope.session") }
			];
			const s = summary;
			const totalTokens = num(s?.tokens?.input) + num(s?.tokens?.cacheRead) + num(s?.tokens?.cacheWrite) + num(s?.tokens?.output);
			const cacheDenominator = num(s?.tokens?.cacheRead) + num(s?.tokens?.input);
			const cacheHit = cacheDenominator > 0 ? Math.round((num(s?.tokens?.cacheRead) / cacheDenominator) * 100) : 0;
			const totalCost = s?.inRange > 0 ? num(s?.peak?.cost) + num(s?.valley?.cost) : 0;
			const avgCost = (s?.inRange ?? 0) > 0 ? totalCost / s.inRange : 0;
			const periodLabel = (PERIODS.find((p) => p.key === periodKey) ?? PERIODS[PERIODS.length - 1]).label;
			const scopeLabel = (SCOPES.find((p) => p.key === scopeKey) ?? SCOPES[0]).label;
			const modelLabel = modelFilter === "all" || modelFilter === "" ? tr("filter.allModels") : (shortModel(modelFilter) || modelFilter);
			return jsxs("div", {
				style: styles.overlay,
				onClick: (event) => {
					event.stopPropagation();
					onClose();
				},
				children: [
					jsx("div", { key: "backdrop", style: styles.backdrop }),
					jsx("div", { key: "panel", style: styles.panel, onClick: (event) => event.stopPropagation(), children: [
					jsxs("div", { style: styles.panelHeader, children: [
						jsx("span", { style: styles.panelTitle, children: tr("title.dashboard") }),
						jsx("div", { style: styles.headerControls, children: [
							jsx("div", { style: styles.periodBtns, children: PERIODS.map((period) => jsx("button", {
								key: period.key,
								style: { ...styles.periodBtn, ...(periodKey === period.key ? styles.periodBtnActive : {}) },
								onClick: () => onPeriodChange(period.key),
								children: period.label
							})) }),
							capsFilters
								? jsx("div", { style: styles.periodBtns, children: SCOPES.map((scope) => jsx("button", {
										key: scope.key,
										style: { ...styles.periodBtn, ...(scopeKey === scope.key ? styles.periodBtnActive : {}) },
										onClick: () => onScopeChange(scope.key),
										children: scope.label
									})) })
								: null,
							capsFilters
								? jsx("select", { style: styles.select, value: modelFilter, onChange: (event) => onModelFilterChange(event.target.value), children: [
										jsx("option", { key: "all", value: "all", children: tr("filter.allModels") }),
										(s?.modelsAll ?? []).map((m) => jsx("option", { key: m.model, value: m.model, children: shortModel(m.model) || m.model })),
										modelFilter !== "all" && modelFilter !== "" && !(s?.modelsAll ?? []).some((m) => m.model === modelFilter)
											? jsx("option", { key: modelFilter, value: modelFilter, children: shortModel(modelFilter) || modelFilter })
											: null
									] })
								: null
						] }),
						jsx("button", { style: styles.close, onClick: onClose, "aria-label": "close", children: "✕" })
					] }),
					jsx("div", { style: styles.panelBody, children: [
						jsx("div", { style: styles.grid, children: [
							jsx(BalanceCard, { tr, balance, balanceError, balanceAt, onRefresh: onRefreshBalance }),
							jsx("div", { style: { ...styles.statChips, gridColumn: "span 12" }, children: [
								jsx(StatChip, { label: tr("stat.cost"), value: fmtCost(totalCost), hint: tr("stat.costHint", { peak: fmtCostShort(num(s?.peak?.cost)), valley: fmtCostShort(num(s?.valley?.cost)) }) }),
								jsx(StatChip, { label: tr("stat.tokens"), value: fmtTokens(totalTokens), hint: tr("stat.tokensHint", { input: fmtTokens(num(s?.tokens?.input) + num(s?.tokens?.cacheWrite)), output: fmtTokens(num(s?.tokens?.output)) }) }),
								jsx(StatChip, { label: tr("stat.steps"), value: String(s?.inRange ?? 0), hint: tr("stat.stepsHint", { peak: String(num(s?.peak?.steps)), valley: String(num(s?.valley?.steps)) }) }),
								jsx(StatChip, { label: tr("stat.cacheHit"), value: s !== null && s !== void 0 ? `${cacheHit}%` : "—", hint: tr("stat.cacheHint", { hit: fmtTokens(num(s?.tokens?.cacheRead)) }) }),
								jsx(StatChip, { label: tr("stat.saved"), value: fmtCost(num(s?.savings)), accent: VALLEY_COLOR, hint: tr("stat.savedHint", { steps: String(num(s?.valley?.steps)) }) }),
								jsx(StatChip, { label: tr("stat.avg"), value: fmtCost(avgCost), hint: tr("stat.avgHint", { steps: String(s?.inRange ?? 0) }) })
							] }),
							jsx("div", { style: { ...styles.card, gridColumn: "span 7" }, children: [
								jsx("div", { style: styles.cardTitle, children: tr("chart.trend") }),
								jsx(TrendChart, { buckets: s?.days, tr })
							] }),
							jsx(TokenMixCard, { tr, modelsAll: s?.modelsAll, tokens: s?.tokens }),
							jsx("div", { style: { ...styles.card, gridColumn: "span 6" }, children: [
								jsx("div", { style: styles.cardTitle, children: tr("chart.models") }),
								jsx(ModelBars, { models: s?.models, tr })
							] }),
							jsx("div", { style: { ...styles.card, gridColumn: "span 6" }, children: [
								jsx("div", { style: styles.cardTitle, children: tr("chart.peakValley") }),
								jsx(PeakValley, { peak: s?.peak, valley: s?.valley, savings: s?.savings, tr })
							] }),
							jsx(RecentTable, { tr, recent: s?.recent, totalSteps: s?.inRange })
						] }),
						jsxs("div", { style: { ...styles.footnote, display: "flex", flexDirection: "column", gap: 2 }, children: [
							jsx("span", { children: tr("range.caption", { scope: scopeLabel, period: periodLabel, model: modelLabel, n: String(s?.inRange ?? 0) }) }),
							capsFilters !== true ? jsx("span", { children: tr("note.upgrade") }) : null,
							jsx("span", { children: tr("note.windows") }),
							jsx("div", { children: tr("note.storage") })
						] })
					] })
				] })
			] })
		}

		// ────────────────────────────────────────────────────────────────
		// Dock component
		// ────────────────────────────────────────────────────────────────
		function UsageDock(props) {
			const { useSession, useProjection, readModel, t } = props;
			const tr = useMemo(() => makeTr(t), [t]);
			const nodes = useSession((snapshot) => snapshot?.nodes) ?? [];
			const sessionId = useSession((snapshot) => snapshot?.sessionId);
			const tokenUsage = useProjection("tokenUsage");
			const turnModels = useProjection("turnModels");

			const [model, setModel] = useState(null);
			const readModelRef = useRef(readModel);
			readModelRef.current = readModel;
			useEffect(() => {
				const read = readModelRef.current;
				if (typeof read !== "function" || !sessionId) return;
				let live = true;
				Promise.resolve()
					.then(() => read(sessionId))
					.then((resolved) => {
						if (live && typeof resolved === "string" && resolved.length > 0) setModel(resolved);
					})
					.catch(() => {});
				return () => {
					live = false;
				};
			}, [sessionId]);

			const effectiveModel = model ?? "default";

			const [now, setNow] = useState(() => Date.now());
			useEffect(() => {
				const id = setInterval(() => setNow(Date.now()), 1000);
				return () => clearInterval(id);
			}, []);

			const [open, setOpen] = useState(false);
			const rootRef = useRef(null);
			useEffect(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open]);

			// ── balance (60s poll) ──
			const mountedRef = useRef(true);
			useEffect(() => () => {
				mountedRef.current = false;
			}, []);
			const [balance, setBalance] = useState(null);
			const [balanceError, setBalanceError] = useState(null);
			const [balanceAt, setBalanceAt] = useState(0);
			const refreshBalance = useCallback(() => {
				fetch(`${API_BASE}/balance`)
					.then((response) => response.json())
					.then((payload) => {
						if (!mountedRef.current) return;
						if (payload?.ok === true) {
							setBalance(payload.value ?? null);
							setBalanceError(null);
						} else {
							setBalanceError(payload?.error?.message ?? "balance failed");
						}
					})
					.catch((error) => {
						if (mountedRef.current) setBalanceError(error?.message ?? String(error));
					})
					.finally(() => {
						if (mountedRef.current) setBalanceAt(Date.now());
					});
			}, []);
			useEffect(() => {
				refreshBalance();
				const id = setInterval(refreshBalance, 60000);
				return () => clearInterval(id);
			}, [refreshBalance]);

			// ── history sync + summary ──
			const [periodKey, setPeriodKey] = useState("7d");
			const [scopeKey, setScopeKey] = useState("all");
			const [modelFilter, setModelFilter] = useState("all");
			/** Host capabilities: session/model filters + per-model token mix. */
			const [capsFilters, setCapsFilters] = useState(false);
			const since = useMemo(() => {
				const nowMs = Date.now();
				if (periodKey === "today") return bjDayStart(nowMs);
				if (periodKey === "7d") return nowMs - 7 * 24 * HOUR;
				if (periodKey === "30d") return nowMs - 30 * 24 * HOUR;
				if (periodKey === "90d") return nowMs - 90 * 24 * HOUR;
				return 0;
			}, [periodKey]);
			const [summary, setSummary] = useState(null);
			const refreshSummary = useCallback(() => {
				if (scopeKey === "session" && (typeof sessionId !== "string" || sessionId.length === 0)) return;
				const params = new URLSearchParams();
				params.set("since", String(Math.floor(since / 1000) * 1000));
				// New hosts: `turns=20` returns all steps of the latest 20 turns.
				// Old hosts ignore `turns` and cap `limit` steps (fallback).
				params.set("limit", "60");
				params.set("turns", "20");
				if (scopeKey === "session" && typeof sessionId === "string" && sessionId.length > 0) params.set("session", sessionId);
				if (modelFilter !== "all" && modelFilter !== "") params.set("model", modelFilter);
				fetch(`${API_BASE}/history/summary?${params.toString()}`)
					.then((response) => response.json())
					.then((payload) => {
						if (mountedRef.current && payload?.ok === true) {
							setSummary(payload.value ?? null);
							setCapsFilters(payload?.value?.modelsAll?.some((m) => m !== null && m !== void 0 && m.mix !== void 0 && m.mix !== null) === true);
						}
					})
					.catch(() => {});
			}, [since, scopeKey, sessionId, modelFilter]);
			useEffect(() => {
				if (!open) return;
				refreshSummary();
				const id = setInterval(refreshSummary, 30000);
				return () => clearInterval(id);
			}, [open, refreshSummary]);

			const sentKeysRef = useRef(new Map());
			useEffect(() => {
				if (!sessionId) return;
				const records = [];
				for (const node of nodes ?? []) {
					if (node === null || node === void 0 || node.kind !== "assistant") continue;
					const usage = node.usage;
					if (usage === null || usage === void 0 || typeof usage !== "object") continue;
					const turn = typeof node.turn === "number" ? node.turn : 0;
					const step = typeof node.step === "number" ? node.step : 0;
					const key = `${sessionId}|${turn}|${step}`;
					const stepKey = `${turn}:${step}`;
					// Prefer the durable per-step projection; fall back to the session
					// model RPC. Never post while the model is still unknown — the
					// effect re-runs when either source resolves, and the host upserts
					// corrections over previously posted `default`/`unknown` rows.
					const projected = turnModels !== null && turnModels !== void 0 && typeof turnModels === "object" && typeof turnModels[stepKey] === "string"
						? turnModels[stepKey]
						: null;
					const known = (projected !== null && projected.length > 0 && projected !== "default" && projected !== "unknown")
						? projected
						: (typeof model === "string" && model.length > 0 && model !== "default" && model !== "unknown")
							? model
							: null;
					if (known === null) continue;
					const posted = sentKeysRef.current.get(key);
					if (posted !== undefined && (posted === known || (posted !== "default" && posted !== "unknown"))) continue;
					const time = typeof node.time === "number" ? node.time : Date.now();
					const price = priceAt(PRICE_TABLE, known, time);
					records.push({
						v: 1,
						sessionId,
						turn,
						step,
						time,
						model: known,
						inputTokens: num(usage.inputTokens),
						cacheReadTokens: num(usage.cacheReadTokens),
						cacheWriteTokens: num(usage.cacheWriteTokens),
						outputTokens: num(usage.outputTokens),
						cost: stepCost(usage, price),
						peak: periodAt(time).peak
					});
					sentKeysRef.current.set(key, known);
				}
				if (records.length > 0) {
					fetch(`${API_BASE}/history`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ records })
					})
						.then(() => {
							if (mountedRef.current && open) refreshSummary();
						})
						.catch(() => {});
				}
			}, [nodes, sessionId, turnModels, model, open, refreshSummary]);

			const stats = useMemo(
				() => computeCosts(nodes, effectiveModel, PRICE_TABLE, turnModels),
				[nodes, effectiveModel, turnModels]
			);
			const period = periodAt(now);
			const next = nextBoundary(now);
			const row = rowFor(PRICE_TABLE, effectiveModel);
			const currentPrice = period.peak ? row.peak : row.valley;

			const projTokens = tokenUsage
				? num(tokenUsage.uncachedInputTokens) + num(tokenUsage.outputTokens) + num(tokenUsage.cacheReadTokens) + num(tokenUsage.cacheWriteTokens)
				: 0;
			let sessionCost = stats.total;
			let approx = false;
			if (stats.nodeTokens > 0 && projTokens > stats.nodeTokens) {
				sessionCost = stats.total * (projTokens / stats.nodeTokens);
				approx = true;
			}

			const periodLabel = period.peak ? tr("period.peak") : tr("period.valley");
			const nextLabel = next.next === "peak" ? tr("period.peak") : tr("period.valley");
			const periodColor = period.peak ? PEAK_COLOR : VALLEY_COLOR;
			const pct = `${(period.percent * 100).toFixed(0)}%`;

			const balanceRow = balance !== null && balance !== void 0 && Array.isArray(balance.balance_infos) && balance.balance_infos.length > 0
				? balance.balance_infos[0]
				: null;

			const dashboard = open
				? jsx(Dashboard, {
						tr,
						balance,
						balanceError,
						balanceAt,
						onRefreshBalance: refreshBalance,
						summary,
						periodKey,
						onPeriodChange: setPeriodKey,
						scopeKey,
						onScopeChange: setScopeKey,
						modelFilter,
						onModelFilterChange: setModelFilter,
						capsFilters,
						onClose: () => setOpen(false)
					})
				: null;

			return jsxs("div", {
				ref: rootRef,
				style: styles.root,
				onClick: () => setOpen((value) => !value),
				title: tr("title.dashboard"),
				children: [
					jsxs("span", { key: "period", style: styles.group, children: [
						jsx("span", { style: { ...styles.dot, background: periodColor } }),
						jsx("span", { style: { ...styles.periodLabel, color: periodColor }, children: periodLabel }),
						jsx("span", { style: styles.muted, children: `${fmtClock(period.start)}–${fmtClock(period.end)}` }),
						jsx("span", { style: styles.track, children: jsx("span", { style: { ...styles.fill, width: pct, background: periodColor } }) }),
						jsx("span", { style: styles.muted, children: tr("countdown", { next: nextLabel, left: fmtLeft(next.delta) }) })
					] }),
					jsx("span", { key: "sep1", style: styles.sep, children: "|" }),
					jsxs("span", { key: "costs", style: styles.group, children: [
						jsx("span", { style: styles.muted, children: tr("cost.session") }),
						jsx("span", { style: styles.num, children: `${approx ? "≈" : ""}${fmtCost(sessionCost)}` }),
						jsx("span", { style: styles.muted, children: tr("cost.turn") }),
						jsx("span", { style: styles.num, children: fmtCost(stats.latest?.cost ?? 0) })
					] }),
					jsx("span", { key: "sep2", style: styles.sep, children: "|" }),
					jsx("span", {
						key: "balance",
						style: styles.balanceChip,
						children: [
							jsx("span", { key: "bl", style: styles.muted, children: tr("balance.title") }),
							balanceError !== null && balanceError !== void 0
								? jsx("span", { key: "bv", style: { color: "var(--dsw-alias-label-tertiary)" }, children: "—" })
								: jsx("span", { key: "bv", style: { ...styles.num, fontWeight: 600 }, children: balanceRow !== null ? `${balanceRow.currency ?? "¥"} ${balanceRow.total_balance ?? "0"}` : "…" }),
							jsx("span", {
								key: "br",
								style: styles.iconBtn,
								title: tr("balance.retry"),
								onClick: (event) => {
									event.stopPropagation();
									refreshBalance();
								},
								children: "⟳"
							})
						]
					}),
					stats.turns.length >= 2
						? jsx(Sparkline, {
								key: "spark",
								values: stats.turns.map((turn) => turn.cost),
								width: 56,
								height: 14,
								peakFill: PEAK_COLOR,
								valleyFill: VALLEY_COLOR
							})
						: null,
					dashboard !== null && react_dom !== null && typeof react_dom.createPortal === "function"
						? react_dom.createPortal(dashboard, document.body)
						: dashboard
				]
			});
		}

		// ────────────────────────────────────────────────────────────────
		// Plugin body
		// ────────────────────────────────────────────────────────────────
		const inject = ["slots", "locale", "connection"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-usage: dictionaries");
			// Slot contract: `slots.inject(key, factory)` — the entry component is
			// the SECOND argument of `slots.register(record, component)`; a third
			// `slots.inject` argument is ignored (entry.component would be undefined).
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "usage",
				order: 1,
				locale: NS,
				inject: () => ({
					readModel: async (sessionIdArg) => {
						try {
							const connection = ctx.get("connection");
							if (connection === void 0 || connection.api === void 0 || connection.api.sessions === void 0) return null;
							const { result } = await connection.api.sessions.models({ sessionId: sessionIdArg });
							if (result !== void 0 && result.ok === true && result.value !== void 0 && result.value.current !== void 0) return result.value.current.model ?? null;
							return null;
						} catch {
							return null;
						}
					}
				})
			}, UsageDock));
		}

		exports.Dashboard = Dashboard;
		exports.TokenDonut = TokenDonut;
		exports.TrendChart = TrendChart;
		exports.UsageDock = UsageDock;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
