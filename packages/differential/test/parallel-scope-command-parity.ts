import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { applyStimulusWithTrace, replayCommittedTransitions, initialState, CommandOutcome, ControlStateKind,
  StimulusKind, EffectExecutionResultKind, VariableValueKind, LocalDataOwnerKind, supportsSemanticProcessExecution,
  projectOpenFlowNodeOccurrences, requireCompleteFlowNodeOccurrenceLifecycles, SemanticOperationKind, SemanticTransitionKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticProcessProgram, Stimulus, VariableBinding, OccurrenceId, UnnumberedFlowNodeOccurrenceEnd } from "@bpmn-lean/semantic-core";
import { parallelProgramCapacityCases } from "../../bpmn-source/test/parallel-scope-start-bound-fixture.ts";
import { parallelCommandInputs } from "../../bpmn-source/test/parallel-scope-command-fixture.ts";
import { parallelOutputMappingCommandInputs } from "../../bpmn-source/test/parallel-scope-output-mapping-fixture.ts";
import { parseLeanOutputLines } from "./pipeline-target-support.ts";
import { runLeanDriver } from "./semantic-differential-targets.ts";

export const owner = (id: ScopeOccurrenceId) => [id.processInstanceId, id.definitionScopeId, id.activation];
export const prefix = (before: RuntimeState, state: RuntimeState) => ({
  tokens: state.controlTokens.flatMap(token => Array.from({ length: token.multiplicity }, () => [token.placeId, owner(token.owner)])),
  tasks: state.userTaskWaits.map(wait => [owner(wait.owner), wait.id.elementId, wait.id.activation, wait.output]),
  effects: state.effectWaits.map(wait => [owner(wait.owner), wait.id.elementId, wait.id.activation, wait.output, wait.arguments]),
  taskCounters: state.taskActivations.map(row => [row.elementId, row.count]),
  effectCounters: state.effectActivations.map(row => [row.elementId, row.count]),
  endOccurrences: state.endOccurrences,
  effectFrames: state.variables.activities.flatMap(frame => frame.owner.kind === LocalDataOwnerKind.EffectOccurrence
    ? [[frame.owner.id.processInstanceId, frame.owner.id.elementId, frame.owner.id.activation, frame.bindings]] : []),
  otherStateUnchanged: isDeepStrictEqual({ ...state, controlTokens: before.controlTokens,
    userTaskWaits: before.userTaskWaits, effectWaits: before.effectWaits, taskActivations: before.taskActivations,
    effectActivations: before.effectActivations, endOccurrences: before.endOccurrences,
    variables: { ...state.variables, activities: before.variables.activities } }, before),
});

export const stateProjection = (before: RuntimeState, state: RuntimeState) => ({
  status: state.control.kind, prefix: prefix(before, state), process: state.variables.process.bindings,
  scopeFrames: state.variables.scopes.map(frame => [owner(frame.owner), frame.bindings]),
  scopes: state.scopeOccurrences.map(scope => [owner(scope.id), scope.parent === null ? null : owner(scope.parent)]),
  fullState: completePrivateState(state),
});

function absentFamily(values: readonly unknown[] | undefined, field: string): readonly unknown[] {
  assert.deepEqual(values ?? [], [], `private PMIS state excludes ${field}`);
  return [];
}

/** RuntimeState.lean identifies absent optional collections with empty lists; token lists preserve multiplicity. */
function completePrivateState(state: RuntimeState) {
  assert.notEqual(state.control.kind, ControlStateKind.Failed, "private PMIS excludes failed control");
  for (const activity of state.activityOccurrences) {
    assert.equal(activity.body.kind, "parallelChildScopes");
    absentFamily(activity.attachedHandlers, "attachedHandlers");
  }
  for (const wait of state.effectWaits) assert.equal(wait.bpmnErrorRoute, null);
  for (const frame of state.variables.activities) assert.equal(frame.owner.kind, LocalDataOwnerKind.EffectOccurrence);
  return {
    control: state.control, initiationPending: state.initiationPending,
    scopeOccurrences: state.scopeOccurrences,
    controlTokens: state.controlTokens.flatMap(token => {
      assert.ok(Number.isSafeInteger(token.multiplicity) && token.multiplicity > 0);
      return Array.from({ length: token.multiplicity }, () => ({ placeId: token.placeId, owner: token.owner }));
    }),
    userTaskWaits: state.userTaskWaits.map(wait => ({ ...wait, metadata: wait.metadata ?? null })),
    messageWaits: absentFamily(state.messageWaits, "messageWaits"),
    eventSubProcessMessageSubscriptions: absentFamily(state.eventSubProcessMessageSubscriptions, "eventSubProcessMessageSubscriptions"),
    timerWaits: absentFamily(state.timerWaits, "timerWaits"),
    effectWaits: state.effectWaits,
    effectIncidents: absentFamily(state.effectIncidents, "effectIncidents"),
    selectedBranchSets: absentFamily(state.selectedBranchSets, "selectedBranchSets"),
    eventRaces: absentFamily(state.eventRaces, "eventRaces"),
    calledProcessOccurrences: absentFamily(state.calledProcessOccurrences, "calledProcessOccurrences"),
    activityOccurrences: state.activityOccurrences,
    sequentialScopeControllers: absentFamily(state.sequentialScopeControllers, "sequentialScopeControllers"),
    parallelScopeControllers: state.parallelScopeControllers ?? [],
    sequentialMultiInstanceControllers: absentFamily(state.sequentialMultiInstanceControllers, "sequentialMultiInstanceControllers"),
    parallelMultiInstanceControllers: absentFamily(state.parallelMultiInstanceControllers, "parallelMultiInstanceControllers"),
    compensationActivityRetentions: absentFamily(state.compensationActivityRetentions, "compensationActivityRetentions"),
    compensationParentContextRetentions: absentFamily(state.compensationParentContextRetentions, "compensationParentContextRetentions"),
    compensationTriggers: absentFamily(state.compensationTriggers, "compensationTriggers"),
    compensationHandlerEffectWaits: absentFamily(state.compensationHandlerEffectWaits, "compensationHandlerEffectWaits"),
    variables: { process: state.variables.process, scopes: state.variables.scopes, activities: state.variables.activities,
      processInterfaces: absentFamily(state.variables.processInterfaces, "processInterfaces") } satisfies Record<keyof RuntimeState["variables"], unknown>,
    taskActivations: state.taskActivations, messageActivations: state.messageActivations, timerActivations: state.timerActivations,
    effectActivations: state.effectActivations, scopeActivations: state.scopeActivations, eventRaceActivations: state.eventRaceActivations,
    callActivations: state.callActivations, activityActivations: state.activityActivations,
    endOccurrences: state.endOccurrences, logicalTimeMs: state.logicalTimeMs,
  } satisfies Record<keyof RuntimeState, unknown>;
}

export function compareCommandState(actual: unknown, expected: unknown, context: string): void {
  const received = comparisonRecord(actual, context), wanted = comparisonRecord(expected, context);
  compareRecordKeys(received, wanted, context);
  for (const key of Object.keys(wanted)) {
    if (key === "fullState") {
      const receivedState = comparisonRecord(received[key], context), wantedState = comparisonRecord(wanted[key], context);
      compareRecordKeys(receivedState, wantedState, `${context} fullState`);
      for (const field of Object.keys(wantedState)) assert.equal(isDeepStrictEqual(receivedState[field], wantedState[field]),
        true, `${context} fullState.${field}`);
    } else assert.equal(isDeepStrictEqual(received[key], wanted[key]), true, `${context} state.${key}`);
  }
}

function commandWitness(program: SemanticProcessProgram, count: number) {
  let state = initialState;
  const stimuli: Stimulus[] = [];
  const commands: unknown[] = [];
  const run = (stimulus: Stimulus, outcome = CommandOutcome.Committed) => {
    const before = state;
    const traced = applyStimulusWithTrace(program, before, stimulus);
    state = traced.result.state;
    assert.equal(traced.result.outcome, outcome, stimulus.commandId);
    assert.equal(traced.result.internalStepBoundExceeded || traced.result.ambiguousInternalChoice, false);
    assert.equal(traced.committedTransitions.length > 0, outcome === CommandOutcome.Committed);
    assert.equal(traced.flowNodeOccurrenceLifecycles.length, traced.committedTransitions.length);
    const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
    if (outcome === CommandOutcome.Committed) {
      assert.deepEqual(replayed, state);
      const open = projectOpenFlowNodeOccurrences(program, before);
      assert.ok(open);
      requireCompleteFlowNodeOccurrenceLifecycles(program,
        open.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), stimulus.commandId,
        traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
    } else assert.deepEqual(state, before);
    assert.equal(state.variables.process.bindings.some(binding => binding.name === "status"), false);
    commands.push({ commandId: stimulus.commandId, outcome: traced.result.outcome,
      internalStepBoundExceeded: traced.result.internalStepBoundExceeded,
      ambiguousInternalChoice: traced.result.ambiguousInternalChoice,
      stateUnchanged: isDeepStrictEqual(state, before), traceReplays: isDeepStrictEqual(replayed, state),
      publication: traced.committedTransitions.length === 0 ? null : {
        transitions: traced.committedTransitions, current: traced.currentPositions },
      lifecycles: traced.flowNodeOccurrenceLifecycles, state: stateProjection(before, state) });
    stimuli.push(stimulus);
    return traced;
  };
  return { program, count, stimuli, run, get state() { return state; },
    result: () => ({ commands, finalState: stateProjection(initialState, state), publicShapeAdmitted: false }) };
}

type CommandWitness = ReturnType<typeof commandWitness>;

export async function parallelDataCommandWitnesses(): Promise<readonly CommandWitness[]> {
  const { program, start } = (await parallelCommandInputs({ condition: true, processEffectOutput: true })).find(input => input.count === 2)!;
  const witnesses: CommandWitness[] = [];
  for (const variant of ["forward", "reverse", "early", "initial-true"] as const) {
    const early = variant === "early" || variant === "initial-true";
    const witness = commandWitness(program, 2);
    witness.run({ ...start, initialVariables: start.initialVariables.map(binding => binding.name === "stop"
      ? { ...binding, value: { kind: VariableValueKind.Boolean, value: variant === "initial-true" } } : binding) });
    const reviews = [...witness.state.userTaskWaits];
    assert.equal(reviews.length, 2, "even an initially true condition waits for body completion");
    const first = reviews[0]!;
    for (const name of ["items", "item", "invoiceValidator"]) witness.run(taskCommand(first.id, `protected-${name}`,
      [{ name, value: { kind: VariableValueKind.String, value: "replace" } }]), CommandOutcome.Rejected);
    witness.run(taskCommand(first.id, "human-type", [
      { name: "reviewStatus", value: { kind: VariableValueKind.Boolean, value: true } }]), CommandOutcome.Rejected);
    witness.run(taskCommand(first.id, "condition-type", [
      { name: "stop", value: { kind: VariableValueKind.String, value: "true" } }]), CommandOutcome.Rejected);
    const order = variant === "reverse" ? [1, 0] : [0, 1];
    for (const index of order) {
      const review = reviews[index]!;
      const values: VariableBinding[] = [
        { name: "reviewStatus", value: { kind: VariableValueKind.String, value: `review-${index}` } },
        { name: "shared", value: { kind: VariableValueKind.String, value: `human-${index}` } },
        ...(index === 1 ? [{ name: "siblingNote", value: { kind: VariableValueKind.String, value: "committed-before-cancel" } } as const] : []),
        ...(early && index === 0 ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } } as const] : []),
      ];
      witness.run(taskCommand(review.id, `review-${index}`, values));
      assert.deepEqual(witness.state.variables.process.bindings.find(binding => binding.name === "shared")?.value,
        { kind: VariableValueKind.String, value: `human-${index}` }, "Process writes follow external command order");
      assert.equal(witness.state.variables.scopes.length, 2, "true condition cannot cancel an incomplete body");
    }
    const effects = reviews.map(review => {
      const wait = witness.state.effectWaits.find(wait => isDeepStrictEqual(wait.owner, review.owner));
      assert.ok(wait);
      return wait;
    });
    const selectedEffect = effects[0]!;
    witness.run(effectCommand(selectedEffect.id, "effect-type", { kind: VariableValueKind.Boolean, value: true }), CommandOutcome.Rejected);
    witness.run({ kind: StimulusKind.CompleteEffect, commandId: "effect-protected", effectId: selectedEffect.id,
      result: { kind: EffectExecutionResultKind.Success, localPatch: [
        { name: "invoiceValidator", value: { kind: VariableValueKind.String, value: "shadow" } },
        { name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] } }, CommandOutcome.Rejected);
    witness.run({ kind: StimulusKind.CompleteEffect, commandId: "effect-error", effectId: selectedEffect.id,
      result: { kind: EffectExecutionResultKind.BpmnError, code: "unsupported", message: null, localPatch: [] } }, CommandOutcome.Rejected);
    for (const index of order) {
      const value: VariableBinding["value"] = index === 0 ? { kind: VariableValueKind.Null }
        : { kind: VariableValueKind.String, value: "service-1" };
      const scopes = witness.state.variables.scopes;
      witness.run(effectCommand(effects[index]!.id, `service-${index}`, value));
      assert.deepEqual(witness.state.variables.scopes, scopes, "Process-target outputs preserve body frames");
      assert.deepEqual(witness.state.variables.process.bindings.find(binding => binding.name === "summary")?.value,
        value, "competing Service outputs follow command order");
    }
    const confirmations = reviews.map(review => {
      const wait = witness.state.userTaskWaits.find(wait => isDeepStrictEqual(wait.owner, review.owner));
      assert.equal(wait?.id.elementId, "Confirm");
      assert.ok(wait);
      return wait;
    });
    const committedProcess = witness.state.variables.process;
    const retirement = witness.run(taskCommand(confirmations[0]!.id, "retire-first"));
    const ends = retirement.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended).filter(end => end.anchor.kind === "scope");
    assert.equal(ends.filter(end => end.terminal === "completed").length, 1);
    assert.equal(ends.filter(end => end.terminal === "cancelled").length, early ? 1 : 0);
    assert.deepEqual(witness.state.variables.process, committedProcess, "retirement retains already committed sibling Process writes");
    if (early) {
      assert.deepEqual(witness.state.variables.scopes, []);
      witness.run(taskCommand(confirmations[1]!.id, "stale-cancelled-confirm", [
        { name: "shared", value: { kind: VariableValueKind.String, value: "late" } }]), CommandOutcome.Rejected);
    } else {
      assert.ok(witness.state.userTaskWaits.some(wait => isDeepStrictEqual(wait, confirmations[1])), "natural retirement preserves sibling work");
      witness.run(taskCommand(confirmations[1]!.id, "retire-second"));
    }
    const publish = witness.state.userTaskWaits[0];
    assert.equal(publish?.id.elementId, "PublishBatch");
    assert.ok(publish);
    witness.run(taskCommand(publish.id, "parent-protected-item", [
      { name: "item", value: { kind: VariableValueKind.String, value: "replace" } }]), CommandOutcome.Rejected);
    witness.run(taskCommand(publish.id, "publish"));
    completed(witness);
    assert.deepEqual(witness.state.variables.process, committedProcess);
    witnesses.push(witness);
  }
  return witnesses;
}

export async function verifyParallelDataCommandParity(): Promise<void> {
  await compareCommandWitnesses(await parallelDataCommandWitnesses());
}

export async function parallelOutputMappingCommandWitnesses(): Promise<readonly CommandWitness[]> {
  const witnesses: CommandWitness[] = [];
  for (const { shape, program, start } of await parallelOutputMappingCommandInputs()) {
    for (const nullable of [false, true]) {
      const witness = commandWitness(program, 2);
      witness.run(start);
      assert.equal(witness.state.userTaskWaits.length, 2);
      const review = witness.state.userTaskWaits[0]!;
      const sibling = witness.state.userTaskWaits[1]!;
      const siblingFrame = witness.state.variables.scopes.find(frame => isDeepStrictEqual(frame.owner, sibling.owner));
      assert.ok(siblingFrame);
      witness.run(taskCommand(review.id, "review"));
      const wait = witness.state.effectWaits[0]!;
      assert.equal(wait.id.elementId, "Validate");
      assert.deepEqual(wait.owner, review.owner);
      assert.deepEqual(wait.outputMappings.map(mapping => mapping.target), shape === "single" ? ["decision"] : ["decision", "summary"]);
      if (shape === "distinct") assert.deepEqual(wait.arguments.find(binding => binding.name === "summaryResult")?.value,
        { kind: VariableValueKind.String, value: "argument-only" });
      const resultValue: VariableBinding["value"] = nullable ? { kind: VariableValueKind.Null }
        : { kind: VariableValueKind.String, value: "accepted" };
      const summaryValue: VariableBinding["value"] = nullable ? { kind: VariableValueKind.Null }
        : { kind: VariableValueKind.String, value: "audited" };
      const patch: readonly VariableBinding[] = [
        { name: "result", value: resultValue },
        ...(shape === "distinct" ? [{ name: "summaryResult", value: summaryValue }] : []),
      ];
      const success = (commandId: string, localPatch: readonly VariableBinding[], effectId = wait.id): Stimulus => ({
        kind: StimulusKind.CompleteEffect, commandId, effectId,
        result: { kind: EffectExecutionResultKind.Success, localPatch },
      });
      for (const [label, invalid] of [
        ["missing", patch.slice(0, -1)],
        ["extra", [...patch, { name: "unexpected", value: resultValue }]],
        ["type", patch.map<VariableBinding>((binding, index) => index === 0 ? { ...binding, value: { kind: VariableValueKind.Boolean, value: true } } : binding)],
      ] as const) witness.run(success(`effect-${label}`, invalid), CommandOutcome.Rejected);
      // JsonSupport.decodeCanonicalVariableBindings rejects duplicates before execution; direct core calls still need refusal.
      const duplicate = applyStimulusWithTrace(program, witness.state, success("effect-duplicate", [...patch, patch[0]!]));
      assert.equal(duplicate.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(duplicate.result.state, witness.state);
      assert.deepEqual(duplicate.committedTransitions, []);
      assert.deepEqual(duplicate.flowNodeOccurrenceLifecycles, []);
      witness.run(success("effect-wrong-instance", patch, { ...wait.id, processInstanceId: "other" }), CommandOutcome.Rejected);
      witness.run(success("effect-wrong-activation", patch, { ...wait.id, activation: wait.id.activation + 1 }), CommandOutcome.Rejected);
      const completedEffect = witness.run(success("effect", patch));
      assert.deepEqual(witness.state.variables.scopes.find(frame => isDeepStrictEqual(frame.owner, review.owner))?.bindings
        .find(binding => binding.name === "decision")?.value, resultValue);
      assert.deepEqual(witness.state.variables.process.bindings.find(binding => binding.name === "summary")?.value,
        shape === "single" ? undefined : shape === "distinct" ? summaryValue : resultValue);
      assert.deepEqual(witness.state.variables.scopes.find(frame => isDeepStrictEqual(frame.owner, sibling.owner)), siblingFrame);
      assert.ok(witness.state.userTaskWaits.some(current => isDeepStrictEqual(current, sibling)));
      assert.deepEqual(witness.state.effectWaits, []);
      assert.deepEqual(witness.state.variables.activities, []);
      assert.deepEqual(witness.state.userTaskWaits.filter(current => isDeepStrictEqual(current.owner, review.owner))
        .map(current => current.id.elementId), ["Confirm"]);
      assert.deepEqual(completedEffect.committedTransitions[0]?.transition,
        { kind: SemanticTransitionKind.ExternalStimulus, stimulus: success("effect", patch) });
      assert.ok(completedEffect.flowNodeOccurrenceLifecycles.some(delta => delta.ended.some(end =>
        end.anchor.kind === "wait" && isDeepStrictEqual(end.anchor.id, wait.id) && end.terminal === "completed")));
      witness.run(success("effect-stale", patch), CommandOutcome.Rejected);
      witnesses.push(witness);
    }
  }
  return witnesses;
}

export async function verifyParallelOutputMappingParity(): Promise<void> {
  const witnesses = await parallelOutputMappingCommandWitnesses();
  await compareCommandWitnesses(witnesses);
  const witness = witnesses[0]!;
  const effect = witness.stimuli.find(stimulus => stimulus.commandId === "effect");
  assert.ok(effect?.kind === StimulusKind.CompleteEffect && effect.result.kind === EffectExecutionResultKind.Success);
  const duplicate: Stimulus = { ...effect, result: { ...effect.result,
    localPatch: [...effect.result.localPatch, effect.result.localPatch[0]!] } };
  await assert.rejects(compareCommandWitnesses([{ ...witness, stimuli: [...witness.stimuli.slice(0, 2), duplicate] }]),
    /variable bindings must have unique names in canonical order/);
}

function completed(witness: CommandWitness): void {
  assert.equal(witness.state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(witness.state.variables.scopes, []);
  assert.deepEqual(witness.state.variables.activities, []);
  assert.deepEqual(witness.state.parallelScopeControllers ?? [], []);
  const start = witness.stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  assert.equal(supportsSemanticProcessExecution(start, witness.program), false);
}

function comparisonRecord(value: unknown, context: string): Record<string, unknown> {
  assert.equal(typeof value === "object" && value !== null && !Array.isArray(value), true, `${context}: object shape`);
  return value as Record<string, unknown>;
}

function compareRecordKeys(actual: Record<string, unknown>, expected: Record<string, unknown>, context: string): void {
  assert.equal(isDeepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort()), true, `${context}: exact keys`);
}

function compareCommandResult(actual: unknown, witness: CommandWitness, index: number): void {
  const context = `witness=${index} count=${witness.count}`;
  const received = comparisonRecord(actual, context);
  const expected = witness.result();
  compareRecordKeys(received, expected, context);
  assert.equal(Array.isArray(received.commands), true, `${context}: commands array`);
  const commands = received.commands as unknown[];
  assert.equal(commands.length, expected.commands.length, `${context}: command count`);
  for (const [commandIndex, command] of expected.commands.entries()) {
    const commandContext = `${context} command=${commandIndex} commandId=${witness.stimuli[commandIndex]!.commandId}`;
    const actualCommand = comparisonRecord(commands[commandIndex], commandContext);
    const expectedCommand = comparisonRecord(command, commandContext);
    compareRecordKeys(actualCommand, expectedCommand, commandContext);
    for (const key of Object.keys(expectedCommand)) {
      if (key === "state") compareCommandState(actualCommand[key], expectedCommand[key], commandContext);
      else assert.equal(isDeepStrictEqual(actualCommand[key], expectedCommand[key]), true, `${commandContext} key=${key}`);
    }
  }
  for (const [key, value] of Object.entries(expected)) {
    if (key === "finalState") compareCommandState(received[key], value, `${context} finalState`);
    else if (key !== "commands") assert.equal(isDeepStrictEqual(received[key], value), true, `${context} key=${key}`);
  }
}

async function compareCommandWitnesses(witnesses: readonly CommandWitness[]): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-command-parity-"));
  try {
    const files: string[] = [];
    for (const [index, witness] of witnesses.entries()) {
      const programPath = path.join(directory, `${index}.program.json`);
      const stimuliPath = path.join(directory, `${index}.stimuli.json`);
      await writeFile(programPath, JSON.stringify(witness.program));
      await writeFile(stimuliPath, JSON.stringify(witness.stimuli));
      files.push(programPath, stimuliPath);
    }
    const execution = await runLeanDriver("BpmnSemantics/ParallelScopeReservationMain.lean", ["--commands", ...files],
      witnesses.reduce((count, witness) => count + witness.stimuli.length, 0));
    const actual = parseLeanOutputLines(execution.stdout);
    assert.equal(actual.length, witnesses.length, "exact witness count");
    witnesses.forEach((witness, index) => compareCommandResult(actual[index], witness, index));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const taskCommand = (id: OccurrenceId, commandId: string, submittedValues: readonly VariableBinding[] = []): Stimulus =>
  ({ kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: id, submittedValues });
const effectCommand = (id: OccurrenceId, commandId: string, value: VariableBinding["value"]): Stimulus =>
  ({ kind: StimulusKind.CompleteEffect, commandId, effectId: id,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value }] } });

export async function verifyParallelCommandParity(): Promise<void> {
  const witnesses: CommandWitness[] = [];
  for (const { count, program, start } of await parallelCommandInputs()) {
    const witness = commandWitness(program, count);
    witness.run(start);
    let checkedStaleTask = false, checkedStaleEffect = false;
    for (let step = 0; step < 3 * count + 1 && witness.state.control.kind !== ControlStateKind.Completed; step++) {
      const task = witness.state.userTaskWaits[0];
      const effect = witness.state.effectWaits[0];
      if (task !== undefined) {
        const stimulus = taskCommand(task.id, `task-${step}`, task.id.elementId === "Review"
          ? [{ name: "reviewStatus", value: { kind: VariableValueKind.String, value: `review-${task.owner.activation}` } }] : []);
        witness.run(stimulus);
        if (!checkedStaleTask) { witness.run({ ...stimulus, commandId: `stale-${stimulus.commandId}` }, CommandOutcome.Rejected); checkedStaleTask = true; }
      } else if (effect !== undefined) {
        const stimulus = effectCommand(effect.id, `effect-${step}`, { kind: VariableValueKind.String, value: `accepted-${effect.owner.activation}` });
        witness.run(stimulus);
        if (!checkedStaleEffect) { witness.run({ ...stimulus, commandId: `stale-${stimulus.commandId}` }, CommandOutcome.Rejected); checkedStaleEffect = true; }
      } else assert.fail(`${count}: unfinished command journey has no task or effect`);
    }
    completed(witness);
    assert.deepEqual(witness.state.variables.process.bindings, start.initialVariables);
    witnesses.push(witness);
  }
  await compareCommandWitnesses(witnesses);
}

export async function verifyParallelParentPreludeParity(): Promise<void> {
  const witnesses: CommandWitness[] = [];
  for (const { count, program, start } of (await parallelCommandInputs({ parentPrelude: true }))
    .filter(input => input.count === 0 || input.count === 2)) {
    const witness = commandWitness(program, count);
    const assertBeforeEntry = () => {
      assert.equal(witness.state.control.kind, ControlStateKind.Running);
      assert.equal(witness.state.scopeOccurrences.length, 1);
      assert.deepEqual(witness.state.activityOccurrences, []);
      assert.deepEqual(witness.state.parallelScopeControllers ?? [], []);
    };
    witness.run(start);
    assertBeforeEntry();
    const approval = witness.state.userTaskWaits[0]!;
    assert.equal(approval.id.elementId, "ApproveBatch");
    const approve = taskCommand(approval.id, "approve-batch");
    witness.run(approve);
    assertBeforeEntry();
    witness.run({ ...approve, commandId: "stale-approval" }, CommandOutcome.Rejected);
    const validation = witness.state.effectWaits[0]!;
    assert.equal(validation.id.elementId, "ValidateBatch");
    witness.run({ kind: StimulusKind.CompleteEffect, commandId: "missing-validation-result",
      effectId: validation.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [] } }, CommandOutcome.Rejected);
    assertBeforeEntry();
    const validate = effectCommand(validation.id, "validate-batch", { kind: VariableValueKind.String, value: "accepted" });
    witness.run(validate);
    witness.run({ ...validate, commandId: "stale-validation" }, CommandOutcome.Rejected);
    assert.equal(witness.state.scopeOccurrences.length, count + 1);
    assert.equal(witness.state.userTaskWaits.length, count === 0 ? 1 : count);
    assert.deepEqual(witness.state.variables.process.bindings.find(binding => binding.name === "batchValidation"),
      { name: "batchValidation", value: { kind: VariableValueKind.String, value: "accepted" } });
    for (let step = 0; step < 3 * count + 1 && witness.state.control.kind !== ControlStateKind.Completed; step++) {
      const task = witness.state.userTaskWaits[0], effect = witness.state.effectWaits[0];
      if (task !== undefined) witness.run(taskCommand(task.id, `body-task-${step}`, task.id.elementId === "Review"
        ? [{ name: "reviewStatus", value: { kind: VariableValueKind.String, value: "reviewed" } }] : []));
      else if (effect !== undefined) witness.run(effectCommand(effect.id, `body-effect-${step}`,
        { kind: VariableValueKind.String, value: "validated" }));
      else assert.fail(`${count}: unfinished parent-prelude journey has no task or effect`);
    }
    completed(witness);
    witnesses.push(witness);
  }
  assert.equal(witnesses.length, 2);
  await compareCommandWitnesses(witnesses);
}

export async function verifyParallelEarlyCompletionParity(): Promise<void> {
  const witnesses: CommandWitness[] = [];
  for (const { count, program, start } of (await parallelCommandInputs({ condition: true })).filter(input => input.count > 0)) {
    for (const pendingEffect of count === 1 ? [false] : [false, true]) {
      const witness = commandWitness(program, count);
      witness.run(start);
      const selected = witness.state.userTaskWaits[0]!;
      const sibling = witness.state.userTaskWaits[1];
      let cancelledEffect: OccurrenceId | undefined;
      if (pendingEffect) {
        witness.run(taskCommand(sibling!.id, "arm-sibling-effect"));
        cancelledEffect = witness.state.effectWaits[0]!.id;
      }
      witness.run(taskCommand(selected.id, "request-stop", [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }]));
      assert.equal(witness.state.variables.scopes.length, count, "condition cannot retire an incomplete body");
      const selectedEffect = witness.state.effectWaits.find(wait => isDeepStrictEqual(wait.owner, selected.owner));
      assert.ok(selectedEffect);
      witness.run(effectCommand(selectedEffect.id, "validate-selected", { kind: VariableValueKind.Null }));
      const confirmation = witness.state.userTaskWaits.find(wait => isDeepStrictEqual(wait.owner, selected.owner));
      assert.ok(confirmation);
      const retired = witness.run(taskCommand(confirmation.id, "finish-selected"));
      const scopeEnds = retired.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended).filter(end => end.anchor.kind === "scope");
      assert.equal(scopeEnds.filter(end => end.terminal === "completed").length, 1);
      assert.equal(scopeEnds.filter(end => end.terminal === "cancelled").length, count - 1);
      assert.deepEqual(witness.state.variables.scopes, []);
      assert.deepEqual(witness.state.effectWaits, []);
      if (sibling !== undefined && !pendingEffect) witness.run(taskCommand(sibling.id, "stale-cancelled-task"), CommandOutcome.Rejected);
      if (cancelledEffect !== undefined) witness.run(effectCommand(cancelledEffect, "stale-cancelled-effect", { kind: VariableValueKind.String, value: "late" }), CommandOutcome.Rejected);
      const publish = witness.state.userTaskWaits[0]!;
      assert.equal(publish.id.elementId, "PublishBatch");
      witness.run(taskCommand(publish.id, "publish"));
      completed(witness);
      assert.deepEqual(witness.state.variables.process.bindings, start.initialVariables.map(binding => binding.name === "stop"
        ? { ...binding, value: { kind: VariableValueKind.Boolean, value: true } } : binding));
      witnesses.push(witness);
    }
  }
  await compareCommandWitnesses(witnesses);
}

export async function verifyParallelRootEffectParity(): Promise<void> {
  const witnesses: CommandWitness[] = [];
  for (const { count, program, start } of (await parallelCommandInputs({ parentEffect: true })).filter(input => input.count === 0)) {
    const witness = commandWitness(program, count);
    witness.run(start);
    const wait = witness.state.effectWaits[0]!;
    assert.equal(wait.id.elementId, "PublishBatch");
    witness.run(effectCommand(wait.id, "publish-null", { kind: VariableValueKind.Null }));
    witness.run(effectCommand(wait.id, "stale-publish", { kind: VariableValueKind.Null }), CommandOutcome.Rejected);
    completed(witness);
    assert.deepEqual(witness.state.variables.process.bindings, [...start.initialVariables, { name: "summary", value: { kind: VariableValueKind.Null } }]);
    witnesses.push(witness);
  }
  await compareCommandWitnesses(witnesses);
}

export async function verifyParallelInnerBodyCommandParity(): Promise<void> {
  const witnesses: CommandWitness[] = [];
  for (const bodyShape of ["joined", "separate-ends"] as const) for (const early of [false, true]) {
    const { program, start } = (await parallelCommandInputs({ bodyShape, condition: early })).find(input => input.count === 2)!;
    const witness = commandWitness(program, 2);
    witness.run(start);
    const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    const owners = witness.state.scopeOccurrences.filter(scope => scope.id.definitionScopeId === entry.childScopeId).map(scope => scope.id);
    assert.equal(owners.length, 2);
    const branches = bodyShape === "joined" ? ["Branch0", "Branch1", "Branch2"] : ["Branch0", "Branch1"];
    const terminals: string[] = [];
    for (const element of [...branches, "Validate", "Confirm"]) for (const selectedOwner of owners) {
      if (early && !witness.state.scopeOccurrences.some(scope => isDeepStrictEqual(scope.id, selectedOwner))) continue;
      const commandId = `${bodyShape}-${early ? "early" : "natural"}-${element}-body${selectedOwner.activation}`;
      let stimulus: Stimulus;
      if (element === "Validate") {
        const wait = witness.state.effectWaits.find(wait => wait.id.elementId === element && isDeepStrictEqual(wait.owner, selectedOwner));
        assert.ok(wait, `${commandId}: enabled effect`);
        stimulus = effectCommand(wait.id, commandId, { kind: VariableValueKind.String, value: "accepted" });
      } else {
        const wait = witness.state.userTaskWaits.find(wait => wait.id.elementId === element && isDeepStrictEqual(wait.owner, selectedOwner));
        assert.ok(wait, `${commandId}: enabled human task`);
        stimulus = taskCommand(wait.id, commandId, early
          ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : []);
      }
      const traced = witness.run(stimulus);
      const scopeEnds: readonly UnnumberedFlowNodeOccurrenceEnd[] = traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended).filter(end =>
        end.anchor.kind === "scope" && end.anchor.id.definitionScopeId === entry.childScopeId);
      terminals.push(...scopeEnds.map(end => end.terminal));
      if (bodyShape === "separate-ends" && element.startsWith("Branch")) {
        assert.equal(scopeEnds.length, 0, `${commandId}: inner End cannot retire a body with its Service branch pending`);
        assert.equal(witness.state.variables.scopes.length, 2, `${commandId}: both body frames survive inner End`);
      }
    }
    assert.equal(terminals.length, 2);
    assert.equal(terminals.filter(terminal => terminal === "completed").length, early ? 1 : 2);
    assert.equal(terminals.filter(terminal => terminal === "cancelled").length, early ? 1 : 0);
    const publish = witness.state.userTaskWaits[0];
    assert.equal(publish?.id.elementId, "PublishBatch");
    assert.ok(publish);
    witness.run(taskCommand(publish.id, "publish"));
    completed(witness);
    witnesses.push(witness);
  }
  assert.equal(witnesses.length, 4);
  await compareCommandWitnesses(witnesses);
}

function capacitySyntaxError(program: unknown, bindings: readonly VariableBinding[]): RegExp | undefined {
  // These are the explicit wire mutations in parallelProgramCapacityCases; semantic refusal is compared separately.
  if (program === null || typeof program !== "object" || Array.isArray(program)) return /object expected/;
  const value = program as Record<string, unknown>;
  if (Object.keys(value).length === 0 || Object.hasOwn(value, "budget") ||
      (Array.isArray(value.operations) && value.operations.some(operation => Object.hasOwn(operation, "extra"))))
    return /object fields do not match/;
  if (Array.isArray(value.interruptingMessageEventSubProcesses)) {
    for (const handler of value.interruptingMessageEventSubProcesses) {
      if (!Object.hasOwn(handler, "childEntry")) return /object fields do not match/;
      if (handler.channel.kind === "directMessage") return /operation-addressed Message channel expected/;
    }
  }
  if (bindings.some((binding, index) => index > 0 && bindings[index - 1]!.name >= binding.name))
    return /variable bindings must have unique names in canonical order/;
  return undefined;
}

type ProgramCapacityGroup = "ordinary" | "maximum-parent" | "maximum-body";
type ProgramCapacityCase = Awaited<ReturnType<typeof parallelProgramCapacityCases>>[number];

function programCapacityGroup({ program, expected }: ProgramCapacityCase): ProgramCapacityGroup {
  if (expected === null) return "ordinary";
  const admitted = program as SemanticProcessProgram;
  if (admitted.operations.length !== 1024) return "ordinary";
  const root = admitted.definitionScopes.find(scope => scope.parentScopeId === null);
  assert.ok(root);
  const parentCount = admitted.operationScopes.filter(owner => owner.scopeId === root.id).length;
  assert.notEqual(parentCount, admitted.operations.length / 2, "maximum-operation fixture has one larger region");
  return parentCount > admitted.operations.length / 2 ? "maximum-parent" : "maximum-body";
}

export async function verifyParallelProgramCapacityParity(group: ProgramCapacityGroup = "ordinary"): Promise<void> {
  const cases = (await parallelProgramCapacityCases()).map((entry, index) => ({ entry, index, group: programCapacityGroup(entry) }));
  const maximum = cases.filter(entry => entry.group !== "ordinary");
  assert.equal(maximum.length, 2, "fixture retains both accepted 1024-operation boundaries");
  for (const selected of ["maximum-parent", "maximum-body"])
    assert.equal(maximum.filter(entry => entry.group === selected).length, 1, `exact ${selected} boundary`);
  const selectedCases = cases.filter(entry => entry.group === group);

  const { parallelScopeProgramStartCapacity } = await import(new URL("../../semantic-core/dist/parallel-scope-program-capacity.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/parallel-scope-program-capacity.ts");
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-program-capacity-"));
  try {
    const files: string[] = [];
    const expected: unknown[] = [];
    for (const { index, entry: { program, bindings, expected: capacity } } of selectedCases) {
      assert.deepEqual(parallelScopeProgramStartCapacity(program, bindings) ?? null, capacity, `Program capacity case ${index}`);
      const programPath = path.join(directory, `${index}.program.json`);
      const startPath = path.join(directory, `${index}.start.json`);
      const processId = typeof program === "object" && program !== null && "processId" in program ? program.processId : "invalid";
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify({ kind: StimulusKind.StartProcess, commandId: "start", processId,
        instanceId: "batch", initialVariables: bindings }));
      const syntaxError = capacitySyntaxError(program, bindings);
      if (syntaxError !== undefined) assert.equal(capacity, null);
      files.push(programPath, startPath);
      expected.push(syntaxError ?? capacity);
    }
    const execution = await runLeanDriver("BpmnSemantics/ParallelScopeReservationMain.lean", ["--program-capacity", ...files], expected.length);
    const actual = parseLeanOutputLines<Readonly<{ syntaxError?: unknown }>>(execution.stdout);
    assert.equal(actual.length, expected.length);
    for (const [offset, result] of actual.entries()) {
      const index = selectedCases[offset]!.index;
      const wanted = expected[offset];
      if (wanted instanceof RegExp) {
        assert.deepEqual(Object.keys(result), ["syntaxError"], `Program syntax case ${index}`);
        assert.match(String(result.syntaxError), wanted, `Program syntax case ${index}`);
      } else assert.deepEqual(result, wanted, `Program capacity case ${index}`);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
