import assert from "node:assert/strict";
import test from "node:test";

import {
  AuditActorSelectionDecision,
  isTaskClaimable,
  isTaskVisible,
  TaskAuthorizationDecision,
  TaskAuthorizationPolicy,
} from "../dist/index.js";

const actor = Object.freeze({
  id: "demo-user",
  groups: Object.freeze(["reviewers"]),
});
const policy = new TaskAuthorizationPolicy();

test("shows and permits claiming an eligible unclaimed task", () => {
  const decision = policy.decideTask(actor, {
    candidateGroupId: "reviewers",
    claimActorId: null,
  });

  assert.equal(decision, TaskAuthorizationDecision.VisibleClaimable);
  assert.equal(isTaskVisible(decision), true);
  assert.equal(isTaskClaimable(decision), true);
});

test("shows but does not permit reclaiming the current actor's claim", () => {
  const decision = policy.decideTask(actor, {
    candidateGroupId: "reviewers",
    claimActorId: "demo-user",
  });

  assert.equal(
    decision,
    TaskAuthorizationDecision.VisibleClaimedByCurrentActor,
  );
  assert.equal(isTaskVisible(decision), true);
  assert.equal(isTaskClaimable(decision), false);
});

test("uniformly hides another actor's claim even when the group matches", () => {
  const claimedByAnotherActor = policy.decideTask(actor, {
    candidateGroupId: "reviewers",
    claimActorId: "other-user",
  });
  const groupMismatch = policy.decideTask(actor, {
    candidateGroupId: "managers",
    claimActorId: "other-user",
  });
  const metadataFree = policy.decideTask(actor, {
    candidateGroupId: null,
    claimActorId: null,
  });

  assert.equal(claimedByAnotherActor, TaskAuthorizationDecision.Hidden);
  assert.equal(claimedByAnotherActor, groupMismatch);
  assert.equal(claimedByAnotherActor, metadataFree);
  assert.equal(isTaskVisible(claimedByAnotherActor), false);
  assert.equal(isTaskClaimable(claimedByAnotherActor), false);
});

test("uses exact group identifiers without canonicalization", () => {
  assert.equal(policy.decideTask(actor, {
    candidateGroupId: "Reviewers",
    claimActorId: null,
  }), TaskAuthorizationDecision.Hidden);
  assert.equal(policy.decideTask(actor, {
    candidateGroupId: "reviewers ",
    claimActorId: null,
  }), TaskAuthorizationDecision.Hidden);
});

test("permits only omitted or exact self audit selection", () => {
  assert.equal(
    policy.decideAuditActorSelection(actor, undefined),
    AuditActorSelectionDecision.Permitted,
  );
  assert.equal(
    policy.decideAuditActorSelection(actor, "demo-user"),
    AuditActorSelectionDecision.Permitted,
  );
  assert.equal(
    policy.decideAuditActorSelection(actor, "other-user"),
    AuditActorSelectionDecision.Forbidden,
  );
});
