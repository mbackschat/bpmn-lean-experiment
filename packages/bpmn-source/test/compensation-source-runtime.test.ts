import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  canonicalCompensationExecutionStateUtf8Bytes,
  initialState,
  projectCompensationStartCapacity,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

test("both exact-source branch orders reach the same B/C compensation frontier", async () => {
  const program = await compensationProgram();
  const reserveFirst = runToFrontier(program, [
    "Task_ReserveHotel",
    "Task_ArrangeGroundTravel",
    "Task_IssueInsurance",
  ]);
  const insuranceFirst = runToFrontier(program, [
    "Task_IssueInsurance",
    "Task_ReserveHotel",
    "Task_ArrangeGroundTravel",
  ]);

  assert.deepEqual(frontierProjection(reserveFirst), frontierProjection(insuranceFirst));
  assert.deepEqual(frontierProjection(reserveFirst), {
    handlers: [
      ["EventSubProcess_UndoGroundTravel", "compensating"],
      ["Task_UndoInsurance", "compensating"],
      ["Task_UndoReserveHotel", "pending"],
    ],
    waits: [
      ["Task_UndoGroundTravel", [{
        name: "DataInput_TravelDetails",
        value: { kind: VariableValueKind.String, value: "frozen itinerary" },
      }]],
      ["Task_UndoInsurance", []],
    ],
  });
  const projection = projectCompensationStartCapacity(
    program,
    startStimulus(program, "CompensationSourceRuntime_1"),
  );
  assert.ok(projection !== null);
  assert.deepEqual(reserveFirst.compensationTriggers, [projection.trigger]);
  assert.deepEqual(reserveFirst.compensationHandlerEffectWaits, projection.waits);
});

test("the B/C first frontier is larger than every later legal success frontier", async () => {
  const program = await compensationProgram();
  const firstFrontier = runToFrontier(program, [
    "Task_ReserveHotel",
    "Task_ArrangeGroundTravel",
    "Task_IssueInsurance",
  ]);
  const firstFrontierBytes = compensationExecutionBytes(firstFrontier);
  const orders = successfulCompensationOrders(
    program,
    firstFrontier,
    firstFrontierBytes,
  );

  assert.deepEqual(orders, [
    ["Task_UndoGroundTravel", "Task_UndoInsurance", "Task_UndoReserveHotel"],
    ["Task_UndoGroundTravel", "Task_UndoReserveHotel", "Task_UndoInsurance"],
    ["Task_UndoInsurance", "Task_UndoGroundTravel", "Task_UndoReserveHotel"],
  ]);
});

test("the promoted snapshot, not a later Process value, supplies B's argument", async () => {
  const program = await compensationProgram();
  let state = start(program, "FrozenCompensationSource_1");
  state = complete(program, state, "Task_ReserveHotel");
  state = complete(program, state, "Task_ArrangeGroundTravel");
  state = {
    ...state,
    variables: {
      ...state.variables,
      process: {
        bindings: [{
          name: "Property_TravelDetails",
          value: { kind: VariableValueKind.String, value: "newer current value" },
        }],
      },
    },
  };
  state = complete(program, state, "Task_IssueInsurance");

  assert.deepEqual(
    state.compensationHandlerEffectWaits?.find(
      ({ id }) => id.elementId === "Task_UndoGroundTravel",
    )?.arguments,
    [{
      name: "DataInput_TravelDetails",
      value: { kind: VariableValueKind.String, value: "frozen itinerary" },
    }],
  );
});

function runToFrontier(
  program: SemanticProcessProgram,
  completionOrder: ReadonlyArray<string>,
): RuntimeState {
  let state = start(program, "CompensationSourceRuntime_1");
  for (const elementId of completionOrder) {
    state = complete(program, state, elementId);
  }
  return state;
}

function start(program: SemanticProcessProgram, instanceId: string): RuntimeState {
  const result = applyStimulus(
    program,
    initialState,
    startStimulus(program, instanceId),
  );
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function startStimulus(program: SemanticProcessProgram, instanceId: string) {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `start:${instanceId}`,
    processId: program.processId,
    instanceId,
    initialVariables: [{
      name: "Property_TravelDetails",
      value: { kind: VariableValueKind.String, value: "frozen itinerary" },
    }],
  } as const;
}

function complete(
  program: SemanticProcessProgram,
  state: RuntimeState,
  elementId: string,
): RuntimeState {
  const waits = state.userTaskWaits.filter(({ id }) => id.elementId === elementId);
  const wait = waits[0];
  assert.equal(waits.length, 1, `expected one ${elementId} wait`);
  assert.ok(wait !== undefined);
  const result = applyStimulus(program, state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete:${elementId}`,
    taskId: wait.id,
    submittedValues: [],
  });
  assert.equal(result.outcome, CommandOutcome.Committed, elementId);
  return result.state;
}

function frontierProjection(state: RuntimeState) {
  const trigger = state.compensationTriggers?.[0];
  assert.ok(trigger !== undefined);
  return {
    handlers: trigger.handlers.map(({ handlerElementId, lifecycle }) => [
      handlerElementId,
      lifecycle,
    ]),
    waits: (state.compensationHandlerEffectWaits ?? []).map(({ id, arguments: arguments_ }) => [
      id.elementId,
      arguments_,
    ]),
  };
}

function successfulCompensationOrders(
  program: SemanticProcessProgram,
  state: RuntimeState,
  firstFrontierBytes: number,
  completed: ReadonlyArray<string> = [],
): ReadonlyArray<ReadonlyArray<string>> {
  const waits = state.compensationHandlerEffectWaits ?? [];
  if (waits.length === 0) return [completed];
  return waits.flatMap((wait) => {
    const result = applyStimulus(program, state, {
      kind: StimulusKind.CompleteEffect,
      commandId: `complete-compensation:${[...completed, wait.id.elementId].join(":")}`,
      effectId: wait.id,
      result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
    });
    assert.equal(result.outcome, CommandOutcome.Committed, wait.id.elementId);
    assert.ok(
      compensationExecutionBytes(result.state) < firstFrontierBytes,
      `${wait.id.elementId} successor must be smaller than the first frontier`,
    );
    return successfulCompensationOrders(
      program,
      result.state,
      firstFrontierBytes,
      [...completed, wait.id.elementId],
    );
  });
}

function compensationExecutionBytes(state: RuntimeState): number {
  return canonicalCompensationExecutionStateUtf8Bytes(
    state.compensationTriggers ?? [],
    state.compensationHandlerEffectWaits ?? [],
  );
}

async function compensationProgram(): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "./fixtures/compensation-source-checkpoint.bpmn",
      import.meta.url,
    )),
    sourceId: "compensation-source-runtime",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
    limits,
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("Compensation checkpoint compilation failed");
  }
  return result.semanticProcess;
}
