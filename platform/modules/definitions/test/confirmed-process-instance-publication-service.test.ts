import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConfirmedProcessInstancePublicationService,
  ConfirmedProcessInstanceState,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";

const publication = {
  instance: {
    processInstanceId: "instance-1",
    definition: {
      processId: "Review_Process",
      version: 1,
      source: {
        kind: "bpmnSource" as const,
        id: "review.bpmn",
        sha256: "3".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8" as const,
      },
      semanticProfile: "profile-1",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  locator: "bpmn-process-work-v1:private-address",
};

test("retains subscriber acknowledgements and retries only missing delivery", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const operate: string[] = [];
  const work: string[] = [];
  let failWork = true;
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: {
      recordProcessInstance: async (instance) => {
        operate.push(instance.processInstanceId);
      },
    },
    work: {
      recordConfirmedProcessInstance: async (confirmed) => {
        work.push(confirmed.instance.processInstanceId);
        if (failWork) {
          failWork = false;
          throw new Error("work delivery failed");
        }
      },
    },
  });

  await assert.rejects(service.publishConfirmed(publication), /work delivery failed/u);
  const result = await service.publishConfirmed(publication);

  assert.deepEqual(result, publication.instance);
  assert.deepEqual(operate, ["instance-1"]);
  assert.deepEqual(work, ["instance-1", "instance-1"]);
  assert.deepEqual(repository.get("instance-1"), {
    ...publication,
    intent: null,
    state: ConfirmedProcessInstanceState.Confirmed,
    operatePending: false,
    workPending: false,
  });
});

test("never redispatches a direct start after ambiguous transmission", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  let starts = 0;
  let matching = false;
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  const direct = {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "4".repeat(64),
    },
  };
  const host = {
    start: async () => {
      starts += 1;
      throw new Error("response lost");
    },
    describe: async () => ({
      status: matching ? "matching" as const : "missing" as const,
    }),
  };

  const ambiguous = await service.startDirect(direct, host);
  assert.equal(ambiguous.state, ConfirmedProcessInstanceState.Indeterminate);
  matching = true;
  const recovered = await service.startDirect(direct, host);

  assert.equal(recovered.state, ConfirmedProcessInstanceState.Confirmed);
  assert.equal(recovered.operatePending, false);
  assert.equal(recovered.workPending, false);
  assert.equal(starts, 1);
});

test("keeps divergent direct evidence as a stable integrity tombstone", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  const direct = {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "5".repeat(64),
    },
  };
  let starts = 0;
  const host = {
    start: async () => {
      starts += 1;
      throw new Error("response lost");
    },
    describe: async () => ({ status: "divergent" as const }),
  };

  await assert.rejects(service.startDirect(direct, host), /integrity/u);
  await assert.rejects(service.startDirect(direct, host), /integrity/u);
  assert.equal(starts, 1);
  assert.equal(
    repository.get("instance-1")?.state,
    ConfirmedProcessInstanceState.IntegrityFailure,
  );
});

test("startup reconciliation describes direct uncertain state without dispatch", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const direct = {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "6".repeat(64),
    },
  };
  repository.reserveDirect(direct);
  repository.compareAndSetState(
    publication.instance.processInstanceId,
    ConfirmedProcessInstanceState.Reserved,
    ConfirmedProcessInstanceState.Starting,
  );
  let starts = 0;
  let describes = 0;
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });

  await service.reconcileDirect({
    start: async () => {
      starts += 1;
      return { status: "started" };
    },
    describe: async () => {
      describes += 1;
      return { status: "matching" };
    },
  });

  assert.equal(starts, 0);
  assert.equal(describes, 1);
  assert.deepEqual(repository.get(publication.instance.processInstanceId), {
    ...direct,
    state: ConfirmedProcessInstanceState.Confirmed,
    operatePending: false,
    workPending: false,
  });
});
