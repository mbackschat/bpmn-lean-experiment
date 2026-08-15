import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  decodeCanonicalOperatorAuditExport,
  operatorAuditExportFormat,
  OperatorAuditMaximumCanonicalResponseBytes,
  serializeOperatorAuditExport,
} from "@bpmn-lean/platform-contracts";

const instance = {
  processInstanceId: "hosting-instance/🚀",
  definition: {
    processId: "OrderProcess",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "order.bpmn",
      sha256: "b".repeat(64),
      byteLength: 512,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "profile/operator-audit",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
} as const;

const value = {
  format: operatorAuditExportFormat,
  instance,
  work: {
    headEventId: "work-1",
    events: [{
      eventId: "work-1",
      actorId: "worker\nalpha",
      recordedAt: "2026-08-15T12:00:02.000Z",
      hostingProcessInstanceId: instance.processInstanceId,
      taskId: {
        processInstanceId: "semantic-instance",
        elementId: "ReviewOrder",
        activation: 1,
      },
      action: { kind: "claim", actionId: "claim-1", outcome: "claimed" },
    }],
  },
  incidentActions: {
    headEventId: "incident-1",
    events: [{
      eventId: "incident-1",
      actorId: "operator-1",
      recordedAt: "2026-08-15T12:00:01.000Z",
      hostingProcessInstanceId: instance.processInstanceId,
      incidentId: {
        effectId: {
          processInstanceId: instance.processInstanceId,
          elementId: "ChargeCard",
          activation: 1,
        },
        generation: 1,
      },
      actionId: "retry-1",
      actionKind: "retryIncident",
      outcome: "committed",
    }],
  },
} as const;

test("emits fixed operator-audit canonical bytes and SHA", () => {
  const bytes = serializeOperatorAuditExport(value, instance);
  const text = new TextDecoder().decode(bytes);
  const fixedByteOracle = String.raw`{"format":"bpmn-lean.operator-audit.v1","incidentActions":{"events":[{"actionId":"retry-1","actionKind":"retryIncident","actorId":"operator-1","eventId":"incident-1","hostingProcessInstanceId":"hosting-instance/🚀","incidentId":{"effectId":{"activation":1,"elementId":"ChargeCard","processInstanceId":"hosting-instance/🚀"},"generation":1},"outcome":"committed","recordedAt":"2026-08-15T12:00:01.000Z"}],"headEventId":"incident-1"},"instance":{"definition":{"processId":"OrderProcess","semanticProfile":"profile/operator-audit","source":{"byteLength":512,"declaredEncoding":"UTF-8","decodedAs":"UTF-8","id":"order.bpmn","kind":"bpmnSource","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"startCapabilities":{"messageStarts":[],"timerStarts":[]},"version":1},"processInstanceId":"hosting-instance/🚀"},"work":{"events":[{"action":{"actionId":"claim-1","kind":"claim","outcome":"claimed"},"actorId":"worker\nalpha","eventId":"work-1","hostingProcessInstanceId":"hosting-instance/🚀","recordedAt":"2026-08-15T12:00:02.000Z","taskId":{"activation":1,"elementId":"ReviewOrder","processInstanceId":"semantic-instance"}}],"headEventId":"work-1"}}`;
  assert.equal(text, fixedByteOracle);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "39fee418002934d34b144fd173607a1bac4784c5561da165c810c561fc0e2a59",
  );
  assert.deepEqual(decodeCanonicalOperatorAuditExport(bytes, instance), value);
});

test("rejects whitespace, key-order, escape-form, and trailing-byte mutations", () => {
  const bytes = serializeOperatorAuditExport(value, instance);
  const text = new TextDecoder().decode(bytes);
  const mutations = [
    new TextEncoder().encode(` ${text}`),
    new TextEncoder().encode(text.replace(
      '{"actionId":"claim-1","kind":"claim","outcome":"claimed"}',
      '{"kind":"claim","actionId":"claim-1","outcome":"claimed"}',
    )),
    new TextEncoder().encode(text.replace("worker\\nalpha", "worker\\u000aalpha")),
    new Uint8Array([...bytes, 0x0a]),
    new Uint8Array([0xc3, 0x28]),
  ];
  for (const mutation of mutations) {
    assert.throws(() => decodeCanonicalOperatorAuditExport(mutation, instance), /canonical/u);
  }
});

test("fails closed before emitting an oversized canonical response", () => {
  const oversizedInstance = {
    ...instance,
    processInstanceId: `instance-${"x".repeat(
      OperatorAuditMaximumCanonicalResponseBytes,
    )}`,
  } as const;
  assert.throws(
    () => serializeOperatorAuditExport({
      format: operatorAuditExportFormat,
      instance: oversizedInstance,
      work: { headEventId: null, events: [] },
      incidentActions: { headEventId: null, events: [] },
    }, oversizedInstance),
    /response byte ceiling/u,
  );
});
