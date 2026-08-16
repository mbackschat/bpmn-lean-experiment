import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type {
  FormValidationIssue,
  PublicStructuredTaskFormV1,
} from "@bpmn-lean/platform-contracts";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

const dependencies = [
  "react/jsx-runtime",
  "react",
  "@bpmn-lean/platform-ui-kit",
] as const;
const built = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    minify: false,
    ssr: fileURLToPath(new URL("../src/structured-work-form.tsx", import.meta.url)),
    target: "esnext",
    write: false,
    rollupOptions: {
      external: (id) => dependencies.includes(id as typeof dependencies[number]),
    },
  },
});
if (Array.isArray(built) || !("output" in built)) {
  throw new Error("Unexpected structured Work form build result.");
}
const chunk = built.output.find((entry) => entry.type === "chunk");
if (chunk === undefined) throw new Error("Structured Work form test bundle is missing.");
let runnable = chunk.code;
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(`'${dependency}'`, JSON.stringify(import.meta.resolve(dependency)));
  runnable = runnable.replaceAll(`"${dependency}"`, JSON.stringify(import.meta.resolve(dependency)));
}
const module = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  StructuredWorkForm: ComponentType<Readonly<{
    form: PublicStructuredTaskFormV1;
    isDisabled?: boolean;
    issues: readonly FormValidationIssue[];
    onSubmit: (submission: Readonly<{
      resolutionActionId: string;
      fields: Readonly<Record<string, unknown>>;
    }>) => void;
  }>>;
  initialStructuredFormDraft: (
    form: PublicStructuredTaskFormV1,
  ) => Readonly<Record<string, unknown>>;
  prepareStructuredFormSubmission: (
    form: PublicStructuredTaskFormV1,
    resolutionActionId: string,
    draft: Readonly<Record<string, unknown>>,
  ) =>
    | Readonly<{
        kind: "accepted";
        submission: Readonly<{
          resolutionActionId: string;
          fields: Readonly<Record<string, unknown>>;
        }>;
      }>
    | Readonly<{ kind: "rejected"; issues: readonly FormValidationIssue[] }>;
  structuredFormStateKey: (form: PublicStructuredTaskFormV1) => string;
  visibleStructuredFields: (
    form: PublicStructuredTaskFormV1,
    resolutionActionId: string,
  ) => PublicStructuredTaskFormV1["taskDefinition"]["form"]["fields"];
}>;

const form = structuredForm();

test("uses current values before defaults without collapsing Boolean false", () => {
  const draft = module.initialStructuredFormDraft(form);

  assert.equal(draft.notifySubmitter, false);
  assert.deepEqual(draft.riskFlags, []);
  assert.equal(draft.approvedAmount, null);
});

test("reveals and requires resolution reason only for the matching action", () => {
  assert.deepEqual(
    module.visibleStructuredFields(form, "approve").map(({ key }) => key),
    ["requestReference", "expenseDate", "approvedAmount", "costCenter", "riskFlags", "notifySubmitter"],
  );
  assert.deepEqual(
    module.visibleStructuredFields(form, "abort").map(({ key }) => key),
    ["requestReference", "expenseDate", "costCenter", "riskFlags", "notifySubmitter", "resolutionReason"],
  );

  const rejected = module.prepareStructuredFormSubmission(form, "abort", {
    ...module.initialStructuredFormDraft(form),
    requestReference: "EXP-17",
    expenseDate: "2026-08-16",
    resolutionReason: null,
  });
  assert.equal(rejected.kind, "rejected");
  if (rejected.kind === "rejected") {
    assert.deepEqual(rejected.issues, [{
      code: "requiredFieldNull",
      target: { kind: "field", key: "resolutionReason" },
    }]);
  }
});

test("canonicalizes multiple-choice selections into catalog order and preserves empty arrays", () => {
  const accepted = module.prepareStructuredFormSubmission(form, "approve", {
    ...module.initialStructuredFormDraft(form),
    requestReference: "EXP-17",
    expenseDate: "2026-08-16",
    costCenter: "engineering",
    riskFlags: ["receipt", "duplicate"],
  });
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind === "accepted") {
    assert.deepEqual(accepted.submission.fields.riskFlags, ["duplicate", "receipt"]);
  }

  const empty = module.prepareStructuredFormSubmission(form, "approve", {
    ...module.initialStructuredFormDraft(form),
    requestReference: "EXP-17",
    expenseDate: "2026-08-16",
    costCenter: "engineering",
    riskFlags: [],
  });
  assert.equal(empty.kind, "accepted");
  if (empty.kind === "accepted") assert.deepEqual(empty.submission.fields.riskFlags, []);
});

test("renders every field kind and ordered action without leaking server details", () => {
  const html = renderToStaticMarkup(createElement(module.StructuredWorkForm, {
    form,
    issues: [{ code: "requiredFieldMissing", target: { kind: "field", key: "requestReference" } }],
    onSubmit: () => undefined,
  }));

  for (const label of [
    "Request reference",
    "Expense date",
    "Approved amount",
    "Cost center",
    "Risk flags",
    "Notify submitter",
  ]) {
    assert.match(html, new RegExp(label, "u"));
  }
  assert.match(html, /Approve/u);
  assert.match(html, /Request changes/u);
  assert.match(html, /Abort/u);
  assert.match(html, /data-validation-target="requestReference"/u);
  assert.doesNotMatch(html, /zod|stack|workflow|task queue|event history/iu);
});

test("changes the state key when exact task or catalog identity changes", () => {
  const key = module.structuredFormStateKey(form);
  assert.notEqual(key, module.structuredFormStateKey({
    ...form,
    taskDefinition: { ...form.taskDefinition, elementId: "OtherTask" },
  }));
  assert.notEqual(key, module.structuredFormStateKey({
    ...form,
    catalogIdentity: { ...form.catalogIdentity, sourceSha256: "b".repeat(64) },
  }));
});

function structuredForm(): PublicStructuredTaskFormV1 {
  return {
    schemaVersion: "bpmn-lean-structured-task-form/v1",
    catalogIdentity: {
      processId: "Process_ExpenseExceptionReview",
      version: 1,
      sourceSha256: "a".repeat(64),
      semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
    },
    taskDefinition: {
      elementId: "ReviewException",
      description: "Review the expense exception and choose a resolution.",
      worklistPriority: 80,
      form: {
        schemaVersion: "bpmn-lean-structured-form/v1",
        resolutionVariable: "resolution",
        fields: [
          text("requestReference", "Request reference", "all", ["approve", "request-changes", "abort"], false),
          { ...base("date", "expenseDate", "Expense date", "all", ["approve", "request-changes", "abort"]), defaultValue: null },
          { ...base("integer", "approvedAmount", "Approved amount", ["approve"], []), helpText: "Whole currency units", defaultValue: null, minimum: 0, maximum: 1_000_000 },
          { ...base("singleChoice", "costCenter", "Cost center", "all", ["approve", "request-changes"]), defaultValue: null, options: [{ value: "engineering", label: "Engineering" }, { value: "sales", label: "Sales" }] },
          { ...base("multipleChoice", "riskFlags", "Risk flags", "all", []), defaultValue: [], options: [{ value: "duplicate", label: "Possible duplicate" }, { value: "policy", label: "Policy exception" }, { value: "receipt", label: "Missing receipt" }], maxItems: 3 },
          { ...base("boolean", "notifySubmitter", "Notify submitter", "all", []), defaultValue: true },
          text("resolutionReason", "Resolution reason", ["request-changes", "abort"], ["request-changes", "abort"], true),
        ],
        actions: [
          { id: "approve", label: "Approve", intent: "primary", resolutionValue: "approved" },
          { id: "request-changes", label: "Request changes", intent: "neutral", resolutionValue: "changes-requested" },
          { id: "abort", label: "Abort", intent: "destructive", resolutionValue: "aborted" },
        ],
      },
    },
    fields: [
      current("requestReference", { kind: "absent" }),
      current("expenseDate", { kind: "absent" }),
      current("approvedAmount", { kind: "null" }),
      current("costCenter", { kind: "absent" }),
      current("riskFlags", { kind: "absent" }),
      current("notifySubmitter", { kind: "boolean", value: false }),
      current("resolutionReason", { kind: "absent" }),
    ],
  };
}

function base<
  const Kind extends "boolean" | "integer" | "date" | "singleChoice" | "multipleChoice",
>(
  kind: Kind,
  key: string,
  label: string,
  visibleForActions: "all" | string[],
  requiredForActions: string[],
) {
  return { kind, key, label, helpText: null, visibleForActions, requiredForActions } as const;
}

function text(
  key: string,
  label: string,
  visibleForActions: "all" | string[],
  requiredForActions: string[],
  multiline: boolean,
) {
  return {
    kind: "text" as const,
    key,
    label,
    helpText: null,
    defaultValue: null,
    visibleForActions,
    requiredForActions,
    multiline,
    minLength: 1,
    maxLength: 2048,
  };
}

function current(
  key: string,
  currentValue: PublicStructuredTaskFormV1["fields"][number]["currentValue"],
) {
  return { key, currentValue, compatibility: "compatible" as const };
}
