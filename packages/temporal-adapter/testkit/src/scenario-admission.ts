import type {
  SemanticProcessProgram,
  ProcessStartStimulus,
} from "@bpmn-lean/semantic-core";

import {
  BpmnProcessAdmissionResultKind,
  assessBpmnProcessAdmission,
} from "@bpmn-lean/temporal-client";

/** Enforces typed production admission before a conformance Workflow starts. */
export function requireScenarioAdmission(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
): void {
  const admission = assessBpmnProcessAdmission(start, semanticProcess);
  if (admission.kind === BpmnProcessAdmissionResultKind.Rejected) {
    throw new TypeError(
      `Temporal host rejected the admitted Process before Workflow start: ${admission.failure.code}`,
    );
  }
}
