import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  populationEvidenceCases,
  populationEvidenceDocument,
  populationEvidenceValidator,
  verifyPopulationEvidence,
} from "./cibseven-population-evidence.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("every retained population evidence file binds its population, its profile and the profile's oracle", async () => {
  const checked = await verifyPopulationEvidence(projectRoot);
  assert.ok(checked.every((evidence) => evidence.endsWith(".population-cibseven-evidence.json")));
});

test("covers a population only when its provenance names its profile oracle's revision", () => {
  const cases = populationEvidenceCases(projectRoot).map(({ scenarioRelativePath }) => scenarioRelativePath);
  // The Message key-correlation populations cite the source checkout's revision, which no packaged release runs.
  assert.equal(cases.includes("scenarios/message-key-correlation/unique.population-scenario.json"), false);
  assert.ok(cases.includes("scenarios/open-rows/call-binding-population/nested-callee-binds-at-own-deployment.population-scenario.json"));
  for (const { scenarioRelativePath, evidenceRelativePath } of populationEvidenceCases(projectRoot)) {
    assert.equal(evidenceRelativePath, scenarioRelativePath.replace(/scenario\.json$/u, "cibseven-evidence.json"));
  }
});

const state = { kind: "state", instanceId: "Claim", status: "running", logicalTimeMs: 0, variables: [], openWaits: [] };

function evidence(result: Readonly<Record<string, unknown>>): unknown {
  return populationEvidenceDocument(
    { id: "population", bytes: new TextEncoder().encode("population") },
    {
      id: "cibseven-2.2.0", bytes: new TextEncoder().encode("profile"),
      revision: "834a9874760de8a0107f7c1b32806e37f17fb017", java: "21", database: "H2 2.3.232",
    },
    {
      scenarioId: "population",
      deployments: [{ deploymentId: 1, definitionRef: "claim", versions: [{ key: "Claim", version: 1 }], outcome: { kind: "deployed" } }],
      steps: [],
      processStates: [state],
      diagnostics: { engineVersion: "2.2.0", databaseVersion: "2.3.232", cleanup: {} },
      ...result,
    },
  );
}

test("the schema takes CIB's population answer and none of the kernel members beyond CIB's boundary", async () => {
  const validate = await populationEvidenceValidator(projectRoot);
  const started = { kind: "started", instanceId: "start:1:p:1:1:5:Start", deploymentId: 1, version: 1, startEvent: "Start" };
  const accepted = evidence({
    steps: [
      { commandId: "p", ordinal: 1, at: 0, outcome: "committed", resolution: { kind: "fanOut", entries: [started] } },
      { commandId: "q", ordinal: 2, at: 0, outcome: "rolledBack", resolution: { kind: "ambiguous" } },
      { commandId: "r", ordinal: 3, at: 5, outcome: "rejected" },
    ],
    inputFailures: [{ commandId: "s", outcome: "rejected" }],
  });
  assert.equal(validate(accepted), true, JSON.stringify(validate.errors));
  const refused = [
    evidence({ deployments: [{ deploymentId: 1, definitionRef: "c", versions: [], outcome: { kind: "deploymentRefused", code: "x" } }] }),
    evidence({ steps: [{ commandId: "p", ordinal: 1, at: 0, outcome: "committed",
      resolution: { kind: "fanOut", entries: [{ kind: "delivered", target: { processInstanceId: "C", elementId: "E", activation: 1 } }] } }] }),
    evidence({ steps: [{ commandId: "p", ordinal: 1, at: 0, outcome: "rejected", resolution: { kind: "rejected", code: "x" } }] }),
    evidence({ inputFailures: [{ commandId: "s", outcome: "rejected", code: "x" }] }),
  ];
  for (const document of refused) assert.equal(validate(document), false, JSON.stringify(document));
});
