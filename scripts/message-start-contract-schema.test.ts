import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_Order",
  interfaceOperationId: "Operation_CreateOrder",
  messageId: "Message_CreateOrder",
} as const;

test("admits only exact triggered Start checked, IL, and stimulus wire shapes", async () => {
  const [checkedSchema, programSchema, scenarioSchema] = await Promise.all([
    readSchema("checked-process.schema.json"),
    readSchema("semantic-process.schema.json"),
    readSchema("scenario.schema.json"),
  ]);
  const checkedNode = compileDefinition(checkedSchema, "node");
  const operation = compileDefinition(programSchema, "operation");
  const stimulus = compileDefinition(scenarioSchema, "start");

  const values = [
    {
      validate: checkedNode,
      exact: {
        kind: "messageStartEvent",
        id: "Start_Message",
        channel,
      },
      missing: {
        kind: "messageStartEvent",
        id: "Start_Message",
      },
    },
    {
      validate: operation,
      exact: {
        kind: "initiateMessage",
        id: "operation:Start_Message",
        origin: {
          kind: "bpmnElement",
          elementId: "Start_Message",
        },
        channel,
        outputs: ["place:Flow_Start_User"],
      },
      missing: {
        kind: "initiateMessage",
        id: "operation:Start_Message",
        origin: {
          kind: "bpmnElement",
          elementId: "Start_Message",
        },
        outputs: ["place:Flow_Start_User"],
      },
    },
    {
      validate: stimulus,
      exact: {
        kind: "start",
        commandId: "command-start",
        instanceId: "instance-message-start",
        variables: [],
        startEvent: "Start_Message",
        trigger: { kind: "message", channel },
      },
      missing: {
        kind: "start",
        commandId: "command-start",
        instanceId: "instance-message-start",
        variables: [],
        startEvent: "Start_Message",
        trigger: { kind: "message" },
      },
    },
    {
      validate: checkedNode,
      exact: {
        kind: "timerStartEvent",
        id: "Start_Timer",
        durationLiteral: "PT1S",
      },
      missing: {
        kind: "timerStartEvent",
        id: "Start_Timer",
      },
    },
    {
      validate: operation,
      exact: {
        kind: "initiateTimer",
        id: "operation:Start_Timer",
        origin: {
          kind: "bpmnElement",
          elementId: "Start_Timer",
        },
        timer: {
          durationMs: 1000,
        },
        outputs: ["place:Flow_Timer_User"],
      },
      missing: {
        kind: "initiateTimer",
        id: "operation:Start_Timer",
        origin: {
          kind: "bpmnElement",
          elementId: "Start_Timer",
        },
        outputs: ["place:Flow_Timer_User"],
      },
    },
    {
      validate: stimulus,
      exact: {
        kind: "start",
        commandId: "command-timer-start",
        instanceId: "instance-timer-start",
        variables: [],
        startEvent: "Start_Timer",
        trigger: { kind: "timer", logicalTimeMs: 1000 },
      },
      missing: {
        kind: "start",
        commandId: "command-timer-start",
        instanceId: "instance-timer-start",
        variables: [],
        startEvent: "Start_Timer",
        trigger: { kind: "timer" },
      },
    },
  ] as const;

  for (const { validate, exact, missing } of values) {
    assert.equal(validate(exact), true, JSON.stringify(validate.errors));
    assert.equal(validate(missing), false);
    assert.equal(validate({ ...exact, privateField: "forbidden" }), false);
  }
});

test("requires one exact Process-start variant first and forbids every later start", async () => {
  const scenarioSchema = await readSchema("scenario.schema.json");
  const validate = new Ajv2020({ strict: true, strictTuples: false }).compile(
    scenarioSchema,
  );
  const start = {
    kind: "start",
    commandId: "command-start",
    instanceId: "instance-message-start",
    variables: [],
    startEvent: "Start_Message",
    trigger: { kind: "message", channel },
  } as const;
  const scenario = {
    kind: "scenario",
    id: "message-start-event",
    profile: "bpmn-2.0.2-message-start-event-draft",
    bpmn: {
      id: "message-start-event",
      relativePath: "scenarios/message-start-event/process.bpmn",
      sha256: "a".repeat(64),
      sourceOverlay: null,
    },
    stimuli: [start],
    provenance: {
      normativeRefs: ["BPMN 2.0.2 Clause 10.5.2"],
      cibRevision: "b".repeat(40),
      cibRefs: ["not-used-as-semantic-evidence"],
    },
  } as const;
  const timerStart = {
    kind: "start",
    commandId: "command-timer-start",
    instanceId: "instance-timer-start",
    variables: [],
    startEvent: "Start_Timer",
    trigger: { kind: "timer", logicalTimeMs: 1000 },
  } as const;
  const completion = {
    kind: "command",
    commandId: "command-complete",
    occurrence: { processInstanceId: "instance-message-start", elementId: "UserTask_1", activation: 1 },
    action: { kind: "completeUserTask", values: [] },
  } as const;

  assert.equal(validate(scenario), true, JSON.stringify(validate.errors));
  assert.equal(
    validate({
      ...scenario,
      id: "timer-start-event",
      profile: "bpmn-2.0.2-timer-start-event-draft",
      stimuli: [timerStart],
    }),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(validate({ ...scenario, stimuli: [start, completion] }), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...scenario, stimuli: [start, start] }), false);
  assert.equal(validate({ ...scenario, stimuli: [start, completion, timerStart] }), false);
  assert.equal(validate({ ...scenario, stimuli: [completion] }), false);
  assert.equal(validate({ ...scenario, stimuli: [] }), false);
  // The removed request list is closed out, so a scenario cannot ask a target for observations.
  assert.equal(validate({ ...scenario, observations: ["deployment"] }), false);
});

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

function compileDefinition(
  schema: Record<string, unknown>,
  definition: string,
) {
  return new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  });
}
