import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  SemanticOperationKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import {
  program,
  start,
} from "../../../semantic-core/test/activity-boundary-message-fixture.ts";

import { requireExecutionPublicationPage } from "../dist/index.js";

test("validates the boundary operation as the declarer of its enabled Message interaction", () => {
  const step = advanceScenario(program, initialState, start);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed || step.publication === null) {
    throw new TypeError("Activity boundary Message start did not publish");
  }
  const throughRevision = step.publication.transitions.length;
  const page = {
    definition: program.identity,
    processId: program.processId,
    processInstanceId: start.instanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: throughRevision,
    headRevision: throughRevision,
    batches: [{
      commandId: start.commandId,
      fromRevision: 0,
      throughRevision,
      transitions: step.publication.transitions.map((record, index) => ({
        revision: index + 1,
        ...record,
      })),
    }],
    current: { revision: throughRevision, ...step.publication.current },
  };
  const context = {
    program,
    processInstanceId: start.instanceId,
    afterRevision: 0,
    limit: 1,
  };

  assert.deepEqual(requireExecutionPublicationPage(page, context), page);

  const bounded = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
  assert.ok(bounded?.kind === SemanticOperationKind.AwaitMessageBoundedUserTask);
  const undeclared = {
    ...program,
    operations: program.operations.map((operation) =>
      operation === bounded
        ? {
          ...bounded,
          boundaryMessage: {
            ...bounded.boundaryMessage,
            elementId: "OtherBoundaryMessage",
          },
        }
        : operation
    ),
  };
  assert.throws(
    () => requireExecutionPublicationPage(page, { ...context, program: undeclared }),
    /malformed execution publication page/u,
  );
});
