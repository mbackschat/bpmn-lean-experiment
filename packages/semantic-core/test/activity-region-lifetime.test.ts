import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  ActivityHandlerKind,
  CommandOutcome,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  createActivityLocalDataOwner,
  createEffectLocalDataOwner,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation } from "@bpmn-lean/semantic-core";

import { boundedScopeProgram, start } from "./bounded-scope-fixture.ts";

for (const kind of [SemanticOperationKind.ThrowError, SemanticOperationKind.TerminateScope]) {
  test(`${kind} withdraws the child Activity's parent-owned Message and local data`, () => {
    const started = applyStimulus(boundedScopeProgram, initialState, start);
    assert.equal(started.outcome, CommandOutcome.Committed);
    const [record] = started.state.activityOccurrences;
    assert.ok(record?.body.kind === ActivityBodyKind.ChildScope);
    const child = record.body.scope;
    const messageId = {
      processInstanceId: record.id.processInstanceId,
      elementId: "BoundaryMessage",
      activation: 7,
    };
    const attachedMessage = {
      id: messageId,
      owner: record.owner,
      channel: { kind: MessageChannelKind.DirectMessage, messageId: "Withdrawal" },
      output: "place:Withdrawal",
    } as const;
    const unrelatedMessage = {
      ...attachedMessage,
      id: { ...messageId, activation: 8 },
    };
    const sameCoordinatesTimer = {
      id: messageId,
      owner: record.owner,
      deadlineMs: 9000,
      output: "place:UnrelatedTimer",
    };
    const withdrawnData = {
      owner: createActivityLocalDataOwner(record.id),
      bindings: [{ name: "Input", value: { kind: VariableValueKind.String, value: "withdraw" } }],
    } as const;
    const unrelatedData = {
      owner: createActivityLocalDataOwner({ ...record.id, activation: 2 }),
      bindings: [{ name: "Input", value: { kind: VariableValueKind.String, value: "retain" } }],
    } as const;
    const sameCoordinatesEffectData = {
      owner: createEffectLocalDataOwner({
        processInstanceId: record.id.processInstanceId,
        elementId: record.id.activityElementId,
        activation: record.id.activation,
      }),
      bindings: [],
    };
    const input = "place:InterruptChild";
    const operation: SemanticOperation = kind === SemanticOperationKind.TerminateScope
      ? {
        id: "operation:TerminateChild",
        kind,
        origin: { kind: SemanticOriginKind.BpmnElement, elementId: "TerminateChild" },
        input,
        scopeId: child.definitionScopeId,
      }
      : {
        id: "operation:FailChild",
        kind: SemanticOperationKind.ThrowError,
        origin: { kind: SemanticOriginKind.BpmnElement, elementId: "FailChild" },
        input,
        error: { errorDefinitionId: "ErrorDefinition", errorElementId: "Error", code: "E" },
        handler: {
          attachedScopeId: child.definitionScopeId,
          code: "E",
          output: "place:Handled",
          origin: {
            kind: SemanticOriginKind.BpmnElement,
            boundaryEventId: "BoundaryError",
            errorDefinitionId: "ErrorDefinition",
            errorElementId: "Error",
            sequenceFlowId: "Handled",
          },
        },
      };
    // AOO-CANCEL-01 applies to the represented ownership graph; this synthetic composition
    // exercises the cleanup boundary without claiming admission of a new BPMN profile.
    const before: RuntimeState = {
      ...started.state,
      controlTokens: [{ placeId: input, owner: child, multiplicity: 1 }],
      activityOccurrences: [{
        ...record,
        attachedHandlers: [
          ...record.attachedHandlers,
          { kind: ActivityHandlerKind.Message, occurrence: messageId },
        ],
      }],
      messageWaits: [attachedMessage, unrelatedMessage],
      timerWaits: [...started.state.timerWaits, sameCoordinatesTimer],
      variables: {
        ...started.state.variables,
        activities: [withdrawnData, unrelatedData, sameCoordinatesEffectData],
      },
    };
    assert.notDeepEqual(attachedMessage.owner, child);
    const after = applyInternalOperation(boundedScopeProgram, operation, before);
    assert.ok(after !== null, "the chosen route must reach regional cancellation");
    assert.deepEqual(after.activityOccurrences, []);
    assert.deepEqual(after.messageWaits, [unrelatedMessage]);
    assert.deepEqual(after.timerWaits, [sameCoordinatesTimer]);
    assert.deepEqual(after.variables.activities, [unrelatedData, sameCoordinatesEffectData]);
    assert.deepEqual(after.variables.process, before.variables.process);
    assert.equal(after.logicalTimeMs, before.logicalTimeMs);
    assert.deepEqual(after.activityActivations, before.activityActivations);
    assert.equal(
      after.scopeOccurrences.some(({ id }) => id.definitionScopeId === child.definitionScopeId),
      kind === SemanticOperationKind.TerminateScope,
    );
  });
}
