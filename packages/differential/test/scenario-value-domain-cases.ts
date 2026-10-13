import assert from "node:assert/strict";
import { CallDataKind, EffectExecutionResultKind, MessageChannelKind, SemanticOperationKind, SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { Scenario, Stimulus, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import { pipelineCases } from "./pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import type { PipelineContext } from "./pipeline-types.ts";
import { loadMessageKeyCorrelationPopulationCases } from "./message-key-correlation-population-cases.ts";

type DomainContext = Pick<PipelineContext, "scenario" | "checkedProcess" | "semanticProcess">;
export type DomainCase = Readonly<{ context: DomainContext; scenario: Scenario; supported: boolean }>;
const stringNull = [VariableValueKind.String, VariableValueKind.Null];
const booleanCompletion = [...stringNull, VariableValueKind.Boolean];
// SingletonBusinessItem at kind level; the 1,024-byte root String bound is exercised by explicit cases below.
const singletonBusinessItem = [...booleanCompletion, VariableValueKind.Integer, VariableValueKind.Decimal, VariableValueKind.Map];
const userDomains = new Map<string, readonly VariableValueKind[]>([
  ...[SemanticProfileId.UserTask, SemanticProfileId.UserTaskProcessDataPreservedNotation, SemanticProfileId.UserTaskCycle,
    SemanticProfileId.ActivityDataOutputUserTask, SemanticProfileId.ActivityDataInputOutputUserTask,
    SemanticProfileId.CallActivityDataBoundaries, SemanticProfileId.SerialBusinessTaskComposition,
    SemanticProfileId.MixedTaskControlFlow, SemanticProfileId.MixedTaskBusinessError,
    SemanticProfileId.StructuredProcessComposition].map(profile => [profile, stringNull] as const),
  ...[SemanticProfileId.UserTaskBooleanCompletionData, SemanticProfileId.UserTaskAssignmentFormMetadata,
    SemanticProfileId.ParallelUserTaskAssignmentFormMetadata].map(profile => [profile, booleanCompletion] as const),
  ...[SemanticProfileId.SequentialMultiInstanceUserTask, SemanticProfileId.ParallelMultiInstanceUserTask]
    .map(profile => [profile, [VariableValueKind.String]] as const),
  // Explicit rather than `Object.values`, so a newly recognized arm is never expected here until the profile selects it.
  [SemanticProfileId.StructuredHumanWork, [...booleanCompletion, VariableValueKind.Integer, VariableValueKind.StringList]],
  [SemanticProfileId.PortableBusinessValuesHandoff, singletonBusinessItem],
]);
const effectDomains = new Map<string, readonly VariableValueKind[]>([
  [SemanticProfileId.MappedSuccessServiceTask, [VariableValueKind.String]],
  ...[SemanticProfileId.MappedBoundaryErrorServiceTask, SemanticProfileId.SerialBusinessTaskComposition,
    SemanticProfileId.MixedTaskControlFlow, SemanticProfileId.MixedTaskBusinessError].map(profile => [profile, stringNull] as const),
]);
export const values: readonly VariableValue[] = [
  { kind: VariableValueKind.String, value: "candidate" }, { kind: VariableValueKind.Null },
  { kind: VariableValueKind.Boolean, value: true }, { kind: VariableValueKind.Integer, value: 7 },
  { kind: VariableValueKind.StringList, value: ["candidate"] },
  // Portable arms recognized by both readers; no current profile selects them (PBV-INGRESS-01).
  { kind: VariableValueKind.Decimal, coefficient: "-125", scale: 2 },
  { kind: VariableValueKind.List, value: [{ kind: VariableValueKind.Integer, value: 1 }, { kind: VariableValueKind.Integer, value: 1 }] },
  { kind: VariableValueKind.Map, value: [
    { name: "address", value: { kind: VariableValueKind.Map, value: [{ name: "line2", value: { kind: VariableValueKind.Null } }] } },
    { name: "total", value: { kind: VariableValueKind.Decimal, coefficient: "12345", scale: 2 } }] },
];
const payloadDomain = [...booleanCompletion, VariableValueKind.Integer];

export function changedScenario(context: DomainContext, suffix: string, stimuli: readonly Stimulus[]): Scenario {
  return { ...context.scenario, id: `${context.scenario.id}-${suffix}`, stimuli };
}

/** Retained answer-free schedules provide valid starts; expectations follow each profile's reviewed external domain. */
export async function domainCases(): Promise<readonly DomainCase[]> {
  const contexts = await loadAndCompileCases(pipelineCases);
  const selected = new Map<string, DomainContext>();
  for (const context of contexts) if (!selected.has(context.scenario.profile)) selected.set(context.scenario.profile, context);
  const population = (await loadMessageKeyCorrelationPopulationCases()).find(input => input.scenario.id === "message-key-correlation-unique")!;
  const definition = population.definitions[0]!;
  const source = population.scenario.definitions[0]!;
  const payloadContext = selected.get(SemanticProfileId.MessagePayloadCatch)!;
  const correlated: DomainContext = { ...definition, scenario: { ...payloadContext.scenario, id: "correlated-scenario-domain",
    profile: population.scenario.profile, bpmn: { id: source.id, sha256: source.sha256, sourceOverlay: source.sourceOverlay,
      relativePath: source.relativePath }, stimuli: population.scenario.instances[0]!.stimuli } };
  selected.set(population.scenario.profile, correlated);
  const cases: DomainCase[] = [];
  for (const context of selected.values()) {
    cases.push({ context, scenario: context.scenario, supported: true });
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess || start.kind === StimulusKind.TriggerMessageStart ||
      start.kind === StimulusKind.TriggerTimerStart);
    const differentProcessId = `${start.processId}_Other`;
    cases.push({ context, scenario: changedScenario(context, "wrong-start-process",
      [{ ...start, processId: differentProcessId }, ...context.scenario.stimuli.slice(1)]), supported: false });
    const occurrence = { processInstanceId: start.instanceId, elementId: "Unavailable", activation: 1 };
    for (const surface of ["human", EffectExecutionResultKind.Success, EffectExecutionResultKind.BpmnError] as const) {
      const admitted = (surface === "human" ? userDomains : effectDomains).get(context.scenario.profile) ?? [];
      for (const value of values) {
        const bindings: VariableBinding[] = [...(admitted.length === 0 ? [] : [{ name: "candidate", value: values.find(v => v.kind === admitted[0])! }]),
          { name: "zzLater", value }];
        const stimulus: Stimulus = surface === "human"
          ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-${surface}-${value.kind}`, taskId: occurrence, submittedValues: bindings }
          : { kind: StimulusKind.CompleteEffect, commandId: `late-${surface}-${value.kind}`, effectId: occurrence,
            result: surface === EffectExecutionResultKind.Success ? { kind: surface, localPatch: bindings }
              : { kind: surface, code: "BUSINESS", message: null, localPatch: bindings } };
        cases.push({ context, scenario: changedScenario(context, `${surface}-${value.kind}`, [...context.scenario.stimuli, stimulus]),
          supported: admitted.includes(value.kind) });
      }
    }
  }
  const add = (context: DomainContext, suffix: string, stimuli: readonly Stimulus[], supported: boolean) =>
    cases.push({ context, scenario: changedScenario(context, suffix, stimuli), supported });
  for (const profile of [SemanticProfileId.CallActivityDataBoundaries, SemanticProfileId.Compensation]) {
    const context = selected.get(profile)!;
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess);
    const startCase = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
      add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
    const undeclared: VariableBinding = { name: "zzUndeclared", value: values[0]! };
    startCase("invalid-start-data-missing", [], false);
    startCase("invalid-start-data-undeclared", [undeclared], false);
    startCase("invalid-start-data-extra", [...start.initialVariables, undeclared], false);
    if (profile === SemanticProfileId.CallActivityDataBoundaries) {
      const invoke = context.semanticProcess.operations.find(operation => operation.kind === SemanticOperationKind.InvokeProcess);
      assert.ok(invoke?.kind === SemanticOperationKind.InvokeProcess && invoke.data.kind === CallDataKind.Scalar &&
        invoke.data.directInput.source.kind === "property");
      const request = invoke.data.directInput.source.propertyId;
      const optional = start.initialVariables.filter(binding => binding.name !== request);
      assert.ok(optional.length > 0);
      startCase("invalid-start-data-required-input-missing", optional, false);
      startCase("valid-start-data-required-only", [{ name: request, value: values[0]! }], true);
      startCase("valid-start-data-null-request", [{ name: request, value: { kind: VariableValueKind.Null } }], true);
    } else {
      const snapshots = context.semanticProcess.compensationEventSubProcessSnapshots;
      assert.ok(snapshots !== undefined && start.initialVariables.length === 1);
      const binding = start.initialVariables[0]!;
      startCase("invalid-start-data-capacity-overflow", [{ ...binding,
        value: { kind: VariableValueKind.String, value: "x".repeat(snapshots.limits.maxCanonicalBytes + 1) } }], false);
    }
  }
  addPortableHandoffCases(selected.get(SemanticProfileId.PortableBusinessValuesHandoff)!, add);
  const startDomains = new Map<string, readonly VariableValueKind[]>([
    [SemanticProfileId.UserTask, stringNull], [SemanticProfileId.UserTaskBooleanCompletionData, stringNull],
    [SemanticProfileId.EmbeddedSubProcessCompletion, []],
    [SemanticProfileId.SequentialMultiInstanceUserTask, [VariableValueKind.StringList]],
    [SemanticProfileId.ParallelMultiInstanceUserTask, [VariableValueKind.String, VariableValueKind.StringList]],
  ]);
  for (const [profile, admitted] of startDomains) {
    const context = selected.get(profile)!;
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess);
    for (const value of values) add(context, `start-${value.kind}`, [{ ...start,
      initialVariables: [...start.initialVariables, { name: "zzLater", value }] }], admitted.includes(value.kind));
  }
  for (const profile of [SemanticProfileId.EmbeddedSubProcessCompletion, SemanticProfileId.MessagePayloadCatch,
    SemanticProfileId.MessageKeyCorrelation, SemanticProfileId.ServiceTaskIncident, SemanticProfileId.ServiceTaskIncidentCancellation]) {
    const context = selected.get(profile)!;
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess);
    const occurrence = { processInstanceId: start.instanceId, elementId: "Unavailable", activation: 1 };
    const channel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" } as const;
    for (const value of values) {
      const payload: Stimulus = { kind: StimulusKind.DeliverPayloadMessage, commandId: `late-payload-${value.kind}`,
        subscriptionId: occurrence, channel, payload: value };
      add(context, `payload-${value.kind}`, [...context.scenario.stimuli, payload],
        (profile === SemanticProfileId.MessagePayloadCatch || profile === SemanticProfileId.MessageKeyCorrelation) && payloadDomain.includes(value.kind));
      if (value.kind !== VariableValueKind.String) continue;
      const delivery: Stimulus = { kind: StimulusKind.DeliverCorrelatedPayloadMessage, commandId: `late-correlated-${value.kind}`,
        subscriptionId: occurrence, address: { definition: context.semanticProcess.identity, processId: context.semanticProcess.processId,
          channel, correlationKeyId: "Key" }, ingressOrdinal: 1, correlationPropertyId: "Correlation", processPropertyId: "Property", payload: value };
      add(context, `correlated-${value.kind}`, [...context.scenario.stimuli, delivery],
        profile === SemanticProfileId.MessageKeyCorrelation && value.kind === VariableValueKind.String);
    }
    for (const stimulus of [
      { kind: StimulusKind.ReportEffectFailure, commandId: "late-failure", effectId: occurrence, generation: 1 },
      { kind: StimulusKind.RetryIncident, commandId: "late-retry", incidentId: { effectId: occurrence, generation: 1 } },
      { kind: StimulusKind.CancelIncidentProcess, commandId: "late-cancel", processInstanceId: start.instanceId,
        incidentId: { effectId: occurrence, generation: 1 } },
    ] as const satisfies readonly Stimulus[]) add(context, stimulus.kind, [...context.scenario.stimuli, stimulus],
      stimulus.kind === StimulusKind.CancelIncidentProcess ? profile === SemanticProfileId.ServiceTaskIncidentCancellation
        : profile === SemanticProfileId.ServiceTaskIncident || profile === SemanticProfileId.ServiceTaskIncidentCancellation);
  }
  const mapped = selected.get(SemanticProfileId.MappedSuccessServiceTask)!;
  const effectIndex = mapped.scenario.stimuli.findIndex(stimulus => stimulus.kind === StimulusKind.CompleteEffect);
  const effect = mapped.scenario.stimuli[effectIndex]!;
  assert.ok(effect.kind === StimulusKind.CompleteEffect && effect.result.kind === EffectExecutionResultKind.Success);
  for (const [label, localPatch] of [["missing", []], ["extra", [...effect.result.localPatch, { name: "zzExtra", value: values[0]! }]],
    ["wrong-name", [{ name: "wrong", value: values[0]! }]]] as const) {
    const negative = { ...effect, commandId: `refuse-${label}`, result: { ...effect.result, localPatch } };
    add(mapped, label, [...mapped.scenario.stimuli.slice(0, effectIndex), negative, ...mapped.scenario.stimuli.slice(effectIndex)], true);
  }
  const embedded = selected.get(SemanticProfileId.EmbeddedSubProcessCompletion)!;
  const start = embedded.scenario.stimuli[0]!;
  const human = embedded.scenario.stimuli.find(stimulus => stimulus.kind === StimulusKind.CompleteUserTaskInstance)!;
  add(embedded, "empty-sequence", [], false);
  add(embedded, "late-start", [...embedded.scenario.stimuli, { ...start, commandId: "second-start" }], false);
  add(embedded, "non-start-first", [human], false);
  assert.ok(start.kind === StimulusKind.StartProcess);
  for (const [label, patch] of [
    ["profile", { profile: SemanticProfileId.UserTask }],
    ["source-id", { bpmn: { ...embedded.scenario.bpmn, id: "other" } }],
    ["source-hash", { bpmn: { ...embedded.scenario.bpmn, sha256: "0".repeat(64) } }],
    ["source-overlay", { bpmn: { ...embedded.scenario.bpmn, sourceOverlay: { id: "other", sha256: "0".repeat(64) } } }],
    ["observations", { observations: embedded.scenario.observations.slice(1) }],
  ] as const) cases.push({ context: embedded, scenario: { ...changedScenario(embedded, label, embedded.scenario.stimuli), ...patch }, supported: false });
  return cases;
}

type AddCase = (context: DomainContext, suffix: string, stimuli: readonly Stimulus[], supported: boolean) => void;

/**
 * The serial portable handoff selects Process Start and User Task completion only, with exactly one P_in binding and a
 * 1,024-byte root String bound. Each case changes one fact of the retained answer-free Start, so only that fact can move
 * the expectation.
 */
function addPortableHandoffCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess && start.initialVariables.length === 1);
  const pin = start.initialVariables[0]!.name;
  const rest = context.scenario.stimuli.slice(1);
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...rest], supported);
  const string = (bytes: number): VariableValue => ({ kind: VariableValueKind.String, value: "a".repeat(bytes) });
  for (const value of values) startWith(`start-${value.kind}`, [{ name: pin, value }], singletonBusinessItem.includes(value.kind));
  startWith("start-string-exact-bound", [{ name: pin, value: string(1024) }], true);
  startWith("start-string-over-bound", [{ name: pin, value: string(1025) }], false);
  startWith("invalid-start-data-missing", [], false);
  startWith("invalid-start-data-undeclared", [{ name: "zzUndeclared", value: values[0]! }], false);
  startWith("invalid-start-data-extra", [...start.initialVariables, { name: "zzUndeclared", value: values[0]! }], false);
  const occurrence = { processInstanceId: start.instanceId, elementId: "Unavailable", activation: 1 };
  for (const [label, value, supported] of [["exact-bound", string(1024), true], ["over-bound", string(1025), false]] as const) {
    const stimulus: Stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-human-${label}`,
      taskId: occurrence, submittedValues: [{ name: "candidate", value: values[0]! }, { name: "zzLater", value }] };
    add(context, `human-string-${label}`, [...context.scenario.stimuli, stimulus], supported);
  }
}
