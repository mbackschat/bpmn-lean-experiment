/**
 * Locks restoration of the serial portable handoff: a continuation is representable only if every value at every carried
 * RuntimeState path is a SingletonBusinessItem, while every older profile still refuses the same nested order.
 *
 * The states under test are produced by the engine from the retained order model, then edited at exactly one carried
 * value, so a refusal can only come from that value and its profile.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, SemanticProfileId, StimulusKind, VariableValueKind, applyStimulus, initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";

import { requireBpmnWorkflowContinuationStateV1 } from "../dist/index.js";

const instanceId = "Handoff_continuation";
const text = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });
const order: VariableValue = { kind: VariableValueKind.Map, value: [
  { name: "items", value: { kind: VariableValueKind.List, value: [text("A"), text("A")] } },
  { name: "total", value: { kind: VariableValueKind.Decimal, coefficient: "-125", scale: 2 } },
] };

async function journey(): Promise<{ program: SemanticProcessProgram; review: RuntimeState; archive: RuntimeState }> {
  const bytes = await readFile(new URL("../../../../scenarios/portable-business-values-handoff/order-handoff.bpmn", import.meta.url));
  const compiled = await compileBpmnToSemanticProcess({ bytes, sourceId: "portable-handoff-order", expectedSha256: undefined,
    sourceOverlay: null, semanticProfile: SemanticProfileId.PortableBusinessValuesHandoff,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 } });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
  const program = compiled.semanticProcess;
  const started = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "OrderHandoff", instanceId, initialVariables: [{ name: "receivedOrder", value: order }] });
  assert.equal(started.outcome, CommandOutcome.Committed);
  const reviewed = applyStimulus(program, started.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review",
    taskId: { processInstanceId: instanceId, elementId: "ReviewOrder", activation: 1 },
    submittedValues: [{ name: "ReviewOrder_out", value: order }] });
  assert.equal(reviewed.outcome, CommandOutcome.Committed);
  return { program, review: started.state, archive: reviewed.state };
}

/** Replaces the one local input and the Process Property that fed it, keeping all other carried state intact. */
function withCarried(state: RuntimeState, value: VariableValue): RuntimeState {
  const edit = (bindings: readonly VariableBinding[]) => bindings.map(({ name }) => ({ name, value }));
  return { ...state, variables: { ...state.variables,
    process: { bindings: edit(state.variables.process.bindings) },
    activities: state.variables.activities.map((scope) => ({ ...scope, bindings: edit(scope.bindings) })) } };
}

test("restores the engine's own stable states at both waits, nested order included", async () => {
  const { program, review, archive } = await journey();
  for (const state of [review, archive]) {
    assert.deepEqual(requireBpmnWorkflowContinuationStateV1(state, program, instanceId), state);
  }
});

test("restores any SingletonBusinessItem at every carried path and nothing else", async () => {
  const { program, archive } = await journey();
  for (const value of [text("a".repeat(1024)), { kind: VariableValueKind.Null }, { kind: VariableValueKind.Map, value: [] },
    { kind: VariableValueKind.Boolean, value: false }, { kind: VariableValueKind.Integer, value: 0 }] as const) {
    const state = withCarried(archive, value);
    assert.deepEqual(requireBpmnWorkflowContinuationStateV1(state, program, instanceId), state, value.kind);
  }
  for (const [label, value] of [
    ["root List", { kind: VariableValueKind.List, value: [text("x")] }],
    ["empty root List", { kind: VariableValueKind.List, value: [] }],
    ["root StringList", { kind: VariableValueKind.StringList, value: ["x"] }],
    ["root String over 1,024 bytes", text("a".repeat(1025))],
  ] as const satisfies readonly (readonly [string, VariableValue])[]) {
    assert.throws(() => requireBpmnWorkflowContinuationStateV1(withCarried(archive, value), program, instanceId),
      /representable committed state/u, label);
  }
});

test("a single offending carried value is enough: the local input alone, then the Process Property alone", async () => {
  const { program, archive } = await journey();
  const root: VariableValue = { kind: VariableValueKind.List, value: [text("x")] };
  const onlyLocal: RuntimeState = { ...archive, variables: { ...archive.variables,
    activities: archive.variables.activities.map((scope) => ({ ...scope,
      bindings: scope.bindings.map(({ name }) => ({ name, value: root })) })) } };
  const onlyProcess: RuntimeState = { ...archive, variables: { ...archive.variables,
    process: { bindings: archive.variables.process.bindings.map(({ name }) => ({ name, value: root })) } } };
  for (const state of [onlyLocal, onlyProcess]) {
    assert.throws(() => requireBpmnWorkflowContinuationStateV1(state, program, instanceId), /representable committed state/u);
  }
});

test("an older profile restores the same state with String data but refuses the nested order", async () => {
  const { program, archive } = await journey();
  const older: SemanticProcessProgram = { ...program, identity: { ...program.identity,
    semanticProfile: SemanticProfileId.StructuredProcessComposition } };
  const strings = withCarried(archive, text("order-4711"));
  assert.deepEqual(requireBpmnWorkflowContinuationStateV1(strings, older, instanceId), strings);
  assert.throws(() => requireBpmnWorkflowContinuationStateV1(archive, older, instanceId), /representable committed state/u);
});
