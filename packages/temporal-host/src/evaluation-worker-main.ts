/**
 * The evaluation distribution's `bpmn-worker` process (`Dockerfile` target `bpmn-worker`); `evaluation-worker.ts` owns
 * the behaviour, so a test can import it without starting a Worker.
 */
import { runEvaluationWorkerCommand } from "./evaluation-worker.js";

try {
  await runEvaluationWorkerCommand(process.env, process.argv.slice(2));
} catch (error) {
  // The message names a variable or an address, never a configured value, so it is safe to print.
  process.stderr.write(`Evaluation BPMN Worker failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
