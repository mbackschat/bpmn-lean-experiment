/**
 * PTT-ADMIT-01, PTT-KIND-01, PTT-BURST-01 and the amended SRE-ROUTE-01 over the retained pass-through Task models through
 * the exact-bytes source path. The oracle is the approved proposal's witness account: each model compiles under the
 * nested scope-data profile with its Tasks kept as source-kind checked nodes and lowered to one-input merges, and each
 * refusal is a one-fact edit of an admitted model, so a gate refusing every Task could not pass. The control removes the
 * Tasks, so a red result before the mechanism exists can come only from the Tasks themselves.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, CommandOutcome, SemanticOperationKind, TaskNotation, applyStimulus, initialState,
  isWellFormedSemanticProcessProgram, nestedScopeCheckedModel,
  nestedScopeProgramModel, scopeDataMaximumBurst, scopeReentryChecked,
  scopeReentryCheckedAnalysis, scopeReentryProgram, scopeReentryProgramAnalysis, structuredScopeDataCheckedStartNames,
  structuredScopeDataProgramStartNames,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-nested-embedded-scope-data-draft";
const directory = new URL("../../../scenarios/pass-through-task/", import.meta.url);

type Model = "equipment-return" | "document-intake";

const source = async (model: Model): Promise<string> => readFile(new URL(`${model}.bpmn`, directory), "utf8");

async function compile(model: Model, xml: string) {
  const bytes = await readFile(new URL(`${model}-overlay.json`, directory));
  const sourceOverlay = { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay, limits: semanticProcessTestLimits });
}

async function admitted(model: Model, xml: string) {
  const result = await compile(model, xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  return result;
}

async function refused(model: Model, xml: string, label: string): Promise<void> {
  assert.equal((await compile(model, xml)).status, BpmnCompilationStatus.Rejected, label);
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

/** The model with one Task removed and its incoming flow retargeted to the Task's successor. */
function withoutTask(xml: string, element: string, id: string, incoming: string, outgoing: string): string {
  const flow = new RegExp(`<sequenceFlow id="${outgoing}" sourceRef="${id}" targetRef="(\\w+)" />`, "u").exec(xml);
  assert.ok(flow !== null, outgoing);
  const removed = replaceOnce(replaceOnce(xml, flow[0], ""), new RegExp(`<${element} id="${id}"[^>]*/>`, "u").exec(xml)![0], "");
  return removed.replace(new RegExp(`(<sequenceFlow id="${incoming}" [^>]*targetRef=")${id}"`, "u"), `$1${flow[1]}"`);
}

/**
 * Runs a retained scenario's stimuli over an admitted Program and requires each to commit: the runtime closure bound
 * rolls back any closure longer than eight steps, so this ties the admission-time burst to the closure that executes.
 */
async function commitsEveryStimulus(program: SemanticProcessProgram, scenario: string): Promise<void> {
  const { stimuli } = JSON.parse(await readFile(new URL(`${scenario}.scenario.json`, directory), "utf8")) as
    { stimuli: Stimulus[] };
  let state = initialState;
  for (const stimulus of stimuli) {
    const result = applyStimulus(program, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
    state = result.state;
  }
}

/** `count` plain Tasks inserted on `flow`, which keeps its source and now enters the first inserted Task. */
function chain(xml: string, flow: string, count: number): string {
  const match = new RegExp(`<sequenceFlow id="${flow}" sourceRef="(\\w+)" targetRef="(\\w+)" />`, "u").exec(xml);
  assert.ok(match !== null, flow);
  const [, from, to] = match;
  const ids = Array.from({ length: count }, (_, index) => `Chained${index + 1}`);
  const steps = [from!, ...ids, to!];
  const tasks = ids.map(id => `<task id="${id}" name="Chained step" />`).join("");
  const flows = steps.slice(1).map((target, index) =>
    `<sequenceFlow id="${index === 0 ? flow : `Flow_Chained${index}`}" sourceRef="${steps[index]}" targetRef="${target}" />`).join("");
  return replaceOnce(xml, match[0], tasks + flows);
}

test("both witnesses without their Tasks are admitted today, so the Tasks alone decide admission", async () => {
  let equipment = await source("equipment-return");
  equipment = withoutTask(equipment, "manualTask", "UnpackEquipment", "Flow_InspectionOpened", "Flow_Unpacked");
  equipment = withoutTask(equipment, "task", "CloseReturnTicket", "Flow_Refunded", "Flow_Ticketed");
  await admitted("equipment-return", equipment);
  let intake = await source("document-intake");
  intake = withoutTask(intake, "manualTask", "FilePaperOriginal", "Flow_ArchivingOpened", "Flow_PaperFiledAway");
  intake = withoutTask(intake, "manualTask", "PhoneSender", "Flow_Illegible", "Flow_Recontacted");
  intake = withoutTask(intake, "task", "RegisterDigitalCopy", "Flow_Digital", "Flow_DigitalFiled");
  await admitted("document-intake", intake);
});

test("the equipment return keeps each Task's source kind and lowers it to a one-input merge on the serial route", async () => {
  const { checkedProcess, semanticProcess } = await admitted("equipment-return", await source("equipment-return"));
  const tasks = checkedProcess.nodes.filter(node => node.kind === CheckedNodeKind.NonOperationalTask);
  assert.deepEqual(tasks, [
    { kind: CheckedNodeKind.NonOperationalTask, id: "CloseReturnTicket", notation: TaskNotation.AbstractTask },
    { kind: CheckedNodeKind.NonOperationalTask, id: "UnpackEquipment", notation: TaskNotation.ManualTask },
  ]);
  for (const id of ["CloseReturnTicket", "UnpackEquipment"]) {
    const operations = semanticProcess.operations.filter(({ origin }) => origin.elementId === id);
    assert.equal(operations.length, 1, id);
    const [operation] = operations;
    assert.ok(operation?.kind === SemanticOperationKind.MergeExclusive, id);
    assert.equal(operation.inputs.length, 1, id);
  }
  // SRE-ROUTE-01, amended: the root one-input merge of Close return ticket keeps the serial route at both levels.
  assert.equal(scopeReentryProgram(semanticProcess), false);
  assert.equal(scopeReentryChecked(checkedProcess), false);
  assert.deepEqual(structuredScopeDataProgramStartNames(semanticProcess), structuredScopeDataCheckedStartNames(checkedProcess));
  assert.ok(structuredScopeDataProgramStartNames(semanticProcess) !== null);
});

test("the checked-process schema admits each notation, refuses an unknown one and requires it", async () => {
  const checked = JSON.parse(await readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url),
    "utf8")) as { $defs: Record<string, unknown> };
  const node = new Ajv2020({ strict: true }).compile({ $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: checked.$defs, $ref: "#/$defs/node" });
  const { checkedProcess } = await admitted("equipment-return", await source("equipment-return"));
  for (const task of checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.NonOperationalTask)) {
    assert.equal(node(task), true, task.id);
  }
  assert.equal(node({ kind: "nonOperationalTask", id: "Task", notation: "userTask" }), false);
  assert.equal(node({ kind: "nonOperationalTask", id: "Task" }), false);
});

test("the document intake stands on the re-entry route with a longest burst of seven", async () => {
  const { checkedProcess, semanticProcess } = await admitted("document-intake", await source("document-intake"));
  const analysis = scopeReentryProgramAnalysis(semanticProcess);
  // After Record document format: the body End's two steps, the Choice, then Register digital copy, Filed and the
  // root End's two steps.
  assert.deepEqual(analysis, { required: [], optional: null, burst: 7 });
  assert.deepEqual(scopeReentryCheckedAnalysis(checkedProcess), analysis);
});

test("a serial burst of eight through chained Tasks is admitted and one of nine is refused", async () => {
  const equipment = await source("equipment-return");
  // After Refund deposit: five chained Tasks, Close return ticket and the root None End's two steps.
  const { checkedProcess, semanticProcess } = await admitted("equipment-return", chain(equipment, "Flow_Refunded", 5));
  const programModel = nestedScopeProgramModel(semanticProcess);
  const checkedModel = nestedScopeCheckedModel(checkedProcess);
  assert.ok(programModel !== null && checkedModel !== null);
  assert.equal(scopeDataMaximumBurst(programModel), 8);
  assert.equal(scopeDataMaximumBurst(checkedModel), 8);
  await commitsEveryStimulus(semanticProcess, "equipment-return");
  await refused("equipment-return", chain(equipment, "Flow_Refunded", 6), "nine-step serial burst");
});

test("a re-entry burst of eight through chained Tasks is admitted and one of nine is refused", async () => {
  const intake = await source("document-intake");
  const { semanticProcess } = await admitted("document-intake", chain(intake, "Flow_DigitalFiled", 1));
  assert.equal(scopeReentryProgramAnalysis(semanticProcess)?.burst, 8);
  await commitsEveryStimulus(semanticProcess, "intake-digital");
  await refused("document-intake", chain(intake, "Flow_DigitalFiled", 2), "nine-step re-entry burst");
});

test("each excluded Task form is refused", async () => {
  const equipment = await source("equipment-return");
  const close = '<task id="CloseReturnTicket" name="Close return ticket" />';
  await refused("equipment-return", replaceOnce(equipment, close,
    '<task id="CloseReturnTicket" name="Close return ticket" camunda:asyncBefore="true" />'), "asynchronous continuation");
  await refused("equipment-return", replaceOnce(equipment, close, '<task id="CloseReturnTicket" name="Close return ticket">' +
    '<extensionElements><camunda:inputOutput><camunda:inputParameter name="ticket">open</camunda:inputParameter>' +
    '</camunda:inputOutput></extensionElements></task>'), "input mapping");
  await refused("equipment-return", replaceOnce(equipment, close, '<task id="CloseReturnTicket" name="Close return ticket">' +
    '<multiInstanceLoopCharacteristics isSequential="true"><loopCardinality>2</loopCardinality>' +
    '</multiInstanceLoopCharacteristics></task>'), "Multi-Instance");
  await refused("equipment-return", replaceOnce(equipment, close,
    '<task id="CloseReturnTicket" name="Close return ticket" isForCompensation="true" />'), "compensation handler");
  await refused("equipment-return", replaceOnce(equipment, '<endEvent id="ReturnClosed" name="Return closed" />',
    '<endEvent id="ReturnClosed" name="Return closed" /><sequenceFlow id="Flow_Split" sourceRef="CloseReturnTicket" ' +
    'targetRef="ReturnClosed" />'), "two outgoing flows");
  await refused("equipment-return", replaceOnce(equipment, '<endEvent id="ReturnClosed" name="Return closed" />',
    '<endEvent id="ReturnClosed" name="Return closed" /><sequenceFlow id="Flow_Join" sourceRef="SchedulePickup" ' +
    'targetRef="CloseReturnTicket" />'), "two incoming flows");
  await refused("equipment-return", replaceOnce(equipment, close,
    '<task id="CloseReturnTicket" name="Close return ticket" camunda:asyncAfter="true" />'), "asynchronous continuation after");
  await refused("equipment-return", replaceOnce(equipment, '<manualTask id="UnpackEquipment" name="Unpack equipment" />',
    '<manualTask id="UnpackEquipment" name="Unpack equipment" camunda:asyncBefore="true" />'), "asynchronous Manual Task");
  await refused("equipment-return", replaceOnce(equipment, close, '<task id="CloseReturnTicket" name="Close return ticket">' +
    '<extensionElements><camunda:executionListener event="start" class="org.example.Listener" /></extensionElements></task>'),
    "execution listener");
  await refused("equipment-return", replaceOnce(equipment, close, '<task id="CloseReturnTicket" name="Close return ticket">' +
    '<standardLoopCharacteristics /></task>'), "standard loop");
  await refused("equipment-return", replaceOnce(equipment, close, close + '<boundaryEvent id="TicketTimer" ' +
    'attachedToRef="CloseReturnTicket"><timerEventDefinition><timeDuration>PT1S</timeDuration></timerEventDefinition>' +
    '</boundaryEvent>'), "attached boundary Event");
  // moddle defines reference-valued attributes as non-enumerable, so a closed-key inventory alone cannot see `default`.
  await refused("equipment-return", replaceOnce(equipment, close,
    '<task id="CloseReturnTicket" name="Close return ticket" default="Flow_Ticketed" />'), "default outgoing flow");
  await refused("equipment-return", replaceOnce(equipment, close,
    '<task id="CloseReturnTicket" name="Close return ticket" default="Flow_Requested" />'), "default naming another flow");
  const intake = await source("document-intake");
  await refused("document-intake", replaceOnce(intake,
    '<sequenceFlow id="Flow_DigitalFiled" sourceRef="RegisterDigitalCopy" targetRef="Filed" />',
    '<sequenceFlow id="Flow_DigitalFiled" sourceRef="RegisterDigitalCopy" targetRef="Filed">' +
    '<conditionExpression xsi:type="tFormalExpression">stringEquals(documentFormat,"digital")</conditionExpression></sequenceFlow>'),
    "conditional outgoing flow");
});

/** A retained model of another family, compiled with its own overlay, for the refusals outside these witnesses. */
async function compileRetained(family: string, model: string, xml: string) {
  const familyDirectory = new URL(`../../../scenarios/${family}/`, import.meta.url);
  const bytes = await readFile(new URL(`${model}-overlay.json`, familyDirectory));
  const sourceOverlay = { id: `${model}-handlers`, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: model, expectedSha256: undefined,
    semanticProfile, sourceOverlay, limits: semanticProcessTestLimits });
}

test("a Task in a called Process or in a forking Program is refused while the unedited model is admitted", async () => {
  for (const [family, model, flow] of [
    ["scope-reentry", "contract-revision", "Flow_ClausesReviewed"],
    ["concurrent-structured-scope-data", "order-fulfilment", "Flow_StockPicked"],
    ["concurrent-structured-scope-data", "order-fulfilment", "Flow_PickingOpened"],
  ] as const) {
    const xml = await readFile(new URL(`../../../scenarios/${family}/${model}.bpmn`, import.meta.url), "utf8");
    assert.equal((await compileRetained(family, model, xml)).status, BpmnCompilationStatus.Accepted, model);
    assert.equal((await compileRetained(family, model, chain(xml, flow, 1))).status, BpmnCompilationStatus.Rejected,
      `${model} with a Task on ${flow}`);
  }
});
