/** Exact source admission and checked-to-IL binding for passive User Task metadata. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  lowerCheckedProcess,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
  userTaskMetadataBindingValid,
} from "@bpmn-lean/bpmn-source";
import type { AcceptedBpmnCompilation } from "@bpmn-lean/bpmn-source";
import {
  BoundaryInterruption,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import type { DeepMutable } from "../../../scripts/contract-artifact-test-fixtures.ts";

const profile = SemanticProfileId.UserTaskAssignmentFormMetadata;
const fixtureUrl = new URL(
  "./fixtures/user-task-assignment-form-metadata.bpmn",
  import.meta.url,
);

test("admits alternate-prefix exact User Task metadata and binds it to IL", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const result = await compile(source, profile);
  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result.diagnostics),
  );
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const checked = result.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.UserTask,
  );
  const operation = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.deepEqual(checked, {
    kind: CheckedNodeKind.UserTask,
    id: "UserTask_Approve",
    name: "Approve",
    metadata: metadata("reviewers", "approved", "boolean"),
  });
  assert.ok(operation?.kind === SemanticOperationKind.AwaitUserTask);
  assert.deepEqual(operation.task.metadata, metadata("reviewers", "approved", "boolean"));

  const ordinaryPrefix = await compile(
    source
      .replaceAll("c7:", "camunda:")
      .replace("xmlns:c7=", "xmlns:camunda="),
    profile,
  );
  assert.equal(ordinaryPrefix.status, BpmnCompilationStatus.Accepted);
  if (ordinaryPrefix.status === BpmnCompilationStatus.Accepted) {
    assert.deepEqual(ordinaryPrefix.checkedProcess.nodes, result.checkedProcess.nodes);
    assert.deepEqual(ordinaryPrefix.semanticProcess.operations, result.semanticProcess.operations);
  }

  const locallyDeclaredPrefix = await compile(
    source
      .replace('  xmlns:c7="http://camunda.org/schema/1.0/bpmn"\n', "")
      .replace(
        '<bpmn:userTask id="UserTask_Approve"',
        '<bpmn:userTask xmlns:local="http://camunda.org/schema/1.0/bpmn" id="UserTask_Approve"',
      )
      .replaceAll("c7:", "local:"),
    profile,
  );
  assert.equal(locallyDeclaredPrefix.status, BpmnCompilationStatus.Accepted);
  if (locallyDeclaredPrefix.status === BpmnCompilationStatus.Accepted) {
    assert.deepEqual(
      locallyDeclaredPrefix.checkedProcess.nodes,
      result.checkedProcess.nodes,
    );
    assert.deepEqual(
      locallyDeclaredPrefix.semanticProcess.operations,
      result.semanticProcess.operations,
    );
  }

  for (const terminator of ["\n", "\r", "\u2028", "\u2029"]) {
    const internalTerminator = await compile(
      source.replace("reviewers", `review${terminator}team`),
      profile,
    );
    assert.equal(
      internalTerminator.status,
      BpmnCompilationStatus.Accepted,
      JSON.stringify(terminator),
    );
  }
});

test("keeps candidate, field key, and field type distinct in checked source and IL", async () => {
  const exact = await acceptedFixture();
  const source = await readFile(fixtureUrl, "utf8");
  const mutations = [
    source.replace('candidateGroups="reviewers"', 'candidateGroups="approvers"'),
    source.replace('id="approved" type=', 'id="decision" type='),
    source.replace('type="boolean"', 'type="string"'),
  ];
  for (const mutation of mutations) {
    const changed = await compile(mutation, profile);
    assert.equal(changed.status, BpmnCompilationStatus.Accepted);
    if (changed.status !== BpmnCompilationStatus.Accepted) {
      continue;
    }
    assert.notDeepEqual(changed.checkedProcess.nodes, exact.checkedProcess.nodes);
    assert.notDeepEqual(changed.semanticProcess.operations, exact.semanticProcess.operations);
  }
});

test("rejects every checked-to-IL User Task metadata binding drift", async () => {
  const exact = await acceptedFixture();
  assert.equal(
    userTaskMetadataBindingValid(exact.checkedProcess, exact.semanticProcess),
    true,
  );
  const mutations = [
    ["candidate", (value: MutableArtifacts) => {
      requireWait(value).task.metadata!.assignment.candidates[0].id = "other";
    }],
    ["field key", (value: MutableArtifacts) => {
      requireWait(value).task.metadata!.form.fields[0].key = "other";
    }],
    ["field type", (value: MutableArtifacts) => {
      requireWait(value).task.metadata!.form.fields[0].type = "string";
    }],
    ["omission", (value: MutableArtifacts) => {
      delete requireWait(value).task.metadata;
    }],
  ] as const;
  for (const [name, mutate] of mutations) {
    const changed = {
      checkedProcess: structuredClone(exact.checkedProcess),
      semanticProcess: structuredClone(exact.semanticProcess),
    } as MutableArtifacts;
    mutate(changed);
    assert.equal(
      userTaskMetadataBindingValid(
        changed.checkedProcess,
        changed.semanticProcess,
      ),
      false,
      name,
    );
  }
});

test("fails closed instead of lowering metadata into a bounded User Task", async () => {
  const exact = await acceptedFixture();
  const checked = structuredClone(exact.checkedProcess) as DeepMutable<
    AcceptedBpmnCompilation["checkedProcess"]
  >;
  const scopeId = checked.nodeScopes.find(({ nodeId }) =>
    nodeId === "UserTask_Approve"
  )?.scopeId;
  assert.notEqual(scopeId, undefined);
  if (scopeId === undefined) {
    return;
  }
  checked.nodes.push(
    {
      kind: CheckedNodeKind.TimerBoundaryEvent,
      id: "Deadline",
      attachedToRef: "UserTask_Approve",
      interruption: BoundaryInterruption.Interrupting,
      durationLiteral: "PT1S",
      outputFlowId: "Flow_Deadline",
    },
    { kind: CheckedNodeKind.NoneEndEvent, id: "DeadlineEnd" },
  );
  checked.sequenceFlows.push({
    id: "Flow_Deadline",
    sourceId: "Deadline",
    targetId: "DeadlineEnd",
    condition: null,
  });
  checked.nodeScopes.push(
    { nodeId: "Deadline", scopeId },
    { nodeId: "DeadlineEnd", scopeId },
  );
  checked.sequenceFlowScopes.push({
    sequenceFlowId: "Flow_Deadline",
    scopeId,
  });

  const program = lowerCheckedProcess(checked);
  assert.equal(
    program.operations.some(({ kind }) =>
      kind === SemanticOperationKind.AwaitBoundedUserTask ||
      kind === SemanticOperationKind.AwaitMonitoredUserTask
    ),
    false,
  );
  assert.equal(userTaskMetadataBindingValid(checked, program), false);
});

test("refuses wrong namespaces, partial metadata, broader siblings, and nonliteral identities", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const refusals = [
    ["wrong candidate namespace", source.replace(
      'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
      'xmlns:c7="https://example.invalid/camunda"',
    )],
    ["wrong form namespace", source
      .replace(
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn" xmlns:wrong="https://example.invalid/camunda"',
      )
      .replaceAll("<c7:form", "<wrong:form")
      .replaceAll("</c7:form", "</wrong:form")],
    ["wrong form local name", source.replaceAll("formData", "generatedForm")],
    ["unknown foreign sibling", source.replace(
      'c7:candidateGroups="reviewers"',
      'c7:candidateGroups="reviewers" c7:priority="1"',
    )],
    ...["\n", "\r", "\u2028", "\u2029"].map((terminator) => [
      `duplicate expanded candidate after ${JSON.stringify(terminator)}`,
      source
        .replace(
          'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
          'xmlns:c7="http://camunda.org/schema/1.0/bpmn" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"',
        )
        .replace(
          'c7:candidateGroups="reviewers"',
          `c7:candidateGroups="review${terminator}ers" camunda:candidateGroups="approvers"`,
        ),
    ] as const),
    ["duplicate expanded candidate", source
      .replace(
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"',
      )
      .replace(
        'c7:candidateGroups="reviewers"',
        'c7:candidateGroups="reviewers" camunda:candidateGroups="reviewers"',
      )],
    ...([
      ["duplicate expanded candidate after quoted greater-than", 'c7:candidateGroups="review>team" c8:candidateGroups="other"'],
      ["duplicate expanded candidate after single-quoted greater-than", "c7:candidateGroups='review>team' c8:candidateGroups='other'"],
      ["duplicate expanded candidate before quoted greater-than", 'c8:candidateGroups="other" c7:candidateGroups="review>team"'],
      ["duplicate expanded candidate before single-quoted greater-than", "c8:candidateGroups='other' c7:candidateGroups='review>team'"],
    ] as const).map(([name, attributes]) => [name, source
      .replace(
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn" xmlns:c8="http://camunda.org/schema/1.0/bpmn"',
      )
      .replace('c7:candidateGroups="reviewers"', attributes)] as const),
    ["duplicate locally bound candidate", source
      .replace(
        'c7:candidateGroups="reviewers"',
        'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" c7:candidateGroups="reviewers" camunda:candidateGroups="reviewers"',
      )],
    ["leading nonbreaking space", source.replace("reviewers", "\u00a0reviewers")],
    ["trailing nonbreaking space", source.replace("reviewers", "reviewers\u00a0")],
    ["empty candidate", source.replace("reviewers", "")],
    ["comma list", source.replace("reviewers", "reviewers,approvers")],
    ["dollar expression", source.replace("reviewers", "${reviewers}")],
    ["hash expression", source.replace("reviewers", "#{reviewers}")],
    ...["assignee", "candidateUsers", "formKey", "dueDate", "followUpDate"].map(
      (name) => [name, source.replace(
        'c7:candidateGroups="reviewers"',
        `c7:candidateGroups="reviewers" c7:${name}="other"`,
      )] as const,
    ),
    ["missing candidate", source.replace(' c7:candidateGroups="reviewers"', "")],
    ["missing form", source.replace(
      /\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/u,
      "",
    )],
    ["duplicate extensionElements", source.replace(
      "      <bpmn:extensionElements>",
      "      <bpmn:extensionElements><c7:formData><c7:formField id=\"other\" type=\"string\" /></c7:formData></bpmn:extensionElements>\n      <bpmn:extensionElements>",
    )],
    ["duplicate formData", source.replace(
      "        <c7:formData>",
      "        <c7:formData><c7:formField id=\"other\" type=\"string\" /></c7:formData>\n        <c7:formData>",
    )],
    ["duplicate field", source.replace(
      "          <c7:formField id=\"approved\" type=\"boolean\" />",
      "          <c7:formField id=\"approved\" type=\"boolean\" />\n          <c7:formField id=\"other\" type=\"string\" />",
    )],
    ["missing field", source.replace(
      '          <c7:formField id="approved" type="boolean" />\n',
      "",
    )],
    ["duplicate field key", source.replace(
      'id="approved" type=',
      'id="approved" id="other" type=',
    )],
    ["empty field key", source.replace('id="approved"', 'id=""')],
    ["leading-space field key", source.replace('id="approved"', 'id="\u00a0approved"')],
    ["trailing-space field key", source.replace('id="approved"', 'id="approved\u00a0"')],
    ["unsupported type", source.replace('type="boolean"', 'type="long"')],
    ["extra field attribute", source.replace('type="boolean"', 'type="boolean" label="Decision"')],
    ["extra form attribute", source.replace("<c7:formData>", '<c7:formData foo="bar">')],
    ["extra form child", source.replace("        </c7:formData>", "          <c7:validation />\n        </c7:formData>")],
    ["extra User Task child", source.replace(
      "      <bpmn:incoming>Flow_StartToTask</bpmn:incoming>",
      "      <bpmn:documentation>reviewers</bpmn:documentation>\n      <bpmn:incoming>Flow_StartToTask</bpmn:incoming>",
    )],
    ["standard potential owner twin", source.replace(
      /\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/u,
      "\n      <bpmn:potentialOwner id=\"PotentialOwner_1\"><bpmn:resourceRef>reviewers</bpmn:resourceRef></bpmn:potentialOwner>",
    )],
    ["standard lane-name twin", source
      .replace(' c7:candidateGroups="reviewers"', "")
      .replace(
        /\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/u,
        "",
      )
      .replace(
        "    <bpmn:startEvent",
        "    <bpmn:laneSet id=\"LaneSet_1\"><bpmn:lane id=\"Lane_Reviewers\" name=\"reviewers\" /></bpmn:laneSet>\n    <bpmn:startEvent",
      )],
  ] as const;
  for (const [name, xml] of refusals) {
    const result = await compile(xml, profile);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, name);
  }
});

test("admits decimal and hexadecimal namespace references as the same expanded name", async () => {
  const exact = await acceptedFixture();
  const source = await readFile(fixtureUrl, "utf8");
  for (const encodedN of ["&#110;", "&#x6e;", "&#x06E;"]) {
    const result = await compile(
      source.replace(
        'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
        `xmlns:c7="http://camunda.org/schema/1.0/bpm${encodedN}"`,
      ),
      profile,
    );
    assert.equal(
      result.status,
      BpmnCompilationStatus.Accepted,
      JSON.stringify({ encodedN, diagnostics: result.diagnostics }),
    );
    if (result.status === BpmnCompilationStatus.Accepted) {
      assert.deepEqual(result.checkedProcess.nodes, exact.checkedProcess.nodes);
      assert.deepEqual(
        result.semanticProcess.operations,
        exact.semanticProcess.operations,
      );
    }
  }
});

test("retains the exact cardinality diagnostic for decoded namespace duplicates", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  for (const encodedN of ["&#110;", "&#x6e;", "&#x06E;"]) {
    for (const attributes of [
      'c7:candidateGroups="review>team" c8:candidateGroups="other"',
      'c8:candidateGroups="other" c7:candidateGroups="review>team"',
    ]) {
      const result = await compile(
        source
          .replace(
            'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
            `xmlns:c7="http://camunda.org/schema/1.0/bpmn" xmlns:c8="http://camunda.org/schema/1.0/bpm${encodedN}"`,
          )
          .replace('c7:candidateGroups="reviewers"', attributes),
        profile,
      );
      assert.equal(result.status, BpmnCompilationStatus.Rejected, encodedN);
      if (result.status === BpmnCompilationStatus.Rejected) {
        assert.deepEqual(
          result.diagnostics.map(({ code, evidence }) => ({ code, evidence })),
          [{
            code: "unsupportedModel",
            evidence: "Exact source requires one expanded candidateGroups attribute on the selected User Task.",
          }],
          JSON.stringify({ encodedN, attributes }),
        );
      }
    }
  }
});

test("refuses the exact extension source under an old profile", async () => {
  const result = await compile(
    await readFile(fixtureUrl, "utf8"),
    SemanticProfileId.UserTaskBooleanCompletionData,
  );
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("does not apply the selected raw duplicate guard to an old profile", async () => {
  const source = (await readFile(fixtureUrl, "utf8"))
    .replace(
      'xmlns:c7="http://camunda.org/schema/1.0/bpmn"',
      'xmlns:c7="http://camunda.org/schema/1.0/bpmn" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"',
    )
    .replace(
      'c7:candidateGroups="reviewers"',
      'c7:candidateGroups="reviewers" camunda:candidateGroups="reviewers"',
    );
  const result = await compile(source, SemanticProfileId.UserTaskBooleanCompletionData);
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  if (result.status === BpmnCompilationStatus.Rejected) {
    assert.ok(result.diagnostics.some(
      ({ code }) => code === "unconsumedForeignAttribute",
    ));
    assert.equal(
      result.diagnostics.some(({ evidence }) =>
        evidence.includes("one expanded candidateGroups attribute")
      ),
      false,
    );
  }
});

test("ignores duplicate-like candidate attributes in opaque XML regions", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const fakeTag = '<bpmn:userTask c7:candidateGroups="one" c7:candidateGroups="two" />';
  const opaqueRegions = [
    [`<!-- ${fakeTag} -->`, BpmnCompilationStatus.Accepted],
    [`<![CDATA[${fakeTag}]]>`, BpmnCompilationStatus.Rejected],
    [`<?metadata ${fakeTag} ?>`, BpmnCompilationStatus.Accepted],
  ];
  for (const [opaque, expectedStatus] of opaqueRegions) {
    const result = await compile(
      source.replace("  <bpmn:process", `  ${opaque}\n  <bpmn:process`),
      profile,
    );
    assert.equal(result.status, expectedStatus, opaque);
    if (result.status === BpmnCompilationStatus.Rejected) {
      assert.equal(
        result.diagnostics.some(({ evidence }) =>
          evidence.includes("one expanded candidateGroups attribute")
        ),
        false,
        opaque,
      );
    }
  }
});

test("decodes bounded XML namespace references and fails closed on invalid references", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  for (const reference of ["&amp;", "&apos;", "&gt;", "&lt;", "&quot;"]) {
    const result = await compile(
      source.replace("xmlns:c7=", `xmlns:unused="urn:${reference}" xmlns:c7=`),
      profile,
    );
    assert.equal(result.status, BpmnCompilationStatus.Accepted, reference);
  }
  const invalidReferences = [
    ["missing semicolon", "&#110"],
    ["malformed numeric", "&#x;"],
    ["unknown", "&unknown;"],
    ["surrogate", "&#xD800;"],
    ["out of range", "&#x110000;"],
    ["XML-illegal scalar", "&#0;"],
  ] as const;
  for (const [name, reference] of invalidReferences) {
    const result = await compile(
      source.replace("xmlns:c7=", `xmlns:unused="urn:${reference}" xmlns:c7=`),
      profile,
    );
    assert.equal(result.status, BpmnCompilationStatus.Rejected, name);
    if (result.status === BpmnCompilationStatus.Rejected) {
      assert.ok(result.diagnostics.some(({ evidence }) =>
        evidence.includes("one expanded candidateGroups attribute")
      ), name);
    }
  }
});

test("preserves metadata-free old-profile checked and IL shapes", async () => {
  const source = await readFile(
    new URL("../../../scenarios/user-task-discovery-completion/process.bpmn", import.meta.url),
    "utf8",
  );
  const result = await compile(source, SemanticProfileId.UserTaskBooleanCompletionData);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const checked = result.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.UserTask,
  );
  const operation = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.deepEqual(Object.keys(checked ?? {}), ["kind", "id", "name"]);
  assert.ok(operation?.kind === SemanticOperationKind.AwaitUserTask);
  assert.deepEqual(Object.keys(operation.task), ["elementId", "name"]);
});

test("admits a metadata-free User Task under the metadata profile with physical omission", async () => {
  const source = (await readFile(fixtureUrl, "utf8"))
    .replace(' c7:candidateGroups="reviewers"', "")
    .replace(
      /\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/u,
      "",
    );
  const result = await compile(source, profile);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const checked = result.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.UserTask,
  );
  const operation = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.equal(Object.hasOwn(checked ?? {}, "metadata"), false);
  assert.ok(operation?.kind === SemanticOperationKind.AwaitUserTask);
  assert.equal(Object.hasOwn(operation.task, "metadata"), false);
});

async function acceptedFixture() {
  const result = await compile(await readFile(fixtureUrl, "utf8"), profile);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("User Task metadata fixture was not admitted");
  }
  return result;
}

async function compile(xml: string, semanticProfile: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId: "user-task-metadata-source",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

function metadata(candidate: string, key: string, type: "string" | "boolean") {
  return {
    assignment: { candidates: [{ kind: "group", id: candidate }] },
    form: { fields: [{ key, type }] },
  } as const;
}

type MutableArtifacts = DeepMutable<{
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
  semanticProcess: AcceptedBpmnCompilation["semanticProcess"];
}>;

function requireWait(value: MutableArtifacts) {
  const operation = value.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  if (operation?.kind !== SemanticOperationKind.AwaitUserTask) {
    throw new TypeError("Await User Task operation is missing");
  }
  return operation;
}
