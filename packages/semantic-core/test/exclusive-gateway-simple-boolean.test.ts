import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  evaluateSimpleBooleanExpression,
  initialState,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
  SimpleBooleanExpression,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const literal = (value: boolean): SimpleBooleanExpression => ({
  kind: SimpleBooleanExpressionKind.Literal,
  value,
});

function choiceProgram(
  first: SimpleBooleanExpression,
  second: SimpleBooleanExpression,
): SemanticProcessProgram {
  const places = [
    "Flow_Default",
    "Flow_Default_End",
    "Flow_First",
    "Flow_First_End",
    "Flow_Second",
    "Flow_Second_End",
    "Flow_Start",
  ];
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile:
        "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft",
      sourceId: "simple-boolean-choice",
      sourceSha256: "1".repeat(64),
    },
    processId: "Process_Choice",
    controlPlaces: places.map(controlPlace),
    operations: [
      {
        ...operationBase("Choice"),
        kind: SemanticOperationKind.Choose,
        input: "place:Flow_Start",
        candidates: [
          {
            condition: first,
            output: "place:Flow_First",
            origin: {
              kind: SemanticOriginKind.BpmnSequenceFlow,
              elementId: "Flow_First",
            },
          },
          {
            condition: second,
            output: "place:Flow_Second",
            origin: {
              kind: SemanticOriginKind.BpmnSequenceFlow,
              elementId: "Flow_Second",
            },
          },
        ],
        defaultOutput: "place:Flow_Default",
        defaultOrigin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Default",
        },
      },
      {
        ...operationBase("End_Default"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_Default_End",
      },
      {
        ...operationBase("End_First"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_First_End",
      },
      {
        ...operationBase("End_Second"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_Second_End",
      },
      {
        ...operationBase("Start"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_Start",
      },
      {
        ...operationBase("Task_Default"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Default",
        output: "place:Flow_Default_End",
        task: { elementId: "Task_Default", name: null },
      },
      {
        ...operationBase("Task_First"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_First",
        output: "place:Flow_First_End",
        task: { elementId: "Task_First", name: null },
      },
      {
        ...operationBase("Task_Second"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Second",
        output: "place:Flow_Second_End",
        task: { elementId: "Task_Second", name: null },
      },
    ],
  });
}

const start = {
  kind: StimulusKind.StartProcess,
  commandId: "start-choice",
  processId: "Process_Choice",
  instanceId: "choice-instance",
  initialVariables: [],
} as const;

test("evaluates presence, explicit null, and string equality without coercion", () => {
  const bindings: VariableBinding[] = [
    {
      name: "nullValue",
      value: { kind: VariableValueKind.Null },
    },
    {
      name: "route",
      value: { kind: VariableValueKind.String, value: "approve" },
    },
  ];

  assert.equal(
    evaluateSimpleBooleanExpression(
      { kind: SimpleBooleanExpressionKind.IsPresent, variable: "nullValue" },
      bindings,
    ),
    true,
  );
  assert.equal(
    evaluateSimpleBooleanExpression(
      { kind: SimpleBooleanExpressionKind.IsNull, variable: "missing" },
      bindings,
    ),
    false,
  );
  assert.equal(
    evaluateSimpleBooleanExpression(
      {
        kind: SimpleBooleanExpressionKind.StringEquals,
        variable: "route",
        value: "approve",
      },
      bindings,
    ),
    true,
  );
  assert.equal(
    evaluateSimpleBooleanExpression(
      {
        kind: SimpleBooleanExpressionKind.StringEquals,
        variable: "nullValue",
        value: "",
      },
      bindings,
    ),
    false,
  );
});

test("selects first true, second true, and default branches", () => {
  const cases = [
    {
      program: choiceProgram(literal(true), literal(true)),
      task: "Task_First",
    },
    {
      program: choiceProgram(literal(false), literal(true)),
      task: "Task_Second",
    },
    {
      program: choiceProgram(literal(false), literal(false)),
      task: "Task_Default",
    },
  ];

  for (const { program, task } of cases) {
    assert.equal(supportsSemanticProcessExecution(start, program), true);
    const result = applyStimulus(program, initialState, start);
    assert.equal(result.outcome, CommandOutcome.Committed);
    assert.equal(result.internalStepBoundExceeded, false);
    assert.equal(result.state.control.kind, ControlStateKind.Running);
    assert.deepEqual(
      result.state.userTaskWaits.map(({ id }) => id.elementId),
      [task],
    );
    assert.deepEqual(result.state.controlTokens, []);
  }
});

test("does not let an unevaluated tail affect a first-true route", () => {
  const route = (second: SimpleBooleanExpression) =>
    applyStimulus(
      choiceProgram(literal(true), second),
      initialState,
      start,
    ).state.userTaskWaits.map(({ id }) => id.elementId);

  assert.deepEqual(route(literal(false)), route(literal(true)));
});

test("requires three start-closure steps and reports a smaller bound", () => {
  const program = choiceProgram(literal(true), literal(false));
  const exact = applyStimulus(program, initialState, start, 3);
  const short = applyStimulus(program, initialState, start, 2);

  assert.equal(exact.internalStepBoundExceeded, false);
  assert.equal(short.internalStepBoundExceeded, true);
  assert.deepEqual(short.state.userTaskWaits, []);
  assert.deepEqual(short.state.controlTokens, [
    {
      placeId: "place:Flow_First",
      owner: rootScopeOccurrence(program.processId, start.instanceId),
      multiplicity: 1,
    },
  ]);
});

test("rejects an extra initiation branch before it creates multiple-enabledness", () => {
  const original = choiceProgram(literal(true), literal(false));
  const extraTerminate = {
    ...operationBase("End_Extra"),
    kind: SemanticOperationKind.ReachNoneEnd,
    input: "place:Flow_Extra",
  } as const satisfies SemanticOperation;
  const extraInitiate = {
    ...operationBase("Start_Extra"),
    kind: SemanticOperationKind.Initiate,
    output: "place:Flow_Extra",
  } as const satisfies SemanticOperation;
  const mutated: SemanticProcessProgram = {
    ...original,
    controlPlaces: [
      ...original.controlPlaces,
      controlPlace("Flow_Extra"),
    ].toSorted(({ id: left }, { id: right }) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
    operations: [
      ...original.operations,
      extraTerminate,
      extraInitiate,
    ].toSorted(({ id: left }, { id: right }) =>
      left < right ? -1 : left > right ? 1 : 0
    ),
  };

  assert.equal(supportsSemanticProcessExecution(start, mutated), false);
});

test("rejects a branch origin that differs from its control place", () => {
  const original = choiceProgram(literal(true), literal(false));
  const mutated: SemanticProcessProgram = {
    ...original,
    operations: original.operations.map((operation) =>
      operation.kind === SemanticOperationKind.Choose
        ? {
            ...operation,
            candidates: [
              {
                ...operation.candidates[0],
                origin: {
                  ...operation.candidates[0].origin,
                  elementId: "Flow_Second",
                },
              },
              operation.candidates[1],
            ],
          }
        : operation
    ),
  };

  assert.equal(supportsSemanticProcessExecution(start, mutated), false);
});
