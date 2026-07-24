import { readFile } from "node:fs/promises";

import {
  BpmnCompilerIdentity,
  BpmnExecutableIrKind,
} from "../dist/index.js";

const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);

export async function loadJson(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, capsuleUrl), "utf8"),
  );
}

export async function loadCase(scenarioName, evidenceName) {
  const [scenario, evidence] = await Promise.all([
    loadJson(scenarioName),
    loadJson(evidenceName),
  ]);
  return { scenario, expected: evidence.result };
}

export function executableIrFor(scenario, name = "Approve") {
  return {
    kind: BpmnExecutableIrKind.SequentialUserTask,
    identity: {
      compiler: BpmnCompilerIdentity.SequentialUserTask,
      semanticProfile: scenario.profile,
      sourceId: scenario.bpmn.id,
      sourceSha256: scenario.bpmn.sha256,
    },
    processId: "Process_SequentialUserTask",
    startEventId: "StartEvent_1",
    userTask: {
      id: "UserTask_Approve",
      name,
    },
    endEventId: "EndEvent_1",
    sequenceFlows: [
      {
        id: "Flow_StartToTask",
        sourceId: "StartEvent_1",
        targetId: "UserTask_Approve",
      },
      {
        id: "Flow_TaskToEnd",
        sourceId: "UserTask_Approve",
        targetId: "EndEvent_1",
      },
    ],
  };
}
