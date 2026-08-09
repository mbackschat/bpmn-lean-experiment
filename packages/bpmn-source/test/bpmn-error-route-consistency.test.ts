import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { SemanticOperationKind } from "@bpmn-lean/bpmn-source";

import { verifyDefinitionArtifacts } from "../../../scripts/contract-artifacts.ts";
import {
  requireAwaitEffect,
} from "../../../scripts/contract-artifact-test-fixtures.ts";
import type {
  MutableDefinitionArtifacts,
} from "../../../scripts/contract-artifact-test-fixtures.ts";
import {
  compileSemanticProcessFixture,
} from "./semantic-process-compilation-test-support.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

type MutableErrorRoute = {
  code: string;
  output: string;
  origin: {
    boundaryEventId: string;
    errorDefinitionId: string;
    errorElementId: string;
    sequenceFlowId: string;
  };
};

async function mappedBoundaryArtifacts(): Promise<MutableDefinitionArtifacts> {
  const compiled = await compileSemanticProcessFixture(
    new URL(
      "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
      import.meta.url,
    ),
    "mapped-boundary-error-service-task",
    "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
  );
  return structuredClone({
    checkedProcess: compiled.checkedProcess,
    semanticProcess: compiled.semanticProcess,
  }) as unknown as MutableDefinitionArtifacts;
}

function requireMappedErrorRoute(
  artifacts: MutableDefinitionArtifacts,
): { route: MutableErrorRoute; effectOutput: string } {
  const effect = requireAwaitEffect(
    artifacts.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitEffect,
    ),
  );
  assert.notEqual(effect.bpmnErrorRoute, null);
  if (effect.bpmnErrorRoute === null) {
    throw new Error("expected a BPMN Error route");
  }
  return {
    route: effect.bpmnErrorRoute,
    effectOutput: effect.output,
  };
}

test("rejects every checked-to-IL BPMN Error route drift", async () => {
  const mutations: ReadonlyArray<(
    route: MutableErrorRoute,
    effectOutput: string,
  ) => void> = [
    (route) => { route.code = "OtherCode"; },
    (route, effectOutput) => { route.output = effectOutput; },
    (route) => { route.origin.boundaryEventId = "OtherBoundary"; },
    (route) => { route.origin.errorDefinitionId = "OtherDefinition"; },
    (route) => { route.origin.errorElementId = "OtherError"; },
    (route) => { route.origin.sequenceFlowId = "Flow_EffectToNormalEnd"; },
  ];

  for (const mutate of mutations) {
    const artifacts = await mappedBoundaryArtifacts();
    const { route, effectOutput } = requireMappedErrorRoute(artifacts);
    mutate(route, effectOutput);
    await assert.rejects(
      verifyDefinitionArtifacts(projectRoot, artifacts),
      /BPMN Error route differs from its checked BPMN origin/,
    );
  }

  const renamedArtifacts = await mappedBoundaryArtifacts();
  const { route } = requireMappedErrorRoute(renamedArtifacts);
  const routeOutput = route.output;
  renamedArtifacts.semanticProcess = JSON.parse(
    JSON.stringify(renamedArtifacts.semanticProcess).replaceAll(
      JSON.stringify(routeOutput),
      JSON.stringify("place:Flow_ErrorToReviewMappedErrorRenamed"),
    ),
  ) as MutableDefinitionArtifacts["semanticProcess"];
  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, renamedArtifacts),
    /BPMN Error route differs from its checked BPMN origin/,
  );
});
