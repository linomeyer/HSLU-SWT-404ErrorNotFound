// Kleine Helfer für die Wikipedia-API (Autovervollständigung, Zufallsartikel).
// Diese laufen über normales HTTP, nicht über Selenium.
const API_URL = "https://de.wikipedia.org/w/api.php";
const HEADERS = { "User-Agent": "PhilosophyWikiGame/0.1 (HSLU SWT student project)" };

async function callApi(params: Record<string, string>): Promise<unknown> {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Wikipedia-API antwortete mit ${response.status}`);
  return response.json();
}

export async function searchTitles(query: string, limit = 8): Promise<string[]> {
  const data = (await callApi({
    action: "opensearch",
    search: query,
    limit: String(limit),
    namespace: "0",
  })) as [string, string[]];
  return data[1] ?? [];
}

export async function randomTitles(count: number): Promise<string[]> {
  const data = (await callApi({
    action: "query",
    list: "random",
    rnnamespace: "0",
    rnlimit: String(count),
  })) as { query: { random: Array<{ title: string }> } };
  return data.query.random.map((r) => r.title);
}
