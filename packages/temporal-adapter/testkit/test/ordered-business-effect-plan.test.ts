import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { EffectExecutionResultKind, EffectMappingValuePolicy, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { EffectExecutionResult, Scenario, VariableBinding } from "@bpmn-lean/semantic-core";
import { EffectExecutionSchedule, EffectProbeActivityRegistry, EffectProbeStore,
  completeEffectCommandId, effectTransportKey, requireOrderedEffectHistory, requireScenarioAdmission } from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";

const root = new URL("../../../../", import.meta.url);
const retained: Scenario = JSON.parse(await readFile(new URL("packages/differential/test/fixtures/serial-classification.scenario.json", root), "utf8"));
const xml = await readFile(new URL(retained.bpmn.relativePath, root), "utf8");
const overlayBytes = await readFile(new URL("packages/differential/test/fixtures/serial-classification.overlay.json", root));
const payload = (value: unknown) => ({ metadata: { encoding: Buffer.from("json/plain") }, data: Buffer.from(JSON.stringify(value)) });

function effectHistory(requests: readonly EffectRequest[], results: readonly EffectExecutionResult[]): TemporalHistory {
  assert.equal(requests.length, results.length);
  const events: TemporalHistory["events"][number][] = requests.flatMap((request, index) => {
    const scheduledEventId = index * 10 + 1;
    return [
      { eventId: scheduledEventId, activityTaskScheduledEventAttributes: {
        activityType: { name: "executeBpmnEffect" }, input: { payloads: [payload(request)] },
        startToCloseTimeout: { seconds: 2 }, scheduleToCloseTimeout: { seconds: 10 },
        retryPolicy: { maximumAttempts: 2, initialInterval: { nanos: 100_000_000 }, backoffCoefficient: 1 },
      } },
      { eventId: scheduledEventId + 1, activityTaskStartedEventAttributes: { scheduledEventId, attempt: 1 } },
      { eventId: scheduledEventId + 2, activityTaskCompletedEventAttributes: {
        scheduledEventId, result: { payloads: [payload(results[index])] },
      } },
    ];
  });
  events.push({ eventId: 100, workflowExecutionCompletedEventAttributes: {} });
  return { events };
}

for (const repeatedOperation of [false, true]) {
  test(`ordered effects bind human-started and consecutive intents, repeated operation=${repeatedOperation}`, async () => {
    assert.ok(retained.bpmn.sourceOverlay !== null);
    const compiled = await compileBpmnToSemanticProcess({
      bytes: Buffer.from(repeatedOperation ? xml.replaceAll("invoiceClassifier", "invoiceValidator") : xml),
      sourceId: retained.bpmn.id, expectedSha256: repeatedOperation ? undefined : retained.bpmn.sha256,
      semanticProfile: retained.profile, sourceOverlay: { ...retained.bpmn.sourceOverlay, bytes: overlayBytes },
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
    });
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Business source refused");
    const program = compiled.semanticProcess;
    const scenario: Scenario = { ...retained, bpmn: { ...retained.bpmn, sha256: program.identity.sourceSha256 } };
    const start = scenario.stimuli[0]!;
    assert.equal(start.kind, StimulusKind.StartProcess);
    if (start.kind !== StimulusKind.StartProcess) throw new Error("Business Start missing");
    assert.doesNotThrow(() => requireScenarioAdmission(start, program));
    const completions = scenario.stimuli.filter(stimulus => stimulus.kind === StimulusKind.CompleteEffect);
    assert.equal(completions.length, 2);
    const requests: EffectRequest[] = [];
    for (const [index, completion] of completions.entries()) {
      const descriptor = { protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: index === 0 || repeatedOperation ? "invoiceValidator" : "invoiceClassifier" };
      const arguments_ = [...(index === 0 ? [{ name: "echo", value: { kind: VariableValueKind.String as const, value: "parent-payload" } }] : []), { name: "payload", value: { kind: VariableValueKind.String as const, value: index === 0 ? "INV-42" : "valid" } }];
      const request = { ...descriptor, arguments: arguments_, idempotencyKey: effectTransportKey({
        definition: { ...program.identity, processId: program.processId }, occurrence: completion.effectId,
        descriptor, arguments: arguments_,
      }) };
      requests.push(request);
      const registry = new EffectProbeActivityRegistry();
      let calls = 0;
      registry.register(request, async () => { calls++; return completion.result; });
      assert.deepEqual(await registry.activities.executeBpmnEffect(structuredClone(request)), completion.result);
      await assert.rejects(registry.activities.executeBpmnEffect({ ...request, arguments: [] }), /No exact probe registration/);
      await assert.rejects(registry.activities.executeBpmnEffect({ ...request, idempotencyKey: `effect-transport-sha256:${"0".repeat(64)}` }), /No exact probe registration/);
      assert.equal(calls, 1);
      registry.unregister(request.idempotencyKey);
      await assert.rejects(registry.activities.executeBpmnEffect(request), /No exact probe registration/);
      const store = new EffectProbeStore();
      await assert.rejects(store.execute(request, EffectExecutionSchedule.PlainSuccess), /calibration operation/);
      store.requireEmpty();
    }
    const history = effectHistory(requests, completions.map(completion => completion.result));
    assert.doesNotThrow(() => requireOrderedEffectHistory(history, scenario, program));
    assert.throws(() => requireOrderedEffectHistory({ events: history.events.slice(3) }, scenario, program), /Every reached intent/);
    const premature = structuredClone(history);
    Reflect.set(premature.events[2]!, "eventId", 12);
    assert.throws(() => requireOrderedEffectHistory(premature, scenario, program), /before its predecessor completed/);
    const wrongPolicy = structuredClone(history);
    Reflect.set(Reflect.get(wrongPolicy.events[0]!, "activityTaskScheduledEventAttributes"), "heartbeatTimeout", { seconds: 1 });
    assert.throws(() => requireOrderedEffectHistory(wrongPolicy, scenario, program), /exact effect Activity heartbeat policy/);
    const extraResult = { ...completions[0]!.result, localPatch: [{ name: "private", value: { kind: VariableValueKind.String as const, value: "extra" } }] };
    const refused: Scenario = { ...scenario, stimuli: scenario.stimuli.map(stimulus => stimulus === completions[0]
      ? { ...completions[0]!, commandId: completeEffectCommandId(completions[0]!.effectId, extraResult), result: extraResult }
      : stimulus) };
    assert.throws(() => requireOrderedEffectHistory(history, refused, program), /completion did not commit/);
  });
}

test("ordered business Error recovery binds repeated occurrences, corrected inputs and exact outcomes", async () => {
  const scenario: Scenario = JSON.parse(await readFile(new URL("packages/differential/test/fixtures/business-error.scenario.json", root), "utf8"));
  assert.ok(scenario.bpmn.sourceOverlay !== null);
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(scenario.bpmn.relativePath, root)), sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256, semanticProfile: scenario.profile,
    sourceOverlay: { ...scenario.bpmn.sourceOverlay,
      bytes: await readFile(new URL("packages/differential/test/fixtures/business-error.overlay.json", root)) },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Business Error source refused");
  const program = compiled.semanticProcess;
  const start = scenario.stimuli[0]!;
  assert.equal(start.kind, StimulusKind.StartProcess);
  if (start.kind !== StimulusKind.StartProcess) throw new Error("Business Error Start missing");
  assert.doesNotThrow(() => requireScenarioAdmission(start, program));
  const expected = [
    ["Validate", 1, "invoiceValidator", "missing-reference"],
    ["Validate", 2, "invoiceValidator", "policy-review"],
    ["Authorize", 1, "policyChecker", "policy-review"],
    ["Validate", 3, "invoiceValidator", "INV-42"],
    ["Authorize", 2, "policyChecker", "INV-42"],
  ] as const;
  const completions = scenario.stimuli.filter(stimulus => stimulus.kind === StimulusKind.CompleteEffect);
  assert.deepEqual(completions.map(({ effectId }) => [effectId.elementId, effectId.activation]), expected.map(([element, activation]) => [element, activation]));
  assert.deepEqual(completions.map(({ result }) => result.kind), [EffectExecutionResultKind.BpmnError,
    EffectExecutionResultKind.Success, EffectExecutionResultKind.BpmnError, EffectExecutionResultKind.Success, EffectExecutionResultKind.Success]);
  const requests = expected.map(([elementId, activation, operation, value]) => {
    const descriptor = { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation };
    const arguments_: VariableBinding[] = [{ name: "payload", value: { kind: VariableValueKind.String, value } }];
    return { ...descriptor, arguments: arguments_, idempotencyKey: effectTransportKey({
      definition: { ...program.identity, processId: program.processId },
      occurrence: { processInstanceId: "invoice", elementId, activation }, descriptor, arguments: arguments_,
    }) };
  });
  assert.equal(new Set(requests.map(request => request.idempotencyKey)).size, 5);
  const results = completions.map(completion => completion.result);
  const history = effectHistory(requests, results);
  assert.doesNotThrow(() => requireOrderedEffectHistory(history, scenario, program));
  const staleInputs = requests.map((request, index) => index === 3 ? { ...request, arguments: requests[0]!.arguments } : request);
  assert.throws(() => requireOrderedEffectHistory(effectHistory(staleInputs, results), scenario, program), /exact committed content/);
  const reusedIdentity = requests.map((request, index) => index === 1 ? { ...request, idempotencyKey: requests[0]!.idempotencyKey } : request);
  assert.throws(() => requireOrderedEffectHistory(effectHistory(reusedIdentity, results), scenario, program), /exact committed content/);
  for (const index of [0, 2]) {
    const wrongResults = results.map<EffectExecutionResult>((result, offset) => offset === index
      ? { kind: EffectExecutionResultKind.Success, localPatch: result.localPatch } : result);
    assert.throws(() => requireOrderedEffectHistory(effectHistory(requests, wrongResults), scenario, program), /no exact typed result/);
    const original = completions[index]!;
    const result = wrongResults[index]!;
    const wrongRoute: Scenario = { ...scenario, stimuli: scenario.stimuli.map(stimulus => stimulus === original
      ? { ...original, result, commandId: completeEffectCommandId(original.effectId, result) } : stimulus) };
    assert.throws(() => requireOrderedEffectHistory(history, wrongRoute, program), /not content-bound to one committed intent/);
  }
});

test("named callback registration rejects noncanonical and unsupported business arguments", () => {
  const scalar = (name: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value: "value" } });
  const request = { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "invoiceValidator",
    idempotencyKey: `effect-transport-sha256:${"1".repeat(64)}` };
  const invalid: readonly (readonly VariableBinding[])[] = [
    [{ name: "payload", value: { kind: VariableValueKind.Integer, value: 1 } }],
    [{ name: "payload", value: { kind: VariableValueKind.Boolean, value: true } }],
    [scalar("z"), scalar("a")], [scalar("same"), scalar("same")], [scalar("invoiceValidator")],
  ];
  const registry = new EffectProbeActivityRegistry();
  for (const arguments_ of invalid) {
    assert.throws(() => registry.register({ ...request, arguments: arguments_ },
      async () => ({ kind: EffectExecutionResultKind.Success, localPatch: [] })),
      /admitted protocol, operation, and argument contract/);
  }
});

test("named callback registration admits structured arguments only under the registering profile's policy", () => {
  const request = { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "notifyApplicant",
    idempotencyKey: `effect-transport-sha256:${"2".repeat(64)}` };
  const assessment: VariableBinding = { name: "assessment", value: { kind: VariableValueKind.Map, value: [
    { name: "amount", value: { kind: VariableValueKind.Decimal, coefficient: "-123455", scale: 2 } }] } };
  const rootList: VariableBinding = { name: "assessment", value: { kind: VariableValueKind.List, value: [] } };
  const handler = async () => ({ kind: EffectExecutionResultKind.Success, localPatch: [] }) as const;
  const register = (arguments_: readonly VariableBinding[], policy?: EffectMappingValuePolicy) =>
    new EffectProbeActivityRegistry().register({ ...request, arguments: arguments_ }, handler, policy);
  assert.throws(() => register([assessment]), /admitted protocol, operation, and argument contract/, "scalar by default");
  assert.doesNotThrow(() => register([assessment], EffectMappingValuePolicy.SingletonBusinessItem));
  assert.throws(() => register([rootList], EffectMappingValuePolicy.SingletonBusinessItem),
    /admitted protocol, operation, and argument contract/, "a root List is no SingletonBusinessItem");
});
