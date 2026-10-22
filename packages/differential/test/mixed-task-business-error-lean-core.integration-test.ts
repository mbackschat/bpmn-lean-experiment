import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { completeEffectCommandId } from "@bpmn-lean/temporal-protocol";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, ObservationRequestKind, ScenarioDocumentKind,
  SemanticOperationKind, StimulusKind, VariableValueKind, applyStimulusWithTrace, initialState,
  isWellFormedRuntimeState, isWellFormedSemanticProcessProgram, isWellFormedStimulus, projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { compile, profile, source } from "../../bpmn-source/test/mixed-task-business-error-fixture.ts";
import { semanticProcessTestLimits } from "../../bpmn-source/test/semantic-process-compilation-test-support.ts";
import { parseWireJson, parseWireJsonBytes } from "../../../scripts/strict-json.ts";
import { runLeanDriver } from "./semantic-differential-targets.ts";
import { readDefinitionAdmissionVectors } from "./definition-admission-target.ts";
import type { DefinitionAdmissionInput, DefinitionAdmissionResult } from "./definition-admission-target.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const instanceId = "invoice";
const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];

function commands(program: SemanticProcessProgram, prefix: string, patch: readonly VariableBinding[]): Stimulus[] {
  const human = (commandId: string, elementId: string, activation: number, submittedValues: readonly VariableBinding[] = []): Stimulus =>
    ({ kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: { processInstanceId: instanceId, elementId: prefix + elementId, activation }, submittedValues });
  const effect = (commandId: string, elementId: string, activation: number, error = false, localPatch = patch, code = "REVIEW_REQUIRED"): Stimulus =>
    ({ kind: StimulusKind.CompleteEffect, commandId, effectId: { processInstanceId: instanceId, elementId: prefix + elementId, activation },
      result: error ? { kind: EffectExecutionResultKind.BpmnError, code, message: "Correct invoice", localPatch }
        : { kind: EffectExecutionResultKind.Success, localPatch } });
  return [
    { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
      initialVariables: [scalar("request", "initial"), scalar("result", "parent-result")] },
    human("review-1", "Review", 1, [scalar("request", "reviewed")]),
    effect("refuse-wrong-code", "Validate", 1, true, patch, "OTHER"),
    effect("refuse-missing-local", "Validate", 1, true, []),
    effect("refuse-extra-local", "Validate", 1, true, [scalar("extra", "unexpected"), ...patch]),
    effect("refuse-other-service", "Authorize", 1, true),
    effect("invalid-invoice", "Validate", 1, true),
    effect("refuse-ended-validation", "Validate", 1, true),
    human("correct-data", "CorrectData", 1, [scalar("request", "corrected-data")]),
    human("review-2", "Review", 2),
    effect("refuse-stale-validation", "Validate", 1, true),
    effect("valid-invoice", "Validate", 2),
    effect("invalid-policy", "Authorize", 1, true),
    human("correct-policy", "ReviewPolicy", 1, [scalar("request", "corrected-policy")]),
    human("refuse-stale-review", "Review", 2),
    human("review-3", "Review", 3),
    effect("valid-invoice-again", "Validate", 3),
    effect("refuse-stale-policy", "Authorize", 1, true),
    effect("valid-policy", "Authorize", 2),
    human("finalize", "Finalize", 1),
  ];
}

function scenarioFor(id: string, program: SemanticProcessProgram, stimuli: readonly Stimulus[]): Scenario {
  return { kind: ScenarioDocumentKind.Scenario, id, profile,
    bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256, sourceOverlay: program.identity.sourceOverlay, relativePath: `${id}.bpmn` },
    stimuli, observations, provenance: { normativeRefs: ["BPMN 2.0.2 Clause 10.6.3", "BPMN 2.0.2 Clause 13.3.3"],
      cibRevision: "2.2.0", cibRefs: ["CIB-AGR-0012", "CIB-EXT-0015", "CIB-EXT-0016"] } };
}

test("business Error recovery agrees with Lean on exact lowering, repeated ownership, data and E1/E2", async () => {
  const original = await readFile(source, "utf8");
  const declarations = /<(?:startEvent|endEvent|userTask|exclusiveGateway|sequenceFlow)\b[^>]*\/>/gu;
  const reorderedDeclarations = [...original.matchAll(declarations)].map(match => match[0]).reverse();
  let index = 0;
  const reordered = original.replace(declarations, () => reorderedDeclarations[index++]!);
  const variants = [
    { id: "business-error", xml: original, prefix: "", nullable: false },
    { id: "reordered", xml: reordered, prefix: "", nullable: false },
    { id: "renamed", xml: reordered.replace(/\b(id|sourceRef|targetRef|attachedToRef|errorRef)="([^"]+)"/gu, '$1="Renamed_$2"'), prefix: "Renamed_", nullable: false },
    { id: "nullable-fanout", xml: original.replaceAll('</camunda:outputParameter>', '</camunda:outputParameter><camunda:outputParameter name="audit">${result}</camunda:outputParameter>'), prefix: "", nullable: true },
    { id: "string-metadata-error-recovery", xml: original.replace(/<userTask\b([^>]*?)\s*\/>/gu,
      '<userTask$1 camunda:candidateGroups="reviewers"><extensionElements><camunda:formData><camunda:formField id="request" type="string"/></camunda:formData></extensionElements></userTask>'), prefix: "", nullable: false },
  ];
  const inputs = await Promise.all(variants.map(async variant => {
    const compiled = await compile(variant.xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, variant.id);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Business Error invoice rejected");
    const patch: VariableBinding[] = [{ name: "result", value: variant.nullable ? { kind: VariableValueKind.Null }
      : { kind: VariableValueKind.String, value: "assessed" } }];
    return { ...variant, patch, program: compiled.semanticProcess, checkedProcess: compiled.checkedProcess,
      scenario: scenarioFor(variant.id, compiled.semanticProcess, commands(compiled.semanticProcess, variant.prefix, patch)) };
  }));
  const baseline = inputs[0]!;
  for (const input of inputs.slice(1, 3)) {
    const normalized = JSON.parse(JSON.stringify({ ...input.program, identity: baseline.program.identity }).replaceAll("Renamed_", ""));
    assert.deepEqual(normalized, baseline.program);
  }
  const retainedPath = new URL("./fixtures/business-error.scenario.json", import.meta.url);
  const retained = parseWireJsonBytes<Scenario>(await readFile(retainedPath), "retained business Error scenario");
  assert.equal(retained.id, "invoice-business-error-recovery");
  assert.equal(retained.profile, profile);
  assert.ok(retained.bpmn.sourceOverlay !== null);
  for (const stimulus of retained.stimuli) {
    assert.ok(!stimulus.commandId.startsWith("refuse-"), "retained journey contains only committed commands");
    if (stimulus.kind === StimulusKind.CompleteEffect) {
      assert.equal(stimulus.commandId, completeEffectCommandId(stimulus.effectId, stimulus.result));
    }
  }
  const retainedXml = await readFile(path.join(projectRoot, retained.bpmn.relativePath), "utf8");
  const overlayBytes = await readFile(new URL("./fixtures/business-error.overlay.json", import.meta.url));
  const retainedCompilation = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(retainedXml),
    sourceId: retained.bpmn.id, expectedSha256: retained.bpmn.sha256, semanticProfile: retained.profile,
    sourceOverlay: { ...retained.bpmn.sourceOverlay, bytes: overlayBytes }, limits: semanticProcessTestLimits });
  assert.equal(retainedCompilation.status, BpmnCompilationStatus.Accepted);
  if (retainedCompilation.status !== BpmnCompilationStatus.Accepted) throw new Error("Retained business Error journey rejected");
  inputs.push({ id: retained.id, xml: retainedXml, prefix: "", nullable: false, patch: [scalar("result", "correct")],
    scenario: retained, program: retainedCompilation.semanticProcess, checkedProcess: retainedCompilation.checkedProcess });
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-business-error-parity-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, checkedProcess, program }) => JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario, xml }) => {
      if (scenario.id === retained.id) return path.relative(projectRoot, fileURLToPath(retainedPath));
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      await writeFile(path.join(directory, scenario.bpmn.relativePath), xml);
      return file;
    }));
    const execution = await runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, ...paths], inputs.length);
    const records = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{
      scenarioId: string; scenario: Scenario; result: ScenarioResult; definitionBinding: unknown; commandPublications: unknown;
    }>(line, "business Error Lean result"));
    assert.equal(records.length, inputs.length);
    for (const [index, input] of inputs.entries()) {
      const { scenario, program, prefix, patch, nullable } = input;
      const record = records[index]!;
      assert.equal(record.scenarioId, scenario.id);
      assert.deepEqual(record.scenario, scenario);
      assert.deepEqual(record.definitionBinding, { kind: "leanDefinitionBinding", sourceSha256: program.identity.sourceSha256,
        semanticProfile: profile, programMatchesLeanLowering: true });
      assert.deepEqual(record.result, runScenario(scenario, program), `${scenario.id} E1`);
      let state = initialState;
      const publications = scenario.stimuli.map(stimulus => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        const refused = stimulus.commandId.startsWith("refuse-");
        assert.equal(traced.result.outcome, refused ? CommandOutcome.Rejected : CommandOutcome.Committed, stimulus.commandId);
        assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
        const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
        assert.deepEqual(replayed, refused ? null : state);
        if (refused) {
          assert.deepEqual(state, before);
          assert.deepEqual(traced.committedTransitions, []);
        }
        if (!refused && stimulus.kind === StimulusKind.CompleteEffect && stimulus.result.kind === EffectExecutionResultKind.BpmnError) {
          assert.deepEqual(state.userTaskWaits.map(wait => wait.id.elementId), [prefix + (stimulus.effectId.elementId === prefix + "Validate" ? "CorrectData" : "ReviewPolicy")]);
          assert.deepEqual(state.effectWaits, []);
          assert.deepEqual(state.variables.activities, []);
          assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "decision")?.value, patch[0]!.value);
          if (nullable) assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "audit")?.value, patch[0]!.value);
        }
        if (stimulus.commandId === "review-2" || stimulus.commandId === "review-3") {
          const activation = stimulus.commandId === "review-2" ? 2 : 3;
          assert.deepEqual(state.effectWaits.map(wait => ({ id: wait.id, arguments: wait.arguments })), [{
            id: { processInstanceId: instanceId, elementId: prefix + "Validate", activation },
            arguments: [scalar("payload", scenario.id === retained.id
              ? (activation === 2 ? "policy-review" : "INV-42")
              : (activation === 2 ? "corrected-data" : "corrected-policy"))],
          }]);
        }
        return { commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
          stateWellFormed: true, traceReplays: isDeepStrictEqual(replayed, state), publication: traced.committedTransitions.length === 0 ? null :
            { transitions: traced.committedTransitions, current: traced.currentPositions }, lifecycles: traced.flowNodeOccurrenceLifecycles,
          openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
      });
      assert.equal(state.control.kind, ControlStateKind.Completed);
      assert.deepEqual(state.variables.activities, []);
      assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "result"), scalar("result", "parent-result"));
      assert.deepEqual(record.commandPublications, publications, `${scenario.id} E2`);
      if (scenario.id === retained.id) {
        assert.deepEqual(scenario.stimuli.filter(stimulus => stimulus.kind === StimulusKind.CompleteUserTaskInstance)
          .map(stimulus => [stimulus.taskId.elementId, stimulus.taskId.activation]),
        [["Review", 1], ["CorrectData", 1], ["Review", 2], ["ReviewPolicy", 1], ["Review", 3], ["Finalize", 1]]);
        assert.deepEqual(state.variables.process.bindings, [scalar("decision", "valid"), scalar("request", "INV-42"), scalar("result", "parent-result")]);
      }
    }
    await writeFile(definitions, JSON.stringify({ scenarioId: baseline.scenario.id, checkedProcess: baseline.checkedProcess, semanticProcess: baseline.program }) + "\n");
    for (const kind of [EffectExecutionResultKind.Success, EffectExecutionResultKind.BpmnError]) {
      for (const localPatch of [[scalar("result", "a"), scalar("result", "b")], [scalar("result", "a"), scalar("extra", "b")]]) {
        const malformed: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: "malformed-patch",
          effectId: { processInstanceId: instanceId, elementId: "Validate", activation: 1 },
          result: kind === EffectExecutionResultKind.Success ? { kind, localPatch }
            : { kind, code: "REVIEW_REQUIRED", message: null, localPatch } };
        assert.equal(isWellFormedStimulus(malformed), false);
        const invalid = { ...baseline.scenario, stimuli: [...baseline.scenario.stimuli.slice(0, 2), malformed] };
        assert.deepEqual(runScenario(invalid, baseline.program), {
          outcome: { kind: "semantic", outcome: "unsupported" }, trace: [{ kind: "deployment", outcome: "unsupported" }],
        });
        let before = initialState;
        for (const stimulus of invalid.stimuli.slice(0, 2)) before = applyStimulusWithTrace(baseline.program, before, stimulus).result.state;
        const refused = applyStimulusWithTrace(baseline.program, before, malformed);
        assert.equal(refused.result.outcome, CommandOutcome.Rejected);
        assert.deepEqual(refused.result.state, before);
        assert.deepEqual(refused.committedTransitions, []);
        await writeFile(paths[0]!, JSON.stringify(invalid));
        await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, paths[0]!], 1), /variable bindings must have unique names in canonical order/);
      }
    }
    const metadataInput = inputs.find(input => input.id === "string-metadata-error-recovery");
    assert.ok(metadataInput);
    const metadataPath = paths[inputs.indexOf(metadataInput)]!;
    const admissionInputs: DefinitionAdmissionInput[] = [{ scenarioId: "string-control",
      checkedProcess: metadataInput.checkedProcess, semanticProcess: metadataInput.program }];
    const expectedAdmissions: DefinitionAdmissionResult[] = [{ scenarioId: "string-control",
      checkedWellFormed: true, programWellFormed: true, programProfileCapabilitiesValid: true }];
    for (const [id, from, to] of [['boolean', '"type":"string"', '"type":"boolean"'],
      ['handler-key', '"key":"request"', '"key":"invoiceValidator"']]) {
      const mutate = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(from!, to!));
      const invalid = mutate({ scenarioId: metadataInput.scenario.id, checkedProcess: metadataInput.checkedProcess, semanticProcess: metadataInput.program });
      admissionInputs.push({ ...invalid, scenarioId: `${id}-checked-and-il` }, {
        scenarioId: `${id}-il-only`, checkedProcess: metadataInput.checkedProcess, semanticProcess: mutate(metadataInput.program) });
      expectedAdmissions.push({ scenarioId: `${id}-checked-and-il`, checkedWellFormed: false, programWellFormed: true,
        programProfileCapabilitiesValid: false }, { scenarioId: `${id}-il-only`, checkedWellFormed: true,
        programWellFormed: true, programProfileCapabilitiesValid: false });
      await writeFile(definitions, JSON.stringify(invalid) + "\n");
      await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, metadataPath], 1), /checked Process is not well formed/);
      await writeFile(definitions, JSON.stringify({ scenarioId: metadataInput.scenario.id,
        checkedProcess: metadataInput.checkedProcess, semanticProcess: mutate(metadataInput.program) }) + "\n");
      await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, metadataPath], 1), /Semantic Process does not equal Lean lowering/);
    }
    assert.deepEqual(await readDefinitionAdmissionVectors(path.join(directory, "admission.jsonl"), admissionInputs), expectedAdmissions);
    await writeFile(paths[0]!, JSON.stringify(baseline.scenario));
    const validation = baseline.program.operations.find(operation => operation.kind === SemanticOperationKind.AwaitEffect && operation.effect.elementId === "Validate");
    const authorization = baseline.program.operations.find(operation => operation.kind === SemanticOperationKind.AwaitEffect && operation.effect.elementId === "Authorize");
    assert.ok(validation?.kind === SemanticOperationKind.AwaitEffect && validation.bpmnErrorRoute !== undefined);
    assert.ok(authorization?.kind === SemanticOperationKind.AwaitEffect && authorization.bpmnErrorRoute !== undefined);
    const swapped = { ...baseline.program, operations: baseline.program.operations.map(operation => {
      switch (operation) {
        case validation: return { ...validation, bpmnErrorRoute: authorization.bpmnErrorRoute };
        case authorization: return { ...authorization, bpmnErrorRoute: validation.bpmnErrorRoute };
        default: return operation;
      }
    }) };
    assert.equal(isWellFormedSemanticProcessProgram(swapped), true, "the lowering check must reject a structurally valid route swap");
    await writeFile(definitions, JSON.stringify({ scenarioId: baseline.scenario.id, checkedProcess: baseline.checkedProcess, semanticProcess: swapped }) + "\n");
    await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, paths[0]!], 1), /Semantic Process does not equal Lean lowering/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
