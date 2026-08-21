# dsh-client-ui-usage — DeepSeek Harness Nutzungsanalyse-Plugin

> 🌐 Languages: [中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch**

> Hinweis: Die Screenshots zeigen die Benutzeroberfläche in chinesischer Sprache.

Fügt unterhalb des Eingabefelds der [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)-Weboberfläche (`dsh web`) eine Zeile mit einem **Peak-/Off-Peak-Abrechnungsdock** hinzu; ein Klick klappt das vollständige **Nutzungsanalyse-Dashboard** auf: Token-/Kosten-/Modell-/Peak-/Off-Peak-Daten werden sitzungsübergreifend automatisch persistiert und mit globalen Filtern sowie mehrdimensionalen Diagrammen bereitgestellt.

![Nutzungsanalyse-Dashboard](docs/screenshots/dashboard.png)

## Funktionen

- **Peak-/Off-Peak-Zeitabrechnung**: Abrechnung nach Pekinger Zeit mit Peakzeiten (9:00–12:00 / 14:00–18:00) und Off-Peak-Zeiten (halber Preis). Das Dock zeigt in Echtzeit den aktuellen Zeitabschnitt, einen Fortschrittsbalken, den Countdown bis zur nächsten Preisänderung, die kumulierten Kosten der Sitzung / der aktuellen Runde sowie das Kontoguthaben (automatische Aktualisierung alle 60 Sekunden über den offiziellen `/user/balance`-Proxy; der API Key verlässt den Browser nicht).

  ![Eingeklapptes Dock](docs/screenshots/dock.png)

- **Historische Persistenz**: Token / Kosten / Modell / Peak-/Off-Peak-Werte jedes Schritts werden automatisch nach `~/.dsh/storages/usage-history.jsonl` geschrieben und sitzungs- sowie neustartübergreifend aufbewahrt (Softlimit von 40.000 Einträgen, älteste werden automatisch entfernt).
- **Globale Filter**: globale Optionen oben im Panel, die alle Diagramme und Statistik-Karten in Echtzeit miteinander verknüpfen —
  - Zeitraum: Heute / 7 Tage / 30 Tage / 90 Tage / Alle
  - Sitzungsbereich: Alle Sitzungen / Diese Sitzung
  - Modellfilter: Alle Modelle / Einzelnes Modell
- **Statistik-Karten**: Kosten (mit Peak-/Off-Peak-Aufschlüsselung), Tokens (mit Eingabe/Ausgabe), Runden (mit Peak/Off-Peak), Cache-Trefferquote, Off-Peak-Ersparnis, Durchschnitt pro Schritt.
- **Analyse-Diagramme**:
  - Kostentrend-Liniendiagramm (Hover zeigt Tageskosten und Peak-/Off-Peak-Aufschlüsselung)
  - Ringdiagramm zur Token-Struktur (umschaltbar zwischen „Alle / nach Modell“)
  - Balkendiagramm zur Modellverteilung (vollständiger Modellname + Kostenanteil)
  - Peak-/Off-Peak-Vergleich und Off-Peak-Ersparnis
- **Letzte Einträge**: alle Schritte der letzten **20 Runden** (standardmäßig eingeklappt, nach Runden gruppiert; Rundentitel mit Modell-Badge, Peak/Off-Peak und Kosten; alle auf-/zuklappen möglich, Scrollen im Bereich).

  ![Letzte Einträge](docs/screenshots/recent.png)

- **Schließen durch Klick außerhalb**: Das Panel wird über ein React-Portal gerendert; ein Klick außerhalb des Panels oder Esc schließt es.

## Voraussetzungen

- Das `web`-Profil von DeepSeek Harness (dsh) `0.1.1-rc.1`
- Für die Guthabenanzeige muss auf der Modell-Einstellungsseite ein DeepSeek API Key konfiguriert sein (ohne Konfiguration wird das Guthaben als „—“ angezeigt; die übrigen Funktionen sind davon nicht betroffen)

## Installation

### Methode 1: Installation mit einem Befehl (empfohlen)

> **pnpm** wird benötigt (`dsh plugin` leitet die Argumente unverändert an pnpm weiter und führt sie im Profilverzeichnis aus).
> Falls nicht vorhanden, zuerst installieren: `corepack enable pnpm` (corepack ist bei Node enthalten) oder `npm install -g pnpm`.

Ein einziger Befehl installiert das Tarball direkt aus dem GitHub Release (getestet und funktionsfähig):

```bash
dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
```

Das Paket deklariert `dsh.bundle.patch`; `dsh plugin` trägt `@deepseek-ai/dsh-client-ui-usage` automatisch in die Liste `dsh.profile.bundles` des Profils ein und mountet es als Eintrag `ui-usage`. Danach `dsh web` neu starten und den Browser aktualisieren.

> **Wechsel von Methode 2/3**: Vorher die manuell hinzugefügte `ui-usage`-insert-Zeile in `~/.dsh/profiles/web/cordis.patch.yml` entfernen, andernfalls kollidieren die Eintrags-IDs von bundle patch und manuellem insert.

### Methode 2: Erst herunterladen, dann installieren (offline/Intranet)

1. Installationspaket herunterladen (das tgz unter [Releases](https://github.com/woosh2010/dsh-usage-dashboard/releases) oder `curl -LO <obige URL>`; alternativ nach `git clone` selbst mit `npm pack` erzeugen).
2. Im Verzeichnis des tgz ausführen (auf `./` vor dem Pfad oder einen absoluten Pfad achten — ein bloßer Dateiname wird von pnpm als npm-Paketname interpretiert):

   ```bash
   dsh plugin --profile web add ./deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

### Methode 3: Manuelle Installation

1. Tarball in den Auflösungspfad des Profils entpacken:

   ```bash
   mkdir -p ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   tar -xzf deepseek-ai-dsh-client-ui-usage-0.4.0.tgz --strip-components=1 \
     -C ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   ```

2. In `~/.dsh/profiles/web/cordis.patch.yml` einen Eintrag hinzufügen:

   ```yaml
   - insert:
       - id: ui-usage
         name: '@deepseek-ai/dsh-client-ui-usage'
   ```

3. `dsh web` neu starten und den Browser aktualisieren.

> Direkte Verwendung aus dem Quellcode-Verzeichnis: `lib/client.js` wird vom Server direkt als Datei gelesen; Client-Änderungen werden durch Aktualisieren des Browsers wirksam. Änderungen an `lib/index.js` (Routing/Speicherung auf Host-Seite) erfordern einen Neustart von `dsh web`.

## Verifizierung

Nach der Bereitstellung ausführen:

```bash
node verify.mjs          # Standard: http://127.0.0.1:3080; ein baseUrl-Argument kann übergeben werden
```

Das Skript prüft: ob die ausgelieferten Client-Dateien mit den bereitgestellten Dateien übereinstimmen, die `modelsAll`- und die Token-Struktur pro Modell, die Sitzungs-/Modellfilter, die letzten 20 Runden und ob die mix-Summe der einzelnen Modelle der Gesamtmenge entspricht.

## Daten- und Abrechnungshinweise

- **Historischer Speicher**: `~/.dsh/storages/usage-history.jsonl`, Softlimit von 40.000 Einträgen mit automatischem Entfernen der ältesten; Einträge mit unbekanntem Modell werden automatisch repariert (neu abgerechnet), sobald der Projektions-Cache verfügbar ist.
- **Preistabelle**: die `PRICE_TABLE` in `lib/client.js` und `lib/index.js` (Yuan/Million Tokens, zwei Stufen Peak/Off-Peak; Cache-Treffer zum Trefferpreis, Schreibvorgänge zum Eingabepreis). Nach einer Preisänderung durch DeepSeek müssen nur diese beiden Stellen angepasst werden.
- **Off-Peak-Ersparnis**: Off-Peak-Zeiten werden zum halben Peakpreis abgerechnet, `Off-Peak-Ersparnis = kumulierte Off-Peak-Kosten`.

## Screenshots neu erzeugen

Die Screenshots in `docs/screenshots/` stammen aus einem real laufenden `dsh web` (Guthabenzahlen sind unkenntlich gemacht). Neu erzeugen:

```bash
# 1. Headless Chrome starten (Debug-Port 9222)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir=/tmp/dsh-shot-profile --window-size=1440,900 about:blank

# 2. Screenshots aufnehmen (DSH_CONV kann gesetzt werden, um den Namen der Seitenleisten-Sitzung anzugeben)
node scripts/screenshots.mjs dock
node scripts/screenshots.mjs dashboard
node scripts/screenshots.mjs recent
```

## Versionshistorie

- **0.4.0**: globale Filter (Zeitraum in 5 Stufen / Alle · Diese Sitzung / Modellfilter), Token-Struktur nach Modell umschaltbar, vollständige Namen in der Modellverteilung, letzte 20 Runden (`turns`-Parameter), Zusatzinformationen der Statistik-Karten und kompakteres Layout, Schließen durch Klick außerhalb (Portal + Overlay), letzte Einträge standardmäßig eingeklappt.
- **0.3.3 / 0.1.0**: erstes Peak-/Off-Peak-Abrechnungsdock, Guthaben-Proxy, JSONL-Verlauf und aggregierte Diagramme.

## License

[MIT](LICENSE)
