/**
 * SEND-ADMIT-01, SEND-REFUSE-01 and SEND-DATA-01 over the retained Send Task models through the exact-bytes source path.
 * The oracle is the specification's witness account: each model compiles under the nested scope-data profile with
 * its Send Task projected to the mapped Service Task's checked node, and each refusal is a one-fact edit of an admitted
 * model. The control renames each Send Task to a Service Task, so a red result before the mechanism exists can come
 * only from the element kind, and the serial business-task control shows that profile admits the Service Task twin.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind, CommandOutcome, SemanticOperationKind, StimulusKind, applyStimulus, initialState,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { importCompiledBpmnGraph, moddleElement } from "./compiled-moddle-graph.ts";
import { compile as compileSerialBusiness } from "./serial-business-task-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-nested-embedded-scope-data-draft";
const protocol = "urn:bpmn-lean:effect-protocol:activity-v1";
const directory = new URL("../../../scenarios/send-task/", import.meta.url);
const { projectSendTask } = await import(new URL("../dist/nested-scope-data-source.js", import.meta.url).href) as
  typeof import("../src/nested-scope-data-source.ts");

type Model = "shipping-notice" | "claim-acknowledgement";

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

const asServiceTask = (xml: string): string => xml.replaceAll("<sendTask ", "<serviceTask ").replaceAll("</sendTask>",
  "</serviceTask>");

test("both models with Service Tasks in place of their Send Tasks are admitted today, so the kind alone decides", async () => {
  for (const model of ["shipping-notice", "claim-acknowledgement"] as const) await admitted(model, asServiceTask(await source(model)));
});

test("each Send Task projects to the mapped Service Task's checked node and effect operation", async () => {
  const shipping = await admitted("shipping-notice", await source("shipping-notice"));
  const twin = await admitted("shipping-notice", asServiceTask(await source("shipping-notice")));
  assert.deepEqual(shipping.checkedProcess.nodes, twin.checkedProcess.nodes);
  assert.deepEqual(shipping.semanticProcess.operations, twin.semanticProcess.operations);
  const node = shipping.checkedProcess.nodes.find(({ id }) => id === "SendShippingNotice");
  assert.ok(node?.kind === CheckedNodeKind.ServiceTask);
  assert.deepEqual(node.descriptor, { protocol, operation: "sendShippingNotice" });
  assert.deepEqual(node.inputMappings.map(({ target }) => target), ["channel", "correlationId", "recipient"]);
  assert.deepEqual(node.outputMappings, []);
  const effects = shipping.semanticProcess.operations.filter(({ origin }) => origin.elementId === "SendShippingNotice");
  assert.deepEqual(effects.map(({ kind }) => kind), [SemanticOperationKind.AwaitEffect]);
  const claim = await admitted("claim-acknowledgement", await source("claim-acknowledgement"));
  const claimTwin = await admitted("claim-acknowledgement", asServiceTask(await source("claim-acknowledgement")));
  assert.deepEqual(claim.semanticProcess.operations, claimTwin.semanticProcess.operations);
});

test("a written metamodel default leaves the Send Task admitted, as on its Service Task twin", async () => {
  // Admission must not depend on whether a source spells out a value already in force; the default guard reaches a
  // type only through the metamodel manifest, so this locks the Send Task's entry there.
  const written = replaceOnce(await source("shipping-notice"), '<sendTask id="SendShippingNotice"',
    '<sendTask id="SendShippingNotice" isForCompensation="false"');
  await admitted("shipping-notice", asServiceTask(written));
  await admitted("shipping-notice", written);
});

test("SEND-REFUSE-01: each one-fact edit of the shipping notice is refused", async () => {
  const shipping = await source("shipping-notice");
  const delegate = ' camunda:delegateExpression="${sendShippingNotice}"';
  await refused("shipping-notice", replaceOnce(shipping, delegate, ""), "no delegate");
  await refused("shipping-notice", replaceOnce(shipping, delegate, ' camunda:type="mail"'), "mail implementation");
  await refused("shipping-notice", replaceOnce(shipping, delegate, ' camunda:class="org.example.Notifier"'), "class");
  await refused("shipping-notice", replaceOnce(shipping, delegate, ' camunda:expression="${notifier.send()}"'), "expression");
  await refused("shipping-notice", replaceOnce(shipping, delegate, `${delegate} camunda:resultVariable="sent"`),
    "result variable");
  await refused("shipping-notice", replaceOnce(shipping, ' camunda:asyncBefore="true"', ""), "synchronous continuation");
  await refused("shipping-notice", replaceOnce(shipping, `implementation="${protocol}"`, 'implementation="##WebService"'),
    "another implementation");
  // SEND-DATA-01: the Service Task twin admits the same output, so only the Send Task's restriction refuses it.
  const output = '<camunda:outputParameter name="noticeSent">${channel}</camunda:outputParameter>';
  const withOutput = replaceOnce(shipping, "</camunda:inputOutput>", `${output}</camunda:inputOutput>`);
  await admitted("shipping-notice", asServiceTask(withOutput));
  await refused("shipping-notice", withOutput, "output parameter");
});

test("SEND-REFUSE-01: the serial business-task and embedded completion profiles refuse the Send Task and admit its twin", async () => {
  const serial = (await readFile(new URL(
    "../../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/business-effect-data.bpmn", import.meta.url), "utf8"));
  assert.equal((await compileSerialBusiness(serial)).status, BpmnCompilationStatus.Accepted);
  const sent = serial.replaceAll("<serviceTask ", "<sendTask ").replaceAll("</serviceTask>", "</sendTask>");
  assert.notEqual(sent, serial);
  assert.equal((await compileSerialBusiness(sent)).status, BpmnCompilationStatus.Rejected);
  // The embedded completion profile shares the nested reader, so only its reader flag keeps the Send Task out there.
  const embedded = "cibseven-2.2.0-embedded-subprocess-completion-draft";
  const bytes = new TextEncoder().encode(JSON.stringify({ kind: "bpmnSourceOverlay", id: "claim-handlers",
    semanticProfile: embedded, effectBindings: [{ source: { implementation: protocol, delegateExpression: "${acknowledgeClaim}" },
      descriptor: { protocol, operation: "acknowledgeClaim" } }], inertAttributes: [] }));
  const underEmbedded = (xml: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml),
    sourceId: "claim-acknowledgement", expectedSha256: undefined, semanticProfile: embedded, limits: semanticProcessTestLimits,
    sourceOverlay: { id: "claim-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes } });
  // A Sub-Process local makes the model data-bearing, so that profile reads it with the shared reader, not the data-free one.
  const claim = replaceOnce(await source("claim-acknowledgement"), '<subProcess id="Intake" name="Intake">',
    '<subProcess id="Intake" name="Intake"><extensionElements><camunda:inputOutput>' +
    '<camunda:inputParameter name="intakeChannel">web</camunda:inputParameter></camunda:inputOutput></extensionElements>');
  const twin = await underEmbedded(asServiceTask(claim));
  assert.equal(twin.status, BpmnCompilationStatus.Accepted, JSON.stringify(twin.diagnostics));
  assert.equal((await underEmbedded(claim)).status, BpmnCompilationStatus.Rejected);
});

test("SEND-REFUSE-01: the projection refuses messageRef and operationRef by name", async () => {
  // moddle defines both as non-enumerable references, so the key inventory cannot see them and the reader's root check
  // refuses the Message and Interface they need; the projection is the only place that keeps their refusal exact.
  const shipping = await source("shipping-notice");
  const roots = '<message id="Message_Notice" name="ShippingNotice" /><interface id="Interface_Notice" name="Notices">' +
    '<operation id="Operation_Notify" name="notify"><inMessageRef>Message_Notice</inMessageRef></operation></interface>';
  const withRoots = replaceOnce(shipping, "<process ", `${roots}<process `);
  const policy = { sourceOverlay: null, inertAttributes: [], effectBindings: [{
    source: { implementation: protocol, delegateExpression: "${sendShippingNotice}" },
    descriptor: { protocol, operation: "sendShippingNotice" } }] };
  const project = async (xml: string) => {
    const { rootElement, warnings } = await importCompiledBpmnGraph(xml, semanticProcessTestLimits.parserDeadlineMs);
    assert.deepEqual(warnings, []);
    const definitions = moddleElement(rootElement, "definitions");
    const process = (definitions.rootElements as readonly Record<string, unknown>[]).find(({ $type }) => $type === "bpmn:Process");
    const task = (process?.flowElements as readonly Record<string, unknown>[]).find(({ id }) => id === "SendShippingNotice");
    return projectSendTask(moddleElement(task, "send task"), definitions, policy);
  };
  assert.equal((await project(withRoots))?.kind, CheckedNodeKind.ServiceTask);
  const open = '<sendTask id="SendShippingNotice"';
  assert.equal(await project(replaceOnce(withRoots, open, `${open} messageRef="Message_Notice"`)), undefined);
  assert.equal(await project(replaceOnce(withRoots, open, `${open} operationRef="Operation_Notify"`)), undefined);
  await refused("shipping-notice", replaceOnce(withRoots, open, `${open} messageRef="Message_Notice"`), "message reference");
});

/** Applies each stimulus and requires it to commit, returning the final state. */
function run(program: SemanticProcessProgram, stimuli: readonly Stimulus[]): RuntimeState {
  let state = initialState;
  for (const stimulus of stimuli) {
    const result = applyStimulus(program, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
    state = result.state;
  }
  return state;
}

test("SEND-DATA-01: a result with one binding is refused with the state preserved, and the empty result commits", async () => {
  const { semanticProcess } = await admitted("shipping-notice", await source("shipping-notice"));
  const instance = "Order_1";
  const text = (value: string) => ({ kind: "string", value }) as const;
  const state = run(semanticProcess, [
    { kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_ShippingNotice", instanceId: instance,
      initialVariables: [{ name: "customerEmail", value: text("ada@example.org") }, { name: "order", value: text("A-17") }] },
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: "pack",
      taskId: { processInstanceId: instance, elementId: "PackOrder", activation: 1 }, submittedValues: [] },
  ] as Stimulus[]);
  const effectId = { processInstanceId: instance, elementId: "SendShippingNotice", activation: 1 };
  const complete = (localPatch: unknown[]) => ({ kind: StimulusKind.CompleteEffect, commandId: "complete", effectId,
    result: { kind: "success", localPatch } }) as Stimulus;
  const bound = applyStimulus(semanticProcess, state, complete([{ name: "noticeSent", value: text("yes") }]));
  assert.notEqual(bound.outcome, CommandOutcome.Committed);
  assert.deepEqual(bound.state, state);
  assert.equal(applyStimulus(semanticProcess, state, complete([])).outcome, CommandOutcome.Committed);
});
