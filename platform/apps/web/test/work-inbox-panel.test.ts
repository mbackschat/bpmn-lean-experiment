import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
} from "@bpmn-lean/platform-contracts";

import type {
  WorkInboxPanelProps,
  WorkTaskFormProps,
} from "../src/work-inbox-panel.tsx";

const source = await readFile(
  new URL("../src/work-inbox-panel.tsx", import.meta.url),
  "utf8",
);
const transformed = await transformWithEsbuild(source, "work-inbox-panel.tsx", {
  format: "esm",
  jsx: "automatic",
  loader: "tsx",
});
const dependencies = [
  "react/jsx-runtime",
  "react",
  "@tanstack/react-query",
  "@bpmn-lean/platform-ui-kit",
] as const;
let runnable = transformed.code.replace(
  /import styles from "\.\/work-inbox\.module\.css";/u,
  "const styles = new Proxy({}, { get: (_target, key) => String(key) });",
);
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(
    JSON.stringify(dependency),
    JSON.stringify(import.meta.resolve(dependency)),
  );
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  WorkInboxPanel: ComponentType<WorkInboxPanelProps>;
  WorkTaskForm: ComponentType<WorkTaskFormProps>;
  initialFormValue: (field: PublicFormField) => PublicFormValue;
  selectedBooleanFormValue: (value: FormDataEntryValue | null) => boolean;
  workTaskRowId: (task: PublicWorkTask) => string;
}>;
const {
  WorkInboxPanel,
  WorkTaskForm,
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

  assert.match(html, /Human work/u);
  assert.match(html, /<table[^>]*aria-label="Current tasks"/u);
  assert.match(html, /Review request/u);
  assert.match(html, /Review_Process/u);
  assert.match(html, /reviewers/u);
  assert.match(html, />Claim</u);
  assert.doesNotMatch(html, /workflow|run id|task queue|event history/iu);
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
    pending: false,
    onComplete: async () => undefined,
  }));
  const stringHtml = renderToStaticMarkup(createElement(WorkTaskForm, {
    detail: stringDetail,
    pending: false,
    onComplete: async () => undefined,
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
      pending: false,
      onComplete: async () => undefined,
    }));
    assert.equal(html.match(/type="radio"/gu)?.length, 2);
    assert.doesNotMatch(html, /checked/u);
    const radioInputs = html.match(/<input[^>]*type="radio"[^>]*>/gu) ?? [];
    assert.equal(radioInputs.length, 2);
    assert.equal(radioInputs.every((input) => input.includes("required")), true);
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

function inertApi() {
  return {
    listTasks: async () => ({ tasks: [] }),
    getTask: async () => ({ workTask: task, form: null }),
    claim: async () => ({ taskId: task.task.id, claim: { actorId: "demo-user", generation: 1 } }),
    release: async () => ({ taskId: task.task.id, claimGeneration: 2, released: true as const }),
    complete: async () => ({ state: "committed" as const, actionId: "complete-1", taskId: task.task.id }),
  };
}
