import { parentPort } from "node:worker_threads";

import { layoutProcess } from "bpmn-auto-layout";

if (parentPort === null) {
  throw new Error("layout worker requires a parent port");
}

parentPort.once("message", async (message: unknown) => {
  try {
    if (
      typeof message !== "object" ||
      message === null ||
      !("sourceXml" in message) ||
      typeof message.sourceXml !== "string"
    ) {
      throw new Error("layout worker received an invalid request");
    }
    if (
      !("maximumOutputBytes" in message) ||
      typeof message.maximumOutputBytes !== "number"
    ) {
      throw new Error("layout worker received no output byte limit");
    }
    const generatedXml = await layoutProcess(message.sourceXml);
    if (
      Buffer.byteLength(generatedXml, "utf8") > message.maximumOutputBytes
    ) {
      throw new Error("BPMN layout output exceeds the byte limit");
    }
    parentPort?.postMessage({ kind: "success", generatedXml });
  } catch (cause: unknown) {
    parentPort?.postMessage({
      kind: "failure",
      evidence: cause instanceof Error ? cause.message : "layout worker failed",
    });
  }
});
