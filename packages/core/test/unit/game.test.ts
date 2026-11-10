import { describe, expect, it } from "vitest";
import {
  ArticleNotFoundError,
  articleUrl,
  BASE_URL,
  GameAbortedError,
  play,
  type StepEvent,
  type WikiBrowser,
} from "../../src/game.ts";

interface FakePage {
  title: string;
  next?: string | null; // Artikelname des ersten Links
  missing?: boolean;
}

/** Wikipedia-Attrappe: Seiten werden über ihren Artikelnamen angesprochen. */
class FakeBrowser implements WikiBrowser {
  opened: string[] = [];
  private url = "";
  constructor(private readonly pages: Record<string, FakePage>) {}

  private page(): FakePage {
    const name = decodeURIComponent(this.url.slice(BASE_URL.length));
    const page = this.pages[name];
    if (!page) throw new Error(`Unbekannte Seite: ${name}`);
    return page;
  }
  async open(url: string) {
    this.opened.push(url);
    this.url = url;
  }
  async readTitle() {
    return this.page().title;
  }
  async isMissingArticle() {
    return this.page().missing ?? false;
  }
  async firstLinkHref() {
    const next = this.page().next;
    return next ? articleUrl(next) : null;
  }
  async currentUrl() {
    return this.url;
  }
}

const chain = {
  Banane: { title: "Banane", next: "Frucht" },
  Frucht: { title: "Frucht", next: "Biologie" },
  Biologie: { title: "Biologie", next: "Philosophie" },
  Philosophie: { title: "Philosophie", next: "Wissen" },
  Wissen: { title: "Wissen", next: "Philosophie" },
  A: { title: "A", next: "B" },
  B: { title: "B", next: "A" },
  Sackgasse: { title: "Sackgasse", next: null },
  Fehlt: { title: "Fehlt", missing: true },
};

describe("play", () => {
  it("erreicht das Ziel und meldet jeden Schritt in Reihenfolge", async () => {
    const steps: StepEvent[] = [];
    const result = await play(new FakeBrowser(chain), "Banane", {}, (s) => steps.push(s));
    expect(result).toEqual({ status: "TARGET", path: ["Banane", "Frucht", "Biologie", "Philosophie"] });
    expect(steps.map((s) => [s.step, s.title])).toEqual([
      [1, "Banane"],
      [2, "Frucht"],
      [3, "Biologie"],
      [4, "Philosophie"],
    ]);
    expect(steps[0]!.url).toBe(BASE_URL + "Banane");
  });

  it("beim Start auf dem Ziel genügt ein Artikel", async () => {
    expect(await play(new FakeBrowser(chain), "Philosophie")).toEqual({ status: "TARGET", path: ["Philosophie"] });
  });

  it("ignoriert Gross-/Kleinschreibung und sucht Teilwörter", async () => {
    const result = await play(new FakeBrowser(chain), "Banane", { target: "BIOLOG" });
    expect(result).toEqual({ status: "TARGET", path: ["Banane", "Frucht", "Biologie"] });
  });

  it("erkennt Zyklen", async () => {
    const result = await play(new FakeBrowser(chain), "A", { target: "__kein_ziel__" });
    expect(result).toEqual({ status: "LOOP", path: ["A", "B", "A"] });
  });

  it("meldet DEAD_END ohne gültigen Link", async () => {
    expect(await play(new FakeBrowser(chain), "Sackgasse")).toEqual({ status: "DEAD_END", path: ["Sackgasse"] });
  });

  it("lädt nach dem Limit keine weitere Seite", async () => {
    const browser = new FakeBrowser(chain);
    const result = await play(browser, "Banane", { maxSteps: 2 });
    expect(result).toEqual({ status: "LIMIT", path: ["Banane", "Frucht"] });
    expect(browser.opened).toEqual([BASE_URL + "Banane", BASE_URL + "Frucht"]);
  });

  it.each([0, -1, 1.5, Number.NaN])("lehnt maxSteps=%s ohne Browserzugriff ab", async (maxSteps) => {
    const browser = new FakeBrowser(chain);
    await expect(play(browser, "Banane", { maxSteps })).rejects.toThrow(/mindestens 1/);
    expect(browser.opened).toEqual([]);
  });

  it("wirft bei fehlendem Artikel", async () => {
    await expect(play(new FakeBrowser(chain), "Fehlt")).rejects.toThrow(
      new ArticleNotFoundError("Fehlt").message,
    );
  });

  it("bricht über AbortSignal ab", async () => {
    const controller = new AbortController();
    const promise = play(new FakeBrowser(chain), "Banane", { signal: controller.signal }, ({ step }) => {
      if (step === 2) controller.abort();
    });
    await expect(promise).rejects.toBeInstanceOf(GameAbortedError);
  });
});

describe("articleUrl", () => {
  it("kodiert Leerzeichen und Sonderzeichen", () => {
    expect(articleUrl("Heiliges Römisches Reich")).toBe(BASE_URL + "Heiliges_R%C3%B6misches_Reich");
    expect(articleUrl("AC/DC")).toBe(BASE_URL + "AC/DC");
    expect(articleUrl("Spezial:Statistik")).toBe(BASE_URL + "Spezial%3AStatistik");
  });
});
