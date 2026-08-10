/** Locks the repository MVP command around strict local configuration and pre-connect admission. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";

import {
  loadRunnableMvpConfig,
} from "../../runner/cli/runnable-mvp-config.ts";
import {
  createRunnableMvpStartStimulus,
} from "../../runner/cli/runnable-mvp-start.ts";
import {
  RunnableMvpEventKind,
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "../../runner/cli/runnable-mvp.ts";
import {
  RunnableMvpCommandEventKind,
  RunnableMvpExitCode,
  runRunnableMvpCommand,
} from "../../runner/cli/runnable-mvp-command.ts";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const acceptedBpmn = path.join(
  projectRoot,
  "scenarios/user-task-discovery-completion/process.bpmn",
);
const unsupportedBpmn = path.join(
  projectRoot,
  "scenarios/parallel-fork-join/process.bpmn",
);
const messageStartBpmn = path.join(
  projectRoot,
  "packages/bpmn-source/test/fixtures/message-start-event.bpmn",
);
const profile = "cibseven-2.2.0-user-task-process-data-draft";
const messageStartProcess = {
  instanceId: "Message_Start_Mvp_1",
  startEventId: "StartEvent_Message",
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_OrderMessages",
    interfaceOperationId: "Operation_StartOrder",
    messageId: "Message_StartOrder",
  },
} as const;

const config = {
  kind: "runnableTemporalMvp",
  bpmn: {
    file: acceptedBpmn,
    sourceId: "sequential-user-task-process",
    semanticProfile: profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  },
  process: {
    instanceId: "Mvp_Test_1",
    initialVariables: [
      {
        name: "requestTitle",
        value: {
          kind: VariableValueKind.String,
          value: "Review invoice 42",
        },
      },
    ],
  },
  temporal: {
    address: "localhost:7233",
    namespace: "default",
    taskQueue: "bpmn-mvp",
    identity: "bpmn-mvp-command",
  },
  interactions: [
    {
      kind: StimulusKind.CompleteUserTaskInstance,
      elementId: "UserTask_Approve",
      delayMs: 3_000,
      inputVariableNames: ["requestTitle"],
      submittedValues: [
        {
          name: "decision",
          value: {
            kind: VariableValueKind.String,
            value: "approved",
          },
        },
      ],
    },
  ],
  effectHandlers: [],
} as const;

test("loads an exact config and resolves its BPMN path from the config file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-config-"));
  const configPath = path.join(directory, "mvp.json");
  const relativeBpmn = path.relative(directory, acceptedBpmn);
  await writeFile(
    configPath,
    `${JSON.stringify({
      ...config,
      bpmn: { ...config.bpmn, file: relativeBpmn },
    }, null, 2)}\n`,
    "utf8",
  );

  const loaded = await loadRunnableMvpConfig(configPath);

  assert.equal(loaded.bpmn.file, acceptedBpmn);
  assert.deepEqual(loaded.process, config.process);
});

test("loads the exact Message-start Process configuration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-config-"));
  const configPath = path.join(directory, "message-start.json");
  await writeFile(
    configPath,
    `${JSON.stringify({ ...config, process: messageStartProcess })}\n`,
    "utf8",
  );

  const loaded = await loadRunnableMvpConfig(configPath);

  assert.deepEqual(loaded.process, messageStartProcess);
});

test("rejects mixed, both-arm, missing, extra, and malformed Process-start shapes", async () => {
  const invalidProcesses = [
    {
      instanceId: messageStartProcess.instanceId,
      initialVariables: [],
      startEventId: messageStartProcess.startEventId,
    },
    { ...messageStartProcess, initialVariables: [] },
    {
      instanceId: messageStartProcess.instanceId,
      startEventId: messageStartProcess.startEventId,
    },
    { ...messageStartProcess, payload: null },
    {
      ...messageStartProcess,
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: messageStartProcess.channel.interfaceId,
        messageId: messageStartProcess.channel.messageId,
      },
    },
  ] as const;

  for (const [index, process] of invalidProcesses.entries()) {
    const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-config-"));
    const configPath = path.join(directory, `invalid-${index}.json`);
    await writeFile(
      configPath,
      `${JSON.stringify({ ...config, process })}\n`,
      "utf8",
    );

    await assert.rejects(loadRunnableMvpConfig(configPath), TypeError);
  }
});

test("constructs distinct exact manual and Message-start stimuli", () => {
  assert.deepEqual(
    createRunnableMvpStartStimulus(config, { processId: "Process_Manual" }),
    {
      kind: StimulusKind.StartProcess,
      commandId: "mvp-start:Mvp_Test_1",
      processId: "Process_Manual",
      instanceId: "Mvp_Test_1",
      initialVariables: config.process.initialVariables,
    },
  );
  assert.deepEqual(
    createRunnableMvpStartStimulus(
      { ...config, process: messageStartProcess },
      { processId: "Process_MessageStart" },
    ),
    {
      kind: StimulusKind.TriggerMessageStart,
      commandId: "mvp-start:Message_Start_Mvp_1",
      processId: "Process_MessageStart",
      instanceId: "Message_Start_Mvp_1",
      startEventId: "StartEvent_Message",
      channel: messageStartProcess.channel,
    },
  );
});

test("rejects unknown config fields", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-config-"));
  const configPath = path.join(directory, "mvp.json");
  await writeFile(
    configPath,
    `${JSON.stringify({ ...config, taskInbox: true })}\n`,
    "utf8",
  );

  await assert.rejects(
    loadRunnableMvpConfig(configPath),
    /unknown field taskInbox/,
  );
});

test("reports an unsupported model before opening a Temporal connection", async () => {
  let attemptedConnection = false;
  const events: Array<{ readonly kind: string }> = [];
  const result = await runRunnableTemporalMvp(
    {
      ...config,
      bpmn: {
        ...config.bpmn,
        file: unsupportedBpmn,
        sourceId: "parallel-two-user-tasks-process",
      },
    },
    (event) => events.push(event),
    {
      connect: async () => {
        attemptedConnection = true;
        throw new Error("Temporal connection must not be attempted");
      },
    },
  );

  assert.equal(result.kind, RunnableMvpResultKind.SourceAdmissionRejected);
  assert.equal(events[0]?.kind, RunnableMvpEventKind.SourceAdmissionRejected);
  assert.equal(attemptedConnection, false);
});

test("rejects wrong Message-start identity before opening a Temporal connection", async () => {
  let attemptedConnection = false;
  const result = await runRunnableTemporalMvp(
    {
      ...config,
      bpmn: {
        ...config.bpmn,
        file: messageStartBpmn,
        sourceId: "message-start-event",
        semanticProfile: "bpmn-2.0.2-message-start-event-draft",
      },
      process: {
        instanceId: "Message_Start_Mvp_Wrong_1",
        startEventId: "MessageStart_ApprovalRequest",
        channel: {
          kind: MessageChannelKind.OperationMessage,
          interfaceId: "Interface_ProcessMessages",
          interfaceOperationId: "Operation_Other",
          messageId: "Message_ApprovalRequest",
        },
      },
    },
    () => undefined,
    {
      connect: async () => {
        attemptedConnection = true;
        throw new Error("Temporal connection must not be attempted");
      },
    },
  );

  assert.equal(result.kind, RunnableMvpResultKind.ProcessAdmissionRejected);
  assert.equal(attemptedConnection, false);
});

test("the command emits typed rejection for an unsupported model without Temporal", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-command-"));
  const configPath = path.join(directory, "unsupported.json");
  await writeFile(
    configPath,
    `${JSON.stringify({
      ...config,
      bpmn: {
        ...config.bpmn,
        file: unsupportedBpmn,
        sourceId: "parallel-two-user-tasks-process",
      },
    })}\n`,
    "utf8",
  );
  const lines: string[] = [];

  const exitCode = await runRunnableMvpCommand(
    [configPath],
    (line) => lines.push(line),
  );

  assert.equal(exitCode, RunnableMvpExitCode.AdmissionRejected);
  assert.equal(JSON.parse(lines[0] ?? "null").kind, "sourceAdmissionRejected");
});

test("the command accepts pnpm's forwarded argument separator", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-command-"));
  const configPath = path.join(directory, "unsupported.json");
  await writeFile(
    configPath,
    `${JSON.stringify({
      ...config,
      bpmn: {
        ...config.bpmn,
        file: unsupportedBpmn,
        sourceId: "parallel-two-user-tasks-process",
      },
    })}\n`,
    "utf8",
  );
  const lines: string[] = [];

  const exitCode = await runRunnableMvpCommand(
    ["--", configPath],
    (line) => lines.push(line),
  );

  assert.equal(exitCode, RunnableMvpExitCode.AdmissionRejected);
  assert.equal(JSON.parse(lines[0] ?? "null").kind, "sourceAdmissionRejected");
});

test("the command classifies malformed local configuration separately", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mvp-command-"));
  const configPath = path.join(directory, "malformed.json");
  await writeFile(configPath, "{}\n", "utf8");
  const lines: string[] = [];

  const exitCode = await runRunnableMvpCommand(
    [configPath],
    (line) => lines.push(line),
  );

  assert.equal(exitCode, RunnableMvpExitCode.ConfigurationRejected);
  assert.equal(
    JSON.parse(lines[0] ?? "null").kind,
    RunnableMvpCommandEventKind.ConfigurationRejected,
  );
});
