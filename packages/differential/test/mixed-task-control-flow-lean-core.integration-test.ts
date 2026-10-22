import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess, lowerCheckedProcess } from "@bpmn-lean/bpmn-source";
import { completeEffectCommandId } from "@bpmn-lean/temporal-protocol";
import {
  ObservationRequestKind, CheckedNodeKind, CommandOutcome, ControlStateKind, EffectExecutionResultKind, ScenarioDocumentKind, compareCanonicalStrings,
  StimulusKind, VariableValueKind, applyStimulusWithTrace, initialState, isWellFormedRuntimeState, isWellFormedSemanticProcessProgram,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
} from "@bpmn-lean/semantic-core";
import type { CheckedProcess, SemanticProcessProgram, Scenario, ScenarioResult, Stimulus, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import { compile, invoiceWithBurst, profile, source } from "../../bpmn-source/test/mixed-task-control-flow-fixture.ts";
import { parseWireJson, parseWireJsonBytes } from "../../../scripts/strict-json.ts";
import { runLeanDriver } from "./semantic-differential-targets.ts";
import { readDefinitionAdmissionVectors } from "./definition-admission-target.ts";
import type { DefinitionAdmissionInput, DefinitionAdmissionResult } from "./definition-admission-target.ts";

const binding = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const instanceId = "invoice";
const effectId = { processInstanceId: instanceId, elementId: "Validate", activation: 1 };
const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];

test("mixed-task branching, rework, local data and complete publications agree with Lean", async () => {
  const original = await readFile(source, "utf8");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const retainedPath = new URL("./fixtures/mixed-invoice-rework.scenario.json", import.meta.url);
  const retained = parseWireJsonBytes<Scenario>(await readFile(retainedPath), "retained rework scenario");
  assert.equal(retained.id, "invoice-rework");
  assert.equal(retained.profile, profile);
  assert.ok(retained.bpmn.sourceOverlay !== null);
  for (const stimulus of retained.stimuli) {
    assert.ok(!stimulus.commandId.startsWith("refuse-"));
    if (stimulus.kind === StimulusKind.CompleteEffect) {
      assert.equal(stimulus.commandId, completeEffectCommandId(stimulus.effectId, stimulus.result));
    }
  }
  const cases = [1, 3].flatMap(count => (count === 1 ? ["rework"] : ["rework", "revise", "resubmit"]).map(result => ({
    id: `candidates-${count}-${result}`, result, xml: count === 1 ? original : original.replace('<sequenceFlow id="Accept"',
      ["Revise", "Resubmit"].map(id => `<sequenceFlow id="${id}" sourceRef="Decision" targetRef="Reentry"><conditionExpression xsi:type="bpmn:tFormalExpression">stringEquals(decision,"${id.toLowerCase()}")</conditionExpression></sequenceFlow>`).join("") + '<sequenceFlow id="Accept"'),
  })));
  const inputs: ParityInput[] = await Promise.all(cases.map(async selected => {
    const compiled = await compile(selected.xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, selected.id);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Mixed-task fixture rejected");
    const program = compiled.semanticProcess;
    const patch = [binding("result", selected.result)];
    const completion: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: "validate", effectId, result: { kind: EffectExecutionResultKind.Success, localPatch: patch } };
    const stimuli: Stimulus[] = [
      { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
        initialVariables: [binding("payload", "parent-payload"), binding("request", "initial"), binding("result", "parent-result")] },
      { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: { processInstanceId: instanceId, elementId: "Review", activation: 1 }, submittedValues: [binding("request", "reviewed")] },
      { ...completion, commandId: "refuse-extra", result: { kind: EffectExecutionResultKind.Success, localPatch: [binding("private", "extra"), ...patch] } },
      { ...completion, commandId: "refuse-foreign", effectId: { ...effectId, processInstanceId: "other" } },
      completion,
      { ...completion, commandId: "refuse-stale" },
      { kind: StimulusKind.CompleteUserTaskInstance, commandId: "refuse-stale-human", taskId: { processInstanceId: instanceId, elementId: "Review", activation: 1 }, submittedValues: [] },
      { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review-again", taskId: { processInstanceId: instanceId, elementId: "Review", activation: 2 }, submittedValues: [binding("request", "corrected")] },
      { ...completion, commandId: "refuse-old-effect-while-new-waits" },
      { ...completion, commandId: "approve", effectId: { ...effectId, activation: 2 }, result: { kind: EffectExecutionResultKind.Success, localPatch: [binding("result", "approved")] } },
      { kind: StimulusKind.CompleteUserTaskInstance, commandId: "finalize", taskId: { processInstanceId: instanceId, elementId: "Finalize", activation: 1 }, submittedValues: [] },
    ];
    const scenario = scenarioFor(selected.id, program, stimuli);
    return { ...selected, scenario, program, checkedProcess: compiled.checkedProcess };
  }));
  const baseline = inputs[0]!;
  for (const rename of [false, true]) {
    const unorderedNodes = [...original.matchAll(/<(?:startEvent|endEvent|userTask|exclusiveGateway)\b[^>]*\/>/gu)].map(match => match[0]).reverse();
    let index = 0;
    const reordered = original.replace(/<(?:startEvent|endEvent|userTask|exclusiveGateway)\b[^>]*\/>/gu, () => unorderedNodes[index++]!);
    const xml = rename ? reordered.replace(/\b(id|sourceRef|targetRef|default)="([^"]+)"/gu, '$1="Renamed_$2"') : reordered;
    const compiled = await compile(xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Permuted invoice rejected");
    const program = compiled.semanticProcess;
    const normalizeIds = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll("Renamed_", ""));
    assert.deepEqual(normalizeIds({ ...program, identity: baseline.program.identity }), baseline.program);
    assert.deepEqual(normalizeIds({ ...compiled.checkedProcess, identity: baseline.checkedProcess.identity }), baseline.checkedProcess);
    const stimuli = baseline.scenario.stimuli.map((stimulus): Stimulus => {
      if (!rename) return stimulus;
      switch (stimulus.kind) {
        case StimulusKind.StartProcess: return { ...stimulus, processId: program.processId };
        case StimulusKind.CompleteUserTaskInstance: return { ...stimulus, taskId: { ...stimulus.taskId, elementId: `Renamed_${stimulus.taskId.elementId}` } };
        case StimulusKind.CompleteEffect: return { ...stimulus, effectId: { ...stimulus.effectId, elementId: `Renamed_${stimulus.effectId.elementId}` } };
        default: return assert.fail("Invoice permutation witness requires only Start and ordinary task completions");
      }
    });
    const id = rename ? "renamed-reordered-invoice" : "reordered-invoice";
    inputs.push({ id, xml, scenario: scenarioFor(id, program, stimuli), program, checkedProcess: compiled.checkedProcess });
  }
  const manualApproval = '<sequenceFlow id="ManualApproval" sourceRef="Decision" targetRef="AcceptMerge"><conditionExpression xsi:type="bpmn:tFormalExpression">stringEquals(decision,"rework")</conditionExpression></sequenceFlow>';
  const competingRoutes = original.replace('<userTask id="Finalize"/>', '<exclusiveGateway id="AcceptMerge" gatewayDirection="Converging"/><userTask id="Finalize"/>')
    .replace('id="Accept" sourceRef="Decision" targetRef="Finalize"', 'id="Accept" sourceRef="Decision" targetRef="AcceptMerge"')
    .replace('<sequenceFlow id="Finish"', '<sequenceFlow id="BeginFinalize" sourceRef="AcceptMerge" targetRef="Finalize"/><sequenceFlow id="Finish"');
  const variants = [
    { id: "string-metadata-rework", xml: original.replace(/<userTask\b([^>]*?)\s*\/>/gu,
      '<userTask$1 camunda:candidateGroups="reviewers"><extensionElements><camunda:formData><camunda:formField id="request" type="string"/></camunda:formData></extensionElements></userTask>'), rounds: 3, rework: true, expectedWait: { elementId: "Review", activation: 4 } },
    { id: "eight-step-resumption", xml: invoiceWithBurst(original, 8), rounds: 1, rework: false },
    { id: "immediate-approval", xml: original, rounds: 1, rework: false },
    { id: "nullable-result-fanout", xml: original.replace('</camunda:outputParameter>', '</camunda:outputParameter><camunda:outputParameter name="audit">${result}</camunda:outputParameter>'), rounds: 1, rework: false, nullable: true },
    { id: "rework-prefix", xml: original, rounds: 3, rework: true, expectedWait: { elementId: "Review", activation: 4 } },
    { id: "first-true-rework", xml: competingRoutes.replace('<sequenceFlow id="Accept"', `${manualApproval}<sequenceFlow id="Accept"`), rounds: 1, rework: true, expectedWait: { elementId: "Review", activation: 2 } },
    { id: "first-true-manual-approval", xml: competingRoutes.replace('<sequenceFlow id="Rework"', `${manualApproval}<sequenceFlow id="Rework"`), rounds: 1, rework: true, expectedWait: { elementId: "Finalize", activation: 1 } },
  ];
  for (const variant of variants) {
    const compiled = await compile(variant.xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, variant.id);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Invoice schedule fixture rejected");
    const program = compiled.semanticProcess;
    const stimuli: Stimulus[] = [{ kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
      initialVariables: [binding("request", "initial"), binding("result", "parent-result")] }];
    for (let activation = 1; activation <= variant.rounds; activation += 1) {
      stimuli.push({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `review-round-${activation}`,
        taskId: { processInstanceId: instanceId, elementId: "Review", activation }, submittedValues: [binding("request", `revision-${activation}`)] });
      stimuli.push({ kind: StimulusKind.CompleteEffect, commandId: `validate-round-${activation}`,
        effectId: { ...effectId, activation }, result: { kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: variant.nullable ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value: variant.rework ? "rework" : "approved" } }] } });
    }
    if (!variant.expectedWait) stimuli.push({ kind: StimulusKind.CompleteUserTaskInstance, commandId: "finalize",
      taskId: { processInstanceId: instanceId, elementId: "Finalize", activation: 1 }, submittedValues: [] });
    inputs.push({ id: variant.id, xml: variant.xml, program, checkedProcess: compiled.checkedProcess,
      scenario: scenarioFor(variant.id, program, stimuli), ...(variant.expectedWait ? { expectedWait: variant.expectedWait } : {}),
      ...(variant.nullable ? { nullableFanout: true } : {}) });
  }
  const assessmentSource = await readFile(new URL("../../bpmn-source/test/fixtures/mixed-task-assessment-routing.bpmn", import.meta.url), "utf8");
  for (const bothWrite of [false, true]) {
    for (const supplier of [false, true]) {
      const id = `assessment-${bothWrite ? "both-writers" : "optional-writer"}-${supplier ? "supplier" : "internal"}`;
      const xml = bothWrite ? assessmentSource.replace('<userTask id="Internal" name="Review the existing internal assessment"/>',
        '<serviceTask id="Internal" implementation="urn:bpmn-lean:effect-protocol:activity-v1" camunda:asyncBefore="true" camunda:delegateExpression="${internalAssessment}"><extensionElements><camunda:inputOutput><camunda:outputParameter name="assessment">${result}</camunda:outputParameter></camunda:inputOutput></extensionElements></serviceTask>') : assessmentSource;
      const compiled = await compile(xml, ["supplierAssessment", "recordAssessment", ...(bothWrite ? ["internalAssessment"] : [])]);
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted, id);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Assessment fixture rejected");
      const program = compiled.semanticProcess;
      const recordedValue: VariableValue = supplier ? { kind: VariableValueKind.String, value: "supplier result" }
        : bothWrite ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value: "existing assessment" };
      const initialVariables = [...(bothWrite ? [] : [binding("assessment", "existing assessment")]), binding("route", supplier ? "supplier" : "internal")];
      const stimuli: Stimulus[] = [
        { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables },
        supplier || bothWrite
          ? { kind: StimulusKind.CompleteEffect, commandId: "assess", effectId: { processInstanceId: instanceId, elementId: supplier ? "Supplier" : "Internal", activation: 1 }, result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value: recordedValue }] } }
          : { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: { processInstanceId: instanceId, elementId: "Internal", activation: 1 }, submittedValues: [] },
        { kind: StimulusKind.CompleteEffect, commandId: "record", effectId: { processInstanceId: instanceId, elementId: "Record", activation: 1 }, result: { kind: EffectExecutionResultKind.Success, localPatch: [] } },
        { kind: StimulusKind.CompleteUserTaskInstance, commandId: "approve", taskId: { processInstanceId: instanceId, elementId: "Approve", activation: 1 }, submittedValues: [] },
      ];
      inputs.push({ id, xml, program, checkedProcess: compiled.checkedProcess, scenario: scenarioFor(id, program, stimuli), recordedValue });
    }
  }
  for (const input of [...inputs]) {
    const start = input.scenario.stimuli[0];
    assert.equal(start?.kind, StimulusKind.StartProcess);
    if (start?.kind !== StimulusKind.StartProcess) throw new Error("Missing scenario Start");
    const requiredName = input.id.startsWith("candidates-") ? "request" : "assessment";
    if (!start.initialVariables.some(binding => binding.name === requiredName)) continue;
    const id = `${input.id}-missing-input`;
    inputs.push({ ...input, id, unsupportedStart: true, scenario: scenarioFor(id, input.program,
      [{ ...start, commandId: "refuse-missing-first-input", initialVariables: start.initialVariables.filter(binding => binding.name !== requiredName) }]) });
  }
  const retainedXml = await readFile(path.join(root, retained.bpmn.relativePath), "utf8");
  const bytes = new Uint8Array(await readFile(new URL("./fixtures/mixed-invoice-rework.overlay.json", import.meta.url)));
  const retainedCompilation = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(retainedXml),
    sourceId: retained.bpmn.id, expectedSha256: retained.bpmn.sha256, semanticProfile: profile,
    sourceOverlay: { ...retained.bpmn.sourceOverlay, bytes }, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } });
  assert.equal(retainedCompilation.status, BpmnCompilationStatus.Accepted);
  if (retainedCompilation.status !== BpmnCompilationStatus.Accepted) throw new Error("Retained rework journey rejected");
  inputs.push({ id: retained.id, xml: retainedXml, scenario: retained,
    program: retainedCompilation.semanticProcess, checkedProcess: retainedCompilation.checkedProcess });
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mixed-task-parity-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, checkedProcess, program }) => JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario, xml }) => {
      if (scenario.id === retained.id) return path.relative(root, fileURLToPath(retainedPath));
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      await writeFile(path.join(directory, scenario.bpmn.relativePath), xml);
      return file;
    }));
    const execution = await runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, ...paths], inputs.length);
    const records = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{
      scenarioId: string; scenario: Scenario; result: ScenarioResult; definitionBinding: unknown; commandPublications: unknown;
    }>(line, "mixed-task Lean result"));
    assert.equal(records.length, inputs.length);
    for (const [index, { scenario, program, recordedValue, unsupportedStart, expectedWait, nullableFanout }] of inputs.entries()) {
      const record = records[index]!;
      assert.equal(record.scenarioId, scenario.id);
      assert.deepEqual(record.scenario, scenario);
      assert.deepEqual(record.definitionBinding, { kind: "leanDefinitionBinding", sourceSha256: program.identity.sourceSha256, semanticProfile: profile, programMatchesLeanLowering: true });
      assert.deepEqual(record.result, runScenario(scenario, program), `${scenario.id} E1`);
      if (unsupportedStart) {
        assert.deepEqual(record.result, { outcome: { kind: "semantic", outcome: "unsupported" }, trace: [{ kind: "deployment", outcome: "unsupported" }] });
        assert.deepEqual(record.commandPublications, []);
        const command = applyStimulusWithTrace(program, initialState, scenario.stimuli[0]!);
        assert.equal(command.result.outcome, CommandOutcome.Rejected);
        assert.deepEqual(command.result.state, initialState);
        assert.deepEqual(command.committedTransitions, []);
        continue;
      }
      let state = initialState;
      const publications = scenario.stimuli.map(stimulus => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        const rejected = stimulus.commandId.startsWith("refuse-");
        if (scenario.id === retained.id && stimulus.kind === StimulusKind.CompleteUserTaskInstance
          && stimulus.taskId.elementId === "Review") {
          assert.deepEqual(state.effectWaits.map(wait => ({ id: wait.id, arguments: wait.arguments })), [{
            id: { ...effectId, activation: stimulus.taskId.activation },
            arguments: [binding("payload", stimulus.taskId.activation === 1 ? "draft" : "INV-42")],
          }]);
        }
        if (stimulus.kind === StimulusKind.CompleteUserTaskInstance && stimulus.commandId.startsWith("review-round-")) {
          assert.deepEqual(state.effectWaits.map(wait => ({ id: wait.id, arguments: wait.arguments })), [{
            id: { ...effectId, activation: stimulus.taskId.activation }, arguments: [binding("payload", `revision-${stimulus.taskId.activation}`)],
          }]);
        }
        if (recordedValue !== undefined && (stimulus.commandId === "assess" || stimulus.commandId === "review")) {
          assert.equal(state.effectWaits.length, 1);
          assert.equal(state.effectWaits[0]?.id.elementId, "Record");
          assert.deepEqual(state.effectWaits[0]?.arguments, [{ name: "payload", value: recordedValue }]);
        }
        assert.equal(traced.result.outcome, rejected ? CommandOutcome.Rejected : CommandOutcome.Committed);
        assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
        const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
        assert.deepEqual(replayed, rejected ? null : state);
        if (rejected) assert.deepEqual(state, before);
        return { commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
          stateWellFormed: true, traceReplays: isDeepStrictEqual(replayed, state), publication: traced.committedTransitions.length === 0 ? null :
            { transitions: traced.committedTransitions, current: traced.currentPositions }, lifecycles: traced.flowNodeOccurrenceLifecycles,
          openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
      });
      assert.equal(state.control.kind, expectedWait ? ControlStateKind.Running : ControlStateKind.Completed);
      assert.deepEqual(state.userTaskWaits.map(wait => wait.id), expectedWait ? [{ processInstanceId: instanceId, ...expectedWait }] : []);
      assert.deepEqual(state.variables.activities, []);
      if (scenario.id === retained.id) assert.deepEqual(state.variables.process.bindings,
        [binding("decision", "valid"), binding("request", "INV-42")]);
      if (nullableFanout) assert.deepEqual(state.variables.process.bindings, [
        { name: "audit", value: { kind: VariableValueKind.Null } }, { name: "decision", value: { kind: VariableValueKind.Null } },
        binding("request", "revision-1"), binding("result", "parent-result"),
      ]);
      assert.deepEqual(record.commandPublications, publications, `${scenario.id} E2`);
    }
    const metadataInput = inputs.find(input => input.id === "string-metadata-rework");
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
    const baseline = inputs[0]!;
    const checkedProcess: CheckedProcess = { ...baseline.checkedProcess,
      nodes: baseline.checkedProcess.nodes.filter(node => !["Review", "Validate"].includes(node.id)),
      nodeScopes: baseline.checkedProcess.nodeScopes.filter(owner => !["Review", "Validate"].includes(owner.nodeId)),
      sequenceFlowScopes: baseline.checkedProcess.sequenceFlowScopes.filter(owner => !["Check", "Route"].includes(owner.sequenceFlowId)),
      sequenceFlows: baseline.checkedProcess.sequenceFlows.filter(flow => !["Check", "Route"].includes(flow.id))
        .map(flow => flow.id === "EnterReview" ? { ...flow, targetId: "Decision" } : flow),
    };
    const internalCycle = lowerCheckedProcess(checkedProcess);
    assert.equal(isWellFormedSemanticProcessProgram(internalCycle), false, "a reachable/coreachable internal-only rework cycle must reject");
    await writeFile(definitions, JSON.stringify({ scenarioId: baseline.scenario.id, checkedProcess, semanticProcess: internalCycle }) + "\n");
    await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, paths[0]!], 1), /checked Process is not well formed/);
    const bounded = inputs.find(input => input.id === "eight-step-resumption")!;
    const choice = bounded.checkedProcess.nodes.find(node => node.id === "Burst1Choice0");
    assert.ok(choice?.kind === CheckedNodeKind.ExclusiveGateway);
    const branch = bounded.checkedProcess.sequenceFlows.find(flow => flow.id === "Burst1Choice0True")!;
    const fallback = bounded.checkedProcess.sequenceFlows.find(flow => flow.id === "Burst1Choice0Default")!;
    const extraId = "Burst1Choice1";
    const tooLong: CheckedProcess = { ...bounded.checkedProcess,
      nodes: [...bounded.checkedProcess.nodes, { ...choice, id: extraId, candidateFlowIds: [`${extraId}True`] as const, defaultFlowId: `${extraId}Default` }]
        .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
      nodeScopes: [...bounded.checkedProcess.nodeScopes, { ...bounded.checkedProcess.nodeScopes.find(owner => owner.nodeId === choice.id)!, nodeId: extraId }]
        .sort((left, right) => compareCanonicalStrings(left.nodeId, right.nodeId)),
      sequenceFlows: [...bounded.checkedProcess.sequenceFlows.map(flow => flow.id === branch.id ? { ...flow, targetId: extraId } : flow),
        { ...branch, id: `${extraId}True`, sourceId: extraId }, { ...fallback, id: `${extraId}Default`, sourceId: extraId }]
        .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
      sequenceFlowScopes: [...bounded.checkedProcess.sequenceFlowScopes, ...["True", "Default"].map(suffix => ({
        ...bounded.checkedProcess.sequenceFlowScopes.find(owner => owner.sequenceFlowId === branch.id)!, sequenceFlowId: `${extraId}${suffix}`,
      }))].sort((left, right) => compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)),
    };
    const tooLongProgram = lowerCheckedProcess(tooLong);
    assert.equal(isWellFormedSemanticProcessProgram(tooLongProgram), false, "one additional choice makes the admitted eight-step burst nine");
    const boundedPath = path.join(directory, "over-bound-scenario.json");
    await writeFile(boundedPath, JSON.stringify(bounded.scenario));
    await writeFile(definitions, JSON.stringify({ scenarioId: bounded.scenario.id, checkedProcess: tooLong, semanticProcess: tooLongProgram }) + "\n");
    await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, boundedPath], 1), /checked Process is not well formed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

type ParityInput = Readonly<{ id: string; xml: string; scenario: Scenario; program: SemanticProcessProgram; checkedProcess: CheckedProcess; recordedValue?: VariableValue; unsupportedStart?: boolean; expectedWait?: { elementId: string; activation: number }; nullableFanout?: boolean }>;

function scenarioFor(id: string, program: SemanticProcessProgram, stimuli: readonly Stimulus[]): Scenario {
  return { kind: ScenarioDocumentKind.Scenario, id, profile,
    bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256, sourceOverlay: program.identity.sourceOverlay, relativePath: `${id}.bpmn` },
    stimuli, observations,
    provenance: { normativeRefs: ["BPMN 2.0.2 Clause 13.3.2", "BPMN 2.0.2 Clause 13.3.3"], cibRevision: "2.2.0", cibRefs: ["CIB-EXT-0015"] } };
}
