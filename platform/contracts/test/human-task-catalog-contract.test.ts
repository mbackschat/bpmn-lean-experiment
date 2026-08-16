import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeHumanTaskCatalogV1,
  decodeStructuredFormDefinitionV1,
} from "@bpmn-lean/platform-contracts";

const form = {
  schemaVersion: "bpmn-lean-structured-form/v1",
  fields: [
    {
      key: "summary",
      label: "Summary",
      helpText: null,
      defaultValue: "ready",
      visibleForActions: "all",
      requiredForActions: ["approve"],
      kind: "text",
      multiline: false,
      minLength: 1,
      maxLength: 20,
    },
    {
      key: "confirmed",
      label: "Confirmed",
      helpText: "Confirm the review",
      defaultValue: true,
      visibleForActions: "all",
      requiredForActions: [],
      kind: "boolean",
    },
    {
      key: "amount",
      label: "Amount",
      helpText: null,
      defaultValue: 10,
      visibleForActions: ["approve"],
      requiredForActions: [],
      kind: "integer",
      minimum: 0,
      maximum: 100,
    },
    {
      key: "reviewDate",
      label: "Review date",
      helpText: null,
      defaultValue: "2024-02-29",
      visibleForActions: "all",
      requiredForActions: [],
      kind: "date",
    },
    {
      key: "department",
      label: "Department",
      helpText: null,
      defaultValue: "ops",
      visibleForActions: "all",
      requiredForActions: [],
      kind: "singleChoice",
      options: [
        { value: "ops", label: "Operations" },
        { value: "sales", label: "Sales" },
      ],
    },
    {
      key: "flags",
      label: "Flags",
      helpText: null,
      defaultValue: ["urgent", "receipt"],
      visibleForActions: ["approve", "abort"],
      requiredForActions: ["abort"],
      kind: "multipleChoice",
      options: [
        { value: "urgent", label: "Urgent" },
        { value: "receipt", label: "Missing receipt" },
      ],
      maxItems: 2,
    },
  ],
  actions: [
    { id: "approve", label: "Approve", intent: "primary", resolutionValue: "approved" },
    { id: "abort", label: "Abort", intent: "destructive", resolutionValue: "aborted" },
  ],
  resolutionVariable: "resolution",
} as const;

function catalog() {
  return {
    schemaVersion: "bpmn-lean-human-task-catalog/v1",
    processId: "ReviewProcess",
    semanticProfile: "structured-human-work",
    sourceSha256: "a".repeat(64),
    tasks: [{
      elementId: "ReviewTask",
      description: "Review the request exactly as submitted.",
      worklistPriority: 50,
      form,
    }],
  };
}

test("decodes every V1 field variant without normalization and returns detached immutable values", () => {
  const input = structuredClone(catalog());
  const decoded = decodeHumanTaskCatalogV1(input);

  assert.deepEqual(decoded, catalog());
  assert.ok(Object.isFrozen(decoded));
  assert.ok(Object.isFrozen(decoded.tasks));
  assert.ok(Object.isFrozen(decoded.tasks[0]?.form.fields));
  assert.ok(Object.isFrozen(decoded.tasks[0]?.form.fields[5]?.defaultValue));
  Reflect.set(input.tasks[0]!, "description", "changed");
  Reflect.set(input.tasks[0]!.form.fields[0]!, "label", "changed");
  assert.equal(decoded.tasks[0]?.description, "Review the request exactly as submitted.");
  assert.equal(decoded.tasks[0]?.form.fields[0]?.label, "Summary");
});

test("rejects unknown keys, duplicate identities, bad references, and colliding resolution bindings", () => {
  const mutations = [
    { ...catalog(), privateValue: true },
    { ...catalog(), tasks: [catalog().tasks[0], catalog().tasks[0]] },
    { ...form, fields: [form.fields[0], form.fields[0]] },
    { ...form, actions: [form.actions[0], { ...form.actions[1], id: "approve" }] },
    { ...form, actions: [form.actions[0], { ...form.actions[1], resolutionValue: "approved" }] },
    { ...form, fields: [{ ...form.fields[0], requiredForActions: ["unknown"] }, ...form.fields.slice(1)] },
    { ...form, fields: [{ ...form.fields[0], visibleForActions: ["abort"], requiredForActions: ["approve"] }, ...form.fields.slice(1)] },
    { ...form, fields: [{ ...form.fields[0], key: "resolution" }, ...form.fields.slice(1)] },
  ];

  assert.throws(() => decodeHumanTaskCatalogV1(mutations[0]));
  assert.throws(() => decodeHumanTaskCatalogV1(mutations[1]));
  for (const mutation of mutations.slice(2)) {
    assert.throws(() => decodeStructuredFormDefinitionV1(mutation));
  }
});

test("enforces text, calendar, integer, option, default, maxItems, and aggregate ceilings", () => {
  const mutations = [
    { ...form, fields: [{ ...form.fields[0], minLength: 3, maxLength: 2 }, ...form.fields.slice(1)] },
    { ...form, fields: [{ ...form.fields[0], defaultValue: "" }, ...form.fields.slice(1)] },
    { ...form, fields: [...form.fields.slice(0, 3), { ...form.fields[3], defaultValue: "2023-02-29" }, ...form.fields.slice(4)] },
    { ...form, fields: [...form.fields.slice(0, 2), { ...form.fields[2], minimum: 20, maximum: 10 }, ...form.fields.slice(3)] },
    { ...form, fields: [...form.fields.slice(0, 2), { ...form.fields[2], defaultValue: 101 }, ...form.fields.slice(3)] },
    { ...form, fields: [...form.fields.slice(0, 4), { ...form.fields[4], defaultValue: "unknown" }, form.fields[5]] },
    { ...form, fields: [...form.fields.slice(0, 5), { ...form.fields[5], defaultValue: ["receipt", "urgent"] }] },
    { ...form, fields: [...form.fields.slice(0, 5), { ...form.fields[5], defaultValue: ["urgent", "urgent"] }] },
    { ...form, fields: [...form.fields.slice(0, 5), { ...form.fields[5], maxItems: 3 }] },
    { ...form, fields: [...form.fields.slice(0, 4), { ...form.fields[4], options: [{ value: "ops", label: "Operations" }, { value: "ops", label: "Again" }] }, form.fields[5]] },
  ];

  for (const mutation of mutations) {
    assert.throws(() => decodeStructuredFormDefinitionV1(mutation));
  }
  assert.throws(() => decodeStructuredFormDefinitionV1({
    ...form,
    fields: [{
      ...form.fields[0],
      key: "x".repeat(257),
    }],
  }));
  assert.throws(() => decodeStructuredFormDefinitionV1({
    ...form,
    fields: Array.from({ length: 33 }, (_, index) => ({
      ...form.fields[0],
      key: `field-${index}`,
    })),
  }));
});

test("accepts leap-century dates and rejects negative zero and unsafe integers", () => {
  const leap = {
    ...form,
    fields: [...form.fields.slice(0, 3), { ...form.fields[3], defaultValue: "2000-02-29" }, ...form.fields.slice(4)],
  };
  assert.equal(decodeStructuredFormDefinitionV1(leap).fields[3]?.defaultValue, "2000-02-29");
  for (const defaultValue of [-0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => decodeStructuredFormDefinitionV1({
      ...form,
      fields: [...form.fields.slice(0, 2), { ...form.fields[2], defaultValue }, ...form.fields.slice(3)],
    }));
  }
});

test("enforces aggregate option and complete canonical catalog ceilings", () => {
  const tooManyOptions = {
    ...form,
    fields: Array.from({ length: 5 }, (_, fieldIndex) => ({
      ...form.fields[4],
      key: `choice-${fieldIndex}`,
      options: Array.from({ length: 64 }, (_, optionIndex) => ({
        value: `value-${fieldIndex}-${optionIndex}`,
        label: `Option ${fieldIndex}-${optionIndex}`,
      })),
      defaultValue: null,
    })),
  };
  assert.throws(() => decodeStructuredFormDefinitionV1(tooManyOptions));

  const largeForm = {
    ...form,
    fields: [{
      ...form.fields[1],
      key: "large-field",
      helpText: "x".repeat(4_096),
    }],
  };
  const oversizedCatalog = {
    ...catalog(),
    tasks: Array.from({ length: 128 }, (_, index) => ({
      elementId: `task-${index}`,
      description: "d".repeat(4_096),
      worklistPriority: 50,
      form: largeForm,
    })),
  };
  assert.throws(
    () => decodeHumanTaskCatalogV1(oversizedCatalog),
    /byte ceiling/u,
  );
});
