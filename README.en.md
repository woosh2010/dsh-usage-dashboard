# dsh-client-ui-usage — DeepSeek Harness Usage Analysis Plugin

> 🌐 Languages: [中文](README.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

Adds a **peak/off-peak billing dock** below the input box of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web (`dsh web`); click it to expand a complete **usage analysis dashboard**: token / cost / model / peak-off-peak data is persisted automatically across sessions, with global filters and multi-dimensional charts.

![Usage analysis dashboard](docs/screenshots/dashboard.png)

## Features

> Note: the screenshots below show the Chinese UI; the plugin's interface also ships an English dictionary.

- **Peak/off-peak time-of-use billing**: priced by Beijing-time peak hours (9:00–12:00 / 14:00–18:00) and off-peak hours (half price); the dock shows in real time the current period, a progress bar, a countdown to the next rate change, session cumulative / current-round cost, and account balance (auto-refreshes every 60 seconds via the official `/user/balance` proxy, with the API Key never leaving the browser).

  ![Collapsed dock](docs/screenshots/dock.png)

- **History persistence**: every step's token / cost / model / peak-off-peak data is automatically written to `~/.dsh/storages/usage-history.jsonl`, retained across sessions and restarts (soft limit of 40,000 entries, oldest automatically trimmed).
- **Global filters**: the global options at the top of the panel drive all charts and stat cards in real time —
  - Time range: Today / 7 days / 30 days / 90 days / All
  - Session scope: All sessions / This session
  - Model filter: All models / Single model
- **Stat cards**: cost (with peak/off-peak breakdown), tokens (with input/output), turns (with peak/off-peak), cache hit rate, off-peak savings, per-step average.
- **Analysis charts**:
  - Cost trend line chart (hover to view the day's cost and peak/off-peak breakdown)
  - Token structure donut chart (switchable between "All / By model")
  - Model distribution bar chart (full model name + cost share)
  - Peak/off-peak comparison and off-peak savings
- **Recent records**: all steps of the most recent **20 turns** (collapsed by default, grouped by turn, turn headers with model badge, peak/off-peak and cost, expand/collapse all, scrolling within the area).

  ![Recent records](docs/screenshots/recent.png)

- **Close on outside click**: the panel is rendered via a React portal; click anywhere outside the panel or press Esc to close.

## Requirements

- DeepSeek Harness (dsh) `0.1.1-rc.1` `web` profile
- The balance display requires a DeepSeek API Key configured on the model settings page (when unconfigured, the balance shows "—" and all other features are unaffected)

## Installation

### Method 1: One-click install (recommended)

> Requires **pnpm** (`dsh plugin` forwards arguments to pnpm as-is and runs them in the profile directory).
> If you don't have it, install it first: `corepack enable pnpm` (Node ships with corepack) or `npm install -g pnpm`.

One command to install the tarball from the GitHub Release directly (verified working):

```bash
dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
```

The package declares `dsh.bundle.patch`; `dsh plugin` automatically writes `@deepseek-ai/dsh-client-ui-usage` into the profile's `dsh.profile.bundles` list and mounts it as a `ui-usage` entry. Then restart `dsh web` and refresh the browser.

> **Switching from Method 2/3**: first delete the manually added `ui-usage` insert line in `~/.dsh/profiles/web/cordis.patch.yml`, otherwise the bundle patch and the manually inserted entry ids will collide.

### Method 2: Download first, then install (offline/intranet)

1. Download the package (the tgz in [Releases](https://github.com/woosh2010/dsh-usage-dashboard/releases), or `curl -LO <the URL above>`; you can also `git clone` and then build your own with `npm pack`).
2. In the directory containing the tgz, run (note the `./` prefix or absolute path — writing just the file name makes pnpm treat it as an npm package name):

   ```bash
   dsh plugin --profile web add ./deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

### Method 3: Manual install

1. Extract the tarball to the profile's resolved path:

   ```bash
   mkdir -p ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   tar -xzf deepseek-ai-dsh-client-ui-usage-0.4.0.tgz --strip-components=1 \
     -C ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   ```

2. Add an entry to `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: ui-usage
         name: '@deepseek-ai/dsh-client-ui-usage'
   ```

3. Restart `dsh web` and refresh the browser.

> Using directly from the source directory: `lib/client.js` is read directly from the file by the server, so client-side changes take effect on browser refresh; changes to `lib/index.js` (host-side routes/storage) require restarting `dsh web`.

## Verification

After deployment, run:

```bash
node verify.mjs          # default http://127.0.0.1:3080, pass a baseUrl argument
```

The script checks: the served client file matches the deployed file, `modelsAll` and per-model token structure, session/model filtering, the most recent 20 turns, and that the per-model mix sums equal the total.

## Data & billing notes

- **History storage**: `~/.dsh/storages/usage-history.jsonl`, soft limit of 40,000 entries with automatic trimming of the oldest; records with unknown models are automatically repaired (re-priced) once the projection cache becomes available.
- **Price table**: the `PRICE_TABLE` built into `lib/client.js` and `lib/index.js` (CNY per million tokens, peak and off-peak tiers; cache hits priced at the hit rate, writes at the input rate). After DeepSeek changes prices, update these two places to match.
- **Off-peak savings**: off-peak is priced at half the peak rate, so `off-peak savings = off-peak cumulative cost`.

## Regenerating screenshots

The screenshots in `docs/screenshots/` come from a real running `dsh web` (balance figures masked). To regenerate:

```bash
# 1. Launch headless Chrome (debug port 9222)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir=/tmp/dsh-shot-profile --window-size=1440,900 about:blank

# 2. Take the screenshot (optionally set DSH_CONV to specify the sidebar session name)
node scripts/screenshots.mjs dock
node scripts/screenshots.mjs dashboard
node scripts/screenshots.mjs recent
```

## Version history

- **0.4.0**: global filters (5-tier time range / All·This session / model filter), token structure switchable by model, model distribution shows full names, most recent 20 turns (`turns` parameter), stat card sub-info and a more compact layout, close on outside click (portal + overlay), recent records collapsed by default.
- **0.3.3 / 0.1.0**: initial peak/off-peak billing dock, account balance proxy, JSONL history and aggregate charts.

## License

[MIT](LICENSE)
