/**
 * Locks exact source admission and lowering for the interrupting Sub-Process boundary Timer profile.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md):
 * one embedded Sub-Process owns one interrupting `PT1S` Timer Boundary Event, and both routes lead to
 * a distinct published follow-on User Task, which is what makes the route choice observable at the
 * canonical boundary.
 *
 * The negative cases are the point of this file rather than a completeness gesture. Both attachment
 * validators exist because a boundary Timer that admits and then resolves to no admitted host lowers
 * to no operation at all — the deadline belongs to the host Activity's operation, not to the boundary
 * node — so a host-kind predicate widened too far readmits a silently deadline-free program that
 * nothing downstream rejects. One case per newly excluded host kind is what holds that line, because
 * the TypeScript and Lean validators encode the same predicate and cannot separate a wrong widening
 * from each other.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { isWellFormedSemanticProcessProgram } from "@bpmn-lean/semantic-core";

const profile = "bpmn-2.0.2-subprocess-boundary-timer-draft";
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL(
    "../../../scenarios/subprocess-boundary-timer/process.bpmn",
    import.meta.url,
  ),
  "utf8",
);

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "subprocess-boundary-timer-test",
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits,
  });
}

test("admits one interrupting PT1S deadline attached to the embedded Sub-Process", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
});

/**
 * A deadline on the child task is the nearest wrong attachment, and the conjunct that rejects it is
 * the *same-scope* one, not the host-kind one. The boundary node sits in the root Process scope while
 * `ChildTask` sits in `scope:Scope`, so `nodeScopes.get(deadline) === nodeScopes.get(host)` is what
 * fails; the host-kind allowlist passes here, because `UserTask` is in it. This case therefore carries
 * no host-kind weight — the two below do — and it is retained because reaching across a scope boundary
 * is the wrong attachment a Sub-Process host makes newly expressible.
 */
test("rejects a deadline attached to the child task instead of the scope", async () => {
  const result = await compile(
    source.replaceAll('attachedToRef="Scope"', 'attachedToRef="ChildTask"'),
  );

  assert.notEqual(result.status, BpmnCompilationStatus.Accepted);
});

test("rejects a non-interrupting deadline on the scope", async () => {
  const result = await compile(
    source.replaceAll(
      '<bpmn:boundaryEvent id="Deadline" name="Deadline" attachedToRef="Scope">',
      '<bpmn:boundaryEvent id="Deadline" name="Deadline" attachedToRef="Scope" cancelActivity="false">',
    ),
  );

  assert.notEqual(result.status, BpmnCompilationStatus.Accepted);
});

test("rejects a duration this profile does not admit", async () => {
  const result = await compile(source.replaceAll(">PT1S<", ">PT2S<"));

  assert.notEqual(result.status, BpmnCompilationStatus.Accepted);
});

/**
 * Every spelling of a *true* `triggeredByEvent`, not only the canonical one.
 *
 * `bpmn-moddle` reduces an `xsd:boolean` to `value === "true"`, and scoped flow-element admission
 * admits a Sub-Process whose `triggeredByEvent` is absent or `false` — it admits on the coerced
 * value rather than refusing on it. So `"1"`, `'1'`, and `" true "` are all schema-valid spellings
 * of true that were once admitted, and an Event Sub-Process was lowered as an ordinary embedded
 * Sub-Process. `"true"` is refused by the admission predicate; the rest by the exact-lexeme guard.
 */
for (const lexeme of ['"true"', '"1"', "'1'", '" true "']) {
  test(`rejects an Event Sub-Process host declared as ${lexeme}`, async () => {
    const result = await compile(
      source.replaceAll(
        '<bpmn:subProcess id="Scope" name="Bounded scope">',
        `<bpmn:subProcess id="Scope" name="Bounded scope" triggeredByEvent=${lexeme}>`,
      ),
    );

    assert.notEqual(result.status, BpmnCompilationStatus.Accepted);
  });
}

/** The admitted spelling still compiles, so the guard refuses by lexeme rather than by attribute presence. */
test("admits an ordinary embedded Sub-Process declared with an exact false", async () => {
  const result = await compile(
    source.replaceAll(
      '<bpmn:subProcess id="Scope" name="Bounded scope">',
      '<bpmn:subProcess id="Scope" name="Bounded scope" triggeredByEvent="false">',
    ),
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
});

/**
 * These two carry decision 2's weight, and they are the only host-kind cases this profile can state.
 *
 * A negative case per *excluded Activity kind* is not constructible at the profile boundary: no
 * registered profile admits both a Timer Boundary Event and a Service Task, Call Activity, or Receive
 * Task, so such a fixture is rejected by the node multiset before the attachment rule ever runs, and
 * its pass would prove nothing about the host-kind conjunct. Both hosts below are instead in this
 * profile's own admitted multiset and in the boundary node's own scope, so the enumerated host-kind
 * set is the only conjunct left that can reject them.
 *
 * Verified by seeding the wrong widening: replacing the allowlist's closing `false` with `true` fails
 * exactly these two and no other test in this file. Attaching the deadline to itself is deliberately
 * absent, because it is already rejected without the host-kind conjunct and would look like evidence
 * for a rule it does not exercise.
 */
for (const excludedHost of ["NormalEnd", "Start"] as const) {
  test(`rejects a deadline attached to ${excludedHost}, which owns no operation`, async () => {
    const result = await compile(
      source.replaceAll('attachedToRef="Scope"', `attachedToRef="${excludedHost}"`),
    );

    assert.notEqual(result.status, BpmnCompilationStatus.Accepted);
  });
}
