import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export {
  completionBindingName,
  currentItemBindingName,
  escalationElementId,
  exactInputItems,
  exactNaturalResults,
  inputBindingName,
  lifetimeTimerElementId,
  outputBindingName,
  reviewElementId,
} from "../src/alpha-contract.ts";

const bpmnSourceUrl = new URL(
  "../../../scenarios/sequential-multi-instance/process.bpmn",
  import.meta.url,
);

export const semanticProfile =
  "bpmn-2.0.2-sequential-multi-instance-user-task-draft";
export const processId = "Process_SequentialMultiInstanceReview";
export const exactSourceSha256 =
  "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff";

export async function exactSequentialMultiInstanceSource(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(bpmnSourceUrl));
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
