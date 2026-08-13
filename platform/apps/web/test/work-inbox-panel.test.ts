import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  WorkCompletionRequest,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";

import type {
  RetainedCompletionOperation,
  WorkCompletionView,
  WorkInboxPanelProps,
  WorkTaskFormProps,
} from "../src/work-inbox-panel.tsx";

const stylesSource = await readFile(
  new URL("../src/work-inbox.module.css", import.meta.url),
  "utf8",
);
const workInboxSource = await readFile(
  new URL("../src/work-inbox-panel.tsx", import.meta.url),
  "utf8",
);
const dependencies = [
  "react/jsx-runtime",
  "react",
  "@tanstack/react-query",
  "@bpmn-lean/platform-ui-kit",
  "bpmn-js/lib/NavigatedViewer.js",
] as const;
const built = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    minify: false,
    ssr: fileURLToPath(new URL("../src/work-inbox-panel.tsx", import.meta.url)),
    target: "esnext",
    write: false,
    rollupOptions: {
      external: (id) => dependencies.includes(id as typeof dependencies[number]) ||
        id.includes("definition-diagram") || id.includes("bpmn-viewer") ||
        id.includes("bpmn-js-factory"),
    },
  },
});
if (Array.isArray(built) || !("output" in built)) {
  throw new Error("Unexpected Work inbox build result.");
}
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Work inbox test bundle is missing.");
let runnable = chunk.code;
runnable = runnable.replace(
  /import \{ DefinitionDiagram \} from ['"][^'"]+['"];/u,
  "const DefinitionDiagram = () => null;",
);
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  WorkInboxPanel: ComponentType<WorkInboxPanelProps>;
  WorkTaskDetailWorkspace: ComponentType<Readonly<{
    completionView: WorkCompletionView;
    detail: PublicTaskDetail;
    onBack: () => void;
    onComplete: WorkTaskFormProps["onComplete"];
    onRetry: () => void;
    task: PublicWorkTask;
  }>>;
  WorkTaskForm: ComponentType<WorkTaskFormProps>;
  WorkCompletionViewKind: Readonly<{
    Idle: "idle";
    Submitting: "submitting";
    TransportFailed: "transportFailed";
    Indeterminate: "indeterminate";
    Rejected: "rejected";
  }>;
  createRetainedCompletionOperation: (
    detail: PublicTaskDetail,
    value: Extract<PublicFormValue, { kind: "string" | "boolean" }>,
    createActionId: () => string,
  ) => RetainedCompletionOperation;
  submitRetainedCompletionOperation: (
    api: Readonly<{ complete: (actionId: string, request: WorkCompletionRequest) => Promise<WorkCompletionResult> }>,
    operation: RetainedCompletionOperation,
  ) => Promise<WorkCompletionResult>;
  resolveCompletionResult: (
    operation: RetainedCompletionOperation,
    result: WorkCompletionResult,
  ) => Readonly<{
    operation: RetainedCompletionOperation | null;
    closeDetail: boolean;
    view: WorkCompletionView;
  }>;
  initialFormValue: (field: PublicFormField) => PublicFormValue;
  selectedBooleanFormValue: (value: FormDataEntryValue | null) => boolean;
  workTaskRowId: (task: PublicWorkTask) => string;
}>;
const {
  WorkInboxPanel,
  WorkTaskDetailWorkspace,
  WorkTaskForm,
  WorkCompletionViewKind,
  createRetainedCompletionOperation,
  submitRetainedCompletionOperation,
  resolveCompletionResult,
  initialFormValue,
  selectedBooleanFormValue,
  workTaskRowId,
} = module;

const task: PublicWorkTask = {
  task: {
    id: { processInstanceId: "called-1", elementId: "Review", activation: 1 },
    name: "Review request",
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "approved", type: "boolean" }] },
    },
  },
  hostingInstance: {
    processInstanceId: "host-1",
    definition: {
      processId: "Review_Process",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "review.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "metadata-profile",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  claimGeneration: 0,
  claim: null,
  claimableByCurrentActor: true,
};

test("renders one global task inbox through TanStack Query and native table semantics", () => {
  const client = new QueryClient();
  client.setQueryData(["work", "tasks"], { tasks: [task] });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, {
    client,
    children: createElement(WorkInboxPanel, {
      api: inertApi(),
      createActionId: () => "action-1",
    }),
  }));

  assert.match(html, />Tasks</u);
  assert.match(html, /<table[^>]*aria-label="Current tasks"/u);
  assert.match(html, /Review request/u);
  assert.match(html, /Review_Process/u);
  assert.match(html, /reviewers/u);
  assert.match(html, />Claim</u);
  assert.doesNotMatch(html, /workflow|run id|task queue|event history/iu);
});

test("reflows the five-column task row without horizontal scrolling", () => {
  const client = new QueryClient();
  client.setQueryData(["work", "tasks"], { tasks: [task] });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, {
    client,
    children: createElement(WorkInboxPanel, {
      api: inertApi(),
      createActionId: () => "action-1",
    }),
  }));

  for (const label of ["Task", "Process", "Candidate group", "Claim", "Action"]) {
    assert.match(html, new RegExp(`data-label="${label}"`, "u"));
  }
  assert.doesNotMatch(stylesSource, /:global\(/u);
  assert.doesNotMatch(stylesSource, /overflow-x:\s*(?:auto|scroll)/u);
});

test("renders a selected task as a full content workspace without the inbox table", () => {
  const detail = claimedBooleanDetail();
  const html = renderToStaticMarkup(createElement(WorkTaskDetailWorkspace, {
    completionView: { kind: WorkCompletionViewKind.Idle },
    detail,
    onBack: () => undefined,
    onComplete: () => undefined,
    onRetry: () => undefined,
    task: detail.workTask,
  }));

  assert.match(html, /Back to tasks</u);
  assert.match(html, /Review request/u);
  assert.match(html, /aria-label="Task detail views"[^>]*role="tablist"/u);
  assert.match(html, /aria-selected="true"[^>]*role="tab"[^>]*>Form</u);
  assert.match(html, /role="tab"[^>]*>Details</u);
  assert.match(html, /Complete task/u);
  assert.doesNotMatch(html, /<table/u);
});

test("keeps the selected task inside the named Tasks workspace region", () => {
  assert.match(
    workInboxSource,
    /<section className=\{styles\.panel\} aria-label="Tasks">/u,
  );
});

test("renders Boolean as an explicit true-false choice and string as text without coercion", () => {
  const booleanDetail: PublicTaskDetail = {
    workTask: { ...task, claim: { actorId: "demo-user", generation: 1 } },
    form: { fields: [{
      key: "approved",
      type: "boolean",
      currentValue: { kind: "boolean", value: false },
      compatibility: "compatible",
    }] },
  };
  const stringDetail: PublicTaskDetail = {
    ...booleanDetail,
    form: { fields: [{
      key: "decision",
      type: "string",
      currentValue: { kind: "string", value: "false" },
      compatibility: "compatible",
    }] },
  };

  const booleanHtml = renderToStaticMarkup(createElement(WorkTaskForm, {
    detail: booleanDetail,
    completionView: { kind: WorkCompletionViewKind.Idle },
    onComplete: async () => undefined,
    onRetry: () => undefined,
  }));
  const stringHtml = renderToStaticMarkup(createElement(WorkTaskForm, {
    detail: stringDetail,
    completionView: { kind: WorkCompletionViewKind.Idle },
    onComplete: async () => undefined,
    onRetry: () => undefined,
  }));

  assert.equal(booleanHtml.match(/type="radio"/gu)?.length, 2);
  const falseInput = booleanHtml.match(/<input(?=[^>]*value="false")(?=[^>]*checked)[^>]*>/u);
  assert.notEqual(falseInput, null);
  assert.match(booleanHtml, />False</u);
  assert.match(booleanHtml, />True</u);
  assert.match(stringHtml, /name="decision"/u);
  assert.match(stringHtml, /value="false"/u);
  assert.deepEqual(initialFormValue(booleanDetail.form!.fields[0]), {
    kind: "boolean",
    value: false,
  });
  assert.deepEqual(initialFormValue(stringDetail.form!.fields[0]), {
    kind: "string",
    value: "false",
  });
});

test("requires a Boolean choice without defaulting absent or null to false", () => {
  for (const currentValue of [{ kind: "absent" }, { kind: "null" }] as const) {
    const detail: PublicTaskDetail = {
      workTask: { ...task, claim: { actorId: "demo-user", generation: 1 } },
      form: { fields: [{
        key: "approved",
        type: "boolean",
        currentValue,
        compatibility: "compatible",
      }] },
    };
    const html = renderToStaticMarkup(createElement(WorkTaskForm, {
      detail,
      completionView: { kind: WorkCompletionViewKind.Idle },
      onComplete: async () => undefined,
      onRetry: () => undefined,
    }));
    assert.equal(html.match(/type="radio"/gu)?.length, 2);
    assert.doesNotMatch(html, /checked/u);
    const radioInputs = html.match(/<input[^>]*type="radio"[^>]*>/gu) ?? [];
    assert.equal(radioInputs.length, 2);
    assert.equal(radioInputs.every((input) => input.includes("required")), true);
  }
});

test("renders incompatible cross-type form values as non-editable alerts", () => {
  const incompatibleFields = [{
    key: "approved",
    type: "string",
    currentValue: { kind: "boolean", value: false },
    compatibility: "incompatible",
  }, {
    key: "approved",
    type: "boolean",
    currentValue: { kind: "string", value: "false" },
    compatibility: "incompatible",
  }] as const satisfies readonly PublicFormField[];

  for (const field of incompatibleFields) {
    const html = renderToStaticMarkup(createElement(WorkTaskForm, {
      detail: {
        workTask: { ...task, claim: { actorId: "demo-user", generation: 1 } },
        form: { fields: [field] },
      },
      completionView: { kind: WorkCompletionViewKind.Indeterminate },
      onComplete: async () => undefined,
      onRetry: () => undefined,
    }));
    assert.match(
      html,
      /role="alert"[^>]*>The current value does not match the declared field type\./u,
    );
    assert.doesNotMatch(html, /<(?:form|input|textarea)\b/u);
    assert.doesNotMatch(html, /Complete task|Retry completion/u);
  }
});

test("decodes only an explicit Boolean form choice", () => {
  assert.equal(selectedBooleanFormValue("true"), true);
  assert.equal(selectedBooleanFormValue("false"), false);
  assert.throws(() => selectedBooleanFormValue(null), /Choose true or false/u);
  assert.throws(() => selectedBooleanFormValue("on"), /Choose true or false/u);
});

test("uses the complete hosting and semantic occurrence as table row identity", () => {
  assert.equal(
    workTaskRowId(task),
    JSON.stringify(["host-1", "called-1", "Review", 1]),
  );
});

test("omits the inbox table when the current actor snapshot is empty", () => {
  const client = new QueryClient();
  client.setQueryData(["work", "tasks"], { tasks: [] });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, {
    client,
    children: createElement(WorkInboxPanel, { api: inertApi() }),
  }));

  assert.match(html, /No current tasks\./u);
  assert.doesNotMatch(html, /<table/u);
});

test("falls back to the collection heading when the selected task disappears", () => {
  assert.match(
    workInboxSource,
    /taskButtonRefs\.current\.get\(taskId\) \?\? null;[\s\S]*taskButton \?\? collectionHeadingRef\.current/u,
  );
});

test("surfaces a complete task snapshot failure without hidden query retries", () => {
  assert.match(
    workInboxSource,
    /queryFn: \(\) => api\.listTasks\(\),[\s\S]*refetchInterval: 5_000,[\s\S]*retry: false,/u,
  );
});

test("retains one immutable action and byte-equivalent request after transport failure", async () => {
  const detail = claimedBooleanDetail();
  let minted = 0;
  const operation = createRetainedCompletionOperation(
    detail,
    { kind: "boolean", value: true },
    () => `completion-${++minted}`,
  );
  const calls: Readonly<{ actionId: string; requestJson: string }>[] = [];
  const api = {
    complete: async (actionId: string, request: WorkCompletionRequest) => {
      calls.push({ actionId, requestJson: JSON.stringify(request) });
      if (calls.length === 1) throw new Error("response lost after capture");
      return committedResult(actionId);
    },
  };

  await assert.rejects(
    submitRetainedCompletionOperation(api, operation),
    /response lost after capture/u,
  );
  assert.deepEqual(
    await submitRetainedCompletionOperation(api, operation),
    committedResult(operation.actionId),
  );
  assert.equal(minted, 1);
  assert.deepEqual(calls, [calls[0], calls[0]]);
  assert.equal(Object.isFrozen(operation), true);
  assert.equal(Object.isFrozen(operation.request), true);
  assert.equal(Object.isFrozen(operation.request.submittedValues), true);
});

test("keeps indeterminate detail controlled and retries the exact retained operation", async () => {
  const detail = claimedBooleanDetail();
  const operation = createRetainedCompletionOperation(
    detail,
    { kind: "boolean", value: true },
    () => "completion-indeterminate",
  );
  const indeterminate = {
    state: "indeterminate",
    actionId: operation.actionId,
    taskId: task.task.id,
  } as const satisfies WorkCompletionResult;
  const resolution = resolveCompletionResult(operation, indeterminate);
  const calls: string[] = [];
  const api = {
    complete: async (actionId: string, request: WorkCompletionRequest) => {
      calls.push(`${actionId}:${JSON.stringify(request)}`);
      return calls.length === 1 ? indeterminate : committedResult(actionId);
    },
  };

  assert.equal(resolution.operation, operation);
  assert.equal(resolution.closeDetail, false);
  assert.equal(resolution.view.kind, WorkCompletionViewKind.Indeterminate);
  await submitRetainedCompletionOperation(api, operation);
  await submitRetainedCompletionOperation(api, resolution.operation!);
  assert.deepEqual(calls, [calls[0], calls[0]]);

  const html = renderToStaticMarkup(createElement(WorkTaskForm, {
    detail,
    completionView: resolution.view,
    onComplete: async () => undefined,
    onRetry: () => undefined,
  }));
  assert.match(html, /Completion is indeterminate/u);
  assert.match(html, />Retry completion</u);
  assert.match(html, /Review request|approved/u);
});

test("clears a committed operation and closes detail while rendering rejection honestly", () => {
  const detail = claimedBooleanDetail();
  const operation = createRetainedCompletionOperation(
    detail,
    { kind: "boolean", value: true },
    () => "completion-terminal",
  );
  const committed = resolveCompletionResult(
    operation,
    committedResult(operation.actionId),
  );
  assert.equal(committed.operation, null);
  assert.equal(committed.closeDetail, true);

  for (const engineResult of [
    { kind: "semantic", outcome: "rolledBack" },
    { kind: "processClosed" },
  ] as const) {
    const rejectedResult = {
      state: "rejected",
      actionId: operation.actionId,
      taskId: task.task.id,
      engineResult,
    } as const satisfies WorkCompletionResult;
    const rejected = resolveCompletionResult(operation, rejectedResult);
    assert.equal(rejected.operation, null);
    assert.equal(rejected.closeDetail, false);
    const html = renderToStaticMarkup(createElement(WorkTaskForm, {
      detail,
      completionView: rejected.view,
      onComplete: async () => undefined,
      onRetry: () => undefined,
    }));
    assert.match(html, /Completion was rejected/u);
    assert.doesNotMatch(html, /Completion committed/u);
  }
});

function inertApi() {
  return {
    listTasks: async () => ({ tasks: [] }),
    getTask: async () => ({ workTask: task, form: null }),
    claim: async () => ({ taskId: task.task.id, claim: { actorId: "demo-user", generation: 1 } }),
    release: async () => ({ taskId: task.task.id, claimGeneration: 2, released: true as const }),
    complete: async () => ({ state: "committed" as const, actionId: "complete-1", taskId: task.task.id }),
  };
}

function claimedBooleanDetail(): PublicTaskDetail {
  return {
    workTask: { ...task, claim: { actorId: "demo-user", generation: 1 } },
    form: { fields: [{
      key: "approved",
      type: "boolean",
      currentValue: { kind: "absent" },
      compatibility: "compatible",
    }] },
  };
}

function committedResult(actionId: string): WorkCompletionResult {
  return { state: "committed", actionId, taskId: task.task.id };
}
