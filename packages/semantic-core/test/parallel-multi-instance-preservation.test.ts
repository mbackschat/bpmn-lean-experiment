import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  CommandOutcome,
  FlowNodeOccurrenceTerminalKind,
  RuntimeStateDefect,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticTransitionKind,
  applyStimulus,
  applyStimulusWithTrace,
  initialState,
  isGateAdmissibleRuntimeState,
  observeStableState,
  runtimeStateDefects,
  type RuntimeState,
  type Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  fireOuterTimer,
  instanceId,
} from "./sequential-multi-instance-fixture.ts";
import {
  parallelProgram,
  startWithParallelItems,
} from "./parallel-multi-instance-fixture.ts";

function startState(): RuntimeState {
  return { ...initialState, parallelMultiInstanceControllers: [] };
}

function committed(state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(parallelProgram, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function entered(policy: "all" | "first" = "all"): RuntimeState {
  return committed(
    startState(),
    startWithParallelItems(`start-parallel-${policy}-preservation`, ["alpha", "beta", "gamma"], policy),
  );
}

function assertAdmitted(label: string, state: RuntimeState): void {
  assert.deepEqual(runtimeStateDefects(parallelProgram, instanceId, state), [], label);
  assert.equal(isGateAdmissibleRuntimeState(parallelProgram, instanceId, state), true, label);
}

function assertRefusedWithoutMutation(
  label: string,
  valid: RuntimeState,
  malformed: RuntimeState,
  stimulus: Stimulus,
  expectedDefects: ReadonlyArray<string>,
): void {
  assert.equal(applyStimulus(parallelProgram, valid, stimulus).outcome, CommandOutcome.Committed);
  const defects = runtimeStateDefects(parallelProgram, instanceId, malformed);
  for (const expected of expectedDefects) {
    assert.ok(defects.includes(expected), `${label}: expected ${expected}, got ${defects.join(", ")}`);
  }
  assert.equal(isGateAdmissibleRuntimeState(parallelProgram, instanceId, malformed), false, label);
  const refused = applyStimulus(parallelProgram, malformed, stimulus);
  assert.equal(refused.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(refused.state, malformed, label);
}

test("every parallel Multi-Instance successor remains gate-admissible", () => {
  const zero = committed(
    startState(),
    startWithParallelItems("start-parallel-zero-preservation", [], "all"),
  );
  assertAdmitted("zero-item atomic closure", zero);

  const nonempty = entered();
  assertAdmitted("nonempty entry", nonempty);
  const progress = committed(nonempty, completeIteration(2, "reviewed gamma"));
  assertAdmitted("all-policy progress", progress);
  const second = committed(progress, completeIteration(0, "reviewed alpha"));
  assertAdmitted("all-policy second progress", second);
  const final = committed(second, completeIteration(1, "reviewed beta"));
  assertAdmitted("all-policy final closure", final);

  const firstEntry = entered("first");
  assertAdmitted("first-policy entry", firstEntry);
  const early = committed(firstEntry, completeIteration(1, "first accepted"));
  assertAdmitted("first-policy early closure", early);

  const timerEntry = entered();
  const interrupted = committed(timerEntry, fireOuterTimer);
  assertAdmitted("Timer closure", interrupted);
});

test("all-policy completion permutations preserve exact state and observation", () => {
  const before = entered();
  const finish = (order: ReadonlyArray<number>): RuntimeState =>
    order.reduce(
      (state, index) => committed(state, completeIteration(index, `reviewed ${["alpha", "beta", "gamma"][index]}`)),
      before,
    );
  const natural = finish([0, 1, 2]);
  const outOfIndex = finish([2, 0, 1]);

  assert.deepEqual(outOfIndex, natural);
  assert.deepEqual(
    observeStableState(parallelProgram, outOfIndex),
    observeStableState(parallelProgram, natural),
  );
});

test("first-policy winner order changes E1 and E2 while preserving terminal semantic state", () => {
  const before = entered("first");
  const first = applyStimulusWithTrace(
    parallelProgram,
    before,
    completeIteration(0, "accepted"),
  );
  const second = applyStimulusWithTrace(
    parallelProgram,
    before,
    completeIteration(1, "accepted"),
  );

  assert.equal(first.result.outcome, CommandOutcome.Committed);
  assert.equal(second.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(first.result.state, second.result.state);
  const firstExternal = first.committedTransitions.find(({ transition }) =>
    transition.kind === SemanticTransitionKind.ExternalStimulus
  );
  const secondExternal = second.committedTransitions.find(({ transition }) =>
    transition.kind === SemanticTransitionKind.ExternalStimulus
  );
  assert.equal(firstExternal?.transition.kind, SemanticTransitionKind.ExternalStimulus);
  assert.equal(secondExternal?.transition.kind, SemanticTransitionKind.ExternalStimulus);
  if (
    firstExternal?.transition.kind !== SemanticTransitionKind.ExternalStimulus ||
    secondExternal?.transition.kind !== SemanticTransitionKind.ExternalStimulus
  ) {
    assert.fail("both traces must publish the accepted external command");
  }
  assert.notDeepEqual(firstExternal.transition.stimulus, secondExternal.transition.stimulus);

  const childTerminals = (trace: typeof first) =>
    trace.flowNodeOccurrenceLifecycles.flatMap(({ ended }) =>
      ended.flatMap(({ anchor, terminal }) =>
        anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait && anchor.id.elementId === "Review"
          ? [{ activation: anchor.id.activation, terminal }]
          : []
      )
    );
  assert.deepEqual(childTerminals(first), [
    { activation: 1, terminal: FlowNodeOccurrenceTerminalKind.Completed },
    { activation: 2, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
    { activation: 3, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
  ]);
  assert.deepEqual(childTerminals(second), [
    { activation: 1, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
    { activation: 2, terminal: FlowNodeOccurrenceTerminalKind.Completed },
    { activation: 3, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
  ]);
});

test("controller bindings reject malformed child, Activity, and Timer joins without mutation", () => {
  const valid = entered();
  const [record] = valid.activityOccurrences;
  const [controller] = valid.parallelMultiInstanceControllers ?? [];
  const [firstWait] = valid.userTaskWaits;
  const [timer] = valid.timerWaits;
  assert.ok(record !== undefined && record.body.kind === ActivityBodyKind.ParallelUserTasks);
  assert.ok(controller !== undefined);
  assert.ok(firstWait !== undefined);
  assert.ok(timer !== undefined);
  const command = completeIteration(0, "accepted");

  const extraWait = {
    ...firstWait,
    id: { ...firstWait.id, activation: 4 },
  };
  const extraTimer = {
    ...timer,
    id: { ...timer.id, activation: 2 },
  };
  const cases: ReadonlyArray<Readonly<{
    label: string;
    state: RuntimeState;
    defects: ReadonlyArray<string>;
  }>> = [
    {
      label: "missing child wait",
      state: { ...valid, userTaskWaits: valid.userTaskWaits.slice(1) },
      defects: [RuntimeStateDefect.ActivityOccurrenceBodyAbsent, RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "extra child wait",
      state: {
        ...valid,
        userTaskWaits: [...valid.userTaskWaits, extraWait],
        taskActivations: [{ elementId: firstWait.id.elementId, count: 4 }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "missing Activity body member",
      state: {
        ...valid,
        activityOccurrences: [{
          ...record,
          body: { ...record.body, tasks: [record.body.tasks[1]!, record.body.tasks[2]!] },
        }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "extra Activity body member",
      state: {
        ...valid,
        activityOccurrences: [{
          ...record,
          body: { ...record.body, tasks: [...record.body.tasks, record.body.tasks[2]!] },
        }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "reordered Activity body",
      state: {
        ...valid,
        activityOccurrences: [{
          ...record,
          body: { ...record.body, tasks: [record.body.tasks[1]!, record.body.tasks[0]!, record.body.tasks[2]!] },
        }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "substituted controller activation",
      state: {
        ...valid,
        parallelMultiInstanceControllers: [{
          ...controller,
          id: { ...controller.id, activation: controller.id.activation + 1 },
        }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerUnowned],
    },
    {
      label: "substituted Activity activation",
      state: {
        ...valid,
        activityOccurrences: [{
          ...record,
          id: { ...record.id, activation: record.id.activation + 1 },
        }],
        activityActivations: [{ elementId: record.id.activityElementId, count: 2 }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerUnowned],
    },
    {
      label: "missing Timer",
      state: { ...valid, timerWaits: [] },
      defects: [RuntimeStateDefect.ActivityOccurrenceBodyAbsent, RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "extra Timer",
      state: {
        ...valid,
        timerWaits: [...valid.timerWaits, extraTimer],
        timerActivations: [{ elementId: timer.id.elementId, count: 2 }],
      },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "wrong Timer owner",
      state: {
        ...valid,
        timerWaits: [{ ...timer, owner: { ...timer.owner, activation: timer.owner.activation + 1 } }],
      },
      defects: [RuntimeStateDefect.DanglingWaitOwner, RuntimeStateDefect.ActivityOccurrenceBodyAbsent],
    },
    {
      label: "wrong Timer output",
      state: { ...valid, timerWaits: [{ ...timer, output: "place:wrong" }] },
      defects: [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    },
    {
      label: "duplicate controller",
      state: { ...valid, parallelMultiInstanceControllers: [controller, controller] },
      defects: [RuntimeStateDefect.DuplicateParallelMultiInstanceController],
    },
  ];

  for (const entry of cases) {
    assertRefusedWithoutMutation(entry.label, valid, entry.state, command, entry.defects);
  }
});

test("progress rejects a completed child retained in its body or wait collection", () => {
  const before = entered();
  const [completedWait] = before.userTaskWaits;
  const progress = committed(before, completeIteration(0, "reviewed alpha"));
  const [record] = progress.activityOccurrences;
  assert.ok(completedWait !== undefined);
  assert.ok(record !== undefined && record.body.kind === ActivityBodyKind.ParallelUserTasks);
  const command = completeIteration(1, "reviewed beta");

  assertRefusedWithoutMutation(
    "completed child wait retained",
    progress,
    { ...progress, userTaskWaits: [completedWait, ...progress.userTaskWaits] },
    command,
    [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
  );
  assertRefusedWithoutMutation(
    "completed child body retained",
    progress,
    {
      ...progress,
      activityOccurrences: [{
        ...record,
        body: { ...record.body, tasks: [completedWait.id, ...record.body.tasks] },
      }],
    },
    command,
    [RuntimeStateDefect.ActivityOccurrenceBodyAbsent, RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
  );
});

test("a child identity cannot be substituted across two live controllers", () => {
  const firstState = entered();
  const [firstController] = firstState.parallelMultiInstanceControllers ?? [];
  const [firstRecord] = firstState.activityOccurrences;
  const [firstTimer] = firstState.timerWaits;
  assert.ok(firstController !== undefined);
  assert.ok(firstRecord !== undefined && firstRecord.body.kind === ActivityBodyKind.ParallelUserTasks);
  assert.ok(firstTimer !== undefined);

  const secondTaskIds = firstController.slots.map((slot) => ({
    ...slot.taskId,
    activation: slot.taskId.activation + firstController.slots.length,
  }));
  const secondController = {
    ...firstController,
    id: { ...firstController.id, activation: firstController.id.activation + 1 },
    slots: firstController.slots.map((slot, index) => ({
      ...slot,
      taskId: secondTaskIds[index]!,
    })),
  };
  const secondTimer = {
    ...firstTimer,
    id: { ...firstTimer.id, activation: firstTimer.id.activation + 1 },
  };
  const secondRecord = {
    ...firstRecord,
    id: secondController.id,
    body: {
      ...firstRecord.body,
      tasks: secondTaskIds as [typeof secondTaskIds[number], ...typeof secondTaskIds[number][]],
    },
    attachedTimers: [secondTimer.id],
  };
  const secondWaits = firstState.userTaskWaits.map((wait, index) => ({
    ...wait,
    id: secondTaskIds[index]!,
  }));
  const validTwoControllers: RuntimeState = {
    ...firstState,
    activityOccurrences: [...firstState.activityOccurrences, secondRecord],
    parallelMultiInstanceControllers: [firstController, secondController],
    userTaskWaits: [...firstState.userTaskWaits, ...secondWaits],
    timerWaits: [...firstState.timerWaits, secondTimer],
    activityActivations: [{ elementId: firstRecord.id.activityElementId, count: 2 }],
    taskActivations: [{ elementId: firstState.userTaskWaits[0]!.id.elementId, count: 6 }],
    timerActivations: [{ elementId: firstTimer.id.elementId, count: 2 }],
  };
  assertAdmitted("two live controllers", validTwoControllers);

  const crossSubstituted: RuntimeState = {
    ...validTwoControllers,
    parallelMultiInstanceControllers: [
      firstController,
      {
        ...secondController,
        slots: secondController.slots.map((slot, index) =>
          index === 0 ? { ...slot, taskId: firstController.slots[0]!.taskId } : slot
        ),
      },
    ],
  };
  assertRefusedWithoutMutation(
    "cross-controller child substitution",
    validTwoControllers,
    crossSubstituted,
    completeIteration(3, "accepted from second controller"),
    [RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
  );
});

test("every closing route rejects retained parallel region state", () => {
  const allEntry = entered();
  const allFinal = committed(
    committed(committed(allEntry, completeIteration(0, "a")), completeIteration(1, "b")),
    completeIteration(2, "c"),
  );
  const firstEntry = entered("first");
  const early = committed(firstEntry, completeIteration(0, "first"));
  const timerEntry = entered();
  const timer = committed(timerEntry, fireOuterTimer);

  for (const [label, open, closed] of [
    ["normal", allEntry, allFinal],
    ["early", firstEntry, early],
    ["Timer", timerEntry, timer],
  ] as const) {
    const [controller] = open.parallelMultiInstanceControllers ?? [];
    const [record] = open.activityOccurrences;
    const [wait] = open.userTaskWaits;
    const [deadline] = open.timerWaits;
    assert.ok(controller !== undefined && record !== undefined && wait !== undefined && deadline !== undefined);
    const retained = [
      [`${label} controller`, { ...closed, parallelMultiInstanceControllers: [controller] }, RuntimeStateDefect.ParallelMultiInstanceControllerUnowned],
      [`${label} Activity`, { ...closed, activityOccurrences: [record] }, RuntimeStateDefect.ActivityOccurrenceBodyAbsent],
      [`${label} child`, { ...closed, userTaskWaits: [wait] }, RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
      [`${label} Timer`, { ...closed, timerWaits: [deadline] }, RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch],
    ] as const;
    for (const [retainedLabel, state, defect] of retained) {
      const defects = runtimeStateDefects(parallelProgram, instanceId, state);
      assert.ok(defects.includes(defect), `${retainedLabel}: expected ${defect}, got ${defects.join(", ")}`);
      assert.equal(isGateAdmissibleRuntimeState(parallelProgram, instanceId, state), false);
    }
  }
});
