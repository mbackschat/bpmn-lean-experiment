/**
 * The retained serial order model and a maximal admitted Start for the capacity-envelope tests of every Temporal
 * package, so the three layers measure the same journey instead of three look-alikes.
 */
import { readFile } from "node:fs/promises";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

export async function portableHandoffProgram(): Promise<SemanticProcessProgram> {
  const bytes = await readFile(new URL(
    "../../../../scenarios/portable-business-values-handoff/order-handoff.bpmn",
    import.meta.url,
  ));
  const compiled = await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "portable-handoff-order",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: SemanticProfileId.PortableBusinessValuesHandoff,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("The retained portable handoff model was refused");
  }
  return compiled.semanticProcess;
}

export function portableHandoffStart(
  instanceId: string,
  value: BusinessValue,
  commandId = "start-order",
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId,
    processId: "OrderHandoff",
    instanceId,
    initialVariables: [{ name: "receivedOrder", value }],
  };
}
