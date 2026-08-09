import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export function canonicalProcessAddressEncoding(
  processInstanceId: string,
): string {
  if (
    typeof processInstanceId !== "string" ||
    processInstanceId.length === 0
  ) {
    throw new TypeError(
      "Workflow identity requires a non-empty semantic Process-instance ID",
    );
  }
  return canonicalTypedTupleEncoding([
    "semanticProcessInstance",
    processInstanceId,
  ]);
}

export function processWorkflowId(processInstanceId: string): string {
  const digest = deterministicSha256Hex(
    canonicalProcessAddressEncoding(processInstanceId),
  );
  return `bpmn-process-sha256:${digest}`;
}
