import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CompensationExecutionStateDefect,
  ControlStateKind,
  applyStimulus,
  compensationExecutionStateDefects,
  constructCompensationTriggerFrontier,
  type CompensationHandlerExecution,
  type CompensationTriggerExecution,
  type RuntimeState,
  type SelectedCompensationSubject,
} from "@bpmn-lean/semantic-core";
import {
  compensationSemanticProgram as program,
  triggerReadyFixture,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

function pendingFixture() {
  const ready = triggerReadyFixture();
  const state = applyStimulus(program, ready.state, ready.completion).state;
  const active = state.compensationTriggers?.[0];
  assert.ok(active);
  const trigger: CompensationTriggerExecution = {
    ...active,
    handlers: active.handlers.map((handler): CompensationHandlerExecution => {
      assert.ok(handler.lifecycle === "pending" || handler.lifecycle === "compensating");
      return {
        id: handler.id,
        subject: handler.subject,
        handlerElementId: handler.handlerElementId,
        lifecycle: "pending",
        restoredContext: handler.restoredContext,
      };
    }),
  };
  return {
    ...state,
    compensationTriggers: [trigger],
    compensationHandlerEffectWaits: [],
  } satisfies RuntimeState;
}

function withHandlers(state: RuntimeState, handlers: readonly CompensationHandlerExecution[]) {
  const trigger = state.compensationTriggers![0]!;
  return { ...state, compensationTriggers: [{ ...trigger, handlers }] };
}

function repeatSubject(handler: CompensationHandlerExecution): CompensationHandlerExecution {
  return {
    ...handler,
    id: { ...handler.id, activation: 2 },
    subject: handler.subject.kind === "boundaryActivity"
      ? { kind: "boundaryActivity", activity: { ...handler.subject.activity, activation: 2 } }
      : { kind: "eventSubProcess", parent: { ...handler.subject.parent, activation: 2 } },
    ...(handler.lifecycle === "pending" && handler.restoredContext !== null ? {
      restoredContext: {
        frames: handler.restoredContext.frames.map((frame, index) => index === 1
          ? { ...frame, owner: { ...frame.owner, activation: 2 } }
          : frame),
      },
    } : {}),
  };
}

test("active trigger owner must resolve to exactly one live parentless root occurrence", () => {
  const state = pendingFixture();
  assert.deepEqual(compensationExecutionStateDefects(program, state), []);
  const trigger = state.compensationTriggers[0]!;
  const owner = { ...trigger.owner, activation: 2 };
  const forged = {
    ...state,
    compensationTriggers: [{
      ...trigger,
      owner,
      handlers: trigger.handlers.map((handler) => handler.lifecycle === "pending" &&
          handler.restoredContext !== null
        ? { ...handler, restoredContext: {
            frames: handler.restoredContext.frames.map((frame, index) =>
              index === 0 ? { ...frame, owner } : frame),
          } }
        : handler),
    }],
  };
  assert.ok(compensationExecutionStateDefects(program, forged).includes(CompensationExecutionStateDefect.InvalidTrigger));
  for (const scopes of [[], [...state.scopeOccurrences, ...state.scopeOccurrences],
    state.scopeOccurrences.map((scope) => ({ ...scope, parent: trigger.owner }))]) {
    assert.ok(compensationExecutionStateDefects(program, {
      ...state, scopeOccurrences: scopes,
    }).includes(CompensationExecutionStateDefect.InvalidTrigger));
  }
});

for (const endpoint of ["predecessor", "successor"] as const) {
  test(`rejects distinct repeated ${endpoint} occurrences even with the first exact edge`, () => {
    const state = pendingFixture();
    const [a, b] = state.compensationTriggers[0]!.handlers;
    assert.ok(a && b);
    const handlers = endpoint === "predecessor" ? [a, repeatSubject(a), b] : [a, b, repeatSubject(b)];
    const forged = withHandlers(state, handlers);
    assert.ok(compensationExecutionStateDefects(program, forged).includes(CompensationExecutionStateDefect.InvalidTrigger));
    const repeated = endpoint === "predecessor" ? a : b;
    assert.ok(compensationExecutionStateDefects(program, {
      ...state,
      compensationTriggers: [{
        ...state.compensationTriggers[0]!,
        handlers: [repeated, repeatSubject(repeated)],
        dependencies: [],
      }],
    }).includes(CompensationExecutionStateDefect.InvalidTrigger));
  });
}

test("dependency construction refuses ambiguity before activating any handler", () => {
  const state = pendingFixture();
  const trigger = state.compensationTriggers[0]!;
  const [a, b] = trigger.handlers;
  assert.ok(a && b);
  const operation = program.operations.find((operation) => operation.kind === "triggerCompensation");
  assert.ok(operation && operation.kind === "triggerCompensation");
  function construct(handlers: readonly CompensationHandlerExecution[]) {
    const selected: SelectedCompensationSubject[] = handlers.map((handler) => {
      const definition = program.compensationExecution.subjects.find(({ body }) =>
        body.handlerElementId === handler.handlerElementId);
      assert.ok(definition && handler.lifecycle === "pending");
      return { definition, occurrence: handler.subject, restoredContext: handler.restoredContext };
    });
    return constructCompensationTriggerFrontier(program, state, operation!, trigger.owner, selected);
  }
  assert.equal(construct([a, repeatSubject(a), b]), null);
  assert.equal(construct([a, b, repeatSubject(b)]), null);
  assert.equal(construct([a, repeatSubject(a)]), null);
  assert.equal(construct([b, repeatSubject(b)]), null);
  assert.deepEqual(construct([a, b])?.trigger.dependencies, trigger.dependencies);
  for (const handlers of [[], [a], [b]]) {
    const result = construct(handlers);
    assert.ok(result);
    assert.deepEqual(result.trigger.dependencies, []);
  }
});

test("unique direct endpoints and partial selected handlers retain their exact dependency contract", () => {
  const state = pendingFixture();
  const trigger = state.compensationTriggers[0]!;
  const [a, b] = trigger.handlers;
  assert.ok(a && b);
  assert.deepEqual(compensationExecutionStateDefects(program, withHandlers(state, [a, b])), []);
  for (const handler of [a, b]) {
    assert.deepEqual(compensationExecutionStateDefects(program, {
      ...state,
      compensationTriggers: [{ ...trigger, handlers: [handler], dependencies: [] }],
    }), []);
  }
});

test("succeeded trigger tombstones remain valid after their live root is disposed", () => {
  const state = pendingFixture();
  const trigger = state.compensationTriggers[0]!;
  assert.deepEqual(compensationExecutionStateDefects(program, {
    ...state,
    control: { kind: ControlStateKind.Completed, instanceId: trigger.owner.processInstanceId },
    scopeOccurrences: [],
    compensationTriggers: [{
      ...trigger,
      lifecycle: "succeeded",
      handlers: trigger.handlers.map(({ id, subject, handlerElementId }) => ({
        id, subject, handlerElementId, lifecycle: "compensated",
      })),
    }],
  }), []);
});
