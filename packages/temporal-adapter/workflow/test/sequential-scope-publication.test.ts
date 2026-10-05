import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { EffectExecutionResultKind, ProcessStatus, ScenarioStepKind, StimulusKind, VariableValueKind, advanceScenario, initialState, observeStableState, projectOpenEffects } from "@bpmn-lean/semantic-core";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../../bpmn-source/test/sequential-scope-source-fixture.ts";
import { createCommandPublicationState, integrateCommandPublication } from "../dist/command-publication-integration.js";
import { programOccurrenceStartMatchesTransition } from "../../protocol/dist/flow-node-occurrence-publication-program-validation.js";
import { requireExecutionPublicationPage, requireExecutionPublicationTransportResult } from "@bpmn-lean/temporal-protocol";

const base = prepareSource(await readFile(source, "utf8"));
async function publication(xml: string, items: readonly string[] = ["A", "B"]) {
  const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "mi-publication",
    expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected accepted invoice");
  const program = compiled.semanticProcess;
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "invoices",
    initialVariables: [{ name: "items", value: { kind: VariableValueKind.StringList, value: items } }] } as const;
  const step = advanceScenario(program, initialState, start);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  const publications = integrateCommandPublication(program, createCommandPublicationState(program, start.instanceId), start, step, () => 1);
  const accumulated = publications.execution;
  const { headRevision, batches, current, definition, processId, processInstanceId } = accumulated;
  const page = { headRevision, batches, current, definition, processId, processInstanceId,
    requestedAfterRevision: 0, pageThroughRevision: headRevision };
  const context = { program, processInstanceId: start.instanceId, afterRevision: 0 };
  return { page, context, program, publications, step };
}
for (const [label, xml, items] of [
  ["serial human body", base, ["A", "B"]],
  ["parallel human/effect body", parallelBodySource(base, 3, true), ["A", "B"]],
  ["zero-item parent continuation", base, []],
] as const) {
  test(`publication accepts actual sequential Sub-Process progress: ${label}`, async () => {
    const { page, context } = await publication(xml, items);
    assert.deepEqual(requireExecutionPublicationPage(page, context), page);
    assert.deepEqual(requireExecutionPublicationTransportResult({ kind: "available", page }, {
      definition: page.definition, processId: page.processId, processInstanceId: page.processInstanceId, afterRevision: 0,
    }), { kind: "available", page });
  });
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type BodyProgress = Mutable<import("@bpmn-lean/semantic-core").OpenSequentialSubProcessMultiInstance>;
const controls: readonly [string, (progress: BodyProgress) => void][] = [
  ["controller count identity", progress => { progress.numberOfInstances++; }],
  ["loop counter identity", progress => { progress.activeIterations[0]!.loopCounter++; }],
  ["foreign instance", progress => { progress.id.processInstanceId = "other"; }],
  ["stale body", progress => { progress.activeIterations[0]!.body.activation++; }],
  ["wrong body definition", progress => { progress.activeIterations[0]!.body.definitionScopeId = "unknown"; }],
  ["unknown body field", progress => { Object.assign(progress.activeIterations[0]!, { privateState: [] }); }],
  ["wrong item declaration", progress => { progress.activeIterations[0]!.item.name = "unknown"; }],
  ["nonscalar item", progress => { progress.activeIterations[0]!.item.value = { kind: VariableValueKind.Null }; }],
  ["omitted declared local", progress => { progress.activeIterations[0]!.bindings.pop(); }],
  ["duplicate local", progress => { progress.activeIterations[0]!.bindings.push(progress.activeIterations[0]!.bindings[0]!); }],
  ["nonscalar local", progress => { progress.activeIterations[0]!.bindings[0]!.value = { kind: VariableValueKind.Boolean, value: true }; }],
  ["unknown task occurrence", progress => { progress.activeIterations[0]!.userTaskIds[0]!.activation++; }],
  ["duplicate task membership", progress => { progress.activeIterations[0]!.userTaskIds.push(progress.activeIterations[0]!.userTaskIds[0]!); }],
  ["unknown effect occurrence", progress => { progress.activeIterations[0]!.effectIds[0]!.activation++; }],
  ["missing task membership", progress => { progress.activeIterations[0]!.userTaskIds.pop(); }],
  ["missing effect membership", progress => { progress.activeIterations[0]!.effectIds.pop(); }],
];
test("Sub-Process publications reject malformed progress and mismatched body membership", async t => {
  const { page, context } = await publication(parallelBodySource(base, 3, true));
  for (const [label, mutate] of controls) await t.test(label, () => {
    const changed = JSON.parse(JSON.stringify(page)) as Mutable<typeof page>;
    const progress = changed.current!.state.openMultiInstances![0]!;
    assert.equal(progress.bodyKind, "subProcess");
    if (progress.bodyKind !== "subProcess") assert.fail("Expected Sub-Process progress");
    mutate(progress);
    assert.throws(() => requireExecutionPublicationPage(changed, context), /malformed execution publication/u);
  });
});

for (const [label, xml] of [["serial", base], ["parallel", parallelBodySource(base, 3, true)]] as const) {
  test(`complete E1/E2 publication transaction validates both body turnovers: ${label}`, async () => {
    const initial = await publication(xml);
    assert.equal(initial.step.kind, ScenarioStepKind.Committed);
    if (initial.step.kind !== ScenarioStepKind.Committed) assert.fail("Expected committed Start");
    let state = initial.step.state;
    let publications = initial.publications;
    for (let index = 0; index < 30 && observeStableState(initial.program, state).status !== ProcessStatus.Completed; index++) {
      const task = state.userTaskWaits[0];
      const effect = projectOpenEffects(state)[0];
      assert.ok(task || effect);
      const command = task !== undefined
        ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `human-${index}`, taskId: task.id, submittedValues: [] } as const
        : { kind: StimulusKind.CompleteEffect, commandId: `effect-${index}`, effectId: effect!.id,
          result: { kind: EffectExecutionResultKind.Success,
            localPatch: [{ name: "result", value: { kind: VariableValueKind.Null } }] } } as const;
      const step = advanceScenario(initial.program, state, command);
      assert.equal(step.kind, ScenarioStepKind.Committed);
      if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected admitted completion");
      publications = integrateCommandPublication(initial.program, publications, command, step, () => index + 2);
      state = step.state;
    }
    assert.equal(observeStableState(initial.program, state).status, ProcessStatus.Completed);
    const bodyStarts = publications.flowNodeOccurrences.batches.flatMap(batch => batch.transitions)
      .flatMap(transition => transition.lifecycle.started).filter(start => start.elementId === "ReviewInvoice");
    assert.equal(bodyStarts.length, 2);
    assert.notDeepEqual(bodyStarts[0]!.id, bodyStarts[1]!.id);
    const records = publications.execution.batches.flatMap(batch => batch.transitions);
    for (const body of bodyStarts) {
      const record = records.find(record => record.revision === body.id.startRevision)!;
      assert.equal(programOccurrenceStartMatchesTransition(body, initial.program, record), true);
      assert.equal(programOccurrenceStartMatchesTransition(body, initial.program, { ...record,
        positionDelta: { ...record.positionDelta, enteredScopes: [] } }), false);
      assert.equal(programOccurrenceStartMatchesTransition(body, initial.program, { ...record,
        positionDelta: { ...record.positionDelta, enteredScopes: record.positionDelta.enteredScopes.map(scope =>
          ({ ...scope, parent: { ...body.owner, activation: body.owner.activation + 1 } })) } }), false);
    }
  });
}
