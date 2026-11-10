// Integrationstests mit echtem Wikipedia, portiert aus dem Python-Projekt.
// Der Inhalt von Wikipedia kann sich ändern; dann müssen Testartikel angepasst werden.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SeleniumWikiBrowser } from "../../src/browser.ts";
import { BASE_URL, play } from "../../src/game.ts";

const TIMEOUT = 180_000;
let browser: SeleniumWikiBrowser;

beforeAll(async () => {
  browser = await SeleniumWikiBrowser.create();
}, TIMEOUT);

afterAll(async () => {
  await browser?.quit();
});

const pathname = async () => decodeURIComponent(new URL(await browser.currentUrl()).pathname);

describe("echtes Wikipedia", { timeout: TIMEOUT }, () => {
  it.each(["Banane", "Schweiz", "Heiliges_Römisches_Reich"])("%s erreicht Philosophie", async (start) => {
    const { path, status } = await play(browser, start);
    expect(status, `${start}: ${status} nach ${path.length} Schritten: ${path.join(" → ")}`).toBe("TARGET");
  });

  it("Start direkt auf dem Ziel", async () => {
    expect(await play(browser, "Philosophie")).toEqual({ status: "TARGET", path: ["Philosophie"] });
  });

  it("grossgeschriebenes Ziel wird erkannt", async () => {
    expect(await play(browser, "Philosophie", { target: "PHILOSOPHIE" })).toEqual({
      status: "TARGET",
      path: ["Philosophie"],
    });
  });

  it("beim Limit bleibt der Browser auf dem letzten erlaubten Artikel", async () => {
    expect(await play(browser, "Banane", { maxSteps: 1 })).toEqual({ status: "LIMIT", path: ["Banane"] });
    expect(await browser.currentUrl()).toBe(BASE_URL + "Banane");
  });

  it("erkennt den Zyklus ab Deutsche Sprache", async () => {
    const { path, status } = await play(browser, "Deutsche Sprache", { target: "__kein_spielziel__" });
    expect(status, path.join(" → ")).toBe("LOOP");
    const before = path.slice(0, -1);
    expect(before).toContain(path.at(-1));
    expect(new Set(before).size).toBe(before.length);
  });

  it("Spezialseite ohne gültigen Link ergibt DEAD_END", async () => {
    expect(await play(browser, "Spezial:Statistik")).toEqual({ status: "DEAD_END", path: ["Statistik"] });
    expect(await pathname()).toBe("/wiki/Spezial:Statistik");
  });

  describe("Linkregeln mit festem Testinhalt", () => {
    // Echte Wikipedia-Seite laden und den Artikeltext durch eigenes HTML ersetzen,
    // damit die Regeln unabhängig vom aktuellen Wikipedia-Inhalt geprüft werden.
    async function firstLinkIn(html: string, { withoutMwConfig = false } = {}) {
      await browser.open(BASE_URL + "Banane");
      await browser.driver.executeScript(
        `document.querySelector('#mw-content-text .mw-parser-output').innerHTML = arguments[0];
         if (arguments[1]) window.mw = undefined;`,
        html,
        withoutMwConfig,
      );
      const href = await browser.firstLinkHref();
      return href && decodeURIComponent(new URL(href).pathname);
    }

    const namespaced = `<p>
      <a href="/wiki/Datei:Oliver_Wendell_Holmes_Jr_circa_1930.jpg">Bild</a>
      <a href="/wiki/Hilfe:Navigation">Hilfe</a>
      <a href="/wiki/Wikipedia:WikiProjekt_Recht/Qualit%C3%A4tssicherung">QS</a>
      <a href="/wiki/Portal:Recht">Portal</a>
      <a href="/wiki/Kategorie:Recht">Kategorie</a>
      <a href="/wiki/Spezial:Statistik">Spezial</a>
      <a href="/wiki/Bild:Beispiel.jpg">Alias</a>
      <a href="/wiki/WP:Relevanzkriterien">Abkürzung</a>
      <a href="/wiki/Star_Wars:_Episode_I_%E2%80%93_Die_dunkle_Bedrohung">Film</a>
    </p>`;

    it("überspringt Datei-, Hilfe-, Projekt-, Portal- und Spezialseiten", async () => {
      expect(await firstLinkIn(namespaced)).toBe("/wiki/Star_Wars:_Episode_I_–_Die_dunkle_Bedrohung");
    });

    it("überspringt Namensräume auch ohne mw.config", async () => {
      expect(await firstLinkIn(namespaced, { withoutMwConfig: true })).toBe(
        "/wiki/Star_Wars:_Episode_I_–_Die_dunkle_Bedrohung",
      );
    });

    it("beachtet Klammern, Kursivschrift, Fussnoten und rote Links", async () => {
      const html = `<p>Text (<a href="/wiki/Klammer">in Klammern</a>) <i><a href="/wiki/Kursiv">kursiv</a></i>
        <sup class="reference"><a href="/wiki/Fussnote">1</a></sup>
        <a class="new" href="/wiki/Fehlt">rot</a> <a href="/wiki/Recht">gültig</a></p>`;
      expect(await firstLinkIn(html)).toBe("/wiki/Recht");
    });

    it("ohne gültigen Link wird nichts gewählt", async () => {
      expect(await firstLinkIn(`<p><a href="/wiki/Hilfe:Navigation">nur Hilfe</a></p>`)).toBeNull();
    });
  });

  it("fehlender Artikel wird abgelehnt", async () => {
    const article = "SWT404ErrorNotFound_Testartikel_713862706291660342";
    await expect(play(browser, article)).rejects.toThrow(
      `Wikipedia-Artikel existiert nicht: ${article.replaceAll("_", " ")}`,
    );
    expect(await pathname()).toBe("/wiki/" + article);
  });
});
