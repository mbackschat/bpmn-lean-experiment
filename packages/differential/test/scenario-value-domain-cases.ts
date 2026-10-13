import assert from "node:assert/strict";
import { CallDataKind, EffectExecutionResultKind, MessageChannelKind, SemanticOperationKind, SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { Scenario, StartProcessStimulus, Stimulus, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import { pipelineCases } from "./pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import type { PipelineContext } from "./pipeline-types.ts";
import { loadMessageKeyCorrelationPopulationCases } from "./message-key-correlation-population-cases.ts";
import { assertProfilesEnrolled, correlatedPayloadProfile, expectedDomainsOf, incidentCommandProfiles, singletonBusinessItem } from "./scenario-value-domain-expectations.ts";
import type { ProfileValueDomains } from "./scenario-value-domain-expectations.ts";

type DomainContext = Pick<PipelineContext, "scenario" | "checkedProcess" | "semanticProcess">;
export type DomainCase = Readonly<{ context: DomainContext; scenario: Scenario; supported: boolean }>;
type AddCase = (context: DomainContext, suffix: string, stimuli: readonly Stimulus[], supported: boolean) => void;

export const values: readonly VariableValue[] = [
  { kind: VariableValueKind.String, value: "candidate" }, { kind: VariableValueKind.Null },
  { kind: VariableValueKind.Boolean, value: true }, { kind: VariableValueKind.Integer, value: 7 },
  { kind: VariableValueKind.StringList, value: ["candidate"] },
  // Portable arms recognized by both readers; only the portable handoff selects them (PBV-INGRESS-01).
  { kind: VariableValueKind.Decimal, coefficient: "-125", scale: 2 },
  { kind: VariableValueKind.List, value: [{ kind: VariableValueKind.Integer, value: 1 }, { kind: VariableValueKind.Integer, value: 1 }] },
  { kind: VariableValueKind.Map, value: [
    { name: "address", value: { kind: VariableValueKind.Map, value: [{ name: "line2", value: { kind: VariableValueKind.Null } }] } },
    { name: "total", value: { kind: VariableValueKind.Decimal, coefficient: "12345", scale: 2 } }] },
];

/**
 * Scenario Starts that must carry their declared bindings (Call request, Compensation restored binding, business-task
 * required inputs), so a kind probe replaces one declared value instead of appending an unrelated binding. Every other
 * profile accepts an unrelated canonical Start binding, which keeps the probe on the value kind alone.
 */
const declaredStartData: ReadonlySet<string> = new Set([SemanticProfileId.CallActivityDataBoundaries, SemanticProfileId.Compensation,
  SemanticProfileId.SerialBusinessTaskComposition, SemanticProfileId.MixedTaskControlFlow, SemanticProfileId.MixedTaskBusinessError]);

export function changedScenario(context: DomainContext, suffix: string, stimuli: readonly Stimulus[]): Scenario {
  return { ...context.scenario, id: `${context.scenario.id}-${suffix}`, stimuli };
}

/** One retained answer-free schedule per registered profile, plus the correlated population schedule for Message key correlation. */
export async function selectedProfileContexts(): Promise<ReadonlyMap<string, DomainContext>> {
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
  return selected;
}

/** A well-formed occurrence of no live wait, so a late command can only differ from a valid one by its value. */
function occurrenceOf(start: Stimulus) {
  assert.ok("instanceId" in start);
  return { processInstanceId: start.instanceId, elementId: "Unavailable", activation: 1 };
}

/** Retained answer-free schedules provide valid starts; expectations follow each profile's reviewed external domain. */
export async function domainCases(): Promise<readonly DomainCase[]> {
  const selected = await selectedProfileContexts();
  assertProfilesEnrolled(selected.keys());
  const cases: DomainCase[] = [];
  const add: AddCase = (context, suffix, stimuli, supported) =>
    cases.push({ context, scenario: changedScenario(context, suffix, stimuli), supported });
  for (const context of selected.values()) {
    const profile = context.scenario.profile;
    const domains = expectedDomainsOf(profile);
    cases.push({ context, scenario: context.scenario, supported: true });
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess || start.kind === StimulusKind.TriggerMessageStart ||
      start.kind === StimulusKind.TriggerTimerStart);
    const differentProcessId = `${start.processId}_Other`;
    cases.push({ context, scenario: changedScenario(context, "wrong-start-process",
      [{ ...start, processId: differentProcessId }, ...context.scenario.stimuli.slice(1)]), supported: false });
    addLateValueCases(context, start, domains, add);
    // Message and Timer Starts carry no bindings, so they have no Start value surface.
    if (start.kind === StimulusKind.StartProcess && profile !== SemanticProfileId.PortableBusinessValuesHandoff) {
      addStartKindCases(context, start, domains.start, add);
    }
    addPayloadCases(context, start, domains.payload, add);
    addIncidentCommandCases(context, start, add);
  }
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
      const request = callRequestProperty(context);
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

function callRequestProperty(context: DomainContext): string {
  const invoke = context.semanticProcess.operations.find(operation => operation.kind === SemanticOperationKind.InvokeProcess);
  assert.ok(invoke?.kind === SemanticOperationKind.InvokeProcess && invoke.data.kind === CallDataKind.Scalar &&
    invoke.data.directInput.source.kind === "property");
  return invoke.data.directInput.source.propertyId;
}

/** Human completion and both effect result arms receive the same profile-selected kind check. */
function addLateValueCases(context: DomainContext, start: Stimulus, domains: ProfileValueDomains, add: AddCase): void {
  const occurrence = occurrenceOf(start);
  for (const surface of ["human", EffectExecutionResultKind.Success, EffectExecutionResultKind.BpmnError] as const) {
    const admitted = surface === "human" ? domains.human : domains.effect;
    for (const value of values) {
      const bindings: VariableBinding[] = [...(admitted.length === 0 ? [] : [{ name: "candidate", value: values.find(v => v.kind === admitted[0])! }]),
        { name: "zzLater", value }];
      const stimulus: Stimulus = surface === "human"
        ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-${surface}-${value.kind}`, taskId: occurrence, submittedValues: bindings }
        : { kind: StimulusKind.CompleteEffect, commandId: `late-${surface}-${value.kind}`, effectId: occurrence,
          result: surface === EffectExecutionResultKind.Success ? { kind: surface, localPatch: bindings }
            : { kind: surface, code: "BUSINESS", message: null, localPatch: bindings } };
      add(context, `${surface}-${value.kind}`, [...context.scenario.stimuli, stimulus], admitted.includes(value.kind));
    }
  }
}

/**
 * Probes each value kind at the Start surface. A declared-data profile gets one declared binding replaced; every other
 * profile gets an unrelated binding appended, which keeps the probe on the value kind alone.
 */
function addStartKindCases(context: DomainContext, start: StartProcessStimulus, admitted: readonly VariableValueKind[], add: AddCase): void {
  const declared = declaredStartBinding(context, start);
  for (const value of values) {
    const initialVariables = declared === undefined ? [...start.initialVariables, { name: "zzLater", value }]
      : start.initialVariables.map(binding => binding.name === declared ? { ...binding, value } : binding);
    add(context, `start-${value.kind}`, [{ ...start, initialVariables }], admitted.includes(value.kind));
  }
}

function declaredStartBinding(context: DomainContext, start: StartProcessStimulus): string | undefined {
  const profile = context.scenario.profile;
  if (!declaredStartData.has(profile)) return undefined;
  if (profile === SemanticProfileId.CallActivityDataBoundaries) return callRequestProperty(context);
  const first = start.initialVariables[0];
  assert.ok(first !== undefined, `${profile} retains a declared Start binding to replace`);
  return first.name;
}

/** Direct payload delivery checks the profile's payload kinds; correlated delivery is wire-restricted to String. */
function addPayloadCases(context: DomainContext, start: Stimulus, admitted: readonly VariableValueKind[], add: AddCase): void {
  const occurrence = occurrenceOf(start);
  const channel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" } as const;
  for (const value of values) {
    const payload: Stimulus = { kind: StimulusKind.DeliverPayloadMessage, commandId: `late-payload-${value.kind}`,
      subscriptionId: occurrence, channel, payload: value };
    add(context, `payload-${value.kind}`, [...context.scenario.stimuli, payload], admitted.includes(value.kind));
    // Strict wire decoding rejects a non-String correlated payload before support (see the strict-wire test), so no support case exists for it.
    if (value.kind !== VariableValueKind.String) continue;
    const delivery: Stimulus = { kind: StimulusKind.DeliverCorrelatedPayloadMessage, commandId: `late-correlated-${value.kind}`,
      subscriptionId: occurrence, address: { definition: context.semanticProcess.identity, processId: context.semanticProcess.processId,
        channel, correlationKeyId: "Key" }, ingressOrdinal: 1, correlationPropertyId: "Correlation", processPropertyId: "Property", payload: value };
    add(context, `correlated-${value.kind}`, [...context.scenario.stimuli, delivery], context.scenario.profile === correlatedPayloadProfile);
  }
}

/** Incident commands carry no value; their support is a profile fact per command family. */
function addIncidentCommandCases(context: DomainContext, start: Stimulus, add: AddCase): void {
  const occurrence = occurrenceOf(start);
  const profile = context.scenario.profile;
  for (const stimulus of [
    { kind: StimulusKind.ReportEffectFailure, commandId: "late-failure", effectId: occurrence, generation: 1 },
    { kind: StimulusKind.RetryIncident, commandId: "late-retry", incidentId: { effectId: occurrence, generation: 1 } },
    { kind: StimulusKind.CancelIncidentProcess, commandId: "late-cancel", processInstanceId: occurrence.processInstanceId,
      incidentId: { effectId: occurrence, generation: 1 } },
  ] as const satisfies readonly Stimulus[]) add(context, stimulus.kind, [...context.scenario.stimuli, stimulus],
    incidentCommandProfiles[stimulus.kind].includes(profile));
}

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
