/**
 * A handler wait must not outlive the Activity occurrence it is attached to.
 *
 * `removeScopeOccurrenceSubtree` filters every runtime collection by *owner inside the subtree*, and a
 * bounded Sub-Process's boundary deadline is owned by the **parent** occurrence. It is therefore
 * outside the removed subtree by construction and survives the removal of the child it guards. The
 * bounded-scope family avoids that today only because its own two victory arms withdraw the deadline
 * by hand; the Error, incident-cancellation, and `terminateScope` routes reach the same region without
 * doing so, and no registered profile composes any of them with a bounded Sub-Process.
 *
 * That unreachability is why the oracle is the invariant rather than a schedule: no public transition
 * can produce the state, so the state is constructed from a committed one and handed to the predicate.
 * The predicate admits it today, because the stranded deadline still names a live owner and
 * `RSI-OWN-01` is satisfied, so nothing in either language reports a region whose handler outlived it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  ActivityHandlerKind,
  CommandOutcome,
  SemanticOperationKind,
  SemanticOriginKind,
  activityOccurrenceForAttachedTimer,
  attachedTimerWaits,
  applyInternalOperation,
  applyStimulus,
  initialState,
  isGateAdmissibleRuntimeState,
  runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { ActivityOccurrence, RuntimeState } from "@bpmn-lean/semantic-core";

import {
  boundedScopeProgram,
  completeChildTask,
  instanceId,
  start,
} from "./bounded-scope-fixture.ts";

function armedState(): RuntimeState {
  const started = applyStimulus(boundedScopeProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function defects(state: RuntimeState): ReadonlyArray<string> {
  return runtimeStateDefects(boundedScopeProgram, instanceId, state);
}

function syntheticActivityOccurrence(
  activityElementId: string,
  owner: ActivityOccurrence["owner"],
  body: ActivityOccurrence["body"],
): ActivityOccurrence {
  return {
    id: { processInstanceId: instanceId, activityElementId, activation: 1 },
    owner,
    operationId: `operation:${activityElementId}`,
    body,
    attachedHandlers: [],
  };
}

test("the armed state is admitted, and its deadline is owned outside the child region", () => {
  const state = armedState();
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(child !== undefined, "arming must create one child occurrence");
  assert.equal(state.timerWaits.length, 1);
  // The precondition the whole defect rests on. Without it the deadline would be removed with the
  // subtree and there would be nothing to strand.
  assert.notEqual(
    state.timerWaits[0]?.owner.definitionScopeId,
    child.id.definitionScopeId,
  );
  assert.deepEqual(defects(state), []);
});

/**
 * Exactly what owner-filtered subtree removal produces: the child region is gone, every token and
 * wait it owned is gone, and the parent-owned deadline is untouched.
 */
function strandedState(state: RuntimeState): RuntimeState {
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(child !== undefined, "arming must create one child occurrence");
  const outsideChild = (scopeId: string): boolean =>
    scopeId !== child.id.definitionScopeId;
  return {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter(({ id }) =>
      outsideChild(id.definitionScopeId)
    ),
    controlTokens: state.controlTokens.filter(({ owner }) =>
      outsideChild(owner.definitionScopeId)
    ),
    userTaskWaits: state.userTaskWaits.filter(({ owner }) =>
      outsideChild(owner.definitionScopeId)
    ),
  };
}

test("a region removal that leaves its attached deadline behind is refused", () => {
  assert.notDeepEqual(
    defects(strandedState(armedState())),
    [],
    "a deadline whose Activity body is gone must be refused, not admitted",
  );
});

/**
 * The fail-closed command boundary, not only the predicate.
 *
 * Adding the three ownership classes to the gated set changed which committed states accept a command,
 * and the predicate tests above cannot see that: they passed before the gating too. This asserts the
 * behaviour the gating bought, and it asserts it attributably. The same stimulus commits against the
 * admitted armed state, so the refusal is the record's stranding rather than the stimulus, and the
 * refused command must leave the received state byte-identical because a fail-closed boundary that
 * mutated on refusal would be worse than no boundary.
 */
/**
 * Attributability for the gated classes, and the discipline that produced it.
 *
 * Two earlier versions of this witness perturbed the *armed* record, and both passed for the wrong
 * reason: `armedBoundedScopeForDeadline` resolves the child through that same record, so the target
 * transition refused the state on its own and reverting the gated set left the test green. The rule the
 * failures teach is that a witness for a fail-closed boundary must perturb state the target transition
 * never reads, and the check that it did is a seeded revert of the boundary itself.
 *
 * Element `Unrelated_Activity` belongs to no Activity this program admits, so no transition looks it up,
 * and it sorts after the armed record's `Scope` so the canonical-order conjunct cannot be the refusal.
 */
const unconsultedElementId = "Unrelated_Activity";

function unconsultedControl(): RuntimeState {
  const state = armedState();
  return {
    ...state,
    activityActivations: [
      ...state.activityActivations,
      { elementId: unconsultedElementId, count: 1 },
    ],
  };
}

function withUnconsultedRecords(
  state: RuntimeState,
  build: (template: ActivityOccurrence) => ReadonlyArray<ActivityOccurrence>,
): RuntimeState {
  const [armed] = state.activityOccurrences;
  assert.ok(armed !== undefined, "arming must produce the template record");
  return {
    ...state,
    activityOccurrences: [...state.activityOccurrences, ...build({
      ...armed,
      id: { ...armed.id, activityElementId: unconsultedElementId, activation: 1 },
      attachedHandlers: [],
    })],
  };
}

test("the fail-closed command gate refuses an unconsulted record, one class at a time", () => {
  const control = unconsultedControl();
  const [liveTask] = control.userTaskWaits;
  assert.ok(liveTask !== undefined, "arming must create one live task");
  assert.equal(
    applyStimulus(boundedScopeProgram, control, completeChildTask).outcome,
    CommandOutcome.Committed,
    "the control must commit, or the refusals below are not attributable",
  );

  const cases = [
    {
      // Body absent: the unconsulted record names a scope occurrence that does not exist.
      defect: "activityOccurrenceBodyAbsent",
      state: withUnconsultedRecords(control, (template) => [{
        ...template,
        body: {
          kind: ActivityBodyKind.ChildScope,
          scope: { ...template.owner, definitionScopeId: "scope:Nowhere" },
        },
      }]),
    },
    {
      // Duplicate identity, with a live body so the body conjunct cannot fire instead. Two records
      // of equal identity also satisfy canonical order. Their task and scope bodies are disjoint, so
      // body-claim uniqueness cannot obscure the exact duplicate-identity attribution.
      defect: "duplicateActivityOccurrence",
      state: withUnconsultedRecords(control, (template) => {
        const taskBody = {
          ...template,
          body: { kind: ActivityBodyKind.UserTask, task: liveTask.id },
        } as const;
        const scopeBody = {
          ...template,
          body: { kind: ActivityBodyKind.ChildScope, scope: template.owner },
        } as const;
        return [taskBody, scopeBody];
      }),
    },
  ] as const;

  for (const { defect, state } of cases) {
    assert.deepEqual(defects(state), [defect], `exactly ${defect} must fire`);
    assert.deepEqual(
      { ...state, activityOccurrences: control.activityOccurrences },
      control,
      `${defect}: the perturbation must differ from the control in activityOccurrences alone`,
    );
    const refused = applyStimulus(boundedScopeProgram, state, completeChildTask);
    assert.notEqual(refused.outcome, CommandOutcome.Committed, defect);
    assert.deepEqual(refused.state, state, `${defect}: a refusal must preserve the received state`);
  }
});

/**
 * The third gated class has no unconsulted witness on this fixture, and that is a property of the
 * class rather than an omission. `UnownedAttachedWait` fires only when two records claim one *live*
 * Timer wait, this profile admits exactly one Timer wait, and it is the deadline the completion path
 * reads. Any state tripping the class therefore also perturbs state the transition consults. The class
 * is covered by the predicate negative above and by the gated set it shares with the other two.
 */
test("the ambiguity class is gated but has no transition-independent witness here", () => {
  const control = unconsultedControl();
  assert.equal(control.timerWaits.length, 1, "the premise of the absence is one live Timer wait");
  const ambiguous = withUnconsultedRecords(control, (template) => [{
    ...template,
    body: { kind: ActivityBodyKind.ChildScope, scope: template.owner },
    attachedHandlers: control.activityOccurrences[0]?.attachedHandlers ?? [],
  }]);
  assert.ok(defects(ambiguous).includes("unownedAttachedWait"));
});

/**
 * Anti-vacuity, and it is what makes the refusal attributable.
 *
 * Removing the region *and* its attached deadline is a complete withdrawal and must stay admitted. If
 * this failed too, the test above would be reporting the subtree removal rather than the stranding.
 */
test("removing the region together with its attached deadline stays admitted", () => {
  const state = armedState();
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(child !== undefined);

  const withdrawn: RuntimeState = {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter((candidate) =>
      candidate.id.definitionScopeId !== child.id.definitionScopeId
    ),
    controlTokens: state.controlTokens.filter(({ owner }) =>
      owner.definitionScopeId !== child.id.definitionScopeId
    ),
    userTaskWaits: state.userTaskWaits.filter(({ owner }) =>
      owner.definitionScopeId !== child.id.definitionScopeId
    ),
    timerWaits: [],
    activityOccurrences: [],
  };

  assert.deepEqual(defects(withdrawn), []);
});

test("the ThrowError route removes only controllers whose exact Activity records are withdrawn", () => {
  const before = armedState();
  const child = before.scopeOccurrences.find(({ parent }) => parent !== null);
  const record = before.activityOccurrences.find(({ body }) =>
    body.kind === ActivityBodyKind.ChildScope &&
    child !== undefined &&
    body.scope.definitionScopeId === child.id.definitionScopeId
  );
  assert.ok(child !== undefined && record !== undefined);

  const withdrawnController = {
    id: record.id,
    snapshot: ["withdrawn"],
    outputSlots: [],
  };
  const unrelatedController = {
    id: { ...record.id, activityElementId: "Unrelated_Activity" },
    snapshot: ["retained"],
    outputSlots: [],
  };
  const withdrawnParallelController = {
    id: record.id,
    snapshot: ["withdrawn"],
    slots: [],
  };
  const unrelatedParallelController = {
    id: { ...record.id, activityElementId: "Unrelated_Parallel_Activity" },
    snapshot: ["retained"],
    slots: [],
  };
  const errorOperation = {
    id: "operation:Synthetic_Error_End",
    kind: SemanticOperationKind.ThrowError,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "Synthetic_Error_End",
    },
    input: "place:Synthetic_Error_Input",
    error: {
      errorDefinitionId: "Synthetic_Error_Definition",
      errorElementId: "Synthetic_Error",
      code: "E",
    },
    handler: {
      attachedScopeId: child.id.definitionScopeId,
      code: "E",
      output: "place:Synthetic_Handled",
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        boundaryEventId: "Synthetic_Boundary_Error",
        errorDefinitionId: "Synthetic_Error_Definition",
        errorElementId: "Synthetic_Error",
        sequenceFlowId: "Synthetic_Handled",
      },
    },
  } as const;
  const withControllers: RuntimeState = {
    ...before,
    controlTokens: [{
      placeId: errorOperation.input,
      owner: child.id,
      multiplicity: 1,
    }],
    sequentialMultiInstanceControllers: [
      withdrawnController,
      unrelatedController,
    ],
    parallelMultiInstanceControllers: [
      withdrawnParallelController,
      unrelatedParallelController,
    ],
  };

  const after = applyInternalOperation(
    boundedScopeProgram,
    errorOperation,
    withControllers,
  );
  assert.ok(after !== null, "the public ThrowError evaluator must select the child region");
  assert.deepEqual(after.sequentialMultiInstanceControllers, [unrelatedController]);
  assert.deepEqual(after.parallelMultiInstanceControllers, [unrelatedParallelController]);
  assert.equal(
    after.activityOccurrences.some((candidate) => candidate === record),
    false,
    "the controller leaves with its exact withdrawn Activity record",
  );
  assert.deepEqual(after.variables.process, withControllers.variables.process);
  assert.equal(after.logicalTimeMs, withControllers.logicalTimeMs);
  for (const field of [
    "endOccurrences",
    "taskActivations",
    "messageActivations",
    "timerActivations",
    "eventRaceActivations",
    "callActivations",
    "effectActivations",
    "scopeActivations",
    "activityActivations",
  ] as const) {
    assert.deepEqual(after[field], withControllers[field], field);
  }

  const absentBefore = armedState();
  const absentChild = absentBefore.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(absentChild !== undefined);
  const absentAfter = applyInternalOperation(
    boundedScopeProgram,
    errorOperation,
    {
      ...absentBefore,
      controlTokens: [{
        placeId: errorOperation.input,
        owner: absentChild.id,
        multiplicity: 1,
      }],
    },
  );
  assert.ok(absentAfter !== null);
  assert.equal(
    Object.hasOwn(absentAfter, "sequentialMultiInstanceControllers"),
    false,
    "regional cleanup must preserve the optional field's historical absence",
  );
  assert.equal(
    Object.hasOwn(absentAfter, "parallelMultiInstanceControllers"),
    false,
    "regional cleanup must preserve the parallel field's historical absence",
  );
});

/**
 * One negative per added conjunct, with its siblings asserted intact.
 *
 * A refusal is only attributable when the state it rejects differs from an admitted one in exactly the
 * conjunct under test. Each case below perturbs the armed state once and asserts that the defect list
 * names the class being tested, so a conjunct that rejected for an unrelated reason would show up as
 * the wrong label rather than as a pass.
 */
test("two records claiming one attached deadline are refused as ambiguous", () => {
  const state = armedState();
  const [record] = state.activityOccurrences;
  assert.ok(record !== undefined, "arming must create one record");

  const ambiguous: RuntimeState = {
    ...state,
    activityActivations: [
      ...state.activityActivations,
      { elementId: "Activity_Other", count: record.id.activation },
    ],
    activityOccurrences: [
      record,
      // A second Activity of a different element claiming the same deadline. Nothing else changes, so
      // its body is absent too; the ambiguity class must be reported alongside that.
      { ...record, id: { ...record.id, activityElementId: "Activity_Other" } },
    ],
  };

  assert.ok(
    defects(ambiguous).includes("unownedAttachedWait"),
    `expected the ambiguity class, got ${JSON.stringify(defects(ambiguous))}`,
  );
});

test("singular and parallel bodies cannot claim the same exact live task", () => {
  const state = armedState();
  const [task] = state.userTaskWaits;
  assert.ok(task !== undefined, "arming must create one live task");

  const singular = syntheticActivityOccurrence(
    "Activity_Claim_Singular",
    task.owner,
    { kind: ActivityBodyKind.UserTask, task: task.id },
  );
  const parallel = syntheticActivityOccurrence(
    "Activity_Claim_Parallel",
    task.owner,
    { kind: ActivityBodyKind.ParallelUserTasks, tasks: [task.id] },
  );
  const duplicateClaim: RuntimeState = {
    ...state,
    activityActivations: [
      { elementId: parallel.id.activityElementId, count: 1 },
      { elementId: singular.id.activityElementId, count: 1 },
      ...state.activityActivations,
    ],
    activityOccurrences: [parallel, singular, ...state.activityOccurrences],
  };

  assert.deepEqual(
    defects(duplicateClaim),
    ["duplicateActivityBodyClaim"],
    "the task claim must be the only violated Activity ownership predicate",
  );
  assert.equal(
    isGateAdmissibleRuntimeState(boundedScopeProgram, instanceId, state),
    true,
    "the admitted control must pass the fail-closed gate",
  );
  assert.equal(
    isGateAdmissibleRuntimeState(boundedScopeProgram, instanceId, duplicateClaim),
    false,
    "the distinct body-claim defect must be gated",
  );
});

test("two distinct Activity identities cannot claim the same exact live child scope", () => {
  const state = armedState();
  const [record] = state.activityOccurrences;
  assert.ok(
    record?.body.kind === ActivityBodyKind.ChildScope,
    "arming must create the child-scope Activity record",
  );

  const duplicateClaim = syntheticActivityOccurrence(
    "Unrelated_Child_Scope_Claim",
    record.owner,
    record.body,
  );
  const ambiguous: RuntimeState = {
    ...state,
    activityActivations: [
      ...state.activityActivations,
      { elementId: duplicateClaim.id.activityElementId, count: 1 },
    ],
    activityOccurrences: [...state.activityOccurrences, duplicateClaim],
  };

  assert.deepEqual(
    defects(ambiguous),
    ["duplicateActivityBodyClaim"],
    "the scope claim must be the only violated Activity ownership predicate",
  );
});

test("multiple records may claim distinct exact live tasks", () => {
  const state = armedState();
  const [firstTask] = state.userTaskWaits;
  assert.ok(firstTask !== undefined, "arming must create one live task");
  const secondTask = {
    ...firstTask,
    id: { ...firstTask.id, activation: firstTask.id.activation + 1 },
  };
  const firstRecord = syntheticActivityOccurrence(
    "Activity_Claim_A",
    firstTask.owner,
    { kind: ActivityBodyKind.UserTask, task: firstTask.id },
  );
  const secondRecord = syntheticActivityOccurrence(
    "Activity_Claim_B",
    secondTask.owner,
    { kind: ActivityBodyKind.ParallelUserTasks, tasks: [secondTask.id] },
  );

  assert.deepEqual(defects({
    ...state,
    userTaskWaits: [firstTask, secondTask],
    taskActivations: state.taskActivations.map((counter) => ({
      ...counter,
      count: secondTask.id.activation,
    })),
    activityActivations: [
      { elementId: firstRecord.id.activityElementId, count: 1 },
      { elementId: secondRecord.id.activityElementId, count: 1 },
      ...state.activityActivations,
    ],
    activityOccurrences: [firstRecord, secondRecord, ...state.activityOccurrences],
  }), []);
});

test("multiple records may claim distinct exact live child scopes", () => {
  const state = armedState();
  const [record] = state.activityOccurrences;
  assert.ok(record !== undefined, "arming must create one Activity record");
  const claimedBody = record.body;
  assert.ok(claimedBody.kind === ActivityBodyKind.ChildScope);
  const child = state.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === claimedBody.scope.definitionScopeId
  );
  assert.ok(child !== undefined, "the claimed child scope must be live");
  const secondChild = {
    ...child,
    id: { ...child.id, activation: child.id.activation + 1 },
  };
  const secondRecord = syntheticActivityOccurrence(
    "Unrelated_Child_Scope_Claim",
    record.owner,
    { kind: ActivityBodyKind.ChildScope, scope: secondChild.id },
  );

  assert.deepEqual(defects({
    ...state,
    scopeOccurrences: [...state.scopeOccurrences, secondChild],
    scopeActivations: state.scopeActivations.map((counter) =>
      counter.elementId === child.id.definitionScopeId
        ? { ...counter, count: secondChild.id.activation }
        : counter
    ),
    activityActivations: [
      ...state.activityActivations,
      { elementId: secondRecord.id.activityElementId, count: 1 },
    ],
    activityOccurrences: [...state.activityOccurrences, secondRecord],
  }), []);
});

test("one parallel body may repeat the same exact live task claim", () => {
  const state = armedState();
  const [task] = state.userTaskWaits;
  assert.ok(task !== undefined, "arming must create one live task");
  const repeated = syntheticActivityOccurrence(
    "Activity_Claim_Parallel",
    task.owner,
    { kind: ActivityBodyKind.ParallelUserTasks, tasks: [task.id, task.id] },
  );

  assert.deepEqual(defects({
    ...state,
    activityActivations: [
      { elementId: repeated.id.activityElementId, count: 1 },
      ...state.activityActivations,
    ],
    activityOccurrences: [repeated, ...state.activityOccurrences],
  }), []);
});

test("a duplicated record identity is refused, and the admitted control is not", () => {
  const state = armedState();
  const [record] = state.activityOccurrences;
  const [task] = state.userTaskWaits;
  assert.ok(record !== undefined && task !== undefined);
  const sameIdentityWithDisjointBody: ActivityOccurrence = {
    ...record,
    body: { kind: ActivityBodyKind.UserTask, task: task.id },
    attachedHandlers: [],
  };

  assert.deepEqual(defects(state), [], "the unperturbed armed state is the control");
  assert.deepEqual(
    defects({
      ...state,
      activityOccurrences: [record, sameIdentityWithDisjointBody],
    }),
    ["duplicateActivityOccurrence"],
  );
});

test("a record whose listed deadline is owned by another scope is refused", () => {
  const state = armedState();
  const [record] = state.activityOccurrences;
  const child = state.scopeOccurrences.find(({ parent }) => parent !== null);
  assert.ok(record !== undefined && child !== undefined);

  // The deadline stays live and the body stays live; only the record's claim about *who* owns the
  // deadline changes. This is the direction that would let a withdrawal cross a region boundary.
  const crossOwned: RuntimeState = {
    ...state,
    activityOccurrences: [{ ...record, owner: child.id }],
  };

  assert.notDeepEqual(defects(crossOwned), []);
});

/**
 * The incidental agreement between the new counter and the ones it shadows is read nowhere.
 *
 * `activityActivations` agrees with `taskActivations` and `scopeActivations` under every registered
 * profile, because an Activity is armed once per body it produces. Asserting that agreement would
 * install exactly the ordinal coincidence this record removes, so a state where they disagree must
 * stay admitted.
 */
test("a state whose Activity and task counters disagree stays admitted", () => {
  const state = armedState();
  assert.deepEqual(
    defects({
      ...state,
      activityActivations: state.activityActivations.map((counter) => ({
        ...counter,
        count: counter.count + 4,
      })),
    }),
    [],
  );
});

test("a same-shaped Message handler cannot masquerade as an attached Timer", () => {
  const timerId = {
    processInstanceId: instanceId,
    elementId: "Boundary_Timer",
    activation: 1,
  };
  const messageOnly: ActivityOccurrence = {
    ...syntheticActivityOccurrence(
      "Activity_Message_Handler",
      armedState().scopeOccurrences[0]!.id,
      {
        kind: ActivityBodyKind.UserTask,
        task: {
          processInstanceId: instanceId,
          elementId: "Activity_Message_Handler",
          activation: 1,
        },
      },
    ),
    attachedHandlers: [{
      kind: ActivityHandlerKind.Message,
      occurrence: timerId,
    }],
  };

  assert.equal(activityOccurrenceForAttachedTimer([messageOnly], timerId), undefined);
  assert.deepEqual(attachedTimerWaits(messageOnly, [{ id: timerId }]), []);
});
