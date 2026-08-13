import { Worker } from "node:worker_threads";

const DEFAULT_DEADLINE_MS = 5_000;

export async function runLayoutWorker(
  sourceXml: string,
  deadlineMs: number | undefined,
  maximumOutputBytes: number,
  workerUrl = new URL("./layout-worker.js", import.meta.url),
): Promise<string> {
  const effectiveDeadlineMs = deadlineMs ?? DEFAULT_DEADLINE_MS;
  if (!Number.isSafeInteger(effectiveDeadlineMs) || effectiveDeadlineMs <= 0) {
    throw new Error("layout deadline must be a positive safe integer");
  }

  const worker = new Worker(workerUrl);
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (result: Readonly<{ xml?: string; error?: Error }>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker.terminate();
      if (result.error !== undefined) {
        reject(result.error);
      } else {
        resolve(result.xml as string);
      }
    };
    const timer = setTimeout(() => {
      settle({ error: new Error("BPMN layout worker exceeded its deadline") });
    }, effectiveDeadlineMs);
    worker.once("message", (message: unknown) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("kind" in message)
      ) {
        settle({ error: new Error("BPMN layout worker returned an invalid response") });
        return;
      }
      if (
        message.kind === "success" &&
        "generatedXml" in message &&
        typeof message.generatedXml === "string"
      ) {
        if (Buffer.byteLength(message.generatedXml, "utf8") > maximumOutputBytes) {
          settle({ error: new Error("BPMN layout output exceeds the byte limit") });
          return;
        }
        settle({ xml: message.generatedXml });
        return;
      }
      const evidence =
        "evidence" in message && typeof message.evidence === "string"
          ? message.evidence
          : "unknown failure";
      settle({ error: new Error(`BPMN layout worker failed: ${evidence}`) });
    });
    worker.once("error", (error) => settle({ error }));
    worker.once("exit", (code) => {
      if (code !== 0) {
        settle({ error: new Error(`BPMN layout worker exited with code ${code}`) });
      }
    });
    worker.postMessage({ maximumOutputBytes, sourceXml });
  });
}
