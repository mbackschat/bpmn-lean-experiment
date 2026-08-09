/**
 * Every profile the compiler dispatches must apply the reference-target-type rule.
 *
 * `bpmn-moddle` resolves an IDREF by identity alone and never checks that the element it found is the
 * kind the referring property declares, so [the admission rule](../src/reference-target-admission.ts)
 * exists to reject that. The rule takes no profile parameter: a reference to the wrong kind of element
 * is a malformed source rather than one beyond a profile, and widening a profile would not admit it.
 *
 * It was nonetheless installed per source reader, and two of the four readers never called it. The A12
 * CreateDocument profile admitted a `BPMNShape` whose `bpmnElement` resolved to a `BPMNPlane` — the
 * exact defect the rule was written for, in the other profile that retains Diagram Interchange.
 *
 * Each case asserts the diagnostic **code**, not merely rejection. Two of these seeds would also fail
 * a structural rule, so a status-only assertion would pass without the rule running at all and could
 * not distinguish a document-wide rule from a per-reader one.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  a12BoundaryErrorProfile,
  a12CreateDocumentProfile,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

/** One dispatch path, its own registered source, and one reference retyped to the wrong target. */
const dispatchPaths: ReadonlyArray<
  Readonly<{
    path: string;
    source: URL;
    semanticProfile: string;
    find: string;
    replace: string;
    subject: string;
  }>
> = [
  {
    path: "the generic compiler",
    source: new URL(
      "../../../scenarios/user-task-preserved-notation/process.bpmn",
      import.meta.url,
    ),
    semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
    find: 'bpmnElement="StartEvent_1"',
    replace: 'bpmnElement="BPMNPlane_1"',
    subject: "bpmnElement",
  },
  {
    path: "the A12 CreateDocument reader",
    source: new URL(
      "../../../scenarios/create-document-data/process.bpmn",
      import.meta.url,
    ),
    semanticProfile: a12CreateDocumentProfile,
    find: 'bpmnElement="StartEvent_CreateDocument"',
    replace: 'bpmnElement="Plane_A12CreateDocument"',
    subject: "bpmnElement",
  },
  {
    // A Sequence Flow is not an Activity, which is what `attachedToRef` declares.
    path: "the A12 boundary-error reader",
    source: new URL(
      "../../../scenarios/boundary-error/process.bpmn",
      import.meta.url,
    ),
    semanticProfile: a12BoundaryErrorProfile,
    find: 'attachedToRef="CreateRelationshipLinkTask"',
    replace: 'attachedToRef="Flow_StartToService"',
    subject: "attachedToRef",
  },
  {
    // A Process is not a Flow Node, which is what `sourceRef` declares.
    path: "the Call Activity reader",
    source: new URL(
      "./fixtures/call-activity-called-process.bpmn",
      import.meta.url,
    ),
    semanticProfile: SemanticProfileId.CalledProcessCallActivity,
    find: 'sourceRef="CallerStart"',
    replace: 'sourceRef="CallerProcess"',
    subject: "sourceRef",
  },
];

for (const { path, source, semanticProfile, find, replace, subject } of dispatchPaths) {
  test(`names the wrong-typed reference through ${path}`, async () => {
    const admitted = await readFile(source, "utf8");
    assert.ok(admitted.includes(find), `the source no longer contains ${find}`);

    const refused = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(admitted.replace(find, replace)),
      sourceId: "wrong-typed-reference",
      expectedSha256: undefined,
      semanticProfile,
      limits: semanticProcessTestLimits,
    });

    assert.equal(refused.status, BpmnCompilationStatus.Rejected);
    assert.deepEqual(
      refused.diagnostics
        .filter(
          ({ code }) =>
            code === BpmnSourceDiagnosticCode.ReferenceTargetTypeMismatch,
        )
        .map(({ element }) => element?.subject),
      [subject],
    );
  });
}

test("keeps every unperturbed dispatch path admitting its own source", async () => {
  const admitted = await Promise.all(
    dispatchPaths.map(async ({ source, semanticProfile }) =>
      compileBpmnToSemanticProcess({
        bytes: await readFile(source),
        sourceId: "unperturbed-dispatch-path",
        expectedSha256: undefined,
        semanticProfile,
        limits: semanticProcessTestLimits,
      })
    ),
  );

  assert.deepEqual(
    admitted.map(({ status }) => status),
    dispatchPaths.map(() => BpmnCompilationStatus.Accepted),
  );
});
