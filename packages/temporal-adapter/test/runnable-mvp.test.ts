/** Locks the repository MVP command around strict local configuration and pre-connect admission. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  VariableValueKind,
} from "@bpmn-lean/semantic-core";

import {
  loadRunnableMvpConfig,
} from "../cli/runnable-mvp-config.ts";
import {
  RunnableMvpEventKind,
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "../cli/runnable-mvp.ts";
import {
  RunnableMvpCommandEventKind,
  RunnableMvpExitCode,
  runRunnableMvpCommand,
} from "../cli/runnable-mvp-command.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const acceptedBpmn = path.join(
  projectRoot,
  "scenarios/user-task-discovery-completion/process.bpmn",
);
const unsupportedBpmn = path.join(
  projectRoot,
  "scenarios/parallel-fork-join/process.bpmn",
);
const profile = "cibseven-2.2.0-user-task-process-data-draft";

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
  dummyUserTask: {
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
  assert.deepEqual(loaded.process.initialVariables, config.process.initialVariables);
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
