import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { LIMITS, type RunCreated } from "@philo/core";
import { parseRunRequest, type RunManager } from "./runManager.ts";
import { randomTitles, searchTitles } from "./wikipediaApi.ts";

const WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));
const HEARTBEAT_MS = 15_000;

export function createApp(manager: RunManager, { serveWeb = true } = {}) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.post("/api/runs", (req, res) => {
    const config = parseRunRequest(req.body, LIMITS);
    if (typeof config === "string") {
      res.status(400).json({ error: config });
      return;
    }
    const run = manager.start(config);
    res.status(201).json({ runId: run.id } satisfies RunCreated);
  });

  // Live-Ereignisse als Server-Sent Events. Last-Event-ID erlaubt das Fortsetzen nach Verbindungsabbruch.
  app.get("/api/runs/:id/events", (req: Request, res: Response) => {
    const run = manager.get(String(req.params.id));
    if (!run) {
      res.status(404).json({ error: "Lauf nicht gefunden." });
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const send = (event: unknown, index: number) => res.write(`id: ${index}\ndata: ${JSON.stringify(event)}\n\n`);
    const lastId = Number.parseInt(req.header("Last-Event-ID") ?? "", 10);
    const from = Number.isNaN(lastId) ? 0 : lastId + 1;

    run.events.slice(from).forEach((event, i) => send(event, from + i));
    if (run.done) {
      res.end();
      return;
    }

    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const unsubscribe = run.subscribe((event, index) => {
      send(event, index);
      if (event.type === "run-end") cleanup(true);
    });
    function cleanup(end: boolean) {
      clearInterval(heartbeat);
      unsubscribe();
      if (end) res.end();
    }
    req.on("close", () => cleanup(false));
  });

  app.delete("/api/runs/:id", (req, res) => {
    const run = manager.get(String(req.params.id));
    if (!run) {
      res.status(404).json({ error: "Lauf nicht gefunden." });
      return;
    }
    run.cancel();
    res.status(204).end();
  });

  app.get("/api/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json([]);
      return;
    }
    try {
      res.json(await searchTitles(q.slice(0, 200)));
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  app.get("/api/random", async (req, res) => {
    const n = Math.min(10, Math.max(1, Number.parseInt(String(req.query.n ?? "3"), 10) || 3));
    try {
      res.json(await randomTitles(n));
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  // Im Produktionsbetrieb die gebaute Oberfläche ausliefern.
  if (serveWeb && existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile("index.html", { root: WEB_DIST }));
  }

  return app;
}
