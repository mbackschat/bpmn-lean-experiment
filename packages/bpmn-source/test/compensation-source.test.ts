import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  SemanticOperationKind,
  compensationSourceDefinitionBindingValid,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  AcceptedBpmnCompilation,
  BpmnCompilationResult,
  BpmnSourceLimits,
  CheckedProcess,
  SemanticProcessProgram,
} from "@bpmn-lean/bpmn-source";
import type { CheckedProcessGraph } from "../src/checked-process-graph-admission.ts";

type DeepMutable<T> = T extends object
  ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;

type CompiledCompensationAdmission = Readonly<{
  hasSelectedCompensationCheckpoint: (
    semanticProfile: string,
    graph: CheckedProcessGraph,
  ) => boolean;
}>;

const fixtureUrl = new URL("./fixtures/compensation-source-checkpoint.bpmn", import.meta.url);
const oldFixtureUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const baseline = await readFile(fixtureUrl, "utf8");
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});
const profile = COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID;
const rootScope = "scope:Process_Compensation";
const childScope = "scope:SubProcess_ArrangeGroundTravel";
const handlerScope = "scope:EventSubProcess_UndoGroundTravel";
const descriptor = {
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:compensation-single-effect-v1",
} as const;

test("compiles the exact id-derived Compensation checked graph and existing Program", async () => {
  const result = accepted(await compile(baseline));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.source, {
    kind: "bpmnSource",
    id: "compensation-source-checkpoint",
    sha256: "b1354a029696fa7a2c07a24a11a52a59b1987abeb2b5317e6e1c55e389f2dc14",
    byteLength: Buffer.byteLength(baseline),
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  });
  assert.equal(Buffer.from(result.copyExactBytes()).toString("utf8"), baseline);

  const checked = result.checkedProcess;
  assert.equal(checked.processId, "Process_Compensation");
  assert.deepEqual(checked.definitionScopes, [
    { id: handlerScope, parentScopeId: childScope, originElementId: "EventSubProcess_UndoGroundTravel" },
    { id: rootScope, parentScopeId: null, originElementId: "Process_Compensation" },
    { id: childScope, parentScopeId: rootScope, originElementId: "SubProcess_ArrangeGroundTravel" },
  ]);
  assert.deepEqual(
    checked.nodes.map(({ id, kind }) => [id, kind]),
    [
      ["End_ArrangeGroundTravel", "noneEndEvent"],
      ["End_Done", "noneEndEvent"],
      ["Gateway_Join", "parallelGateway"],
      ["Gateway_Split", "parallelGateway"],
      ["Start_ArrangeGroundTravel", "noneStartEvent"],
      ["Start_Travel", "noneStartEvent"],
      ["SubProcess_ArrangeGroundTravel", "embeddedSubProcess"],
      ["Task_ArrangeGroundTravel", "userTask"],
      ["Task_IssueInsurance", "userTask"],
      ["Task_ReserveHotel", "userTask"],
      ["Throw_Compensate", "globalSynchronousCompensationThrowEvent"],
    ],
  );
  assert.deepEqual(
    checked.sequenceFlows.map(({ id, sourceId, targetId }) => [id, sourceId, targetId]),
    [
      ["Flow_ArrangeGroundTravel_Join", "SubProcess_ArrangeGroundTravel", "Gateway_Join"],
      ["Flow_ArrangeGroundTravel_Start_Task", "Start_ArrangeGroundTravel", "Task_ArrangeGroundTravel"],
      ["Flow_ArrangeGroundTravel_Task_End", "Task_ArrangeGroundTravel", "End_ArrangeGroundTravel"],
      ["Flow_Compensate_End", "Throw_Compensate", "End_Done"],
      ["Flow_IssueInsurance_Join", "Task_IssueInsurance", "Gateway_Join"],
      ["Flow_Join_Compensate", "Gateway_Join", "Throw_Compensate"],
      ["Flow_ReserveHotel_ArrangeGroundTravel", "Task_ReserveHotel", "SubProcess_ArrangeGroundTravel"],
      ["Flow_Split_IssueInsurance", "Gateway_Split", "Task_IssueInsurance"],
      ["Flow_Split_ReserveHotel", "Gateway_Split", "Task_ReserveHotel"],
      ["Flow_Start_Split", "Start_Travel", "Gateway_Split"],
    ],
  );
  assert.equal(checked.nodeScopes.some(({ scopeId }) => scopeId === handlerScope), false);
  assert.equal(checked.sequenceFlowScopes.some(({ scopeId }) => scopeId === handlerScope), false);
  assert.deepEqual(checked.compensation, expectedCheckedCompensation());
  assert.ok(
    checked.nodes.every((node) =>
      node.kind !== "userTask" || node.name === "Same display name"
    ),
  );

  const program = result.semanticProcess;
  assert.equal(program.operations.length, 12);
  assert.deepEqual(
    program.operations.map(({ kind }) => kind),
    [
      "reachNoneEnd", "reachNoneEnd", "synchronize", "duplicate", "initiate", "enterScope",
      "awaitUserTask", "awaitUserTask", "awaitUserTask", "triggerCompensation",
      "completeScope", "completeScope",
    ],
  );
  assert.deepEqual(
    program.operations.find(({ kind }) => kind === SemanticOperationKind.TriggerCompensation),
    {
      id: "operation:Throw_Compensate",
      kind: "triggerCompensation",
      origin: { kind: "bpmnElement", elementId: "Throw_Compensate" },
      definitionScopeId: rootScope,
      input: "place:Flow_Join_Compensate",
      output: "place:Flow_Compensate_End",
    },
  );
  assert.deepEqual(program.compensationActivityRetention, {
    definitionScopeId: rootScope,
    targets: [
      {
        activityElementId: "Task_IssueInsurance",
        boundaryEventElementId: "Boundary_IssueInsurance_Compensation",
        compensationActivityElementId: "Task_UndoInsurance",
      },
      {
        activityElementId: "Task_ReserveHotel",
        boundaryEventElementId: "Boundary_ReserveHotel_Compensation",
        compensationActivityElementId: "Task_UndoReserveHotel",
      },
    ],
    limits: { maxRecords: 2, maxCanonicalBytes: 4096 },
  });
  assert.deepEqual(program.compensationEventSubProcessSnapshots, {
    targets: [{ parentScopeId: childScope, handlerScopeId: handlerScope }],
    limits: { maxRecords: 1, maxCanonicalBytes: 8192 },
  });
  assert.deepEqual(program.compensationExecution, expectedExecution());
  assert.equal(compensationSourceDefinitionBindingValid(checked, program), true);
});

test("keeps the checkpoint outside product registration", () => {
  assert.equal(Object.values(SemanticProfileId).includes(profile as never), false);
});

test("rejects crossed parser-reference identities despite duplicate display names", async () => {
  const mutations = [
    replaceOnce(
      baseline,
      'attachedToRef="Task_ReserveHotel"',
      'attachedToRef="Task_IssueInsurance"',
    ),
    replaceOnce(
      baseline,
      'sourceRef="Boundary_ReserveHotel_Compensation"\n      targetRef="Task_UndoReserveHotel"',
      'sourceRef="Boundary_ReserveHotel_Compensation"\n      targetRef="Task_UndoInsurance"',
    ),
    replaceOnce(
      baseline,
      "<bpmn:targetRef>DataInput_TravelDetails</bpmn:targetRef>",
      "<bpmn:targetRef>Property_TravelDetails</bpmn:targetRef>",
    ),
  ];
  for (const mutation of mutations) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects reversed dependency references rather than inferring from declaration order", async () => {
  const reversed = replaceOnce(
    baseline,
    'id="Flow_ReserveHotel_ArrangeGroundTravel" sourceRef="Task_ReserveHotel" targetRef="SubProcess_ArrangeGroundTravel"',
    'id="Flow_ReserveHotel_ArrangeGroundTravel" sourceRef="SubProcess_ArrangeGroundTravel" targetRef="Task_ReserveHotel"',
  );
  assert.equal((await compile(reversed)).status, BpmnCompilationStatus.Rejected);
});

test("normalizes only the selected inapplicable spellings and referenced definitions", async () => {
  const acceptedVariants = [
    baseline.replace(' cancelActivity="false"', ""),
    baseline.replace(' cancelActivity="0"', ' cancelActivity="true"'),
    baseline.replace(' waitForCompletion="false"', ""),
    baseline.replace(' waitForCompletion="0"', ' waitForCompletion="true"'),
    baseline.replace(' isInterrupting="false"', ""),
    baseline.replace(' isInterrupting="false"', ' isInterrupting="true"'),
    baseline.replace(' associationDirection="Both"', ""),
    baseline.replace(' associationDirection="Both"', ' associationDirection="None"'),
    baseline.replace(' associationDirection="Both"', ' associationDirection="One"'),
    referencedGlobalDefinition(baseline),
  ];
  const expected = semanticPayload(accepted(await compile(baseline)));
  for (const variant of acceptedVariants) {
    assert.deepEqual(semanticPayload(accepted(await compile(variant))), expected);
  }
  for (const attribute of ["cancelActivity", "waitForCompletion", "isInterrupting"]) {
    const ambiguous = baseline.replace(
      new RegExp(` ${attribute}=\"(?:false|0)\"`),
      ` ${attribute}="1"`,
    );
    assert.equal((await compile(ambiguous)).status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects targeted, asynchronous, and additional global Compensation throws", async () => {
  const targeted = baseline.replace(
    '<bpmn:compensateEventDefinition id="Compensate_Global" />',
    '<bpmn:compensateEventDefinition id="Compensate_Global" activityRef="Task_ReserveHotel" />',
  );
  const asynchronous = baseline.replace(
    '<bpmn:compensateEventDefinition id="Compensate_Global" />',
    '<bpmn:compensateEventDefinition id="Compensate_Global" waitForCompletion="false" />',
  );
  const additional = baseline.replace(
    '    <bpmn:endEvent id="End_Done"',
    '    <bpmn:intermediateThrowEvent id="Throw_Extra"><bpmn:compensateEventDefinition id="Compensate_Extra" /></bpmn:intermediateThrowEvent>\n    <bpmn:endEvent id="End_Done"',
  );
  for (const mutation of [targeted, asynchronous, additional]) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("strict checked admission rejects identity, ordering, dormancy, and every fixed-limit mutation", async () => {
  const { hasSelectedCompensationCheckpoint } = await importCompiledCompensationAdmission();
  const checked = accepted(await compile(baseline)).checkedProcess;
  assert.equal(hasSelectedCompensationCheckpoint(profile, graph(checked)), true);
  const mutations: Array<(candidate: DeepMutable<CheckedProcess>) => void> = [
    (candidate) => {
      const dependency = candidate.compensation!.dependencies[0]!;
      [dependency.predecessorElementId, dependency.successorElementId] =
        [dependency.successorElementId, dependency.predecessorElementId];
    },
    (candidate) => candidate.compensation!.subjects.reverse(),
    (candidate) => candidate.compensation!.dependencies.unshift({
      predecessorElementId: "Task_IssueInsurance",
      successorElementId: "Task_ReserveHotel",
      reason: "sequenceFlow",
    }),
    (candidate) => {
      const event = candidate.compensation!.subjects[0]!;
      assert.equal(event.kind, "eventSubProcess");
      if (event.kind === "eventSubProcess" && event.body.input.kind === "directRestoredProcessBinding") {
        [event.body.input.sourcePropertyId, event.body.input.targetDataInputId] =
          [event.body.input.targetDataInputId, event.body.input.sourcePropertyId];
      }
    },
    (candidate) => candidate.compensation!.subjects[1]!.body.handlerElementId = "Task_UndoReserveHotel",
    (candidate) => candidate.compensation!.subjects[1]!.body.effectElementId = "Task_UndoReserveHotel",
    (candidate) => candidate.nodeScopes.push({ nodeId: "Task_IssueInsurance", scopeId: handlerScope }),
    (candidate) => setInvalidNumber(candidate.compensation!.retentionLimits, "maxRecords", 3),
    (candidate) => setInvalidNumber(
      candidate.compensation!.retentionLimits,
      "maxCanonicalBytes",
      4097,
    ),
    (candidate) => setInvalidNumber(candidate.compensation!.snapshotLimits, "maxRecords", 2),
    (candidate) => setInvalidNumber(
      candidate.compensation!.snapshotLimits,
      "maxCanonicalBytes",
      8193,
    ),
    (candidate) => setInvalidNumber(candidate.compensation!.executionLimits, "maxTriggers", 2),
    (candidate) => setInvalidNumber(candidate.compensation!.executionLimits, "maxHandlers", 4),
    (candidate) => setInvalidNumber(
      candidate.compensation!.executionLimits,
      "maxCanonicalBytes",
      20481,
    ),
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(checked) as DeepMutable<CheckedProcess>;
    mutate(candidate);
    assert.equal(hasSelectedCompensationCheckpoint(profile, graph(candidate)), false);
  }
});

test("definition binding rejects every checked-to-Program identity class", async () => {
  const { checkedProcess: checked, semanticProcess: program } = accepted(await compile(baseline));
  const mutations: Array<(candidate: DeepMutable<SemanticProcessProgram>) => void> = [
    (candidate) => {
      const trigger = candidate.operations.find(({ kind }) => kind === "triggerCompensation")!;
      if (trigger.kind === "triggerCompensation") trigger.output = "place:Flow_Join_Compensate";
    },
    (candidate) => candidate.definitionScopes[0]!.parentScopeId = rootScope,
    (candidate) => candidate.compensationActivityRetention!.targets[0]!.activityElementId = "Task_ReserveHotel",
    (candidate) => candidate.compensationEventSubProcessSnapshots!.targets[0]!.handlerScopeId = childScope,
    (candidate) => candidate.compensationExecution!.subjects[0]!.body.handlerElementId = "Task_UndoGroundTravel",
    (candidate) => candidate.compensationExecution!.subjects[0]!.body.effectElementId = "Task_UndoInsurance",
    (candidate) => {
      const input = candidate.compensationExecution!.subjects[0]!.body.input;
      if (input.kind === "restoredProcessBinding") {
        [input.sourceName, input.argumentName] = [input.argumentName, input.sourceName];
      }
    },
    (candidate) => {
      const dependency = candidate.compensationExecution!.dependencies[0]!;
      [dependency.predecessorElementId, dependency.successorElementId] =
        [dependency.successorElementId, dependency.predecessorElementId];
    },
    (candidate) => candidate.compensationActivityRetention!.limits.maxRecords = 3,
    (candidate) => candidate.compensationEventSubProcessSnapshots!.limits.maxCanonicalBytes = 8193,
    (candidate) => candidate.compensationExecution!.limits.maxHandlers = 4,
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(program) as DeepMutable<SemanticProcessProgram>;
    mutate(candidate);
    assert.equal(compensationSourceDefinitionBindingValid(checked, candidate), false);
  }
});

test("preserves old-profile exact serialized artifacts and physical omission", async () => {
  const old = accepted(await compileBpmnToSemanticProcess({
    bytes: await readFile(oldFixtureUrl),
    sourceId: "sequential-user-task-process",
    expectedSha256: "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    semanticProfile: "cibseven-2.2.0-user-task-process-data-draft",
    sourceOverlay: null,
    limits,
  }));
  assert.equal(Object.hasOwn(old.checkedProcess, "compensation"), false);
  for (const field of [
    "compensationActivityRetention",
    "compensationEventSubProcessSnapshots",
    "compensationExecution",
  ]) {
    assert.equal(Object.hasOwn(old.semanticProcess, field), false);
  }
  assert.equal(digest(old.checkedProcess), "37251f42fe1e0a0f64cb662b358db273719e4ad53ff4ac844efae390041fdfea");
  assert.equal(digest(old.semanticProcess), "107172fc322693a0ebec59b2ccd79e524cb3645f1bc20ef565d88082b54dc92b");
});

function expectedCheckedCompensation(): NonNullable<CheckedProcess["compensation"]> {
  return {
    triggerElementId: "Throw_Compensate",
    subjects: [
      {
        kind: "eventSubProcess",
        parentElementId: "SubProcess_ArrangeGroundTravel",
        parentScopeId: childScope,
        handlerScopeId: handlerScope,
        body: {
          kind: "singleEffect",
          handlerElementId: "EventSubProcess_UndoGroundTravel",
          effectElementId: "Task_UndoGroundTravel",
          descriptor,
          input: {
            kind: "directRestoredProcessBinding",
            sourcePropertyId: "Property_TravelDetails",
            targetDataInputId: "DataInput_TravelDetails",
          },
        },
      },
      boundarySubject("Task_IssueInsurance", "Boundary_IssueInsurance_Compensation", "Task_UndoInsurance"),
      boundarySubject("Task_ReserveHotel", "Boundary_ReserveHotel_Compensation", "Task_UndoReserveHotel"),
    ],
    dependencies: [{
      predecessorElementId: "Task_ReserveHotel",
      successorElementId: "SubProcess_ArrangeGroundTravel",
      reason: "sequenceFlow",
    }],
    retentionLimits: { maxRecords: 2, maxCanonicalBytes: 4096 },
    snapshotLimits: { maxRecords: 1, maxCanonicalBytes: 8192 },
    executionLimits: { maxTriggers: 1, maxHandlers: 3, maxCanonicalBytes: 20480 },
  };
}

function expectedExecution(): NonNullable<SemanticProcessProgram["compensationExecution"]> {
  const checked = expectedCheckedCompensation();
  return {
    definitionScopeId: rootScope,
    triggerOperationId: "operation:Throw_Compensate",
    subjects: checked.subjects.map((subject) => ({
      ...(subject.kind === "eventSubProcess"
        ? { kind: subject.kind, parentScopeId: subject.parentScopeId, handlerScopeId: subject.handlerScopeId }
        : { kind: subject.kind, subjectElementId: subject.subjectElementId }),
      body: {
        ...subject.body,
        input: subject.body.input.kind === "directRestoredProcessBinding"
          ? {
              kind: "restoredProcessBinding",
              sourceName: subject.body.input.sourcePropertyId,
              argumentName: subject.body.input.targetDataInputId,
            }
          : subject.body.input,
      },
    })),
    dependencies: checked.dependencies,
    limits: checked.executionLimits,
  };
}

function boundarySubject(
  subjectElementId: string,
  boundaryEventElementId: string,
  effectElementId: string,
) {
  return {
    kind: "boundaryActivity",
    subjectElementId,
    boundaryEventElementId,
    body: {
      kind: "singleEffect",
      handlerElementId: effectElementId,
      effectElementId,
      descriptor,
      input: { kind: "empty" },
    },
  } as const;
}

async function compile(source: string): Promise<BpmnCompilationResult> {
  return compileBpmnToSemanticProcess({
    bytes: Buffer.from(source),
    sourceId: "compensation-source-checkpoint",
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits,
  });
}

function accepted(result: BpmnCompilationResult): AcceptedBpmnCompilation {
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) throw new TypeError("expected accepted compilation");
  return result;
}

function graph(checked: CheckedProcess): CheckedProcessGraph {
  return { ...checked, flows: checked.sequenceFlows };
}

async function importCompiledCompensationAdmission(): Promise<CompiledCompensationAdmission> {
  const specifier = new URL(
    "../dist/compensation-checked-admission.js",
    import.meta.url,
  ).href;
  const loaded: unknown = await import(specifier);
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    !("hasSelectedCompensationCheckpoint" in loaded) ||
    typeof loaded.hasSelectedCompensationCheckpoint !== "function"
  ) {
    throw new TypeError("the compiled Compensation admission owner is incomplete");
  }
  return loaded as CompiledCompensationAdmission;
}

function semanticPayload(result: AcceptedBpmnCompilation) {
  return {
    checked: { ...result.checkedProcess, identity: undefined },
    program: { ...result.semanticProcess, identity: undefined },
  };
}

function replaceOnce(source: string, before: string, after: string): string {
  assert.equal(source.split(before).length, 2, `expected one occurrence of ${before}`);
  return source.replace(before, after);
}

function setInvalidNumber(target: object, key: string, value: number): void {
  assert.equal(Reflect.set(target, key, value), true);
}

function referencedGlobalDefinition(source: string): string {
  return source
    .replace(
      '  <bpmn:process id="Process_Compensation" isExecutable="true">',
      '  <bpmn:compensateEventDefinition id="Compensate_Global" />\n  <bpmn:process id="Process_Compensation" isExecutable="true">',
    )
    .replace(
      '      <bpmn:compensateEventDefinition id="Compensate_Global" />',
      "      <bpmn:eventDefinitionRef>Compensate_Global</bpmn:eventDefinitionRef>",
    );
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
