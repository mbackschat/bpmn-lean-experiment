/**
 * The concurrent scope Service Task hosting preflight: the embedded completion profile's token split beside effect waits
 * is admitted exactly when the Program is well formed and its nested scope-control analysis admits it, which includes
 * the 32-Service-Task bound. The control is the same Program stripped of its handler overlay, which that analysis refuses,
 * so a host that admitted every token split beside an effect could not pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-testkit";

const directory = new URL("../../../../scenarios/concurrent-scope-service-tasks/", import.meta.url);

async function compile(model: string, handlers: string): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL(`${handlers}.json`, directory));
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(model, directory)), sourceId: model, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    sourceOverlay: { id: handlers, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compilation.status === BpmnCompilationStatus.Accepted, JSON.stringify(compilation.diagnostics));
  return compilation.semanticProcess;
}

for (const [model, handlers] of [
  ["supplier-screening.bpmn", "supplier-screening-handlers"],
  ["claim-intake.bpmn", "claim-intake-handlers"],
] as const) {
  test(`admits the concurrent effect waits of ${model} and refuses them without an admitted Program`, async () => {
    const program = await compile(model, handlers);
    assert.deepEqual(assessTemporalHostCapability(program), { kind: TemporalHostCapabilityResultKind.Admitted });
    const unbound = { ...program, identity: { ...program.identity, sourceOverlay: null } };
    assert.deepEqual(assessTemporalHostCapability(unbound), {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code: TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
        evidence: "A token split can make a timer or effect wait concurrent with another semantic branch.",
      },
    });
  });
}
