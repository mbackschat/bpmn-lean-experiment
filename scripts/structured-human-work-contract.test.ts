import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { SchemaObject } from "ajv/dist/2020.js";

import {
  verifyScenarioVariableValueContract,
} from "./contract-artifacts.ts";
import {
  projectCibUserTaskMetadata,
  structuredHumanWorkProfileId,
} from "./contract-cib-user-task-metadata-projection.ts";

const structuredProfile =
  "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";

async function schemaDefinition(
  schemaName: string,
  definition: string,
): Promise<SchemaObject> {
  const schema = JSON.parse(await readFile(
    new URL(`../contracts/schemas/${schemaName}`, import.meta.url),
    "utf8",
  )) as { readonly $defs: Readonly<Record<string, unknown>> };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  } as SchemaObject;
}

function validateDefinition(definition: SchemaObject, value: unknown): boolean {
  return new Ajv2020({ strict: true }).compile(definition)(value);
}

function completionScenario(
  submittedValues: ReadonlyArray<unknown>,
  profile = structuredProfile,
): unknown {
  return {
    profile,
    stimuli: [{
      kind: "completeUserTaskInstance",
      submittedValues,
    }],
  };
}

function binding(name: string, value: unknown): unknown {
  return { name, value };
}

test("adds exact integer and ordered string-list arms to the generic value schema", async () => {
  const variableValue = await schemaDefinition(
    "scenario.schema.json",
    "variableValue",
  );
  for (const value of [
    { kind: "integer", value: 0 },
    { kind: "integer", value: Number.MAX_SAFE_INTEGER },
    { kind: "stringList", value: ["duplicate", "duplicate", "policy"] },
  ]) {
    assert.equal(validateDefinition(variableValue, value), true);
  }
  for (const value of [
    { kind: "integer", value: -1 },
    { kind: "integer", value: 1.5 },
    { kind: "integer", value: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "stringList", value: Array.from({ length: 33 }, () => "x") },
    { kind: "stringList", value: ["x".repeat(1025)] },
  ]) {
    assert.equal(validateDefinition(variableValue, value), false);
  }
});

test("keeps assignment-only metadata closed beside byte-identical legacy metadata", async () => {
  const assignment = {
    candidates: [{ kind: "group", id: "reviewers" }],
  };
  const legacy = {
    assignment,
    form: { fields: [{ key: "approved", type: "boolean" }] },
  };
  const assignmentOnly = { assignment };
  for (const schemaName of [
    "scenario.schema.json",
    "checked-process.schema.json",
    "semantic-process.schema.json",
  ]) {
    const metadata = await schemaDefinition(schemaName, "userTaskMetadata");
    assert.equal(validateDefinition(metadata, legacy), true, schemaName);
    assert.equal(
      validateDefinition(metadata, assignmentOnly),
      true,
      schemaName,
    );
    for (const invalid of [
      {},
      { form: legacy.form },
      { assignment, unexpected: true },
      { assignment, form: legacy.form, unexpected: true },
    ]) {
      assert.equal(validateDefinition(metadata, invalid), false, schemaName);
    }
  }
});

test("projects only the exact assignment-only CIB prefix facts", () => {
  const task = {
    elementId: "ReviewException",
    name: "Review exception",
    identityLinks: [{
      type: "candidate",
      userId: null,
      groupId: "reviewers",
    }],
    formFields: [],
  } as const;
  assert.deepEqual(
    projectCibUserTaskMetadata(structuredHumanWorkProfileId, task),
    { assignment: { candidates: [{ kind: "group", id: "reviewers" }] } },
  );
  assert.throws(
    () => projectCibUserTaskMetadata(structuredHumanWorkProfileId, {
      ...task,
      formFields: [{ id: "forbidden", typeName: "string" }],
    }),
    /zero form fields/u,
  );
});

test("semantic stimulus validation rejects negative zero and new values on every wrong surface or profile", () => {
  assert.throws(
    () => verifyScenarioVariableValueContract(completionScenario([
      binding("amount", { kind: "integer", value: -0 }),
    ]) as never),
    /negative zero/u,
  );
  for (const value of [
    { kind: "integer", value: 1 },
    { kind: "stringList", value: ["policy"] },
  ]) {
    assert.throws(
      () => verifyScenarioVariableValueContract(completionScenario([
        binding("value", value),
      ], "cibseven-2.2.0-user-task-boolean-completion-data-draft") as never),
      /only admitted for structured Human Work completion/u,
    );
    assert.throws(
      () => verifyScenarioVariableValueContract({
        profile: structuredProfile,
        stimuli: [{
          kind: "startProcess",
          initialVariables: [binding("value", value)],
        }],
      } as never),
      /only admitted for structured Human Work completion/u,
    );
    assert.throws(
      () => verifyScenarioVariableValueContract({
        profile: structuredProfile,
        stimuli: [{
          kind: "completeEffect",
          result: { kind: "success", localPatch: [binding("value", value)] },
        }],
      } as never),
      /only admitted for structured Human Work completion/u,
    );
  }
});

test("enforces every generic string-list, value, binding, and patch ceiling", () => {
  const rejects = [
    [binding("items", {
      kind: "stringList",
      value: Array.from({ length: 33 }, () => "x"),
    })],
    [binding("items", {
      kind: "stringList",
      value: ["é".repeat(513)],
    })],
    [binding("items", {
      kind: "stringList",
      value: Array.from({ length: 17 }, () => "x".repeat(1000)),
    })],
    [binding("n".repeat(6000), {
      kind: "stringList",
      value: Array.from({ length: 15 }, () => "x".repeat(1000)),
    })],
    Array.from({ length: 5 }, (_, index) => binding(`v${index}`, {
      kind: "stringList",
      value: Array.from({ length: 15 }, () => "x".repeat(1000)),
    })),
  ];
  const messages = [
    /at most 32 members/u,
    /member exceeds 1024 UTF-8 bytes/u,
    /tagged value exceeds 16384 UTF-8 bytes/u,
    /binding exceeds 20480 UTF-8 bytes/u,
    /patch exceeds 65536 UTF-8 bytes/u,
  ];
  rejects.forEach((submittedValues, index) => {
    const message = messages[index];
    assert.ok(message);
    assert.throws(
      () => verifyScenarioVariableValueContract(
        completionScenario(submittedValues) as never,
      ),
      message,
    );
  });

  assert.doesNotThrow(() => verifyScenarioVariableValueContract(
    completionScenario([
      binding("amount", { kind: "integer", value: 91 }),
      binding("flags", {
        kind: "stringList",
        value: ["duplicate", "duplicate", "policy"],
      }),
    ]) as never,
  ));
});
