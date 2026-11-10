import { play, SeleniumWikiBrowser } from "@philo/core";
import { createApp } from "./app.ts";
import { RunManager } from "./runManager.ts";

const PORT = Number(process.env.PORT ?? 3001);

const manager = new RunManager({
  createBrowser: () => SeleniumWikiBrowser.create({ headless: process.env.SHOW_BROWSER !== "1" }),
  play,
});

const server = createApp(manager).listen(PORT, () => {
  console.log(`Philosophie-Spiel läuft auf http://localhost:${PORT}`);
});
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} ist bereits belegt – läuft noch ein anderer Server? (PORT=… setzen oder Prozess beenden)`);
    process.exit(1);
  }
  throw error;
});

// Beim Beenden alle Browser schliessen.
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("Beende, schliesse Browser …");
  server.close();
  await manager.shutdown();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
