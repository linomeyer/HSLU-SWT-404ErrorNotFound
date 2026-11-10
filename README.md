# Philosophie-Spiel (TypeScript)

TypeScript-Version des Python-Projekts `HSLU-SWT-404ErrorNotFound`: Ausgehend von beliebigen
Artikeln der deutschen Wikipedia wird jeweils dem ersten gültigen Link gefolgt, bis ein Titel
„Philosophie" enthält. Selenium WebDriver steuert dafür einen **unsichtbaren** (headless) Browser;
die Weboberfläche zeigt die besuchten Artikel live in einer Konsole.

## Voraussetzungen

- Node.js ≥ 20 (getestet mit 24)
- Chrome, Firefox oder Edge (werden in dieser Reihenfolge ausprobiert). Den passenden Treiber lädt
  Selenium Manager automatisch herunter.

## Start

```sh
npm install
npm run dev          # Server (Port 3001) + Vite (http://localhost:5173) mit Hot Reload
```

Produktionsbetrieb in einem Prozess:

```sh
npm run build        # Oberfläche bauen
npm start            # http://localhost:3001
```

Umgebungsvariablen: `PORT` (Standard 3001), `SHOW_BROWSER=1` zeigt die Browserfenster an.

Kommandozeile wie im Python-Projekt:

```sh
npm run cli -- Banane --target Philosophie --steps 50 [--show]
```

## Bedienung

1. Artikel suchen (Autovervollständigung über die Wikipedia-API) und mit Enter hinzufügen,
   mehrere Zeilen einfügen oder „🎲 3 zufällige" wählen.
2. Ziel, maximale Anzahl Artikel und Anzahl paralleler Browser einstellen.
3. „▶ Spielen" – die Konsole zeigt jeden besuchten Artikel; Reiter filtern nach Startartikel.
   „■ Stopp" bricht den Lauf ab. Die Tabelle fasst Ergebnis und Pfad pro Artikel zusammen.

Ergebnisse: `TARGET` (Ziel erreicht), `LOOP` (Titel erneut besucht), `DEAD_END` (kein gültiger Link),
`LIMIT` (maximale Anzahl erreicht; der Startartikel zählt mit), sowie `ERROR` / `CANCELLED`.

## Aufbau

| Paket | Inhalt |
|---|---|
| `packages/core` | Spiellogik `play()`, Selenium-Anbindung, `scripts/first_link.js` (unverändert aus dem Python-Projekt), CLI, gemeinsame Typen (`protocol.ts`) |
| `packages/server` | Express: `POST /api/runs`, `GET /api/runs/:id/events` (Server-Sent Events), `DELETE /api/runs/:id`, `GET /api/search`, `GET /api/random` |
| `packages/web` | React-Oberfläche (Vite) |

Ein Lauf verteilt die Artikel auf bis zu 4 Worker mit je eigenem Browser. Alle Ereignisse werden
gespeichert, sodass die Oberfläche nach Verbindungsabbrüchen per `Last-Event-ID` nahtlos fortsetzt.

## Tests

```sh
npm test             # Unit-Tests (Spiel mit Browser-Attrappe, Server mit Spiel-Attrappe)
npm run test:online  # Integrationstests gegen echtes Wikipedia (portiert aus pytest)
npm run typecheck
```

Die Online-Tests hängen vom aktuellen Wikipedia-Inhalt ab und müssen bei Änderungen angepasst werden.
