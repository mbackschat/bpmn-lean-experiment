import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodeExecutionPublicationResult,
  executionPublicationIdentityForPublicProcessInstance,
  executionPublicationStateAcceptedKeys,
  ExecutionPublicationResultKind,
  SemanticOperationKind,
} from "@bpmn-lean/platform-contracts";

import {
  executionPublicationExport,
  executionPublicationPage,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

test("decodes one exact page and every closed result arm", () => {
  const page = executionPublicationPage();
  assert.deepEqual(decodeExecutionPublicationPage(page, {
    ...publicationIdentity,
    afterRevision: 0,
    limit: 1,
  }), page);
  assert.deepEqual(decodeExecutionPublicationResult({
    kind: ExecutionPublicationResultKind.Available,
    page,
  }, {
    ...publicationIdentity,
    afterRevision: 0,
    limit: 1,
  }), { kind: "available", page });
  for (const kind of ["notReady", "notFound", "unavailable", "gap"] as const) {
    assert.deepEqual(decodeExecutionPublicationResult({ kind }, {
      ...publicationIdentity,
      afterRevision: 0,
    }), { kind });
  }
});

test("accepts the exact sequential Multi-Instance progress publication", () => {
  const livePage = sequentialMultiInstancePublicationPage();

  assert.deepEqual(
    decodeExecutionPublicationPage(livePage, {
      ...publicationIdentity,
      afterRevision: 0,
      limit: 1,
    }),
    livePage,
  );
});

test("keeps the strict state-key decoder synchronized with the producer schema", async () => {
  const schema = JSON.parse(await readFile(
    new URL("../../../contracts/schemas/scenario.schema.json", import.meta.url),
    "utf8",
  )) as {
    $defs: { stateObservation: { required: string[]; properties: Record<string, unknown> } };
  };
  const producer = schema.$defs.stateObservation;
  assert.deepEqual(
    Object.keys(producer.properties).toSorted(),
    [...executionPublicationStateAcceptedKeys].toSorted(),
  );
  assert.equal(producer.required.includes("openMultiInstances"), false);
});

test("keeps the internal-operation decoder synchronized with the producer schema", async () => {
  const schema = JSON.parse(await readFile(
    new URL("../../../contracts/schemas/semantic-publication.schema.json", import.meta.url),
    "utf8",
  )) as {
    $defs: {
      internalTransition: {
        properties: { operationKind: { enum: string[] } };
      };
    };
  };
  assert.deepEqual(
    schema.$defs.internalTransition.properties.operationKind.enum.toSorted(),
    Object.values(SemanticOperationKind).toSorted(),
  );
});

test("rejects recursive Multi-Instance identity, shape, and binding drift", () => {
  rejectSequentialState((state) => Object.assign(state.openMultiInstances[0]!, { privateController: true }), /public fields/u);
  rejectSequentialState((state) => Object.assign(state.openMultiInstances[0]!.activeIterations[0]!, { privateIteration: true }), /public fields/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.id.processInstanceId = "other-instance", /identity/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.id.activityElementId = "OtherTask", /exact open task/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.id.activation = 0, /positive safe integer/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.mode = "future", /mode/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations[0]!.taskId.processInstanceId = "other-instance", /exact open task/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations[0]!.taskId.elementId = "OtherTask", /exact open task/u);
  rejectSequentialState((state) => state.openUserTasks = [], /exact open task/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations[0]!.taskInput.value = { kind: "integer", value: 1 }, /string value/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations[0]!.completionBindingName = "", /must not be empty/u);
});

test("rejects invalid Multi-Instance counts and active-iteration cardinality", () => {
  rejectSequentialState((state) => state.openMultiInstances[0]!.numberOfActiveInstances = 0, /count identities/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.numberOfTerminatedInstances = 1, /count identities/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.numberOfInstances = 2, /count identities/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.plannedInstanceCount = 4, /count identities/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.numberOfCompletedInstances = Number.MAX_SAFE_INTEGER + 1, /safe integer/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations[0]!.loopCounter = 1, /completed count/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations = [], /active iteration count/u);
  rejectSequentialState((state) => state.openMultiInstances[0]!.activeIterations.push(
    structuredClone(state.openMultiInstances[0]!.activeIterations[0]!),
  ), /active iteration count/u);
});

test("requires canonical controllers and globally unique active iteration tasks", () => {
  rejectSequentialState((state) => {
    const second = sequentialMultiInstanceController(2, 2);
    addOpenTask(state, second.activeIterations[0]!.taskId);
    state.openMultiInstances = [second, state.openMultiInstances[0]!];
  }, /canonical/u);
  rejectSequentialState((state) => {
    const duplicateTaskController = sequentialMultiInstanceController(2, 1);
    state.openMultiInstances.push(duplicateTaskController);
  }, /duplicate active task/u);
});

test("permits terminal omission or emptiness but rejects live progress on a terminal state", () => {
  const terminal = sequentialMultiInstancePublicationPage();
  terminal.current.state.status = "completed";
  terminal.current.state.activeWaits = [];
  terminal.current.state.openUserTasks = [];
  terminal.current.state.openMultiInstances = [];
  terminal.current.state.enabledInteractions = [];
  assert.deepEqual(decodeSequentialPage(terminal), terminal);
  rejectSequentialState((state) => state.status = "completed", /terminal/u);
});

test("derives the exact current admitted Product 2 identity without a host locator", () => {
  assert.deepEqual(executionPublicationIdentityForPublicProcessInstance({
    processInstanceId: "process-instance-1",
    definition: {
      processId: "PublicationProcess",
      version: 7,
      source: {
        kind: "bpmnSource",
        id: "publication-🚀.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8",
      },
      semanticProfile: "cib-seven-2.2.0:publication-test",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  }), publicationIdentity);
});

test("rejects nested definition and current-instance substitutions", () => {
  const page = executionPublicationPage();
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      definition: { ...page.definition, sourceId: "other.bpmn" },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /definition identity/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      current: {
        ...page.current!,
        state: { ...page.current!.state, instanceId: "other-instance" },
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /instance/u,
  );
});

test("rejects malformed ranges, limits, duplicates, order, and private fields", () => {
  const page = executionPublicationPage();
  const batch = page.batches[0]!;
  const duplicate = { ...batch.transitions[0]!, revision: 2 };
  const invalidPages = [
    { ...page, pageThroughRevision: 2 },
    { ...page, batches: [{ ...batch, throughRevision: 2 }] },
    { ...page, batches: [{ ...batch, transitions: [batch.transitions[0], duplicate] }] },
    { ...page, workflowId: "private-host-fact" },
  ];
  for (const invalid of invalidPages) {
    assert.throws(
      () => decodeExecutionPublicationPage(invalid, {
        ...publicationIdentity,
        afterRevision: 0,
        limit: 1,
      }),
    );
  }
  assert.throws(
    () => decodeExecutionPublicationPage(page, {
      ...publicationIdentity,
      afterRevision: 0,
      limit: 0,
    }),
    /limit/u,
  );
  const state = page.current!.state;
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      current: {
        ...page.current!,
        state: {
          ...state,
          variables: state.variables.toReversed(),
        },
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /canonical/u,
  );
});

test("validates internal-operation, state, and public-position classes recursively", () => {
  const page = executionPublicationPage();
  const root = page.current!.scopes[0]!;
  const token = {
    sequenceFlowId: "Flow_Join",
    owner: root.id,
    multiplicity: 1,
  } as const;
  const internal = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "duplicate-fork",
      operationKind: "duplicate",
      origin: { kind: "bpmnElement", elementId: "Fork" },
      owner: root.id,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [token],
      enteredScopes: [],
      exitedScopes: [],
    },
  } as const;
  const internalPage = {
    ...page,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      ...page.batches[0]!,
      throughRevision: 2,
      transitions: [page.batches[0]!.transitions[0]!, internal],
    }],
    current: {
      ...page.current!,
      revision: 2,
      controlTokens: [token],
    },
  };
  assert.deepEqual(
    decodeExecutionPublicationPage(internalPage, {
      ...publicationIdentity,
      afterRevision: 0,
    }),
    internalPage,
  );

  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      batches: [{
        ...internalPage.batches[0]!,
        transitions: [
          internalPage.batches[0]!.transitions[0]!,
          {
            ...internal,
            transition: { ...internal.transition, operationKind: "futureOperation" },
          },
        ],
      }],
    }, { ...publicationIdentity, afterRevision: 0 }),
    /operationKind/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      current: {
        ...internalPage.current,
        state: { ...internalPage.current.state, status: "paused" },
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /status/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      current: {
        ...internalPage.current,
        controlTokens: [{ ...token, multiplicity: Number.MAX_SAFE_INTEGER + 1 }],
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /safe integer/u,
  );
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...internalPage,
      current: {
        ...internalPage.current,
        controlTokens: [{
          ...token,
          owner: { ...token.owner, definitionScopeId: "missing-scope" },
        }],
      },
    }, { ...publicationIdentity, afterRevision: 0 }),
    /live scope/u,
  );
});

test("rejects unknown stimuli, closed-arm extras, and page batch overrun", () => {
  const page = executionPublicationPage();
  const first = page.batches[0]!.transitions[0]!;
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      batches: [{
        ...page.batches[0]!,
        transitions: [{
          ...first,
          transition: {
            kind: "externalStimulus",
            stimulus: { kind: "futureStimulus", commandId: "start-publication" },
          },
        }],
      }],
    }, { ...publicationIdentity, afterRevision: 0 }),
    /unknown stimulus kind/u,
  );
  assert.throws(
    () => decodeExecutionPublicationResult({ kind: "gap", page }, {
      ...publicationIdentity,
      afterRevision: 0,
    }),
    /public fields/u,
  );

  const second = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "externalStimulus",
      stimulus: {
        kind: "completeUserTaskInstance",
        commandId: "complete-task",
        taskId: {
          processInstanceId: publicationIdentity.processInstanceId,
          elementId: "Task",
          activation: 1,
        },
        submittedValues: [],
      },
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [],
      exitedScopes: [],
    },
  } as const;
  assert.throws(
    () => decodeExecutionPublicationPage({
      ...page,
      pageThroughRevision: 2,
      headRevision: 2,
      batches: [
        page.batches[0],
        {
          commandId: "complete-task",
          fromRevision: 1,
          throughRevision: 2,
          transitions: [second],
        },
      ],
      current: { ...page.current!, revision: 2 },
    }, { ...publicationIdentity, afterRevision: 0, limit: 1 }),
    /exceeds the requested batch limit/u,
  );
});

test("requires a revision-zero contiguous export and a matching head", () => {
  const publication = executionPublicationExport();
  assert.deepEqual(
    decodeExecutionPublicationExport(publication, publicationIdentity),
    publication,
  );
  assert.throws(
    () => decodeExecutionPublicationExport({
      ...publication,
      batches: [{ ...publication.batches[0], fromRevision: 1 }],
    }, publicationIdentity),
    /revision zero|fromRevision/u,
  );
  assert.throws(
    () => decodeExecutionPublicationExport({
      ...publication,
      current: { ...publication.current, revision: 2 },
    }, publicationIdentity),
    /current|head/u,
  );
});

type MutableTaskId = {
  processInstanceId: string;
  elementId: string;
  activation: number;
};

type MutableSequentialController = {
  id: { processInstanceId: string; activityElementId: string; activation: number };
  mode: string;
  plannedInstanceCount: number;
  pendingItemCount: number;
  numberOfInstances: number;
  numberOfActiveInstances: number;
  numberOfCompletedInstances: number;
  numberOfTerminatedInstances: number;
  activeIterations: Array<{
    loopCounter: number;
    taskId: MutableTaskId;
    taskInput: { name: string; value: { kind: string; value: string | number } };
    completionBindingName: string;
  }>;
};

type MutableSequentialState = {
  status: string;
  activeWaits: Array<{ elementId: string; kind: string; multiplicity: number }>;
  openUserTasks: Array<{ id: MutableTaskId; name: string; state: string }>;
  openMultiInstances: MutableSequentialController[];
  enabledInteractions: Array<{ kind: string; taskId: MutableTaskId }>;
};

type MutableSequentialPage = Record<string, unknown> & {
  current: Record<string, unknown> & { state: MutableSequentialState };
};

function sequentialMultiInstanceController(
  activityActivation = 1,
  taskActivation = 1,
): MutableSequentialController {
  const taskId = {
    processInstanceId: publicationIdentity.processInstanceId,
    elementId: "UserTask_Review",
    activation: taskActivation,
  };
  return {
    id: {
      processInstanceId: publicationIdentity.processInstanceId,
      activityElementId: taskId.elementId,
      activation: activityActivation,
    },
    mode: "sequential",
    plannedInstanceCount: 3,
    pendingItemCount: 2,
    numberOfInstances: 1,
    numberOfActiveInstances: 1,
    numberOfCompletedInstances: 0,
    numberOfTerminatedInstances: 0,
    activeIterations: [{
      loopCounter: 0,
      taskId,
      taskInput: {
        name: "DataInput_CurrentItem",
        value: { kind: "string", value: "contract" },
      },
      completionBindingName: "DataOutput_CurrentResult",
    }],
  };
}

function sequentialMultiInstancePublicationPage(): MutableSequentialPage {
  const page = executionPublicationPage();
  const controller = sequentialMultiInstanceController();
  const taskId = controller.activeIterations[0]!.taskId;
  const owner = page.current!.scopes[0]!.id;
  const token = {
    sequenceFlowId: "Flow_Review",
    owner,
    multiplicity: 1,
  };
  const awaitIteration = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "await-sequential-review",
      operationKind: "awaitSequentialMultiInstanceUserTask",
      origin: { kind: "bpmnElement", elementId: taskId.elementId },
      owner,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [token],
      enteredScopes: [],
      exitedScopes: [],
    },
  };
  return {
    ...page,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      ...page.batches[0]!,
      throughRevision: 2,
      transitions: [page.batches[0]!.transitions[0]!, awaitIteration],
    }],
    current: {
      ...page.current!,
      revision: 2,
      controlTokens: [token],
      state: {
        ...page.current!.state,
        activeWaits: [{ elementId: taskId.elementId, kind: "userTask", multiplicity: 1 }],
        openUserTasks: [{ id: taskId, name: "Review item", state: "active" }],
        openMultiInstances: [controller],
        enabledInteractions: [{ kind: "completeUserTaskInstance", taskId }],
      },
    },
  } as MutableSequentialPage;
}

function addOpenTask(state: MutableSequentialState, taskId: MutableTaskId): void {
  state.openUserTasks.push({ id: taskId, name: "Review item", state: "active" });
  state.enabledInteractions.push({ kind: "completeUserTaskInstance", taskId });
  state.activeWaits[0]!.multiplicity += 1;
}

function decodeSequentialPage(page: MutableSequentialPage) {
  return decodeExecutionPublicationPage(page, {
    ...publicationIdentity,
    afterRevision: 0,
    limit: 1,
  });
}

function rejectSequentialState(
  mutate: (state: MutableSequentialState) => unknown,
  expected: RegExp,
): void {
  const page = sequentialMultiInstancePublicationPage();
  mutate(page.current.state);
  assert.throws(() => decodeSequentialPage(page), expected);
}
