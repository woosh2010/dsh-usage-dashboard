#!/usr/bin/env node
/**
 * Minimal CDP driver for headless Chrome (native WebSocket, no deps).
 * Used to screenshot the live dsh web GUI for the README.
 *
 * Usage: node scripts/screenshots.mjs <dock|dashboard|recent>
 * Env: DSH_APP (default http://127.0.0.1:3080/),
 *      DSH_CONV (sidebar conversation label fragment, default 用量分析UI优化),
 *      DSH_SHOT_DIR (output dir).
 */
const PORT = 9222;
const APP = process.env.DSH_APP ?? "http://127.0.0.1:3080/";
const CONV = process.env.DSH_CONV ?? "用量分析UI优化";
const OUT = process.env.DSH_SHOT_DIR ?? new URL("../docs/screenshots", import.meta.url).pathname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  return res.json();
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) fn(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
}

async function connectPage() {
  const targets = await listTargets();
  let page = targets.find((t) => t.type === "page" && t.url.includes("127.0.0.1:3080"));
  if (!page) page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return new CDP(ws);
}

async function evalJs(cdp, expression, awaitPromise = true) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (exceptionDetails) {
    const detail = exceptionDetails.exception?.description ?? exceptionDetails.text;
    throw new Error(`evaluate failed: ${detail}`);
  }
  return result?.value;
}

/** Center point of an element matched by `expression`. */
async function centerOf(cdp, expression) {
  return evalJs(cdp, `(() => {
    const el = ${expression};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, scale: window.devicePixelRatio || 1, top: r.y, left: r.x };
  })()`);
}

/** Real (trusted) mouse click via CDP Input domain. */
async function realClick(cdp, rect) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function navigate(cdp, url) {
  await cdp.send("Page.enable");
  const loaded = new Promise((resolve) => {
    const handler = () => {
      resolve();
    };
    cdp.on("Page.loadEventFired", handler);
  });
  await cdp.send("Page.navigate", { url });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(3500);
}

async function screenshot(cdp, file, { full = true, clip = null } = {}) {
  const params = { format: "png", fromSurface: true, captureBeyondViewport: full };
  if (clip) params.clip = clip;
  const { data } = await cdp.send("Page.captureScreenshot", params);
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${file}`, Buffer.from(data, "base64"));
  console.log(`saved ${OUT}/${file}`);
}

/**
 * Privacy pass for README captures: darken the panel backdrop so the
 * conversation behind it is unreadable, and mask every digit sequence
 * inside the balance card (account amounts) with "•".
 */
async function redact(cdp) {
  await evalJs(cdp, `(() => {
    const overlay = [...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d);
      return cs.position === "fixed" && cs.zIndex === "150";
    });
    if (overlay) {
      const backdrop = [...overlay.children].find((c) => c.style && c.style.position === "absolute");
      if (backdrop) backdrop.style.background = "color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent)";
    }
    const titles = [...document.querySelectorAll("div, span")].filter((el) => (el.textContent ?? "") === "账户余额" && el.children.length === 0);
    for (const t of titles) {
      let card = t;
      while (card && card.tagName !== "BODY" && !((card.textContent ?? "").length > 60)) card = card.parentElement;
      if (!card || card.tagName === "BODY") continue;
      for (const el of card.querySelectorAll("span, div")) {
        if (el.children.length === 0 && /[0-9]/.test(el.textContent ?? "")) {
          el.textContent = el.textContent.replace(/[0-9][0-9.,:·]*/g, "•");
        }
      }
    }
    // Dock balance chip (visible when the panel is closed).
    const chip = [...document.querySelectorAll("span")].find((s) => /^(CNY|USD|¥)\\s*[0-9]/.test((s.textContent ?? "").trim()));
    if (chip) chip.textContent = (chip.textContent ?? "").replace(/[0-9][0-9.,]*/g, "•");
    return true;
  })()`);
}

async function main() {
  const mode = process.argv[2] ?? "dashboard";
  const cdp = await connectPage();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

  await navigate(cdp, APP);
  console.log("after nav:", await evalJs(cdp, "location.href"));

  // Ensure a conversation is open (its composer carries the usage dock).
  let hasDock = await evalJs(cdp, '!!document.querySelector(\'[title="用量分析"]\')');
  console.log("hasDock:", hasDock);
  if (!hasDock) {
    const row = await centerOf(cdp, `[...document.querySelectorAll("span")].find((s) => (s.textContent ?? "").includes("${CONV}"))`);
    if (row) {
      await realClick(cdp, row);
      await sleep(8000);
      hasDock = await evalJs(cdp, '!!document.querySelector(\'[title="用量分析"]\')');
      console.log("after opening conversation, hasDock:", hasDock);
    }
  }

  if (mode === "dock") {
    await redact(cdp);
    const dock = await centerOf(cdp, 'document.querySelector(\'[title="用量分析"]\')');
    console.log("dock:", JSON.stringify(dock));
    if (dock) {
      const pad = 20;
      await screenshot(cdp, "dock.png", {
        full: false,
        clip: {
          x: Math.max(0, dock.left - pad),
          y: Math.max(0, dock.top - pad),
          width: Math.min(1440, dock.width + pad * 2),
          height: dock.height + pad * 2,
          scale: dock.scale
        }
      });
    }
    return;
  }

  // Open the usage dashboard.
  const dock = await centerOf(cdp, 'document.querySelector(\'[title="用量分析"]\')');
  if (!dock) throw new Error("usage dock not found");
  await realClick(cdp, dock);
  await sleep(3500);

  if (mode === "dashboard") {
    await redact(cdp);
    await screenshot(cdp, "dashboard.png");
    return;
  }

  if (mode === "recent") {
    // Expand all turns, then scroll the recent card into view inside the panel.
    const expand = await centerOf(cdp, `[...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("展开全部"))`);
    if (expand) {
      await realClick(cdp, expand);
      await sleep(1500);
    }
    await evalJs(cdp, `(() => {
      const headings = [...document.querySelectorAll("div, span")];
      const label = headings.find((h) => (h.textContent ?? "").startsWith("最近记录") && h.children.length === 0);
      let card = label;
      while (card && card.tagName !== "BODY") {
        if ((card.style ?? {}).gridColumn === "span 12" && (card.textContent ?? "").length > 40) break;
        card = card.parentElement;
      }
      if (card) {
        card.scrollIntoView({ block: "nearest" });
        const scroller = card.closest('div[style*="overflow-y"]');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }
      return card ? "scrolled" : "no card";
    })()`);
    await sleep(1200);
    await redact(cdp);
    await screenshot(cdp, "recent.png");
    return;
  }

  console.log("unknown mode:", mode);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
