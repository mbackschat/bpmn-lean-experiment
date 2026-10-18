/**
 * The retained nested scope-data models and their Starts for the capacity-envelope tests of every Temporal package,
 * so the layers measure the same journeys. The expense claim is the decisive model: its claim and ticket locals are
 * both copied onward by the Record Claim inputs, so which name a completion fills changes what the state holds.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { BusinessValue, SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

const directory = new URL("../../../../scenarios/nested-embedded-scope-data/", import.meta.url);

export async function nestedScopeProgram(model: "expense-claim" | "purchase-order" | "bulk-quote"): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL(`${model}-overlay.json`, directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`${model}.bpmn`, directory)),
    sourceId: `${model}-capacity`,
    expectedSha256: undefined,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(`The ${model} capacity model was refused: ${JSON.stringify(compiled)}`);
  }
  return compiled.semanticProcess;
}

/** A claim Map of `entries` 1,000-character Strings, large enough that copying it is visible against the cap. */
export function claimValue(entries: number): BusinessValue {
  return {
    kind: VariableValueKind.Map,
    value: Array.from({ length: entries }, (_, index) => ({
      name: `line${index}`, value: { kind: VariableValueKind.String, value: "c".repeat(1_000) },
    })),
  };
}

export function claimStart(
  program: SemanticProcessProgram,
  instanceId: string,
  claim: BusinessValue = claimValue(4),
  commandId = "start-claim",
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess, commandId, processId: program.processId, instanceId,
    initialVariables: [{ name: "claim", value: claim }],
  };
}
