/**
 * Strict Product 2 decoding of the published Activity data-input collection.
 *
 * The platform copies the engine's publication contract instead of importing it, so the copy is only
 * faithful while a test binds it to the shape the engine actually publishes. This one fixes the
 * optional `inputs` collection on an open User Task: present exactly for a task whose program fills
 * an Activity data interface, carrying exactly one binding named by its BPMN DataInput id.
 *
 * The oracle is the published document itself, decoded unchanged. The discriminator that matters is
 * that the fixture's Process-level variables disagree with the published binding in both name and
 * value, so a platform that reconstructed the collection from observed Process data rather than
 * reading the published field cannot reproduce it. Absence is load-bearing in the other direction:
 * every other family publishes no `inputs` key at all, and a decoder that required one would refuse
 * every publication this platform already accepts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeExecutionPublicationPage } from "@bpmn-lean/platform-contracts";

import {
  executionPublicationPage,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

const reviewTaskId = {
  processInstanceId: publicationIdentity.processInstanceId,
  elementId: "UserTask_Review",
  activation: 1,
};

/** The Activity-local copy, named by its DataInput id and absent from every Process variable. */
const publishedInput = {
  name: "DataInput_ReviewContext",
  value: { kind: "string", value: "invoice-4711" },
};

function withOpenTask(task: object): unknown {
  const page = executionPublicationPage();
  return {
    ...page,
    current: {
      ...page.current,
      state: {
        ...page.current?.state,
        openUserTasks: [task],
        enabledInteractions: [
          { kind: "completeUserTaskInstance", taskId: reviewTaskId },
        ],
      },
    },
  };
}

function decodePage(page: unknown) {
  return decodeExecutionPublicationPage(page, {
    ...publicationIdentity,
    afterRevision: 0,
  });
}

function decodeInputs(inputs: unknown) {
  return decodePage(withOpenTask({
    id: reviewTaskId,
    name: "Review invoice",
    state: "active",
    inputs,
  }));
}

test("decodes the published input collection unchanged, with and without metadata", () => {
  const withoutMetadata = decodeInputs([publishedInput]);
  assert.deepEqual(
    withoutMetadata.current?.state.openUserTasks[0]?.inputs,
    [publishedInput],
  );

  // No observed Process variable carries that name, so the decoded collection cannot have been
  // derived from `variables`; it can only have been read from the published task.
  assert.deepEqual(
    withoutMetadata.current?.state.variables.filter(
      (binding) => binding.name === publishedInput.name,
    ),
    [],
  );

  const withMetadata = decodePage(withOpenTask({
    id: reviewTaskId,
    name: "Review invoice",
    state: "active",
    metadata: { assignment: { candidates: [{ kind: "group", id: "reviewers" }] } },
    inputs: [publishedInput],
  }));
  assert.deepEqual(
    withMetadata.current?.state.openUserTasks[0]?.inputs,
    [publishedInput],
  );
});

test("keeps the input collection optional for every other family", () => {
  const decoded = decodePage(withOpenTask({
    id: reviewTaskId,
    name: "Review invoice",
    state: "active",
  }));

  assert.equal(decoded.current?.state.openUserTasks[0]?.inputs, undefined);
});

test("rejects an input collection that is not exactly one well-formed binding", () => {
  for (const malformed of [
    [],
    [publishedInput, { name: "DataInput_Other", value: { kind: "null" } }],
    {},
    null,
    [{ name: "", value: { kind: "string", value: "invoice-4711" } }],
    [{ name: publishedInput.name, value: { kind: "unknownKind", value: 1 } }],
    [{ name: publishedInput.name, value: publishedInput.value, extra: null }],
    [{ name: publishedInput.name }],
  ]) {
    assert.throws(() => decodeInputs(malformed), TypeError, JSON.stringify(malformed));
  }
});
