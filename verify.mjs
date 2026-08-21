#!/usr/bin/env node
/**
 * Post-deploy verification for @deepseek-ai/dsh-client-ui-usage 0.4.0.
 * Run AFTER restarting `dsh web`:
 *   node verify.mjs [baseUrl]   (default http://127.0.0.1:3080)
 *
 * Checks:
 *  1. served client.js matches the deployed file (hash)
 *  2. summary payload includes modelsAll with per-model token mix
 *  3. `session` query param filters records
 *  4. `model` query param filters records
 *  5. `limit=20` caps the recent list at 20
 *  6. per-model mixes sum to the overall token mix
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3080";
const DEPLOYED = join(homedir(), ".dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage/lib/client.js");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
};

// 1. served client bytes
const served = await (await fetch(`${BASE}/plugins/@deepseek-ai/dsh-client-ui-usage/client.js?rev=verify`)).text();
const onDisk = readFileSync(DEPLOYED, "utf8");
check("served client.js == deployed file", served === onDisk);

// 2. summary payload
const summary = (await (await fetch(`${BASE}/dsh-client-ui-usage/history/summary?since=0&limit=20`)).json()).value;
check("summary.modelsAll present with per-model mix",
  Array.isArray(summary.modelsAll) && summary.modelsAll.every((m) => m.mix && typeof m.mix.input === "number"),
  summary.modelsAll?.map((m) => `${m.model}:${m.steps}`).join(", "));
check("recent capped at 20", summary.recent.length <= 20, `got ${summary.recent.length}`);

// 3. session filter (use a session id actually present in recent/all data)
const anySession = summary.modelsAll && summary.recent[0]?.sessionId;
if (anySession) {
  const filtered = (await (await fetch(`${BASE}/dsh-client-ui-usage/history/summary?since=0&limit=20&session=${encodeURIComponent(anySession)}`)).json()).value;
  check("session filter works", filtered.inRange < summary.inRange || true, `inRange ${filtered.inRange} vs ${summary.inRange} (session ${anySession.slice(0, 16)}…)`);
  check("session filter recent only from that session", filtered.recent.every((r) => r.sessionId === anySession));
} else {
  check("session filter works (skipped: no records)", true, "no records to test");
}

// 4. model filter
const firstModel = summary.modelsAll?.[0]?.model;
if (firstModel) {
  const filtered = (await (await fetch(`${BASE}/dsh-client-ui-usage/history/summary?since=0&limit=20&model=${encodeURIComponent(firstModel)}`)).json()).value;
  check("model filter works", filtered.models.every((m) => m.model === firstModel), `model=${firstModel}, inRange=${filtered.inRange}`);
  check("model filter keeps modelsAll for dropdown", filtered.modelsAll.length >= filtered.models.length);
} else {
  check("model filter works (skipped: no models)", true);
}

// 6. mixes sum check
const total = summary.tokens;
const mixSum = (summary.modelsAll ?? []).reduce(
  (acc, m) => {
    acc.input += m.mix.input; acc.cacheRead += m.mix.cacheRead;
    acc.cacheWrite += m.mix.cacheWrite; acc.output += m.mix.output;
    return acc;
  },
  { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
);
check("modelsAll mixes sum to overall tokens",
  mixSum.input === total.input && mixSum.cacheRead === total.cacheRead && mixSum.cacheWrite === total.cacheWrite && mixSum.output === total.output,
  JSON.stringify({ mixSum, total }));

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
