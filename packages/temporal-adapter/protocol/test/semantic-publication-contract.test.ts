import assert from "node:assert/strict";
import test from "node:test";

import {
  bpmnExecutionPublicationQueryName,
  requireExecutionPublicationExport,
  requireExecutionPublicationPage,
  requireExecutionPublicationRequest,
  requireExecutionPublicationResult,
  requireExecutionPublicationTransportResult,
} from "../dist/index.js";
import {
  canonicalExportFixture,
  definition,
  program,
  publicationContext,
  publicationPage,
  twoBatchPublicationPage,
} from "./semantic-publication-fixture.ts";

const transportContext = {
  definition,
  processId: "Process_1",
  processInstanceId: "Instance_1",
  afterRevision: 0,
  limit: 1,
} as const;

test("publishes and strictly decodes the bounded execution-publication Query request", () => {
  assert.equal(bpmnExecutionPublicationQueryName, "bpmn-execution-publication");
  for (const valid of [
    { afterRevision: 0 },
    { afterRevision: Number.MAX_SAFE_INTEGER, limit: 100 },
  ]) {
    assert.deepEqual(requireExecutionPublicationRequest(valid), valid);
  }
  for (const malformed of [
    {},
    { afterRevision: null },
    { afterRevision: 0, privateCursor: "forbidden" },
    { afterRevision: -1 },
    { afterRevision: 1.5 },
    { afterRevision: Number.MAX_SAFE_INTEGER + 1 },
    { afterRevision: 0, limit: null },
    { afterRevision: 0, limit: undefined },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 1.5 },
    { afterRevision: 0, limit: 101 },
    { afterRevision: 0, limit: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(
      () => requireExecutionPublicationRequest(malformed),
      /malformed execution publication request/,
    );
  }
});

test("strictly decodes representation-free client transport without claiming Program equality", () => {
  const valid = { kind: "available", page: publicationPage() } as const;
  assert.deepEqual(
    requireExecutionPublicationTransportResult(valid, transportContext),
    valid,
  );
  const structurallyValidButProgramDifferent = structuredClone(valid);
  structurallyValidButProgramDifferent.page.batches[0]!.transitions[1]!
    .transition.operationKind = "awaitUserTask";
  assert.deepEqual(
    requireExecutionPublicationTransportResult(
      structurallyValidButProgramDifferent,
      transportContext,
    ),
    structurallyValidButProgramDifferent,
  );
  const publicMappingsWithoutPrivateProgram = structuredClone(
    structurallyValidButProgramDifferent,
  );
  const record = publicMappingsWithoutPrivateProgram.page.batches[0]!.transitions[1]!;
  record.transition.origin.elementId = "Element_PublicOnly";
  record.transition.owner.definitionScopeId = "Scope_PublicOnly";
  record.positionDelta.producedTokens[0]!.sequenceFlowId = "Flow_PublicOnly";
  record.positionDelta.producedTokens[0]!.owner.definitionScopeId = "Scope_PublicOnly";
  record.positionDelta.enteredScopes[0]!.id.definitionScopeId = "Scope_PublicOnly";
  publicMappingsWithoutPrivateProgram.page.current!.controlTokens[0]!.sequenceFlowId =
    "Flow_PublicOnly";
  publicMappingsWithoutPrivateProgram.page.current!.controlTokens[0]!.owner
    .definitionScopeId = "Scope_PublicOnly";
  publicMappingsWithoutPrivateProgram.page.current!.scopes[0]!.id.definitionScopeId =
    "Scope_PublicOnly";
  assert.deepEqual(
    requireExecutionPublicationTransportResult(
      publicMappingsWithoutPrivateProgram,
      transportContext,
    ),
    publicMappingsWithoutPrivateProgram,
  );
  assert.throws(
    () => requireExecutionPublicationResult(
      publicMappingsWithoutPrivateProgram,
      { ...publicationContext, limit: 1 },
    ),
    /malformed execution publication result/,
  );

  const unknownOperation = structuredClone(valid);
  unknownOperation.page.batches[0]!.transitions[1]!.transition.operationKind =
    "unknownOperation";
  const otherDefinition = structuredClone(valid);
  otherDefinition.page.definition.sourceId = "Other_Source";
  for (const malformed of [
    { ...valid, privateHostId: "forbidden" },
    otherDefinition,
    { ...valid, page: { ...valid.page, processId: "Other_Process" } },
    { ...valid, page: { ...valid.page, processInstanceId: "Other_Instance" } },
    { ...valid, page: { ...valid.page, requestedAfterRevision: 1 } },
    { ...valid, page: { ...valid.page, pageThroughRevision: 1 } },
    unknownOperation,
  ]) {
    assert.throws(
      () => requireExecutionPublicationTransportResult(malformed, transportContext),
      /malformed execution publication transport result/,
    );
  }
});

test("accepts notReady at head zero for a nonzero requested cursor", () => {
  assert.deepEqual(
    requireExecutionPublicationResult(
      { kind: "notReady" },
      { ...publicationContext, afterRevision: 27 },
    ),
    { kind: "notReady" },
  );
  assert.deepEqual(
    requireExecutionPublicationTransportResult(
      { kind: "notReady" },
      { ...transportContext, afterRevision: 27 },
    ),
    { kind: "notReady" },
  );
});

test("rejects a type-valid page whose complete-batch count exceeds the requested limit", () => {
  const valid = twoBatchPublicationPage();
  assert.deepEqual(
    requireExecutionPublicationPage(
      valid,
      { ...publicationContext, limit: 2 },
    ),
    valid,
  );
  assert.throws(
    () => requireExecutionPublicationPage(
      valid,
      { ...publicationContext, limit: 1 },
    ),
    /malformed execution publication page/,
  );
  const malformedOccurrence = structuredClone(valid);
  malformedOccurrence.batches[1]!.transitions[0]!.transition.stimulus.incidentId
    .effectId.activation = 0;
  assert.throws(
    () => requireExecutionPublicationPage(
      malformedOccurrence,
      { ...publicationContext, limit: 2 },
    ),
    /malformed execution publication page/,
  );
});

test("rejects every page, batch, record, identity, time, and head-equation mutation", () => {
  const mutations: Array<(value: ReturnType<typeof publicationPage>) => void> = [
    (value) => Object.assign(value, { privateHostId: "forbidden" }),
    (value) => { value.definition.sourceId = "other-source"; },
    (value) => { value.processId = "Other_Process"; },
    (value) => { value.processInstanceId = ""; },
    (value) => { value.requestedAfterRevision = -1; },
    (value) => { value.requestedAfterRevision = 1; },
    (value) => { value.pageThroughRevision = 1; },
    (value) => { value.pageThroughRevision = 3; },
    (value) => { value.headRevision = 0; },
    (value) => { value.batches = []; },
    (value) => { value.batches[0]!.fromRevision = 1; },
    (value) => { value.batches[0]!.throughRevision = 1; },
    (value) => { value.batches[0]!.transitions[0]!.revision = 2; },
    (value) => { value.batches[0]!.transitions[0]!.logicalTimeMs = 1; },
    (value) => {
      value.batches[0]!.commandId = "command-retry";
      value.batches[0]!.transitions[0]!.transition =
        twoBatchPublicationPage().batches[1]!.transitions[0]!.transition;
    },
    (value) => {
      value.batches[0]!.transitions[0]!.transition.stimulus.commandId = "other-command";
    },
    (value) => {
      value.batches[0]!.transitions[0]!.transition.stimulus.instanceId = "Instance_2";
    },
    (value) => {
      value.batches[0]!.transitions[1]!.transition.operationId = "Operation_Unknown";
    },
    (value) => {
      value.batches[0]!.transitions[1]!.positionDelta.producedTokens = [
        ...value.batches[0]!.transitions[1]!.positionDelta.producedTokens,
        value.batches[0]!.transitions[1]!.positionDelta.producedTokens[0]!,
      ];
    },
    (value) => { value.current = null; },
    (value) => { value.current!.revision = 1; },
    (value) => { value.current!.state.instanceId = "Instance_2"; },
    (value) => { value.current!.state.logicalTimeMs = 1; },
    (value) => { value.current!.controlTokens[0]!.multiplicity = 2; },
    (value) => { value.current!.scopes[0]!.bpmnElementId = "Process_Other"; },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(publicationPage());
    mutate(malformed);
    assert.throws(
      () => requireExecutionPublicationPage(malformed, { ...publicationContext, limit: 1 }),
      /malformed execution publication page/,
    );
  }
});

test("keeps result arms closed and validates a complete export through the same decoder", () => {
  const publication = canonicalExportFixture();
  assert.deepEqual(
    requireExecutionPublicationExport(publication, publicationContext),
    publication,
  );
  for (const malformed of [
    {},
    { kind: "unknown" },
    { kind: "gap", expectedRevision: 2 },
    { kind: "available", page: null },
  ]) {
    assert.throws(
      () => requireExecutionPublicationResult(malformed, publicationContext),
      /malformed execution publication result/,
    );
  }
  for (const mutate of [
    (value: any) => { value.format = "bpmn-lean.execution-publication.v2"; },
    (value: any) => { value.batches[0].fromRevision = 1; },
    (value: any) => { value.current.revision = 2; },
    (value: any) => { value.current.variables = []; },
  ]) {
    const malformed = structuredClone(publication);
    mutate(malformed);
    assert.throws(
      () => requireExecutionPublicationExport(malformed, publicationContext),
      /malformed execution publication export/,
    );
  }
});

test("binds every redundant internal-operation field to the exact Program operation", () => {
  const valid = publicationPage();
  assert.deepEqual(
    requireExecutionPublicationPage(valid, { ...publicationContext, limit: 1 }),
    valid,
  );
  const consistentlySubstitutedInstance = JSON.parse(
    JSON.stringify(valid).replaceAll("Instance_1", "Instance_2"),
  );
  assert.throws(
    () => requireExecutionPublicationPage(
      consistentlySubstitutedInstance,
      { ...publicationContext, limit: 1 },
    ),
    /malformed execution publication page/,
  );
  assert.deepEqual(
    requireExecutionPublicationResult(
      { kind: "available", page: valid },
      { ...publicationContext, limit: 1 },
    ),
    { kind: "available", page: valid },
  );

  const batch = valid.batches[0];
  const internal = batch.transitions[1];
  for (const changedTransition of [
    { ...internal.transition, operationKind: "awaitUserTask" },
    {
      ...internal.transition,
      origin: { kind: "bpmnElement", elementId: "StartEvent_Substituted" },
    },
    {
      ...internal.transition,
      owner: { ...internal.transition.owner, definitionScopeId: "Scope_Other" },
    },
  ]) {
    const malformed = structuredClone(valid);
    malformed.batches[0]!.transitions[1]!.transition = changedTransition;
    assert.throws(
      () => requireExecutionPublicationPage(malformed, { ...publicationContext, limit: 1 }),
      /malformed execution publication page/,
    );
  }
});
