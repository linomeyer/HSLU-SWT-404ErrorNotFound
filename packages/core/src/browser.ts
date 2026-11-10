import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Browser, Builder, By, until, type WebDriver } from "selenium-webdriver";
import * as chrome from "selenium-webdriver/chrome.js";
import * as edge from "selenium-webdriver/edge.js";
import * as firefox from "selenium-webdriver/firefox.js";
import type { WikiBrowser } from "./game.ts";

// Dasselbe Skript wie im Python-Projekt; es liefert das erste gültige <a>-Element.
const FIRST_LINK_JS = readFileSync(
  fileURLToPath(new URL("../scripts/first_link.js", import.meta.url)),
  "utf8",
);
// Das Skript in eine Funktion einbetten und nur die Adresse zurückgeben (ein Aufruf statt zwei).
const FIRST_HREF_JS = `const a = (function () {\n${FIRST_LINK_JS}\n})();\nreturn a ? a.href : null;`;

const TITLE_TIMEOUT_MS = 10_000;

export interface CreateBrowserOptions {
  /** Ohne sichtbares Fenster starten (Standard: true). */
  headless?: boolean;
}

export class BrowserStartError extends Error {
  constructor(readonly causes: Array<{ browser: string; error: unknown }>) {
    const details = causes.map(({ browser, error }) => `${browser}: ${firstLine(error)}`).join("; ");
    super(`Chrome, Firefox und Edge konnten nicht gestartet werden (${details})`);
    this.name = "BrowserStartError";
  }
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n").find((line) => line.trim())?.trim().slice(0, 300) ?? "unbekannter Fehler";
}

// Browser nacheinander starten: Parallele Aufrufe von Selenium Manager können sich beim
// Herunterladen und Zwischenspeichern der Treiber gegenseitig stören.
let startQueue: Promise<unknown> = Promise.resolve();

/** Den ersten Browser starten, dessen WebDriver verfügbar ist: Chrome, Firefox, dann Edge. */
export function createDriver(options: CreateBrowserOptions = {}): Promise<WebDriver> {
  const next = startQueue.then(() => startFirstAvailable(options));
  startQueue = next.catch(() => {});
  return next;
}

async function startFirstAvailable({ headless = true }: CreateBrowserOptions): Promise<WebDriver> {
  const candidates: Array<[string, () => Promise<WebDriver>]> = [
    ["Chrome", async () => {
      const options = new chrome.Options();
      if (headless) options.addArguments("--headless=new");
      options.addArguments("--window-size=1280,900", "--blink-settings=imagesEnabled=false");
      return new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();
    }],
    ["Firefox", async () => {
      const options = new firefox.Options();
      if (headless) options.addArguments("-headless");
      return new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build();
    }],
    ["Edge", async () => {
      const options = new edge.Options();
      if (headless) options.addArguments("--headless=new");
      return new Builder().forBrowser(Browser.EDGE).setEdgeOptions(options).build();
    }],
  ];

  const causes: Array<{ browser: string; error: unknown }> = [];
  for (const [browser, start] of candidates) {
    try {
      return await start();
    } catch (error) {
      // Grund merken und den nächsten Browser versuchen.
      causes.push({ browser, error });
    }
  }
  throw new BrowserStartError(causes);
}

/** WikiBrowser-Umsetzung mit Selenium WebDriver. */
export class SeleniumWikiBrowser implements WikiBrowser {
  constructor(readonly driver: WebDriver) {}

  static async create(options?: CreateBrowserOptions): Promise<SeleniumWikiBrowser> {
    return new SeleniumWikiBrowser(await createDriver(options));
  }

  async open(url: string): Promise<void> {
    await this.driver.get(url);
  }

  async readTitle(): Promise<string> {
    const heading = await this.driver.wait(until.elementLocated(By.id("firstHeading")), TITLE_TIMEOUT_MS);
    return (await heading.getText()).trim();
  }

  async isMissingArticle(): Promise<boolean> {
    const hits = await this.driver.findElements(By.css("#mw-content-text .noarticletext"));
    return hits.length > 0;
  }

  async firstLinkHref(): Promise<string | null> {
    return (await this.driver.executeScript<string | null>(FIRST_HREF_JS)) ?? null;
  }

  currentUrl(): Promise<string> {
    return this.driver.getCurrentUrl();
  }

  async quit(): Promise<void> {
    await this.driver.quit();
  }
}
