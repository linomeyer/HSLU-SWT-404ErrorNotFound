import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  DEFAULTS,
  GameAbortedError,
  type ArticleResult,
  type GameOptions,
  type GameResult,
  type RunEvent,
  type StepEvent,
  type WikiBrowser,
} from "@philo/core";

export interface ClosableBrowser extends WikiBrowser {
  quit(): Promise<void>;
}

/** Austauschbare Abhängigkeiten, damit Tests ohne echten Browser laufen. */
export interface RunDeps {
  createBrowser(): Promise<ClosableBrowser>;
  play(
    browser: WikiBrowser,
    article: string,
    options: GameOptions,
    onStep: (event: StepEvent) => void,
  ): Promise<GameResult>;
}

export interface RunConfig {
  articles: string[];
  target: string;
  maxSteps: number;
  concurrency: number;
}

type Listener = (event: RunEvent, index: number) => void;

/** Ein Lauf spielt mehrere Artikel; alle Ereignisse werden für spätere Zuhörer aufbewahrt. */
export class Run {
  readonly id = randomUUID();
  readonly events: RunEvent[] = [];
  readonly controller = new AbortController();
  done = false;
  finishedAt?: number;
  private readonly emitter = new EventEmitter();

  constructor(readonly config: RunConfig) {}

  emit(event: RunEvent): void {
    this.events.push(event);
    this.emitter.emit("event", event, this.events.length - 1);
  }

  subscribe(listener: Listener): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  cancel(): void {
    this.controller.abort();
  }
}

const RUN_RETENTION_MS = 10 * 60_000;

export class RunManager {
  private readonly runs = new Map<string, Run>();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly deps: RunDeps) {}

  start(config: RunConfig): Run {
    this.pruneFinished();
    const run = new Run(config);
    this.runs.set(run.id, run);
    const task = this.execute(run).finally(() => this.pending.delete(task));
    this.pending.add(task);
    return run;
  }

  get(id: string): Run | undefined {
    return this.runs.get(id);
  }

  /** Alle Läufe abbrechen und warten, bis die Browser geschlossen sind. */
  async shutdown(): Promise<void> {
    for (const run of this.runs.values()) run.cancel();
    await Promise.allSettled([...this.pending]);
  }

  private pruneFinished(): void {
    const now = Date.now();
    for (const [id, run] of this.runs) {
      if (run.finishedAt && now - run.finishedAt > RUN_RETENTION_MS) this.runs.delete(id);
    }
  }

  private async execute(run: Run): Promise<void> {
    const { articles, target, maxSteps, concurrency } = run.config;
    const signal = run.controller.signal;
    const queue = [...articles];
    const results = new Map<string, ArticleResult>();

    run.emit({ type: "run-start", articles, target, maxSteps, concurrency });

    // Jeder Worker besitzt einen eigenen Browser und holt Artikel aus der Warteschlange.
    const worker = async () => {
      let browser: ClosableBrowser | undefined;
      try {
        while (queue.length > 0 && !signal.aborted) {
          const article = queue.shift()!;
          const path: string[] = [];
          run.emit({ type: "game-start", article });
          try {
            browser ??= await this.deps.createBrowser();
            const result = await this.deps.play(browser, article, { target, maxSteps, signal }, (step) => {
              path.push(step.title);
              run.emit({ type: "step", article, ...step });
            });
            results.set(article, { article, outcome: result.status, path: result.path });
            run.emit({ type: "game-end", article, status: result.status, path: result.path });
          } catch (error) {
            const cancelled = signal.aborted || error instanceof GameAbortedError;
            const message = cancelled ? "Abgebrochen." : error instanceof Error ? error.message : String(error);
            if (!cancelled) console.error(`[${article}]`, error);
            results.set(article, { article, outcome: cancelled ? "CANCELLED" : "ERROR", path, message });
            run.emit({ type: "game-error", article, message, path, cancelled });
          }
        }
      } finally {
        await browser?.quit().catch(() => {});
      }
    };

    const workerCount = Math.max(1, Math.min(concurrency, articles.length));
    await Promise.all(Array.from({ length: workerCount }, worker));

    const ordered = articles.map(
      (article) => results.get(article) ?? { article, outcome: "CANCELLED" as const, path: [], message: "Abgebrochen." },
    );
    run.done = true;
    run.finishedAt = Date.now();
    run.emit({ type: "run-end", cancelled: signal.aborted, results: ordered });
  }
}

/** Anfrage prüfen und mit Standardwerten ergänzen; liefert eine Fehlermeldung als string. */
export function parseRunRequest(body: unknown, limits: {
  maxArticles: number;
  maxSteps: number;
  maxConcurrency: number;
  maxTargetLength: number;
}): RunConfig | string {
  if (typeof body !== "object" || body === null) return "JSON-Objekt erwartet.";
  const { articles, target = DEFAULTS.target, maxSteps = DEFAULTS.maxSteps, concurrency = DEFAULTS.concurrency } =
    body as Record<string, unknown>;

  if (!Array.isArray(articles) || articles.some((a) => typeof a !== "string")) {
    return "articles muss eine Liste von Texten sein.";
  }
  const unique = [...new Set(articles.map((a: string) => a.trim()).filter(Boolean))];
  if (unique.length === 0) return "Mindestens ein Artikel ist nötig.";
  if (unique.length > limits.maxArticles) return `Höchstens ${limits.maxArticles} Artikel pro Lauf.`;

  if (typeof target !== "string" || !target.trim() || target.length > limits.maxTargetLength) {
    return "target muss ein nicht leerer Text sein.";
  }
  if (!Number.isInteger(maxSteps) || (maxSteps as number) < 1 || (maxSteps as number) > limits.maxSteps) {
    return `maxSteps muss zwischen 1 und ${limits.maxSteps} liegen.`;
  }
  if (!Number.isInteger(concurrency) || (concurrency as number) < 1 || (concurrency as number) > limits.maxConcurrency) {
    return `concurrency muss zwischen 1 und ${limits.maxConcurrency} liegen.`;
  }
  return {
    articles: unique,
    target: target.trim(),
    maxSteps: maxSteps as number,
    concurrency: concurrency as number,
  };
}
