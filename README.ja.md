# dsh-client-ui-usage — DeepSeek Harness 用量分析プラグイン

> 🌐 Languages: [中文](README.md) · [English](README.en.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

[![GitHub release](https://img.shields.io/github/v/release/woosh2010/dsh-usage-dashboard?label=release)](https://github.com/woosh2010/dsh-usage-dashboard/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/woosh2010/dsh-usage-dashboard?style=social)](https://github.com/woosh2010/dsh-usage-dashboard/stargazers)

![デモ](docs/demo.gif)


[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) の Web（`dsh web`）の入力欄の下に**ピーク/オフピーク課金ドック**を 1 行追加します。クリックすると完全な**用量分析ダッシュボード**が展開され、セッションをまたいだ token / コスト / モデル / ピーク・オフピークのデータが自動的に保存され、グローバルフィルターと多次元チャートを提供します。

![用量分析ダッシュボード](docs/screenshots/dashboard.png)

> 注: スクリーンショットは中国語 UI のものです。

## 機能

- **ピーク/オフピーク時間帯別課金**: 北京時間のピーク時（9:00–12:00 / 14:00–18:00）とオフピーク時（半額）で課金されます。ドックには現在の時間帯、プログレスバー、次回の料金切り替えまでのカウントダウン、セッション累計 / このターンのコスト、そしてアカウント残高がリアルタイム表示されます（60 秒ごとに自動更新。公式の `/user/balance` プロキシを経由するため、API キーがブラウザの外に出ることはありません）。

  ![折りたたみドック](docs/screenshots/dock.png)

- **履歴の永続化**: 各ステップの token / コスト / モデル / ピーク・オフピークが `~/.dsh/storages/usage-history.jsonl` に自動的に書き込まれ、セッションや再起動をまたいで保持されます（ソフト上限 4 万件で古いものから自動削除）。
- **グローバルフィルター**: パネル上部のグローバルオプションにより、すべてのチャートと統計カードがリアルタイムに連動します——
  - 期間: 今日 / 7 日 / 30 日 / 90 日 / すべて
  - セッション範囲: すべてのセッション / このセッション
  - モデルフィルター: すべてのモデル / 単一モデル
- **統計カード**: コスト（ピーク/オフピークの内訳を含む）、トークン（入力/出力を含む）、ターン数（ピーク/オフピークを含む）、キャッシュヒット率、オフピーク時の節約、1 ステップあたりの平均。
- **分析チャート**:
  - コスト推移の折れ線グラフ（ホバーで当日のコスト、ピーク/オフピークの内訳を確認可能）
  - トークン構成のドーナツチャート（「すべて / モデル別」の切り替え対応）
  - モデル分布の棒グラフ（完全なモデル名 + コスト比率）
  - ピーク/オフピーク比較とオフピーク時の節約
- **最近の記録**: 直近 **20 ターン**のすべてのステップ（デフォルトで折りたたみ、ターンごとにグループ化。ターンの見出しにはモデルバッジ、ピーク/オフピーク、コストが表示され、すべて展開/折りたたみ、領域内スクロールに対応）。

  ![最近の記録](docs/screenshots/recent.png)

- **外側クリックで閉じる**: パネルは React portal で描画され、パネル外の任意の場所をクリックするか Esc キーで閉じます。

## 必要条件

- DeepSeek Harness（dsh）`0.1.1-rc.1` の `web` profile（プロファイル）
- 残高表示にはモデル設定ページで DeepSeek API Key を設定しておく必要があります（未設定の場合、残高は「—」と表示されますが、その他の機能には影響しません）

## インストール

### 方法 1: ワンクリックインストール（推奨）

> **pnpm** が必要です（`dsh plugin` は引数をそのまま pnpm に転送し、profile ディレクトリ内で実行します）。
> 未導入の場合は先に `corepack enable pnpm`（Node に同梱の corepack）または `npm install -g pnpm` でインストールしてください。

GitHub Release の tarball を 1 コマンドで直接インストールできます（動作確認済み）:

```bash
dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
```

パッケージは `dsh.bundle.patch` を宣言しているため、`dsh plugin` は `@deepseek-ai/dsh-client-ui-usage` を profile の `dsh.profile.bundles` リストに自動的に追加し、`ui-usage` エントリとしてマウントします。その後、`dsh web` を再起動してブラウザを更新してください。

> **方法 2/3 から切り替える場合**: 先に `~/.dsh/profiles/web/cordis.patch.yml` に手動で追加した `ui-usage` の insert 行を削除してください。削除しないと、bundle patch と手動 insert のエントリ id が重複して競合します。

### 方法 2: 先にダウンロードしてからインストール（オフライン/イントラネット）

1. インストールパッケージをダウンロードします（[Releases](https://github.com/woosh2010/dsh-usage-dashboard/releases) の tgz、または `curl -LO <上の URL>`。`git clone` 後に `npm pack` で自前ビルドすることもできます）。
2. tgz があるディレクトリで実行します（パスの先頭に `./` または絶対パスを付けてください。ファイル名だけを書くと pnpm が npm パッケージ名として扱います）:

   ```bash
   dsh plugin --profile web add ./deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

### 方法 3: 手動インストール

1. tarball を profile の解決パスに展開します:

   ```bash
   mkdir -p ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   tar -xzf deepseek-ai-dsh-client-ui-usage-0.4.0.tgz --strip-components=1 \
     -C ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   ```

2. `~/.dsh/profiles/web/cordis.patch.yml` にエントリを追加します:

   ```yaml
   - insert:
       - id: ui-usage
         name: '@deepseek-ai/dsh-client-ui-usage'
   ```

3. `dsh web` を再起動し、ブラウザを更新します。

> ソースディレクトリから直接使用する場合: `lib/client.js` はサーバーがファイルを直接読み込むため、クライアント側の変更はブラウザの更新で反映されます。`lib/index.js`（host 側のルーティング/ストレージ）の変更は `dsh web` の再起動が必要です。

## よくある質問（トラブルシューティング）

### アップグレード/インストール後に `dsh web` が "declares no dsh.bundle" で起動しない

**症状**: `dsh web` の再起動時に以下のエラーで終了する:

```
profile bundle "@deepseek-ai/dsh-client-ui-usage" declares no dsh.bundle in its package.json
```

**原因**（頻度順）:

1. **古い 0.1.x のインストール（`dsh.client` のみを宣言し、`dsh.bundle` を持たない）が新バージョンを覆い隠している。**
   v0.4.0 は `dsh.bundle.patch` を宣言しているため、`bundles` への登録は完全に正当です。しかし dsh が
   プロファイルディレクトリからパッケージを解決するとき、`~/.dsh/profiles/web/node_modules/@deepseek-ai/`
   内の**シンボリックリンク**（`web/packages/` 配下の古いソースコピーを指す）が、
   `~/.dsh/profiles/node_modules/@deepseek-ai/`（共有スコープ）内の新しいファイルより優先されるため、
   検証は古い package.json を読んで `declares no dsh.bundle` を報告します。
   ソースを `web/packages/` にコピーする旧来の手動インストールからアップグレードする場合に起こりがちです。
2. **パッケージ名が手動で `dsh.profile.bundles` に追加された**（プロファイルの package.json を手編集し、
   `dsh.bundle` 宣言のないバージョンに解決される）。bundle の登録は `dsh plugin add` に任せるべきで、
   手動で編集しないでください。

**対処法**:

1. 古い残骸を削除する: `~/.dsh/profiles/web/packages/dsh-client-ui-usage` と
   `~/.dsh/profiles/web/node_modules/@deepseek-ai/` 配下のシンボリックリンクを削除または置き換え、
   すべての解決パスが（`dsh.bundle` を宣言する）v0.4.0 に届くようにします。
2. 公式のワンライナーで再インストールする（bundle 登録と依存関係を自動修正）:

   ```bash
   dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

3. プロファイルの `cordis.patch.yml` に手書きの `insert` で本パッケージをマウントしていた場合は、
   どちらか**片方だけ**を残す（公式の bundles 登録を優先し、手書き insert は削除）ことで、
   二重マウントの競合を防ぎます。
4. `dsh web` を再起動し、ブラウザをハードリフレッシュします。

> マシン移行時にも同様です: 古いソースを `web/packages/` にインストールする補助スクリプト
> （シンボリックリンク経由など）は、本プラグインのアップグレード前に必ず掃除してください。
> 掃除しないと上記の解決シャドーイング問題が発生します。

### その他のインストール問題のクイック自己チェック

起動時の `bundles` 検証をローカルでシミュレートします（各 bundle が `dsh.bundle` を宣言しているか、
クライアント専用パッケージが `bundles` に紛れ込んでいないかを検査）:

```bash
node -e '
const fs=require("fs"),path=require("path");
const D=path.join(process.env.HOME,".dsh/profiles/web");
const j=JSON.parse(fs.readFileSync(path.join(D,"package.json"),"utf8"));
let ok=true;
for(const n of j.dsh.profile.bundles){
  const m=JSON.parse(fs.readFileSync(require.resolve(n+"/package.json",{paths:[D]}),"utf8"));
  const has=!!(m.dsh&&m.dsh.bundle);
  console.log((has?"✓":"✗")+" "+n+" "+m.version); if(!has)ok=false;
}
const bad=["@deepseek-ai/dsh-client-ui-usage","@deepseek-ai/dsh-client-ui-gitpush"]
  .filter(n=>j.dsh.profile.bundles.includes(n));
if(bad.length)console.log("✗ クライアント専用パッケージが bundles に混入:",bad),ok=false;
console.log(ok?"✅ チェック成功":"❌ チェック失敗"); process.exit(ok?0:1);
'
```

## 検証

デプロイ後に実行します:

```bash
node verify.mjs          # デフォルトは http://127.0.0.1:3080。baseUrl 引数を渡せます
```

スクリプトは以下を確認します: 配信されたクライアントファイルがデプロイファイルと一致すること、`modelsAll` とモデルごとの token 構造、セッション/モデルフィルター、直近 20 ターン、各モデルの mix 合計が総量と等しいこと。

## データと課金の説明

- **履歴ストレージ**: `~/.dsh/storages/usage-history.jsonl`。ソフト上限 4 万件で古いものから自動削除。モデル不明のレコードは、投影キャッシュが利用可能になると自動的に修復（再課金）されます。
- **価格表**: `lib/client.js` と `lib/index.js` に組み込まれた `PRICE_TABLE`（元/100 万トークン、ピーク/オフピークの 2 段階。キャッシュヒットはヒット価格、書き込みは入力価格で計算）。DeepSeek の価格改定後はこの 2 箇所を同様に変更してください。
- **オフピーク時の節約**: オフピーク時はピーク時の半額で計算され、`オフピーク時の節約 = オフピーク時の累計コスト` となります。

## スクリーンショットの再生成

`docs/screenshots/` のスクリーンショットは実際に稼働中の `dsh web` から取得したものです（残高の数字はマスク済み）。再生成する場合:

```bash
# 1. ヘッドレス Chrome を起動します（デバッグポート 9222）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir=/tmp/dsh-shot-profile --window-size=1440,900 about:blank

# 2. キャプチャします（DSH_CONV でサイドバーのセッション名を指定できます）
node scripts/screenshots.mjs dock
node scripts/screenshots.mjs dashboard
node scripts/screenshots.mjs recent
```

## バージョン履歴

- **0.4.0**: グローバルフィルター（期間 5 段階 / すべて・このセッション / モデルフィルター）、トークン構造のモデル別切り替え、モデル分布のフルネーム表示、直近 20 ターン（`turns` パラメーター）、統計カードのサブ情報とよりコンパクトなレイアウト、外側クリックで閉じる（portal + オーバーレイ）、最近の記録のデフォルト折りたたみ。
- **0.3.3 / 0.1.0**: 初期のピーク/オフピーク課金ドック、アカウント残高プロキシ、JSONL 履歴と集計チャート。

## License

[MIT](LICENSE)
