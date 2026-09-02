import { z } from "zod";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";

/**
 * Usage dashboard surface plugin, node half.
 *
 * Three host responsibilities:
 *  1. the `turnModels` session projection (per-step model attribution for
 *     pricing — unchanged from 0.1.0);
 *  2. a balance route proxying the official DeepSeek `/user/balance` with
 *     the API key resolved host-side (credentials → launch environment),
 *     so the key never crosses the browser;
 *  3. a JSONL usage-history store under `$DSH_HOME/storages/usage-history.jsonl`
 *     plus ingest (`POST /dsh-client-ui-usage/history`) and aggregated
 *     read-out (`GET /dsh-client-ui-usage/history/summary?since&limit`)
 *     routes, so the dashboard charts work across sessions.
 *
 * The browser half posts per-step records (deduped by `sessionId|turn|step`
 * on both sides) and renders the aggregated summary.
 */

/** Stable Cordis plugin name. */
const name = "@deepseek-ai/dsh-client-ui-usage";
/** Services required before the plugin body runs. */
const inject = ["sessionProjections", "webServer"];

// ────────────────────────────────────────────────────────────────
// Projection: per-step model attribution
// ────────────────────────────────────────────────────────────────

/** Pure fold + view for per-step model attribution. */
const turnModelsProjectionDefinition = {
	/** Projection key the browser half reads. */
	key: "turnModels",
	/** Wire payload: turn:step -> model id. */
	schema: z.record(z.string(), z.string()),
	init: () => ({}),
	apply: (state, event) => {
		if (event.type !== "assistant/message") return state;
		const data = event.data;
		if (data === void 0 || typeof data !== "object") return state;
		// Durable shape: data.message.source = {kind: "model", provider, model}.
		// Fall back to data.source for producers that lift it to the envelope.
		const message = data.message !== void 0 && typeof data.message === "object" ? data.message : void 0;
		const source = message !== void 0 && message.source !== void 0 ? message.source : data.source;
		const model = source !== void 0 && typeof source === "object" && typeof source.model === "string" && source.model.length > 0
			? source.model
			: void 0;
		if (model === void 0) return state;
		const { turn, step } = data;
		if (typeof turn !== "number" || typeof step !== "number") return state;
		const key = `${turn}:${step}`;
		if (state[key] === model) return state;
		return { ...state, [key]: model };
	},
	view: (state) => state,
	stateVersion: 1
};

// ────────────────────────────────────────────────────────────────
// Usage-history store (JSONL under $DSH_HOME/storages)
// ────────────────────────────────────────────────────────────────

const HISTORY_DIR = "storages";
const HISTORY_FILE = "usage-history.jsonl";
/** Soft cap on stored step records; the oldest half is pruned past it. */
const MAX_RECORDS = 40000;
const KEEP_RECORDS = 20000;
/** Hard cap on one ingest payload. */
const MAX_POST_RECORDS = 5000;
/** Hard cap on the POST body size (1 MiB). */
const MAX_BODY_BYTES = 1 << 20;

/**
 * Absolute path of the JSONL store for a given harness home.
 * @param home - resolved harness home (see `resolveDshHome`).
 * @returns the store file path.
 */
function historyPath(home) {
	return join(home, HISTORY_DIR, HISTORY_FILE);
}

/** Stable dedupe key of a record. */
function keyOf(record) {
	return `${record.sessionId}|${record.turn}|${record.step}`;
}

/** Coerce a possibly-missing token/cost field to a non-negative finite number. */
function toNumber(value) {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Validate and normalize one raw record (from a JSONL line or POST body).
 * @param raw - untrusted parsed JSON value.
 * @returns the normalized record, or null when the shape is unusable.
 */
function parseRecord(raw) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.slice(0, 200) : "";
	if (sessionId.length === 0) return null;
	const turn = typeof raw.turn === "number" && Number.isFinite(raw.turn) ? Math.floor(raw.turn) : NaN;
	const step = typeof raw.step === "number" && Number.isFinite(raw.step) ? Math.floor(raw.step) : NaN;
	if (!Number.isFinite(turn) || !Number.isFinite(step)) return null;
	return {
		v: 1,
		sessionId,
		turn,
		step,
		time: typeof raw.time === "number" && Number.isFinite(raw.time) ? raw.time : Date.now(),
		model: typeof raw.model === "string" && raw.model.length > 0 ? raw.model.slice(0, 100) : "unknown",
		inputTokens: toNumber(raw.inputTokens),
		cacheReadTokens: toNumber(raw.cacheReadTokens),
		cacheWriteTokens: toNumber(raw.cacheWriteTokens),
		outputTokens: toNumber(raw.outputTokens),
		cost: toNumber(raw.cost),
		peak: raw.peak === true
	};
}

/**
 * Read the whole store: deduped records in file order plus their key set.
 * A missing file is an empty store; corrupted lines are skipped.
 * @param file - store path.
 * @returns `{records, keys}`.
 */
function loadRecords(file) {
	let text = "";
	try {
		text = readFileSync(file, "utf8");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const records = [];
	const keys = new Set();
	for (const line of text.split("\n")) {
		if (line.trim().length === 0) continue;
		let raw;
		try {
			raw = JSON.parse(line);
		} catch {
			continue;
		}
		const record = parseRecord(raw);
		if (record === null) continue;
		const key = keyOf(record);
		if (keys.has(key)) continue;
		keys.add(key);
		records.push(record);
	}
	return { records, keys };
}

/** Models that mean "we did not know the model yet" — upsert candidates. */
function isUnknownModel(model) {
	return model === "default" || model === "unknown" || model.length === 0;
}

// ────────────────────────────────────────────────────────────────
// Pricing — mirrors lib/client.js (PRICE_TABLE / isPeak / stepCost).
// Keep in sync when the rate table changes.
// Weekend valley: from 2026-08-23 00:00 Beijing, Saturdays and Sundays
// bill at the valley rate for the whole day (DeepSeek pricing update).
// ────────────────────────────────────────────────────────────────

const HOUR = 3600000;
/** Weekend valley rule effective 2026-08-23 00:00 Beijing. */
const WEEKEND_EFFECTIVE = Date.UTC(2026, 7, 22, 16, 0, 0);
const SEGMENTS = [
	{ start: 0, end: 9 * HOUR, peak: false },
	{ start: 9 * HOUR, end: 12 * HOUR, peak: true },
	{ start: 12 * HOUR, end: 14 * HOUR, peak: false },
	{ start: 14 * HOUR, end: 18 * HOUR, peak: true },
	{ start: 18 * HOUR, end: 24 * HOUR, peak: false }
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
const PRICE_TABLE = { default: DEFAULT_ROW, ...DEFAULT_PRICES };

/** Beijing time-of-day of a timestamp, in ms since midnight. */
const BJ_CLOCK = typeof Intl !== "undefined" && Intl.DateTimeFormat
	? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
	: null;
function beijingMsOfDay(ms) {
	if (BJ_CLOCK === null) {
		const d = new Date(ms);
		return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) * 1000;
	}
	let hour = 0, minute = 0, second = 0;
	for (const part of BJ_CLOCK.formatToParts(new Date(ms))) {
		if (part.type === "hour") hour = Number(part.value);
		else if (part.type === "minute") minute = Number(part.value);
		else if (part.type === "second") second = Number(part.value);
	}
	return (hour * 3600 + minute * 60 + second) * 1000;
}
/**
 * Beijing day-of-week of a timestamp (0 = Sunday … 6 = Saturday).
 * @param ms - epoch ms.
 * @returns the weekday index in Beijing time.
 */
function beijingDayOfWeek(ms) {
	const label = beijingDay(ms);
	const [year, month, day] = label.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Whether a timestamp falls under the weekend valley rule: Saturday or
 * Sunday (Beijing time) at or after the effective date.
 * @param ms - epoch ms.
 * @returns true when the whole day bills at the valley rate.
 */
function isWeekend(ms) {
	if (ms < WEEKEND_EFFECTIVE) return false;
	const dow = beijingDayOfWeek(ms);
	return dow === 0 || dow === 6;
}

function isPeak(ms) {
	if (isWeekend(ms)) return false;
	const m = beijingMsOfDay(ms);
	for (const segment of SEGMENTS) if (m >= segment.start && m < segment.end) return segment.peak;
	return SEGMENTS[0].peak;
}
function priceAt(table, model, ms) {
	const row = table[model] !== void 0 ? table[model] : table["default"] ?? DEFAULT_ROW;
	return isPeak(ms) ? row.peak : row.valley;
}
function stepCost(usage, price) {
	if (usage === null || typeof usage !== "object") return 0;
	const input = toNumber(usage.inputTokens);
	const cacheRead = toNumber(usage.cacheReadTokens);
	const cacheWrite = toNumber(usage.cacheWriteTokens);
	const output = toNumber(usage.outputTokens);
	return (input + cacheWrite) * price.input / 1e6 + cacheRead * price.cacheRead / 1e6 + output * price.output / 1e6;
}

// ────────────────────────────────────────────────────────────────
// Self-healing: repair rows recorded before their model was known
// ────────────────────────────────────────────────────────────────

const PROJCACHE_FILE = "session_projcache.json";

/**
 * Read the durable session projection cache's `turnModels` unit: a map of
 * `sessionId -> Map("turn:step" -> real model id)` for every session that has
 * the projection (our own node-half unit, checkpointed by the projection
 * system). Missing/corrupt cache yields an empty map — repair is best-effort.
 * @param home - resolved harness home.
 * @returns the session→step→model index.
 */
function readProjectionModels(home) {
	const result = new Map();
	try {
		const raw = readFileSync(join(home, HISTORY_DIR, PROJCACHE_FILE), "utf8");
		const cache = JSON.parse(raw);
		const sessions = cache !== null && typeof cache === "object" ? cache.tables?.sessions : void 0;
		if (sessions === void 0 || typeof sessions !== "object") return result;
		for (const [sessionId, entry] of Object.entries(sessions)) {
			const value = entry?.rows?.turnModels?.val;
			if (value === void 0 || typeof value !== "object") continue;
			const models = new Map();
			for (const [stepKey, model] of Object.entries(value)) {
				if (typeof model === "string" && !isUnknownModel(model)) models.set(stepKey, model);
			}
			if (models.size > 0) result.set(sessionId, models);
		}
	} catch {
		/* best-effort */
	}
	return result;
}

/**
 * Repair stored rows whose model was recorded before it was known: match
 * `sessionId + turn:step` against the projection cache and rewrite the model
 * AND the cost (recomputed with the true model's rate at the step's own time).
 * Rows that already carry a real model are never touched. Rewrites atomically
 * only when at least one row changed.
 * @param file - store path.
 * @param home - resolved harness home (projection cache location).
 * @returns how many rows were repaired.
 */
function repairUnknownModels(file, home) {
	const projections = readProjectionModels(home);
	if (projections.size === 0) return 0;
	const { records } = loadRecords(file);
	let corrected = 0;
	const repaired = records.map((record) => {
		if (!isUnknownModel(record.model)) return record;
		const model = projections.get(record.sessionId)?.get(`${record.turn}:${record.step}`);
		if (model === void 0) return record;
		corrected += 1;
		const price = priceAt(PRICE_TABLE, model, record.time);
		return { ...record, model, cost: stepCost(record, price) };
	});
	if (corrected === 0) return 0;
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, repaired.map((record) => JSON.stringify(record) + "\n").join(""), "utf8");
	renameSync(tmp, file);
	return corrected;
}

// ────────────────────────────────────────────────────────────────
// Self-healing: re-price rows billed under the pre-2026-08-23 rule
// ────────────────────────────────────────────────────────────────

/**
 * Repair stored rows whose `peak` flag (and therefore cost) disagrees with
 * the current pricing rule: since 2026-08-23 weekends bill at the valley rate
 * all day. Rows recorded before the effective date, and rows already in
 * agreement, are never touched. Rewrites atomically only when at least one
 * row changed.
 * @param file - store path.
 * @returns how many rows were re-priced.
 */
function repairWeekendPeak(file) {
	const { records } = loadRecords(file);
	let corrected = 0;
	const repaired = records.map((record) => {
		if (record.time < WEEKEND_EFFECTIVE) return record;
		const peak = isPeak(record.time);
		if (peak === record.peak) return record;
		corrected += 1;
		const price = priceAt(PRICE_TABLE, record.model, record.time);
		return { ...record, peak, cost: stepCost(record, price) };
	});
	if (corrected === 0) return 0;
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, repaired.map((record) => JSON.stringify(record) + "\n").join(""), "utf8");
	renameSync(tmp, file);
	return corrected;
}

/**
 * Append records (deduped by key against the file) and prune when the store
 * outgrows {@link MAX_RECORDS}; the prune rewrites atomically (tmp + rename).
 *
 * Upsert rule: a record whose key already exists replaces the stored one when
 * the stored model is unknown (`default`/`unknown`) and the incoming model is
 * a real model id — the browser half posts corrections once the session
 * projection or the session-model RPC arrives. Records already carrying a real
 * model are never overwritten.
 * @param file - store path.
 * @param records - raw records from the client.
 * @returns `{added, corrected}` counts.
 */
function appendRecords(file, records) {
	const { records: existing, keys } = loadRecords(file);
	const byKey = new Map(existing.map((record) => [keyOf(record), record]));
	const fresh = [];
	let corrected = 0;
	for (const raw of records) {
		const record = parseRecord(raw);
		if (record === null) continue;
		const key = keyOf(record);
		if (byKey.has(key)) {
			const previous = byKey.get(key);
			if (isUnknownModel(previous.model) && !isUnknownModel(record.model)) {
				byKey.set(key, record);
				corrected += 1;
			}
			continue;
		}
		byKey.set(key, record);
		keys.add(key);
		fresh.push(record);
	}
	if (fresh.length === 0 && corrected === 0) return { added: 0, corrected: 0 };
	const directory = dirname(file);
	mkdirSync(directory, { recursive: true });
	if (corrected > 0) {
		const kept = [...byKey.values()];
		const tmp = `${file}.tmp`;
		writeFileSync(tmp, kept.map((record) => JSON.stringify(record) + "\n").join(""), "utf8");
		renameSync(tmp, file);
	} else {
		appendFileSync(file, fresh.map((record) => JSON.stringify(record) + "\n").join(""), "utf8");
	}
	const total = existing.length + fresh.length;
	if (total > MAX_RECORDS) {
		const { records: reloaded } = loadRecords(file);
		const kept = reloaded.slice(-KEEP_RECORDS);
		const tmp = `${file}.tmp`;
		writeFileSync(tmp, kept.map((record) => JSON.stringify(record) + "\n").join(""), "utf8");
		renameSync(tmp, file);
	}
	return { added: fresh.length, corrected };
}

/** Beijing-day label of a timestamp, e.g. "2026-08-21". */
const BEIJING_DAY = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Shanghai",
	year: "numeric",
	month: "2-digit",
	day: "2-digit"
});
function beijingDay(ms) {
	return BEIJING_DAY.format(new Date(ms));
}

/**
 * Hourly buckets for a single Beijing day: 24 hours with cost, tokens, steps
 * and a peak/valley cost split. `records` must already be scoped to one day.
 * @param records - day-scoped records.
 * @returns 24 `{hour, peak, cost, tokens, steps, peakCost, valleyCost}` rows.
 */
function aggregateHours(records) {
	const hours = Array.from({ length: 24 }, (_, hour) => {
		const peak = SEGMENTS.some((segment) => hour * HOUR >= segment.start && hour * HOUR < segment.end && segment.peak);
		return { hour, peak, cost: 0, tokens: 0, steps: 0, peakCost: 0, valleyCost: 0 };
	});
	for (const record of records) {
		const hour = Math.min(23, Math.max(0, Math.floor(beijingMsOfDay(record.time) / HOUR)));
		const bucket = hours[hour];
		const stepTokens = record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens + record.outputTokens;
		bucket.cost += record.cost;
		bucket.tokens += stepTokens;
		bucket.steps += 1;
		if (record.peak) bucket.peakCost += record.cost;
		else bucket.valleyCost += record.cost;
	}
	return hours;
}

/**
 * Per-session aggregates for a single Beijing day, most expensive first.
 * @param records - day-scoped records.
 * @param sessionTitles - sessionId -> title map (optional).
 * @returns sorted `{sessionId, sessionLabel, cost, tokens, steps}` rows.
 */
function aggregateSessions(records, sessionTitles) {
	const sessions = new Map();
	for (const record of records) {
		let session = sessions.get(record.sessionId);
		if (session === void 0) {
			sessions.set(record.sessionId, session = {
				sessionId: record.sessionId,
				sessionLabel: (sessionTitles !== void 0 && sessionTitles.get(record.sessionId)) || shortSessionId(record.sessionId),
				cost: 0,
				tokens: 0,
				steps: 0
			});
		}
		session.cost += record.cost;
		session.tokens += record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens + record.outputTokens;
		session.steps += 1;
	}
	return [...sessions.values()].sort((left, right) => right.cost - left.cost);
}

/**
 * Aggregate stored records into the dashboard summary: Beijing-day buckets
 * (month-merged past 120 buckets), per-model totals (with per-model token
 * mix), token mix, peak/valley split, and a recent list. Everything the
 * charts need, in one payload.
 * @param records - deduped records (see {@link loadRecords}).
 * @param since - epoch ms lower bound for the range.
 * @param recentLimit - how many latest records to return (newest first).
 * @param sessionTitles - sessionId -> title map (optional).
 * @param options - `{ session, model, turnLimit, day }` filters. `day`
 *   (Beijing "YYYY-MM-DD") scopes the whole summary to one calendar day and
 *   additionally returns `hours` (24 hourly buckets) and `sessions`
 *   (per-session aggregates). `modelsAll` (the per-model aggregates used for
 *   the model filter dropdown and the token-mix selector) is computed over
 *   the session/time range BEFORE the model filter, while every other
 *   aggregate applies all filters.
 * @returns the summary object.
 */
function aggregateSummary(records, since = 0, recentLimit = 20, sessionTitles = void 0, options = {}) {
	const sessionFilter = typeof options.session === "string" && options.session.length > 0 ? options.session : void 0;
	const modelFilter = typeof options.model === "string" && options.model.length > 0 ? options.model : void 0;
	const dayFilter = typeof options.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(options.day) ? options.day : void 0;
	const inRange = records.filter((record) => record.time >= since
		&& (sessionFilter === void 0 || record.sessionId === sessionFilter)
		&& (dayFilter === void 0 || beijingDay(record.time) === dayFilter));
	// Per-model aggregates over the full (pre-model-filter) range: they feed
	// the model filter dropdown and the token-mix per-model selector.
	const modelsAll = new Map();
	for (const record of inRange) {
		let model = modelsAll.get(record.model);
		if (model === void 0) {
			modelsAll.set(record.model, model = {
				model: record.model,
				cost: 0,
				tokens: 0,
				steps: 0,
				mix: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
			});
		}
		model.cost += record.cost;
		model.tokens += record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens + record.outputTokens;
		model.steps += 1;
		model.mix.input += record.inputTokens;
		model.mix.cacheRead += record.cacheReadTokens;
		model.mix.cacheWrite += record.cacheWriteTokens;
		model.mix.output += record.outputTokens;
	}
	const filtered = modelFilter === void 0 ? inRange : inRange.filter((record) => record.model === modelFilter);
	// Days that have records under the current session/model filters (all
	// history, ignoring the range and the day drill-down), so the calendar
	// can color-mark dates with data.
	const available = new Set();
	for (const record of records) {
		if (sessionFilter !== void 0 && record.sessionId !== sessionFilter) continue;
		if (modelFilter !== void 0 && record.model !== modelFilter) continue;
		available.add(beijingDay(record.time));
	}
	// Day drill-down extras: hourly breakdown + per-session aggregates, both
	// honoring every filter, computed only when a `day` was requested.
	const hours = dayFilter === void 0 ? [] : aggregateHours(filtered);
	const sessions = dayFilter === void 0 ? [] : aggregateSessions(filtered, sessionTitles);
	const days = new Map();
	const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
	const peak = { cost: 0, tokens: 0, steps: 0 };
	const valley = { cost: 0, tokens: 0, steps: 0 };
	for (const record of filtered) {
		const stepTokens = record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens + record.outputTokens;
		const day = beijingDay(record.time);
		let bucket = days.get(day);
		if (bucket === void 0) days.set(day, bucket = { day, cost: 0, tokens: 0, steps: 0, peakCost: 0, valleyCost: 0 });
		bucket.cost += record.cost;
		bucket.tokens += stepTokens;
		bucket.steps += 1;
		tokens.input += record.inputTokens;
		tokens.cacheRead += record.cacheReadTokens;
		tokens.cacheWrite += record.cacheWriteTokens;
		tokens.output += record.outputTokens;
		const side = record.peak ? peak : valley;
		side.cost += record.cost;
		side.tokens += stepTokens;
		side.steps += 1;
		if (record.peak) bucket.peakCost += record.cost;
		else bucket.valleyCost += record.cost;
	}
	const dayList = [...days.values()].sort((left, right) => left.day < right.day ? -1 : left.day > right.day ? 1 : 0);
	let buckets = dayList;
	if (dayList.length > 120) {
		const months = new Map();
		for (const bucket of dayList) {
			const month = bucket.day.slice(0, 7);
			let merged = months.get(month);
			if (merged === void 0) months.set(month, merged = { day: month, cost: 0, tokens: 0, steps: 0, peakCost: 0, valleyCost: 0 });
			merged.cost += bucket.cost;
			merged.tokens += bucket.tokens;
			merged.steps += bucket.steps;
			merged.peakCost += bucket.peakCost;
			merged.valleyCost += bucket.valleyCost;
		}
		buckets = [...months.values()].sort((left, right) => left.day < right.day ? -1 : left.day > right.day ? 1 : 0);
	}
	// Recent list: a day drill-down returns every step of that day (capped for
	// payload size); otherwise, when `turnLimit` is set, keep every step of the
	// latest N distinct turns per session (walking backwards from the newest
	// record); otherwise keep the last `recentLimit` steps.
	let recentRecords;
	const turnLimit = typeof options.turnLimit === "number" && Number.isFinite(options.turnLimit) && options.turnLimit > 0
		? Math.floor(options.turnLimit)
		: 0;
	if (dayFilter !== void 0) {
		recentRecords = filtered.slice(-Math.max(recentLimit, 1000));
	} else if (turnLimit > 0) {
		const list = [];
		const seenTurns = new Set();
		for (let i = filtered.length - 1; i >= 0; i--) {
			const record = filtered[i];
			const turnKey = `${record.sessionId}|${record.turn}`;
			if (!seenTurns.has(turnKey)) {
				if (seenTurns.size >= turnLimit) break;
				seenTurns.add(turnKey);
			}
			list.push(record);
		}
		recentRecords = list.reverse();
	} else {
		recentRecords = filtered.slice(-recentLimit);
	}
	return {
		firstTime: filtered.length > 0 ? filtered[0].time : void 0,
		lastTime: filtered.length > 0 ? filtered[filtered.length - 1].time : void 0,
		totalRecords: records.length,
		inRange: filtered.length,
		days: buckets,
		/** Days with records under the current filters (all history), for the calendar marker. */
		daysAvailable: [...available].sort(),
		/** Selected Beijing day ("YYYY-MM-DD") when this is a day drill-down. */
		day: dayFilter,
		/** 24 hourly buckets of the selected day (empty outside day drill-downs). */
		hours,
		/** Per-session aggregates of the selected day, most expensive first. */
		sessions,
		/** Per-model aggregates honoring the model filter (the distribution chart). */
		models: [...modelsAll.values()].filter((entry) => modelFilter === void 0 || entry.model === modelFilter).sort((left, right) => right.cost - left.cost),
		/** Per-model aggregates over the whole range (filter dropdown + token-mix selector). */
		modelsAll: [...modelsAll.values()].sort((left, right) => right.cost - left.cost),
		tokens,
		peak,
		valley,
		/** Valley bills at half the peak rate, so each valley step's cost equals what it saved. */
		savings: valley.cost,
		recent: recentRecords.slice().reverse().map((record) => ({
			...record,
			sessionLabel: (sessionTitles !== void 0 && sessionTitles.get(record.sessionId)) || shortSessionId(record.sessionId)
		}))
	};
}

/** Short, human-facing session identifier: the session UUID's first 8 chars. */
function shortSessionId(sessionId) {
	return typeof sessionId === "string" ? (sessionId.replace(/^session-/, "").slice(0, 8) || "?") : "?";
}

/**
 * Read the durable projection cache's `title` unit: sessionId -> session title.
 * A missing/corrupt cache or a session without a title yields an empty map.
 * @param home - resolved harness home.
 * @returns the sessionId→title map.
 */
function readSessionTitles(home) {
	const result = new Map();
	try {
		const raw = readFileSync(join(home, HISTORY_DIR, PROJCACHE_FILE), "utf8");
		const cache = JSON.parse(raw);
		const sessions = cache !== null && typeof cache === "object" ? cache.tables?.sessions : void 0;
		if (sessions === void 0 || typeof sessions !== "object") return result;
		for (const [sessionId, entry] of Object.entries(sessions)) {
			const title = entry?.rows?.title?.val;
			if (typeof title === "string" && title.length > 0) result.set(sessionId, title);
		}
	} catch {
		/* best-effort */
	}
	return result;
}

// ────────────────────────────────────────────────────────────────
// HTTP routes (exact paths on the web server)
// ────────────────────────────────────────────────────────────────

const BALANCE_URL = "https://api.deepseek.com/user/balance";
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store"
};

/**
 * Build the three route handlers against one store file.
 * @param ctx - plugin context (credentials + launch environment).
 * @param options - `{historyFile}` store path.
 * @returns the handlers.
 */
function createRoutes(ctx, options) {
	const { historyFile, home } = options;
	/** Write one {ok, value|error} envelope as JSON. */
	const send = (res, body, status = 200) => {
		res.writeHead(status, JSON_HEADERS);
		res.end(JSON.stringify(body));
	};
	/** Read a bounded JSON body. */
	const readBody = (req) => new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (chunk) => {
			data += chunk;
			if (data.length > MAX_BODY_BYTES) {
				reject(new Error("payload too large"));
				req.destroy();
			}
		});
		req.on("end", () => resolve(data));
		req.on("error", reject);
	});
	/** Resolve the DeepSeek API key: credentials service first, launch environment second. */
	const resolveApiKey = async () => {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(credentialRef("DEEPSEEK_API_KEY"));
			if (hit !== void 0 && typeof hit.value === "string" && hit.value.length > 0) return hit.value;
		}
		const ambient = launchEnvironmentOf(ctx).get("DEEPSEEK_API_KEY");
		if (ambient !== void 0 && ambient.value.length > 0) return ambient.value;
		return void 0;
	};
	/** Proxy DeepSeek /user/balance with the resolved API key. */
	const handleBalance = async (req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			send(res, { ok: false, error: { code: "method-not-allowed", message: "GET only" } }, 405);
			return;
		}
		const apiKey = await resolveApiKey();
		if (apiKey === void 0) {
			send(res, { ok: false, error: { code: "missing-credential", message: "DEEPSEEK_API_KEY 未配置：请在模型设置页填写 DeepSeek API Key" } });
			return;
		}
		try {
			const response = await fetch(BALANCE_URL, {
				method: "GET",
				headers: {
					"authorization": `Bearer ${apiKey}`,
					"accept": "application/json"
				},
				signal: AbortSignal.timeout(15000)
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				const message = body !== null && typeof body === "object" && typeof body.error?.message === "string" ? body.error.message : `HTTP ${response.status}`;
				send(res, { ok: false, error: { code: "balance-request-failed", message } }, 502);
				return;
			}
			send(res, { ok: true, value: body });
		} catch (error) {
			send(res, { ok: false, error: { code: "balance-request-failed", message: error instanceof Error ? error.message : String(error) } }, 502);
		}
	};
	/** Ingest usage records posted by the browser half. */
	const handleHistoryPost = async (req, res) => {
		if (req.method !== "POST") {
			send(res, { ok: false, error: { code: "method-not-allowed", message: "POST only" } }, 405);
			return;
		}
		try {
			const text = await readBody(req);
			const body = text.length === 0 ? {} : JSON.parse(text);
			const records = body !== null && typeof body === "object" && Array.isArray(body.records)
				? body.records.slice(0, MAX_POST_RECORDS)
				: [];
			const repaired = repairUnknownModels(historyFile, home);
			const weekendRepaired = repairWeekendPeak(historyFile);
			const { added, corrected } = appendRecords(historyFile, records);
			send(res, { ok: true, value: { added, corrected, repaired, weekendRepaired } });
		} catch (error) {
			send(res, { ok: false, error: { code: "history-write-failed", message: error instanceof Error ? error.message : String(error) } }, 500);
		}
	};
	/** Aggregated summary for the dashboard charts; `day` drills into one Beijing day. */
	const handleSummary = (req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			send(res, { ok: false, error: { code: "method-not-allowed", message: "GET only" } }, 405);
			return;
		}
		let since = 0;
		let limit = 20;
		let turns = 0;
		let session = void 0;
		let model = void 0;
		let day = void 0;
		try {
			const url = new URL(req.url ?? "/", "http://x");
			if (url.searchParams.has("since")) since = Math.max(0, Number(url.searchParams.get("since")) || 0);
			if (url.searchParams.has("limit")) limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
			if (url.searchParams.has("turns")) turns = Math.min(200, Math.max(0, Number(url.searchParams.get("turns")) || 0));
			if (url.searchParams.has("session")) {
				const raw = url.searchParams.get("session");
				if (typeof raw === "string" && raw.length > 0) session = raw.slice(0, 200);
			}
			if (url.searchParams.has("model")) {
				const raw = url.searchParams.get("model");
				if (typeof raw === "string" && raw.length > 0) model = raw.slice(0, 100);
			}
			if (url.searchParams.has("day")) {
				const raw = url.searchParams.get("day");
				if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) day = raw;
			}
		} catch {
			/* keep defaults on unparsable query */
		}
		try {
			repairUnknownModels(historyFile, home);
			repairWeekendPeak(historyFile);
			const { records } = loadRecords(historyFile);
			send(res, { ok: true, value: aggregateSummary(records, since, limit, readSessionTitles(home), { session, model, turnLimit: turns, day }) });
		} catch (error) {
			send(res, { ok: false, error: { code: "history-read-failed", message: error instanceof Error ? error.message : String(error) } }, 500);
		}
	};
	return { handleBalance, handleHistoryPost, handleSummary };
}

/**
 * Plugin body: register the projection and the three HTTP routes.
 * @param ctx - host plugin context.
 */
function apply(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register(turnModelsProjectionDefinition);
	});
	const home = resolveDshHome();
	const routes = createRoutes(ctx, { historyFile: historyPath(home), home });
	// Self-heal at boot: rows recorded before their model was known get the
	// real model (and a re-priced cost) from the durable projection cache;
	// rows billed under the pre-2026-08-23 weekend rule are re-priced at the
	// valley rate.
	try {
		const repaired = repairUnknownModels(historyPath(home), home);
		if (repaired > 0) ctx.logger?.info(`ui-usage: repaired ${repaired} unknown-model history rows`);
		const weekendRepaired = repairWeekendPeak(historyPath(home));
		if (weekendRepaired > 0) ctx.logger?.info(`ui-usage: re-priced ${weekendRepaired} weekend history rows at the valley rate`);
	} catch {
		/* best-effort */
	}
	ctx.effect(() => ctx.webServer.register({ kind: "exact", path: "/dsh-client-ui-usage/balance", handler: routes.handleBalance }), "ui-usage: balance route");
	ctx.effect(() => ctx.webServer.register({ kind: "exact", path: "/dsh-client-ui-usage/history", handler: routes.handleHistoryPost }), "ui-usage: history ingest route");
	ctx.effect(() => ctx.webServer.register({ kind: "exact", path: "/dsh-client-ui-usage/history/summary", handler: routes.handleSummary }), "ui-usage: history summary route");
}

export { aggregateSummary, appendRecords, apply, createRoutes, historyPath, inject, loadRecords, name, parseRecord, readProjectionModels, readSessionTitles, repairUnknownModels, repairWeekendPeak, shortSessionId, turnModelsProjectionDefinition };
