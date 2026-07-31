import { readFile } from "node:fs/promises";

import {
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);

/**
 * Reads one retained capsule document.
 *
 * The scenario and evidence documents are project-owned tracked artifacts whose
 * shape is locked by the contract gate, so the declared type is the contract
 * rather than a re-validated decode of untrusted input.
 */
async function loadJson<Value>(relativePath: string): Promise<Value> {
  return JSON.parse(
    await readFile(new URL(relativePath, capsuleUrl), "utf8"),
  ) as Value;
}

export async function loadCase(
  scenarioName: string,
  evidenceName: string,
): Promise<Readonly<{ scenario: Scenario; expected: ScenarioResult }>> {
  const [scenario, evidence] = await Promise.all([
    loadJson<Scenario>(scenarioName),
    loadJson<Readonly<{ result: ScenarioResult }>>(evidenceName),
  ]);
  return { scenario, expected: evidence.result };
}

export function semanticProcessFor(
  scenario: Scenario,
  name: string | null = "Approve",
): SemanticProcessProgram {
  return rootScopedProgram({
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
        kind: SemanticOperationKind.ReachNoneEnd,
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
  });
}
