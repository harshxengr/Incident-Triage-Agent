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
