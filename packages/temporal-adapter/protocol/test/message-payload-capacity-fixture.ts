/**
 * The retained shipment-manifest intake and its Starts for the structured Message-payload capacity-envelope tests of
 * every Temporal package, so the layers measure the same journey.
 */
import { readFile } from "node:fs/promises";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

const scenarios = new URL("../../../../scenarios/", import.meta.url);

export async function shipmentManifestProgram(
  semanticProfile: string = SemanticProfileId.PortableBusinessMessagePayload,
  source = new URL("portable-business-message-payload/process.bpmn", scenarios),
): Promise<SemanticProcessProgram> {
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId: "shipment-manifest-capacity",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(`The shipment-manifest capacity model was refused: ${JSON.stringify(compiled)}`);
  }
  return compiled.semanticProcess;
}

/** The closed scalar payload-catch profile's retained settlement source, which the envelope does not reserve. */
export async function settlementProgram(): Promise<SemanticProcessProgram> {
  return await shipmentManifestProgram(SemanticProfileId.MessagePayloadCatch,
    new URL("message-payload-catch/process.bpmn", scenarios));
}

/** Start carries no values under this profile, so identifiers are its only variable size. */
export function manifestStart(
  program: SemanticProcessProgram,
  instanceId: string,
  commandId = "start-manifest",
): StartProcessStimulus {
  return { kind: StimulusKind.StartProcess, commandId, processId: program.processId, instanceId, initialVariables: [] };
}
