import assert from "node:assert/strict";
import test from "node:test";

import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationPolicy,
  OperationsAuthorizationSurface,
  InvalidOperationsAuthorizationConfigurationError,
  TaskAuthorizationDecision,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

const policy = new OperationsAuthorizationPolicy("operators");
const surfaces = Object.values(OperationsAuthorizationSurface);

test("denies every Operations surface to an actor outside the exact group", () => {
  const actor = { id: "reviewer-1", groups: ["reviewers", "Operators"] };
  for (const surface of surfaces) {
    assert.equal(
      policy.decide(actor, surface),
      OperationsAuthorizationDecision.Forbidden,
    );
  }
});

test("grants every Operations surface to the exact operators group", () => {
  const actor = { id: "operator-1", groups: ["reviewers", "operators"] };
  assert.deepEqual(surfaces, [
    "incidentList",
    "incidentDetail",
    "incidentAction",
    "incidentAudit",
    "executionHistory",
    "executionDiagram",
    "executionExport",
    "flowNodeMetrics",
  ]);
  for (const surface of surfaces) {
    assert.equal(
      policy.decide(actor, surface),
      OperationsAuthorizationDecision.Permitted,
    );
  }
});

test("does not change Task authorization semantics", () => {
  const taskPolicy = new TaskAuthorizationPolicy();
  const actor = { id: "operator-1", groups: ["reviewers", "operators"] };
  assert.equal(taskPolicy.decideTask(actor, {
    candidateGroupId: "reviewers",
    claimActorId: null,
  }), TaskAuthorizationDecision.VisibleClaimable);
  assert.equal(taskPolicy.decideTask(actor, {
    candidateGroupId: "operators",
    claimActorId: "another-actor",
  }), TaskAuthorizationDecision.Hidden);
});

test("rejects empty and ill-formed configured group identifiers", () => {
  for (const groupId of ["", "\uD800"]) {
    assert.throws(
      () => new OperationsAuthorizationPolicy(groupId),
      InvalidOperationsAuthorizationConfigurationError,
    );
  }
});
