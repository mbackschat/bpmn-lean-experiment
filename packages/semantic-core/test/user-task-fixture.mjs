import { readFile } from "node:fs/promises";

import {
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
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

export function semanticProcessFor(scenario, name = "Approve") {
  return {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: scenario.profile,
      sourceId: scenario.bpmn.id,
      sourceSha256: scenario.bpmn.sha256,
    },
    processId: "Process_SequentialUserTask",
    controlPlaces: [
      controlPlace("Flow_StartToTask"),
      controlPlace("Flow_TaskToEnd"),
    ],
    operations: [
      {
        ...operationBase("EndEvent_1"),
        kind: SemanticOperationKind.Terminate,
        input: "place:Flow_TaskToEnd",
      },
      {
        ...operationBase("StartEvent_1"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_StartToTask",
      },
      {
        ...operationBase("UserTask_Approve"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_StartToTask",
        output: "place:Flow_TaskToEnd",
        task: {
          elementId: "UserTask_Approve",
          name,
        },
      },
    ],
  };
}

function controlPlace(flowId) {
  return {
    id: `place:${flowId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: flowId,
    },
  };
}

function operationBase(elementId) {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}
