import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConfirmedProcessInstancePublicationService,
  ConfirmedProcessInstanceState,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
  ConfirmedProcessInstanceState as ConfirmedProcessInstanceStateValue,
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
const emptyStartCommandBytes = new TextEncoder().encode('{"initialVariables":[]}');

test("retains subscriber acknowledgements and retries only missing delivery", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const operate: ConfirmedProcessInstancePublication[] = [];
  const work: ConfirmedProcessInstancePublication[] = [];
  let failWork = true;
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: {
      recordConfirmedProcessInstance: async (confirmed) => {
        operate.push(structuredClone(confirmed));
      },
    },
    work: {
      recordConfirmedProcessInstance: async (confirmed) => {
        work.push(structuredClone(confirmed));
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
  assert.deepEqual(operate, [publication]);
  assert.deepEqual(work, [publication, publication]);
  assert.deepEqual(await repository.get("instance-1"), {
    ...publication,
    intent: null,
    startCommandBytes: null,
    state: ConfirmedProcessInstanceState.Confirmed,
    operatePending: false,
    workPending: false,
  });
});

test("single-item delivery re-reads one exact registration", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const delivered: string[] = [];
  const other = {
    ...structuredClone(publication),
    instance: {
      ...structuredClone(publication.instance),
      processInstanceId: "instance-2",
    },
  };
  await repository.confirm(publication);
  await repository.confirm(other);
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: {
      recordConfirmedProcessInstance: async ({ instance }) => {
        delivered.push(`operate:${instance.processInstanceId}`);
      },
    },
    work: {
      recordConfirmedProcessInstance: async ({ instance }) => {
        delivered.push(`work:${instance.processInstanceId}`);
      },
    },
  });

  await service.reconcileDelivery(publication.instance.processInstanceId);

  assert.deepEqual(delivered, ["operate:instance-1", "work:instance-1"]);
  assert.equal((await repository.get("instance-1"))?.operatePending, false);
  assert.equal((await repository.get("instance-2"))?.operatePending, true);
});

test("in-memory direct records snapshot, compare, and CAS exact command bytes", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const originalText = '{"initialVariables":[{"name":"items","value":{"kind":"stringList","value":["a","b"]}}]}';
  const callerBytes = new TextEncoder().encode(originalText);
  const direct = {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "3".repeat(64),
    },
    startCommandBytes: callerBytes,
  };

  const reserved = await repository.reserveDirect(direct);
  callerBytes.fill(0);
  reserved.record.startCommandBytes!.fill(0);
  assert.equal(
    new TextDecoder().decode(
      (await repository.get(publication.instance.processInstanceId))!.startCommandBytes!,
    ),
    originalText,
  );
  assert.equal((await repository.reserveDirect({
    ...direct,
    startCommandBytes: new TextEncoder().encode(originalText),
  })).inserted, false);
  await assert.rejects(
    repository.reserveDirect({
      ...direct,
      startCommandBytes: new TextEncoder().encode(
        '{"initialVariables":[{"name":"items","value":{"kind":"stringList","value":["changed"]}}]}',
      ),
    }),
    /integrity/u,
  );

  const starting = await repository.compareAndSetState(
    publication.instance.processInstanceId,
    ConfirmedProcessInstanceState.Reserved,
    ConfirmedProcessInstanceState.Starting,
  );
  starting!.startCommandBytes!.fill(0);
  assert.equal(
    new TextDecoder().decode(
      (await repository.get(publication.instance.processInstanceId))!.startCommandBytes!,
    ),
    originalText,
  );
});

test("never redispatches a direct start after ambiguous transmission", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  let starts = 0;
  let matching = false;
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordConfirmedProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  const direct = {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "4".repeat(64),
    },
    startCommandBytes: Uint8Array.from(emptyStartCommandBytes),
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
    operate: { recordConfirmedProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  const direct = {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "5".repeat(64),
    },
    startCommandBytes: Uint8Array.from(emptyStartCommandBytes),
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
    (await repository.get("instance-1"))?.state,
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
    startCommandBytes: Uint8Array.from(emptyStartCommandBytes),
  };
  await repository.reserveDirect(direct);
  await repository.compareAndSetState(
    publication.instance.processInstanceId,
    ConfirmedProcessInstanceState.Reserved,
    ConfirmedProcessInstanceState.Starting,
  );
  let starts = 0;
  let describes = 0;
  const service = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordConfirmedProcessInstance: async () => undefined },
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
  assert.deepEqual(await repository.get(publication.instance.processInstanceId), {
    ...direct,
    state: ConfirmedProcessInstanceState.Confirmed,
    operatePending: false,
    workPending: false,
  });
});

test("definitive direct-start success converges after recovery marks the dispatch indeterminate", async () => {
  const repository = new ConcurrentIndeterminateRepository(
    ConfirmedProcessInstanceState.Confirmed,
  );
  const service = directPublicationService(repository);

  const result = await service.startDirect(directReservation(), {
    start: async () => ({ status: "started" }),
    describe: async () => ({ status: "missing" }),
  });

  assert.equal(result.state, ConfirmedProcessInstanceState.Confirmed);
  assert.equal(
    (await repository.get(publication.instance.processInstanceId))?.state,
    ConfirmedProcessInstanceState.Confirmed,
  );
});

test("definitive direct-start rejection converges after recovery marks the dispatch indeterminate", async () => {
  const repository = new ConcurrentIndeterminateRepository(
    ConfirmedProcessInstanceState.IntegrityFailure,
  );
  const service = directPublicationService(repository);

  await assert.rejects(
    service.startDirect(directReservation(), {
      start: async () => ({ status: "rejected", evidence: "not admitted" }),
      describe: async () => ({ status: "missing" }),
    }),
    /integrity/u,
  );

  assert.equal(
    (await repository.get(publication.instance.processInstanceId))?.state,
    ConfirmedProcessInstanceState.IntegrityFailure,
  );
});

class ConcurrentIndeterminateRepository extends InMemoryConfirmedProcessInstanceRepository {
  readonly #target: ConfirmedProcessInstanceStateValue;
  #interposed = false;

  constructor(target: ConfirmedProcessInstanceStateValue) {
    super();
    this.#target = target;
  }

  override async compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceStateValue,
    next: ConfirmedProcessInstanceStateValue,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    if (
      !this.#interposed &&
      expected === ConfirmedProcessInstanceState.Starting &&
      next === this.#target
    ) {
      this.#interposed = true;
      await super.compareAndSetState(
        processInstanceId,
        ConfirmedProcessInstanceState.Starting,
        ConfirmedProcessInstanceState.Indeterminate,
      );
      return null;
    }
    return await super.compareAndSetState(processInstanceId, expected, next);
  }
}

function directPublicationService(
  repository: InMemoryConfirmedProcessInstanceRepository,
): ConfirmedProcessInstancePublicationService {
  return new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordConfirmedProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
}

function directReservation() {
  return {
    ...publication,
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "7".repeat(64),
    },
    startCommandBytes: Uint8Array.from(emptyStartCommandBytes),
  };
}
