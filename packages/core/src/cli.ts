// Kommandozeile wie im Python-Projekt:
//   npm run cli -- [Artikel] [--target WORT] [--steps N] [--show]
import { parseArgs } from "node:util";
import { SeleniumWikiBrowser } from "./browser.ts";
import { ArticleNotFoundError, MAX_STEPS, play, TARGET } from "./game.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string", default: TARGET },
    steps: { type: "string", default: String(MAX_STEPS) },
    show: { type: "boolean", default: false }, // Browserfenster anzeigen
  },
});

const start = positionals[0] ?? "Banane";
const browser = await SeleniumWikiBrowser.create({ headless: !values.show });
try {
  const { path, status } = await play(
    browser,
    start,
    { target: values.target, maxSteps: Number(values.steps) },
    ({ step, title }) => console.log(`${String(step).padStart(2)}. ${title}`),
  );
  console.log(`\nResult: ${status} after ${path.length} steps`);
} catch (error) {
  if (error instanceof ArticleNotFoundError || error instanceof RangeError) {
    console.error(`Fehler: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  // Den Browser auch bei Fehlern schliessen.
  await browser.quit();
}
