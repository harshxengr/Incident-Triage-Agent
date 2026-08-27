Bun.serve({
  port: Number(process.env.PORT ?? process.env.WORKER_HEALTH_PORT ?? 3003),
  fetch(req) {
    if (new URL(req.url).pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  },
});

import "./logAnalyzerWorker";
import "./diagnosisWorker";
import "./actionWorker";
import "./communicatorWorker";
import { checkEnv } from "../config/checkEnv";
checkEnv();

console.log("All 4 workers started. Ctrl+C to stop.");

process.on("unhandledRejection", (reason) => {
  console.error("[workers] unhandled promise rejection (continuing):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[workers] uncaught exception (continuing):", err);
});
