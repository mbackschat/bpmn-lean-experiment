import { createHash } from "node:crypto";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";

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
  const digest = createHash("sha256")
    .update(canonicalProcessAddressEncoding(processInstanceId), "utf8")
    .digest("hex");
  return `bpmn-process-sha256:${digest}`;
}
