/**
 * Locks the Start identity bound of the embedded completion profile: the hosting identity is the one Start input
 * its hosted artifacts grow with, so Start refuses it past the byte bound and admits it at the bound, counted in
 * UTF-8 bytes rather than characters. Every other profile keeps its envelope decision. The hosted oracle that the
 * bound fits the Query and terminal ceilings is the repeated, nested and concurrent Calls recovery witness, which
 * starts at exactly this bound.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  embeddedCompletionHostingIdentityByteLimit,
  startCapacityHostingIdentityEvidence,
} from "../dist/index.js";
import { portableHandoffProgram } from "./portable-handoff-capacity-fixture.ts";

async function supplierProgram(): Promise<SemanticProcessProgram> {
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/repeated-nested-concurrent-calls/supplier-onboarding.bpmn", import.meta.url)),
    sourceId: "supplier-onboarding", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  return compiled.semanticProcess;
}

function start(program: SemanticProcessProgram, instanceId: string): StartProcessStimulus {
  return { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
    initialVariables: [] };
}

// "é" is two UTF-8 bytes, so a character count would admit the refused identity.
const atBound = `Supplier_x${"é".repeat((embeddedCompletionHostingIdentityByteLimit - 10) / 2)}`;

test("admits a hosting identity of exactly the bound in UTF-8 bytes", async () => {
  assert.equal(Buffer.byteLength(atBound, "utf8"), embeddedCompletionHostingIdentityByteLimit);
  const program = await supplierProgram();
  assert.deepEqual(assessStartCapacityEnvelope(start(program, atBound), program),
    { kind: StartCapacityEnvelopeResultKind.NotApplicable });
});

test("refuses a hosting identity one byte past the bound with its bound and size", async () => {
  const program = await supplierProgram();
  const over = assessStartCapacityEnvelope(start(program, `${atBound}x`), program);
  assert.ok(over.kind === StartCapacityEnvelopeResultKind.HostingIdentityExceeded);
  assert.deepEqual(over.failure,
    { configuredBound: embeddedCompletionHostingIdentityByteLimit, identityBytes: embeddedCompletionHostingIdentityByteLimit + 1 });
  assert.match(startCapacityHostingIdentityEvidence(over.failure), /257 UTF-8 bytes, above its 256-byte bound/u);
});

test("leaves the hosting identity of other profiles to their own decision", async () => {
  const handoff = await portableHandoffProgram();
  const other: SemanticProcessProgram = { ...handoff, identity: { ...handoff.identity,
    semanticProfile: SemanticProfileId.StructuredProcessComposition } };
  assert.deepEqual(assessStartCapacityEnvelope(start(other, "I".repeat(4_000)), other),
    { kind: StartCapacityEnvelopeResultKind.NotApplicable });
});
