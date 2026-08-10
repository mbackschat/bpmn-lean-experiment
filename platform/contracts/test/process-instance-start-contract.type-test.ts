import type { ProcessInstanceStartResult } from "../src/index.js";

declare const discriminantResult: ProcessInstanceStartResult;

// @ts-expect-error Start-result discriminants are immutable.
discriminantResult.status = "rejected";

declare const result: ProcessInstanceStartResult;

if (result.status === "started") {
  // @ts-expect-error Public Process-instance identity is immutable.
  result.instance.processInstanceId = "replacement";
  // @ts-expect-error The exact nested definition identity is immutable.
  result.instance.definition.version = 3;
  // @ts-expect-error The nested source identity is immutable.
  result.instance.definition.source.sha256 = "0".repeat(64);
  // @ts-expect-error Temporal Workflow identity is not public platform state.
  result.instance.workflowId;
} else {
  // @ts-expect-error Rejected definition identity is immutable.
  result.definition.processId = "replacement";
  // @ts-expect-error Opaque start failures are immutable.
  result.failure.code = "replacement";
  // @ts-expect-error Opaque start-failure evidence is immutable.
  result.failure.evidence = "replacement";
  // @ts-expect-error Private engine representations are not public platform state.
  result.semanticProcess;
}
