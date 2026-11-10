// Gemeinsame Typen für Server und Web-Oberfläche. Diese Datei darf nichts importieren,
// damit das Frontend sie ohne Selenium- oder Node-Abhängigkeiten verwenden kann.

/** Abbruchgrund eines Spiels, identisch zur Python-Version. */
export type GameStatus = "TARGET" | "LOOP" | "DEAD_END" | "LIMIT";

/** Ergebnis eines Artikels innerhalb eines Laufs. */
export type ArticleOutcome = GameStatus | "ERROR" | "CANCELLED";

export interface ArticleResult {
  article: string;
  outcome: ArticleOutcome;
  path: string[];
  message?: string;
}

export interface RunRequest {
  articles: string[];
  target?: string;
  maxSteps?: number;
  concurrency?: number;
}

export interface RunCreated {
  runId: string;
}

export type RunEvent =
  | { type: "run-start"; articles: string[]; target: string; maxSteps: number; concurrency: number }
  | { type: "game-start"; article: string }
  | { type: "step"; article: string; step: number; title: string; url: string }
  | { type: "game-end"; article: string; status: GameStatus; path: string[] }
  | { type: "game-error"; article: string; message: string; path: string[]; cancelled: boolean }
  | { type: "run-end"; cancelled: boolean; results: ArticleResult[] };

export const DEFAULTS = { target: "Philosophie", maxSteps: 50, concurrency: 2 } as const;
export const LIMITS = { maxArticles: 50, maxSteps: 200, maxConcurrency: 4, maxTargetLength: 100 } as const;
