import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationOrderResultKind,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  canonicalCorrelationPublicationLedgerRecordEncoding,
  canonicalCorrelationPublicationQueueEncoding,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationIngressConfiguration,
  CorrelationPublicationCommand,
} from "@bpmn-lean/temporal-protocol";
import {
  CorrelationPublicationFault,
  CorrelationPublicationFaultCode,
  admitCorrelationPublication,
  emptyCorrelationPublicationState,
  settleCorrelationPublication,
  startNextCorrelationPublication,
} from "../dist/index.js";

const first = publication("Publication_1", "settlement-42");
const second = publication("Publication_2", "settlement-43");
const address = first.address;

test("atomically installs one queue record and one fixed future-result reservation", () => {
  const admitted = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    productionCorrelationIngressConfiguration,
    first,
  );
  assert.equal(admitted.result.kind, CorrelationPublicationAdmissionResultKind.Admitted);
  assert.equal(admitted.state.queue.length, 1);
  assert.equal(admitted.state.ledger.length, 1);
  assert.deepEqual(admitted.state.ledger[0], {
    commandId: first.commandId,
    contentSha256: admitted.result.contentSha256,
    phase: CorrelationPublicationLedgerPhase.Queued,
    ordinal: null,
    resolution: null,
  });

  const retained = admitCorrelationPublication(
    admitted.state,
    address,
    productionCorrelationIngressConfiguration,
    first,
  );
  assert.strictEqual(retained.state, admitted.state);
  assert.equal(retained.result.kind, CorrelationPublicationAdmissionResultKind.Retained);
  assert.equal(retained.state.ledger.length, 1);
  assert.throws(
    () => admitCorrelationPublication(
      admitted.state,
      address,
      productionCorrelationIngressConfiguration,
      { ...first, payload: second.payload },
    ),
    (error: unknown) => error instanceof CorrelationPublicationFault &&
      error.code === CorrelationPublicationFaultCode.IdentityConflict,
  );
});

test("refuses queue count, queue bytes, and ledger capacity without retaining identity", () => {
  const queueCountConfiguration = configuration({
    maxQueuedPublicationRecords: 1,
  });
  const one = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    queueCountConfiguration,
    first,
  );
  assert.throws(() =>
    admitCorrelationPublication(
      one.state,
      address,
      queueCountConfiguration,
      second,
    )
  );
  assert.equal(one.state.ledger.length, 1);
  assert.equal(one.state.nextOrdinal, 1);

  const exactQueueBytes = canonicalCorrelationPublicationQueueEncoding(
    one.state.queue,
  ).length;
  const queueBytesConfiguration = configuration({
    maxQueuedPublicationCanonicalBytes: exactQueueBytes,
  });
  const exact = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    queueBytesConfiguration,
    first,
  );
  assert.equal(exact.state.queue.length, 1);
  assert.throws(() =>
    admitCorrelationPublication(
      exact.state,
      address,
      queueBytesConfiguration,
      second,
    )
  );

  const ledgerConfiguration = configuration({
    maxPublicationLedgerRecords: 1,
    maxPublicationLedgerChargedBytes:
      productionCorrelationIngressConfiguration.publicationLedgerRecordBytes,
  });
  const ledgerOne = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    ledgerConfiguration,
    first,
  );
  assert.throws(() =>
    admitCorrelationPublication(
      ledgerOne.state,
      address,
      ledgerConfiguration,
      second,
    )
  );
  assert.equal(ledgerOne.state.ledger.length, 1);

  const reservationBytes = utf8ByteLength(
    canonicalCorrelationPublicationLedgerRecordEncoding(
      one.state.ledger[0]!,
    ),
  );
  assert.throws(() =>
    admitCorrelationPublication(
      emptyCorrelationPublicationState(),
      address,
      configuration({ publicationLedgerRecordBytes: reservationBytes - 1 }),
      first,
    )
  );
});

test("assigns durable ordinals in FIFO order and will not start the next before settlement", () => {
  let state = admitCorrelationPublication(
    emptyCorrelationPublicationState(),
    address,
    productionCorrelationIngressConfiguration,
    first,
  ).state;
  state = admitCorrelationPublication(
    state,
    address,
    productionCorrelationIngressConfiguration,
    second,
  ).state;

  const startedFirst = startNextCorrelationPublication(
    state,
    address,
    productionCorrelationIngressConfiguration,
  );
  assert.equal(startedFirst.result.kind, CorrelationPublicationOrderResultKind.Started);
  assert.equal(startedFirst.result.command.commandId, first.commandId);
  assert.equal(startedFirst.result.ordinal, 1);
  assert.equal(startedFirst.state.nextOrdinal, 2);
  assert.equal(startedFirst.state.ledger[0]?.phase, CorrelationPublicationLedgerPhase.InFlight);

  const blocked = startNextCorrelationPublication(
    startedFirst.state,
    address,
    productionCorrelationIngressConfiguration,
  );
  assert.equal(blocked.result.kind, CorrelationPublicationOrderResultKind.Busy);
  assert.strictEqual(blocked.state, startedFirst.state);

  const settled = settleCorrelationPublication(
    startedFirst.state,
    address,
    productionCorrelationIngressConfiguration,
    {
      commandId: first.commandId,
      ordinal: 1,
      resolution: {
        kind: CorrelationPublicationStoredResolutionKind.Semantic,
        outcome: { kind: CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch },
      },
    },
  );
  const startedSecond = startNextCorrelationPublication(
    settled.state,
    address,
    productionCorrelationIngressConfiguration,
  );
  assert.equal(startedSecond.result.kind, CorrelationPublicationOrderResultKind.Started);
  assert.equal(startedSecond.result.command.commandId, second.commandId);
  assert.equal(startedSecond.result.ordinal, 2);

  const retained = admitCorrelationPublication(
    startedSecond.state,
    address,
    productionCorrelationIngressConfiguration,
    first,
  );
  assert.strictEqual(retained.state, startedSecond.state);
  assert.equal(retained.result.ordinal, 1);

  assert.throws(() =>
    startNextCorrelationPublication(
      {
        ...startedFirst.state,
        nextOrdinal: 3,
        ledger: startedFirst.state.ledger.map((record) => ({
          ...record,
          ordinal: record.ordinal === null ? null : 2,
        })),
        inFlight: startedFirst.state.inFlight === null
          ? null
          : { ...startedFirst.state.inFlight, ordinal: 2 },
      },
      address,
      productionCorrelationIngressConfiguration,
    )
  );
});

function publication(
  commandId: string,
  value: string,
): CorrelationPublicationCommand {
  return {
    commandId,
    address: {
      definition: {
        compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
        semanticProfile: "message-key-correlation-checkpoint",
        sourceId: "settlement-confirmation",
        sourceSha256: "a".repeat(64),
        sourceOverlay: null,
      },
      processId: "Process_SettlementConfirmation",
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_Settlement",
        interfaceOperationId: "Operation_ConfirmSettlement",
        messageId: "Message_SettlementConfirmed",
      },
      correlationKeyId: "CorrelationKey_Settlement",
    },
    payload: { kind: VariableValueKind.String, value },
  };
}

function configuration(
  overrides: Partial<CorrelationIngressConfiguration>,
): CorrelationIngressConfiguration {
  return { ...productionCorrelationIngressConfiguration, ...overrides };
}
