import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  CheckedNodeKind,
  CommandOutcome,
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticGraphPolicyKind,
  SemanticOperationKind,
  SemanticProfileId,
  StimulusKind,
  UserTaskLifecycleState,
  VariableValueKind,
  applyStimulus,
  initialState,
  isUserTaskMetadata,
  isUserTaskMetadataCandidateId,
  isUserTaskMetadataIdentity,
  isWellFormedSemanticProcessProgram,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
  projectOpenUserTasks,
  semanticGraphPolicyForProfile,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskMetadata,
} from "@bpmn-lean/semantic-core";

import { semanticProcessFor } from "./user-task-fixture.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

const exactMetadata = Object.freeze({
  assignment: {
    candidates: [{ kind: "group", id: "reviewers" }],
  },
  form: {
    fields: [{ key: "approved", type: "boolean" }],
  },
} as const satisfies UserTaskMetadata);

const metadataScenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "user-task-assignment-form-metadata",
  profile: SemanticProfileId.UserTaskAssignmentFormMetadata,
  bpmn: {
    id: "sequential-user-task-process",
    relativePath: "test-only/user-task-metadata.bpmn",
    sha256:
      "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    sourceOverlay: null,
  },
  stimuli: [],
  observations: Object.values(ObservationRequestKind),
  provenance: {
    normativeRefs: [],
    cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    cibRefs: [],
  },
} as const satisfies Scenario;

const start: StartProcessStimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-user-task-metadata",
  processId: "Process_SequentialUserTask",
  instanceId: "Instance_Metadata",
  initialVariables: [],
};

function programWithMetadata(
  metadata: UserTaskMetadata | undefined,
  profile: string = SemanticProfileId.UserTaskAssignmentFormMetadata,
): SemanticProcessProgram {
  const base = semanticProcessFor({ ...metadataScenario, profile });
  return {
    ...base,
    operations: base.operations.map((operation) => {
      if (operation.kind !== SemanticOperationKind.AwaitUserTask) {
        return operation;
      }
      return {
        ...operation,
        task: metadata === undefined
          ? { elementId: operation.task.elementId, name: operation.task.name }
          : {
              elementId: operation.task.elementId,
              name: operation.task.name,
              metadata,
            },
      };
    }),
  };
}

function complete(
  commandId: string,
  activation = 1,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId: start.instanceId,
      elementId: "UserTask_Approve",
      activation,
    },
    submittedValues: [{
      name: "approved",
      value: { kind: VariableValueKind.Boolean, value: true },
    }],
  };
}

test("registers the approved metadata profile without changing its identity", () => {
  assert.equal(
    SemanticProfileId.UserTaskAssignmentFormMetadata,
    "cibseven-2.2.0-user-task-assignment-form-metadata-draft",
  );
  assert.deepEqual(
    semanticGraphPolicyForProfile(
      SemanticProfileId.UserTaskAssignmentFormMetadata,
    ),
    { kind: SemanticGraphPolicyKind.Acyclic },
  );
});

test("validates exact scalar identities without trimming or normalization", () => {
  for (const identity of [
    "reviewers",
    "review\u00a0team",
    "\u{1f642}",
    "e\u0301",
  ]) {
    assert.equal(isUserTaskMetadataIdentity(identity), true, identity);
  }
  for (const identity of [
    "",
    " reviewers",
    "reviewers ",
    "\u00a0reviewers",
    "reviewers\u00a0",
    "\u2009reviewers",
    "reviewers\ufeff",
    "\ud800",
    null,
  ]) {
    assert.equal(isUserTaskMetadataIdentity(identity), false, String(identity));
  }
  const boundarySpaces = [
    0x0009,
    0x000a,
    0x000b,
    0x000c,
    0x000d,
    0x0020,
    0x0085,
    0x00a0,
    0x1680,
    0x2000,
    0x2001,
    0x2002,
    0x2003,
    0x2004,
    0x2005,
    0x2006,
    0x2007,
    0x2008,
    0x2009,
    0x200a,
    0x2028,
    0x2029,
    0x202f,
    0x205f,
    0x3000,
    0xfeff,
  ];
  for (const codePoint of boundarySpaces) {
    const scalar = String.fromCodePoint(codePoint);
    assert.equal(isUserTaskMetadataIdentity(`${scalar}reviewers`), false);
    assert.equal(isUserTaskMetadataIdentity(`reviewers${scalar}`), false);
    assert.equal(isUserTaskMetadataIdentity(`review${scalar}team`), true);
  }
  for (const codePoint of [0x0008, 0x000e, 0x001f, 0x0021, 0x0084, 0x0086]) {
    assert.equal(
      isUserTaskMetadataIdentity(`${String.fromCodePoint(codePoint)}id`),
      true,
    );
  }
});

test("admits only the complete one-candidate one-field metadata shape", () => {
  assert.equal(isUserTaskMetadata(exactMetadata), true);
  assert.equal(isUserTaskMetadataCandidateId("reviewers"), true);
  assert.equal(isUserTaskMetadataCandidateId("review,admin"), false);
  assert.equal(isUserTaskMetadataCandidateId("${reviewers}"), false);
  assert.equal(isUserTaskMetadataCandidateId("#{reviewers}"), false);

  const invalid = [
    null,
    {},
    { ...exactMetadata, extra: null },
    { ...exactMetadata, assignment: { candidates: [] } },
    {
      ...exactMetadata,
      assignment: { candidates: [{ kind: "group", id: "" }] },
    },
    {
      ...exactMetadata,
      assignment: { candidates: [{ kind: "group", id: "review,admin" }] },
    },
    {
      ...exactMetadata,
      assignment: { candidates: [{ kind: "group", id: "${reviewers}" }] },
    },
    {
      ...exactMetadata,
      assignment: { candidates: [{ kind: "group", id: "#{reviewers}" }] },
    },
    {
      ...exactMetadata,
      assignment: { candidates: [{ kind: "user", id: "reviewers" }] },
    },
    {
      ...exactMetadata,
      assignment: {
        candidates: [
          { kind: "group", id: "reviewers" },
          { kind: "group", id: "auditors" },
        ],
      },
    },
    { ...exactMetadata, form: { fields: [] } },
    {
      ...exactMetadata,
      form: { fields: [{ key: " approved", type: "boolean" }] },
    },
    {
      ...exactMetadata,
      form: { fields: [{ key: "approved", type: "number" }] },
    },
    {
      ...exactMetadata,
      form: {
        fields: [{ key: "approved", type: "boolean", label: "Approved" }],
      },
    },
  ];
  for (const value of invalid) {
    assert.equal(isUserTaskMetadata(value), false, JSON.stringify(value));
  }

  const candidateDrift = {
    ...exactMetadata,
    assignment: { candidates: [{ kind: "group", id: "auditors" }] },
  } as const satisfies UserTaskMetadata;
  const keyDrift = {
    ...exactMetadata,
    form: { fields: [{ key: "decision", type: "boolean" }] },
  } as const satisfies UserTaskMetadata;
  const typeDrift = {
    ...exactMetadata,
    form: { fields: [{ key: "approved", type: "string" }] },
  } as const satisfies UserTaskMetadata;
  assert.equal(isUserTaskMetadata(candidateDrift), true);
  assert.equal(isUserTaskMetadata(keyDrift), true);
  assert.equal(isUserTaskMetadata(typeDrift), true);
  assert.notDeepEqual(candidateDrift, exactMetadata);
  assert.notDeepEqual(keyDrift, exactMetadata);
  assert.notDeepEqual(typeDrift, exactMetadata);
});

test("selects the exact checked and IL metadata profile shapes", () => {
  const checkedNodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_1" },
    {
      kind: CheckedNodeKind.UserTask,
      id: "UserTask_Approve",
      name: "Approve",
      metadata: exactMetadata,
    },
    { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
  ] as const satisfies ReadonlyArray<CheckedNode>;
  const metadataProgram = programWithMetadata(exactMetadata);

  assert.equal(
    profileAllowsCheckedProcessShape(
      SemanticProfileId.UserTaskAssignmentFormMetadata,
      checkedNodes,
      1,
    ),
    true,
  );
  assert.equal(isWellFormedSemanticProcessProgram(metadataProgram), true);
  assert.equal(
    profileAllowsProgramShape(
      SemanticProfileId.UserTaskAssignmentFormMetadata,
      metadataProgram.operations,
      1,
    ),
    true,
  );
  assert.equal(supportsSemanticProcessExecution(start, metadataProgram), true);

  for (const oldProfile of [
    SemanticProfileId.UserTask,
    SemanticProfileId.UserTaskPreservedNotation,
    SemanticProfileId.UserTaskBooleanCompletionData,
  ]) {
    assert.equal(
      profileAllowsCheckedProcessShape(oldProfile, checkedNodes, 1),
      false,
      oldProfile,
    );
    assert.equal(
      profileAllowsProgramShape(oldProfile, metadataProgram.operations, 1),
      false,
      oldProfile,
    );
  }

  const omissionControl = programWithMetadata(undefined);
  assert.equal(isWellFormedSemanticProcessProgram(omissionControl), true);
  assert.equal(
    profileAllowsProgramShape(
      SemanticProfileId.UserTaskAssignmentFormMetadata,
      omissionControl.operations,
      1,
    ),
    false,
  );
});

test("rejects malformed operation metadata at strict admission", () => {
  const exact = programWithMetadata(exactMetadata);
  const malformed = [
    null,
    undefined,
    {},
    { ...exactMetadata, assignment: { candidates: [] } },
    {
      ...exactMetadata,
      form: { fields: [{ key: "approved\u00a0", type: "boolean" }] },
    },
    { ...exactMetadata, unexpected: true },
  ];
  for (const metadata of malformed) {
    const program = {
      ...exact,
      operations: exact.operations.map((operation) =>
        operation.kind === SemanticOperationKind.AwaitUserTask
          ? { ...operation, task: { ...operation.task, metadata } }
          : operation
      ),
    } as unknown as SemanticProcessProgram;
    assert.equal(isWellFormedSemanticProcessProgram(program), false);
  }
});

test("copies passive metadata through wait creation and public projection", () => {
  const program = programWithMetadata(exactMetadata);
  const waiting = applyStimulus(program, initialState, start);

  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(waiting.state.userTaskWaits[0]?.metadata, exactMetadata);
  assert.deepEqual(projectOpenUserTasks(waiting.state), [{
    id: {
      processInstanceId: start.instanceId,
      elementId: "UserTask_Approve",
      activation: 1,
    },
    name: "Approve",
    state: UserTaskLifecycleState.Active,
    metadata: exactMetadata,
  }]);

  const wrong = applyStimulus(program, waiting.state, complete("wrong", 2));
  assert.equal(wrong.outcome, CommandOutcome.Rejected);
  assert.deepEqual(wrong.state, waiting.state);

  const laterActivation = {
    ...waiting.state,
    userTaskWaits: waiting.state.userTaskWaits.map((wait) => ({
      ...wait,
      id: { ...wait.id, activation: 2 },
    })),
    taskActivations: [{ elementId: "UserTask_Approve", count: 2 }],
  };
  const stale = applyStimulus(
    program,
    laterActivation,
    complete("stale-while-later-active", 1),
  );
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, laterActivation);

  const invalid = applyStimulus(program, waiting.state, {
    ...complete("invalid"),
    submittedValues: [{
      name: "approved",
      value: { kind: "number", value: 1 },
    }],
  } as unknown as CompleteUserTaskInstanceStimulus);
  assert.equal(invalid.outcome, CommandOutcome.Rejected);
  assert.deepEqual(invalid.state, waiting.state);
});

test("preserves candidate, field-key, and field-type drift at every carried boundary", () => {
  const drifts = [
    {
      ...exactMetadata,
      assignment: { candidates: [{ kind: "group", id: "auditors" }] },
    },
    {
      ...exactMetadata,
      form: { fields: [{ key: "decision", type: "boolean" }] },
    },
    {
      ...exactMetadata,
      form: { fields: [{ key: "approved", type: "string" }] },
    },
  ] as const satisfies ReadonlyArray<UserTaskMetadata>;
  const exactProgram = programWithMetadata(exactMetadata);
  const exactWaiting = applyStimulus(exactProgram, initialState, start).state;
  const exactOpen = projectOpenUserTasks(exactWaiting);
  for (const metadata of drifts) {
    const driftProgram = programWithMetadata(metadata);
    const driftWaiting = applyStimulus(driftProgram, initialState, start).state;
    assert.notDeepEqual(driftProgram.operations, exactProgram.operations);
    assert.notDeepEqual(driftWaiting.userTaskWaits, exactWaiting.userTaskWaits);
    assert.notDeepEqual(projectOpenUserTasks(driftWaiting), exactOpen);
  }
});

test("completion removes metadata and has the same terminal state for metadata drift", () => {
  const candidateDrift = {
    ...exactMetadata,
    assignment: { candidates: [{ kind: "group", id: "auditors" }] },
  } as const satisfies UserTaskMetadata;
  const terminalStates = [exactMetadata, candidateDrift].map((metadata) => {
    const program = programWithMetadata(metadata);
    const waiting = applyStimulus(program, initialState, start);
    const completed = applyStimulus(
      program,
      waiting.state,
      complete(`complete-${metadata.assignment.candidates[0].id}`),
    );
    assert.equal(completed.outcome, CommandOutcome.Committed);
    assert.deepEqual(completed.state.userTaskWaits, []);
    const stale = applyStimulus(
      program,
      completed.state,
      complete(`stale-${metadata.assignment.candidates[0].id}`),
    );
    assert.equal(stale.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.state, completed.state);
    return completed.state;
  });
  assert.deepEqual(terminalStates[0], terminalStates[1]);
});

test("physically omits metadata from the old task, wait, and public bytes", () => {
  const oldProgram = programWithMetadata(undefined, SemanticProfileId.UserTask);
  const operation = oldProgram.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.ok(operation?.kind === SemanticOperationKind.AwaitUserTask);
  assert.equal(Object.hasOwn(operation.task, "metadata"), false);
  assert.equal(
    JSON.stringify(operation.task),
    '{"elementId":"UserTask_Approve","name":"Approve"}',
  );

  const waiting = applyStimulus(oldProgram, initialState, start);
  const wait = waiting.state.userTaskWaits[0];
  const open = projectOpenUserTasks(waiting.state)[0];
  assert.ok(wait !== undefined && open !== undefined);
  assert.equal(Object.hasOwn(wait, "metadata"), false);
  assert.equal(Object.hasOwn(open, "metadata"), false);
});

test("keeps all three wire schemas exact and mutually aligned", async () => {
  const definitions = await Promise.all([
    schemaDefinitions("checked-process.schema.json"),
    schemaDefinitions("semantic-process.schema.json"),
    schemaDefinitions("scenario.schema.json"),
  ]);
  for (const candidate of definitions.slice(1)) {
    assert.deepEqual(
      candidate.userTaskMetadataIdentity,
      definitions[0]?.userTaskMetadataIdentity,
    );
    assert.deepEqual(
      candidate.userTaskMetadata,
      definitions[0]?.userTaskMetadata,
    );
  }
  const [checkedNode, taskDefinition, openUserTask] = await Promise.all([
    schemaValidator("checked-process.schema.json", "node"),
    schemaValidator("semantic-process.schema.json", "taskDefinition"),
    schemaValidator("scenario.schema.json", "openUserTask"),
  ]);
  const values = [
    {
      validator: checkedNode,
      value: {
        kind: "userTask",
        id: "UserTask_Approve",
        name: "Approve",
        metadata: exactMetadata,
      },
    },
    {
      validator: taskDefinition,
      value: {
        elementId: "UserTask_Approve",
        name: "Approve",
        metadata: exactMetadata,
      },
    },
    {
      validator: openUserTask,
      value: {
        id: {
          processInstanceId: "Instance_Metadata",
          elementId: "UserTask_Approve",
          activation: 1,
        },
        name: "Approve",
        state: "active",
        metadata: exactMetadata,
      },
    },
  ];
  for (const { validator, value } of values) {
    assert.equal(validator(value), true, JSON.stringify(validator.errors));
    const { metadata: _metadata, ...omitted } = value;
    assert.equal(validator(omitted), true, JSON.stringify(validator.errors));
    assert.equal(
      validator({
        ...value,
        metadata: {
          ...exactMetadata,
          assignment: { candidates: [{ kind: "group", id: "\u{1f642}" }] },
        },
      }),
      true,
      JSON.stringify(validator.errors),
    );
    const withCandidate = (id: string) => ({
      ...value,
      metadata: {
        ...exactMetadata,
        assignment: { candidates: [{ kind: "group" as const, id }] },
      },
    });
    assert.equal(validator(withCandidate("review\nteam")), true);
    assert.equal(validator(withCandidate("review\n,admin")), false);
    assert.equal(validator({ ...value, metadata: null }), false);
    assert.equal(
      validator({
        ...value,
        metadata: {
          ...exactMetadata,
          form: { fields: [{ key: "approved\u00a0", type: "boolean" }] },
        },
      }),
      false,
    );
    assert.equal(
      validator({ ...value, metadata: { ...exactMetadata, extra: null } }),
      false,
    );
    assert.equal(
      validator({
        ...value,
        metadata: {
          ...exactMetadata,
          assignment: { candidates: [{ kind: "group", id: "\ud800" }] },
        },
      }),
      false,
    );
  }
});

async function schemaValidator(file: string, definition: string) {
  const definitions = await schemaDefinitions(file);
  return new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: definitions,
    $ref: `#/$defs/${definition}`,
  });
}

async function schemaDefinitions(file: string): Promise<Record<string, unknown>> {
  const schema = JSON.parse(await readFile(
    `${projectRoot}/contracts/schemas/${file}`,
    "utf8",
  )) as { $defs: Record<string, unknown> };
  return schema.$defs;
}

function assertMetadataIsDeeplyReadonly(metadata: UserTaskMetadata): void {
  // @ts-expect-error DeepReadonly makes the candidate ID immutable.
  metadata.assignment.candidates[0].id = "mutated";
  // @ts-expect-error DeepReadonly makes the tuple immutable.
  metadata.form.fields.push({ key: "other", type: "string" });
}

void assertMetadataIsDeeplyReadonly;
