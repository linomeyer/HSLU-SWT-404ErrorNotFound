import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ArticleNotFoundError, GameAbortedError, LIMITS, type RunEvent } from "@philo/core";
import { createApp } from "../src/app.ts";
import { parseRunRequest, RunManager, type RunDeps } from "../src/runManager.ts";

/** Spiel-Attrappe: jeder Artikel braucht zwei Schritte bis zum Ziel; "Fehlt" wirft. */
function fakeDeps(options: { delayMs?: number } = {}) {
  let created = 0;
  let quit = 0;
  const deps: RunDeps = {
    async createBrowser() {
      created++;
      return {
        open: async () => {},
        readTitle: async () => "",
        isMissingArticle: async () => false,
        firstLinkHref: async () => null,
        currentUrl: async () => "",
        quit: async () => void quit++,
      };
    },
    async play(_browser, article, { signal }, onStep) {
      if (article === "Fehlt") throw new ArticleNotFoundError(article);
      const titles = [article, "Philosophie"];
      for (const [i, title] of titles.entries()) {
        if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
        if (signal?.aborted) throw new GameAbortedError();
        onStep({ step: i + 1, title, url: `https://de.wikipedia.org/wiki/${title}` });
      }
      return { status: "TARGET", path: titles };
    },
  };
  return { deps, counts: () => ({ created, quit }) };
}

let server: Server | undefined;
afterEach(() => server?.close());

async function startServer(deps: RunDeps) {
  const manager = new RunManager(deps);
  server = createApp(manager, { serveWeb: false }).listen(0);
  await new Promise((r) => server!.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, manager };
}

/** Den SSE-Stream bis zum Ende lesen und die Ereignisse zurückgeben. */
async function readEvents(base: string, runId: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}/api/runs/${runId}/events`, { headers });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as RunEvent);
}

async function createRun(base: string, body: unknown) {
  return fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("HTTP-API", () => {
  it("spielt alle Artikel und streamt die Ereignisse in Reihenfolge", async () => {
    const { deps, counts } = fakeDeps();
    const { base } = await startServer(deps);
    const response = await createRun(base, { articles: ["Banane", "Fehlt"], concurrency: 1 });
    expect(response.status).toBe(201);
    const { runId } = (await response.json()) as { runId: string };

    const events = await readEvents(base, runId);
    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "game-start",
      "step",
      "step",
      "game-end",
      "game-start",
      "game-error",
      "run-end",
    ]);
    const end = events.at(-1) as Extract<RunEvent, { type: "run-end" }>;
    expect(end.cancelled).toBe(false);
    expect(end.results.map((r) => [r.article, r.outcome])).toEqual([
      ["Banane", "TARGET"],
      ["Fehlt", "ERROR"],
    ]);
    expect(end.results[1]!.message).toBe("Wikipedia-Artikel existiert nicht: Fehlt");
    expect(counts()).toEqual({ created: 1, quit: 1 });
  });

  it("setzt nach Last-Event-ID fort", async () => {
    const { deps } = fakeDeps();
    const { base } = await startServer(deps);
    const { runId } = (await (await createRun(base, { articles: ["Banane"] })).json()) as { runId: string };
    const all = await readEvents(base, runId);
    const rest = await readEvents(base, runId, { "Last-Event-ID": "2" });
    expect(rest).toEqual(all.slice(3));
  });

  it("verteilt Artikel auf mehrere Browser", async () => {
    const { deps, counts } = fakeDeps({ delayMs: 5 });
    const { base } = await startServer(deps);
    const { runId } = (await (await createRun(base, { articles: ["A", "B", "C"], concurrency: 3 })).json()) as {
      runId: string;
    };
    const events = await readEvents(base, runId);
    expect(events.filter((e) => e.type === "game-end")).toHaveLength(3);
    expect(counts()).toEqual({ created: 3, quit: 3 });
  });

  it("bricht einen Lauf ab", async () => {
    const { deps, counts } = fakeDeps({ delayMs: 50 });
    const { base } = await startServer(deps);
    const { runId } = (await (await createRun(base, { articles: ["A", "B", "C"], concurrency: 1 })).json()) as {
      runId: string;
    };
    const eventsPromise = readEvents(base, runId);
    await new Promise((r) => setTimeout(r, 20));
    expect((await fetch(`${base}/api/runs/${runId}`, { method: "DELETE" })).status).toBe(204);

    const end = (await eventsPromise).at(-1) as Extract<RunEvent, { type: "run-end" }>;
    expect(end.cancelled).toBe(true);
    expect(end.results.every((r) => r.outcome === "CANCELLED")).toBe(true);
    expect(counts().quit).toBe(counts().created);
  });

  it("lehnt ungültige Anfragen ab", async () => {
    const { deps } = fakeDeps();
    const { base } = await startServer(deps);
    expect((await createRun(base, { articles: [] })).status).toBe(400);
    expect((await fetch(`${base}/api/runs/unbekannt/events`)).status).toBe(404);
  });
});

describe("parseRunRequest", () => {
  it("ergänzt Standardwerte und entfernt Duplikate", () => {
    expect(parseRunRequest({ articles: [" Banane ", "Banane", "", "Schweiz"] }, LIMITS)).toEqual({
      articles: ["Banane", "Schweiz"],
      target: "Philosophie",
      maxSteps: 50,
      concurrency: 2,
    });
  });

  it.each([
    [null],
    [{ articles: "Banane" }],
    [{ articles: ["Banane"], maxSteps: 0 }],
    [{ articles: ["Banane"], maxSteps: 1.5 }],
    [{ articles: ["Banane"], concurrency: 99 }],
    [{ articles: ["Banane"], target: "  " }],
  ])("lehnt %j ab", (body) => {
    expect(typeof parseRunRequest(body, LIMITS)).toBe("string");
  });
});
