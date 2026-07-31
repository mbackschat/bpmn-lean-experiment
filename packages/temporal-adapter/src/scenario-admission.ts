import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import {
  BpmnProcessAdmissionResultKind,
  assessBpmnProcessAdmission,
} from "./process-client.js";

/** Enforces typed production admission before a conformance Workflow starts. */
export function requireScenarioAdmission(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): void {
  const admission = assessBpmnProcessAdmission(start, semanticProcess);
  if (admission.kind === BpmnProcessAdmissionResultKind.Rejected) {
    throw new TypeError(
      `Temporal host rejected the admitted Process before Workflow start: ${admission.failure.code}`,
    );
  }
}
