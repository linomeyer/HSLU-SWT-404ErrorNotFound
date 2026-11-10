import type { RunCreated, RunEvent, RunRequest } from "@philo/core/protocol";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function startRun(request: RunRequest): Promise<string> {
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return (await json<RunCreated>(response)).runId;
}

export async function cancelRun(runId: string): Promise<void> {
  await fetch(`/api/runs/${runId}`, { method: "DELETE" });
}

export async function searchArticles(query: string, signal?: AbortSignal): Promise<string[]> {
  return json(await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal }));
}

export async function randomArticles(n: number): Promise<string[]> {
  return json(await fetch(`/api/random?n=${n}`));
}

/**
 * Live-Ereignisse eines Laufs abonnieren. EventSource verbindet sich bei Abbrüchen
 * selbst neu; der Server setzt dank Last-Event-ID ohne Duplikate fort.
 */
export function subscribeRun(runId: string, onEvent: (event: RunEvent) => void, onConnectionLost: () => void) {
  const source = new EventSource(`/api/runs/${runId}/events`);
  let finished = false;
  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as RunEvent;
    if (event.type === "run-end") {
      finished = true;
      source.close();
    }
    onEvent(event);
  };
  source.onerror = () => {
    // Wurde der Lauf auf dem Server verworfen (z. B. Neustart), gibt EventSource auf.
    if (!finished && source.readyState === EventSource.CLOSED) onConnectionLost();
  };
  return () => source.close();
}
