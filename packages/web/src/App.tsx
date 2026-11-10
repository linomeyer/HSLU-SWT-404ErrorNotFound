import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, LIMITS, type RunEvent } from "@philo/core/protocol";
import { cancelRun, startRun, subscribeRun } from "./api.ts";
import { ArticlePicker } from "./components/ArticlePicker.tsx";
import { ConsolePanel } from "./components/ConsolePanel.tsx";
import { Summary } from "./components/Summary.tsx";
import { buildView } from "./runState.ts";

export function App() {
  const [articles, setArticles] = useState<string[]>(["Banane", "Schweiz"]);
  const [target, setTarget] = useState<string>(DEFAULTS.target);
  const [maxSteps, setMaxSteps] = useState<number>(DEFAULTS.maxSteps);
  const [concurrency, setConcurrency] = useState<number>(DEFAULTS.concurrency);

  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const unsubscribe = useRef<(() => void) | null>(null);

  const view = useMemo(() => buildView(events), [events]);
  const running = starting || (runId !== null && !view.finished);

  useEffect(() => () => unsubscribe.current?.(), []);

  async function onStart() {
    setError(null);
    setStarting(true);
    setEvents([]);
    unsubscribe.current?.();
    try {
      const id = await startRun({ articles, target, maxSteps, concurrency });
      setRunId(id);
      unsubscribe.current = subscribeRun(
        id,
        (event) => setEvents((prev) => [...prev, event]),
        () => {
          setError("Verbindung zum Server verloren.");
          setRunId(null);
        },
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>
          <span className="logo">🦉</span> Philosophie-Spiel
        </h1>
        <p className="subtitle">
          Folgt in de.wikipedia.org jeweils dem ersten gültigen Link, bis ein Artikel „{target || "…"}“ enthält.
        </p>
      </header>

      <section className="controls">
        <ArticlePicker articles={articles} onChange={setArticles} disabled={running} max={LIMITS.maxArticles} />

        <div className="settings">
          <label>
            Ziel
            <input value={target} disabled={running} maxLength={LIMITS.maxTargetLength} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label>
            Max. Artikel
            <input
              type="number"
              min={1}
              max={LIMITS.maxSteps}
              value={maxSteps}
              disabled={running}
              onChange={(e) => setMaxSteps(clamp(e.target.valueAsNumber, 1, LIMITS.maxSteps))}
            />
          </label>
          <label>
            Parallel
            <select value={concurrency} disabled={running} onChange={(e) => setConcurrency(Number(e.target.value))}>
              {Array.from({ length: LIMITS.maxConcurrency }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} Browser
                </option>
              ))}
            </select>
          </label>

          <div className="buttons">
            {running ? (
              <button type="button" className="danger" disabled={!runId} onClick={() => runId && cancelRun(runId)}>
                ■ Stopp
              </button>
            ) : (
              <button type="button" className="primary" disabled={!articles.length || !target.trim()} onClick={onStart}>
                ▶ Spielen
              </button>
            )}
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </section>

      <ConsolePanel lines={view.lines} rows={view.rows} running={running} />
      <Summary rows={view.rows} />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}
