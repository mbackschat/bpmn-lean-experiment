/** The compiler of the default-less Choice witnesses, shared by their source and runtime tests. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/exclusive-choice-without-default/", import.meta.url);

export type Model = "expense-routing" | "ticket-triage";

export async function compileWitness(model: Model, edit: (xml: string) => string = xml => xml) {
  const overlay = new Uint8Array(await readFile(new URL(`${model}-overlay.json`, directory)));
  const xml = edit(await readFile(new URL(`${model}.bpmn`, directory), "utf8"));
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
}
