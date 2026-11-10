import type { ArticleOutcome, RunEvent } from "@philo/core/protocol";

export type LineKind = "info" | "start" | "step" | "success" | "warn" | "error";

export interface ConsoleLine {
  id: number;
  article: string | null; // null = gilt für den ganzen Lauf
  kind: LineKind;
  text: string;
  url?: string;
}

export type ArticleState = "queued" | "running" | ArticleOutcome;

export interface ArticleRow {
  article: string;
  state: ArticleState;
  path: string[];
  message?: string;
}

export interface RunView {
  lines: ConsoleLine[];
  rows: ArticleRow[];
  target: string;
  finished: boolean;
  cancelled: boolean;
}

const OUTCOME_TEXT: Record<ArticleOutcome, { kind: LineKind; symbol: string; label: string }> = {
  TARGET: { kind: "success", symbol: "✔", label: "Ziel erreicht" },
  LOOP: { kind: "warn", symbol: "↻", label: "Zyklus" },
  DEAD_END: { kind: "warn", symbol: "⊘", label: "Sackgasse" },
  LIMIT: { kind: "warn", symbol: "⏱", label: "Limit erreicht" },
  ERROR: { kind: "error", symbol: "✖", label: "Fehler" },
  CANCELLED: { kind: "error", symbol: "■", label: "Abgebrochen" },
};

export function outcomeLabel(state: ArticleState): string {
  if (state === "queued") return "wartet";
  if (state === "running") return "läuft";
  return OUTCOME_TEXT[state].label;
}

/** Die Ereignisliste in Konsolenzeilen und eine Übersichtstabelle umwandeln. */
export function buildView(events: RunEvent[]): RunView {
  const lines: ConsoleLine[] = [];
  const rows = new Map<string, ArticleRow>();
  const view: RunView = { lines, rows: [], target: "", finished: false, cancelled: false };
  const push = (line: Omit<ConsoleLine, "id">) => lines.push({ id: lines.length, ...line });

  for (const event of events) {
    switch (event.type) {
      case "run-start":
        view.target = event.target;
        for (const article of event.articles) rows.set(article, { article, state: "queued", path: [] });
        push({
          article: null,
          kind: "info",
          text: `▶ ${event.articles.length} Spiel(e) · Ziel „${event.target}“ · max. ${event.maxSteps} Artikel · ${event.concurrency} parallel`,
        });
        break;
      case "game-start":
        rows.get(event.article)!.state = "running";
        push({ article: event.article, kind: "start", text: `Starte bei „${event.article}“ …` });
        break;
      case "step":
        rows.get(event.article)!.path.push(event.title);
        push({
          article: event.article,
          kind: "step",
          text: `${String(event.step).padStart(3)}. ${event.title}`,
          url: event.url,
        });
        break;
      case "game-end": {
        const row = rows.get(event.article)!;
        Object.assign(row, { state: event.status, path: event.path });
        const o = OUTCOME_TEXT[event.status];
        push({ article: event.article, kind: o.kind, text: `${o.symbol} ${event.status} nach ${event.path.length} Artikeln` });
        break;
      }
      case "game-error": {
        const row = rows.get(event.article)!;
        Object.assign(row, { state: event.cancelled ? "CANCELLED" : "ERROR", message: event.message });
        push({ article: event.article, kind: "error", text: `✖ ${event.message}` });
        break;
      }
      case "run-end": {
        view.finished = true;
        view.cancelled = event.cancelled;
        for (const result of event.results) {
          const row = rows.get(result.article)!;
          if (row.state === "queued" || row.state === "running") {
            Object.assign(row, { state: result.outcome, message: result.message });
          }
        }
        const reached = event.results.filter((r) => r.outcome === "TARGET").length;
        push({
          article: null,
          kind: event.cancelled ? "error" : "info",
          text: `${event.cancelled ? "■ Abgebrochen" : "■ Fertig"}: ${reached}/${event.results.length} erreichten „${view.target}“`,
        });
        break;
      }
    }
  }
  view.rows = [...rows.values()];
  return view;
}
