import type { GameStatus } from "./protocol.ts";

export const BASE_URL = "https://de.wikipedia.org/wiki/";
export const TARGET = "philosophie";
export const MAX_STEPS = 50;

/**
 * Minimale Browser-Schnittstelle, die das Spiel benötigt. Die Selenium-Umsetzung
 * steht in browser.ts; Unit-Tests verwenden eine Attrappe ohne echten Browser.
 */
export interface WikiBrowser {
  open(url: string): Promise<void>;
  /** Bis zu zehn Sekunden auf die Artikelüberschrift warten und sie lesen. */
  readTitle(): Promise<string>;
  /** true, wenn Wikipedia "Artikel existiert nicht" anzeigt. */
  isMissingArticle(): Promise<boolean>;
  /** Adresse des ersten gültigen Links gemäss Spielregeln oder null. */
  firstLinkHref(): Promise<string | null>;
  currentUrl(): Promise<string>;
}

export interface GameOptions {
  maxSteps?: number;
  target?: string;
  signal?: AbortSignal;
}

export interface StepEvent {
  step: number;
  title: string;
  url: string;
}

export interface GameResult {
  path: string[];
  status: GameStatus;
}

export class ArticleNotFoundError extends Error {
  constructor(readonly title: string) {
    super(`Wikipedia-Artikel existiert nicht: ${title}`);
    this.name = "ArticleNotFoundError";
  }
}

export class GameAbortedError extends Error {
  constructor() {
    super("Spiel abgebrochen.");
    this.name = "GameAbortedError";
  }
}

/** Artikelnamen wie Pythons quote() kodieren: Leerzeichen werden zu "_", "/" bleibt erhalten. */
export function articleUrl(article: string): string {
  return BASE_URL + encodeURIComponent(article.trim().replaceAll(" ", "_")).replaceAll("%2F", "/");
}

/** Annäherung an Pythons str.casefold(). */
function fold(text: string): string {
  return text.normalize("NFKC").toLowerCase().replaceAll("ß", "ss");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new GameAbortedError();
}

/**
 * Das Spiel ab startArticle spielen und besuchte Titel samt Abbruchgrund liefern.
 *
 * TARGET: Ziel erreicht; LOOP: Titel erneut besucht;
 * DEAD_END: kein gültiger Link; LIMIT: maximale Anzahl Artikel erreicht.
 * Auch der Startartikel zählt als Schritt.
 */
export async function play(
  browser: WikiBrowser,
  startArticle: string,
  options: GameOptions = {},
  onStep?: (event: StepEvent) => void,
): Promise<GameResult> {
  const { maxSteps = MAX_STEPS, target = TARGET, signal } = options;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError("maxSteps muss mindestens 1 sein.");
  }
  const needle = fold(target);

  throwIfAborted(signal);
  await browser.open(articleUrl(startArticle));
  const path: string[] = [];
  const visited = new Set<string>();

  for (let step = 1; step <= maxSteps; step++) {
    throwIfAborted(signal);
    const title = await browser.readTitle();
    if (await browser.isMissingArticle()) throw new ArticleNotFoundError(title);
    path.push(title);
    onStep?.({ step, title, url: await browser.currentUrl() });

    // Teilwortsuche ohne Beachtung der Gross-/Kleinschreibung, wie in Python.
    if (fold(title).includes(needle)) return { path, status: "TARGET" };
    if (visited.has(title)) return { path, status: "LOOP" };
    visited.add(title);

    // Nach dem letzten erlaubten Artikel keine weitere Seite mehr laden.
    if (step === maxSteps) return { path, status: "LIMIT" };

    const href = await browser.firstLinkHref();
    if (href === null) return { path, status: "DEAD_END" };

    throwIfAborted(signal);
    await browser.open(href);
  }

  return { path, status: "LIMIT" };
}
