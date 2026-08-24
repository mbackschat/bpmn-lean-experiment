import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceOperateBootstrap,
  ConfirmedProcessInstanceState,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  ConfirmedProcessInstanceOperateSubscriber,
  ConfirmedProcessInstancePublication,
} from "@bpmn-lean/platform-definitions";

const publication = confirmedPublication("instance-1", "direct-locator");
const emptyStartCommandBytes = new TextEncoder().encode('{"initialVariables":[]}');

test("bootstraps every acknowledged confirmed publication without changing delivery markers", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  await repository.confirm(publication);
  await repository.acknowledge(publication.instance.processInstanceId, "operate");
  await repository.acknowledge(publication.instance.processInstanceId, "work");
  const retained = await repository.get(publication.instance.processInstanceId);
  const attempts: ConfirmedProcessInstancePublication[] = [];
  const bootstrap = new ConfirmedProcessInstanceOperateBootstrap({
    repository,
    operate: {
      recordConfirmedProcessInstance: async (confirmed) => {
        attempts.push(structuredClone(confirmed));
      },
    },
  });

  assert.deepEqual(await repository.listForReconciliation(), []);
  await bootstrap.bootstrap();
  await bootstrap.bootstrap();

  assert.deepEqual(attempts, [publication, publication]);
  assert.deepEqual(
    await repository.get(publication.instance.processInstanceId),
    retained,
  );
});

test("enumerates only confirmed rows for retrospective Operate delivery", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const confirmed = confirmedPublication("confirmed", "confirmed-locator");
  await repository.confirm(confirmed);
  await reserve(repository, "reserved");
  await reserve(repository, "starting");
  await repository.compareAndSetState(
    "starting",
    ConfirmedProcessInstanceState.Reserved,
    ConfirmedProcessInstanceState.Starting,
  );
  await reserve(repository, "indeterminate");
  await repository.compareAndSetState(
    "indeterminate",
    ConfirmedProcessInstanceState.Reserved,
    ConfirmedProcessInstanceState.Starting,
  );
  await repository.compareAndSetState(
    "indeterminate",
    ConfirmedProcessInstanceState.Starting,
    ConfirmedProcessInstanceState.Indeterminate,
  );
  await reserve(repository, "integrity-failure");
  await repository.compareAndSetState(
    "integrity-failure",
    ConfirmedProcessInstanceState.Reserved,
    ConfirmedProcessInstanceState.IntegrityFailure,
  );

  assert.deepEqual(await repository.listConfirmed(), [
    {
      ...confirmed,
      intent: null,
      startCommandBytes: null,
      state: ConfirmedProcessInstanceState.Confirmed,
      operatePending: true,
      workPending: true,
    },
  ]);
});

test("aborts on partial failure and converges from the full enumeration after restart", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  const first = confirmedPublication("instance-a", "locator-a");
  const second = confirmedPublication("instance-b", "locator-b");
  await repository.confirm(second);
  await repository.confirm(first);
  const operate = new ExactOperateSubscriber("instance-b");
  const bootstrap = new ConfirmedProcessInstanceOperateBootstrap({
    repository,
    operate,
  });

  await assert.rejects(bootstrap.bootstrap(), /delivery unavailable/u);
  assert.deepEqual(operate.attempts, [first, second]);
  assert.deepEqual(operate.retained(), [first]);

  await bootstrap.bootstrap();

  assert.deepEqual(operate.attempts, [first, second, first, second]);
  assert.deepEqual(operate.retained(), [first, second]);
});

test("propagates locator and identity drift without overwriting retained data", async () => {
  const repository = new InMemoryConfirmedProcessInstanceRepository();
  await repository.confirm(publication);
  const divergentPublications = [
    { ...publication, locator: "divergent-locator" },
    {
      ...publication,
      instance: {
        ...publication.instance,
        definition: {
          ...publication.instance.definition,
          semanticProfile: "divergent-profile",
        },
      },
    },
  ];

  for (const divergent of divergentPublications) {
    const operate = new ExactOperateSubscriber();
    operate.seed(divergent);
    const bootstrap = new ConfirmedProcessInstanceOperateBootstrap({
      repository,
      operate,
    });

    await assert.rejects(
      bootstrap.bootstrap(),
      (error: unknown) => error instanceof ConfirmedProcessInstanceIntegrityError,
    );
    assert.deepEqual(operate.retained(), [divergent]);
  }
});

class ExactOperateSubscriber implements ConfirmedProcessInstanceOperateSubscriber {
  readonly attempts: ConfirmedProcessInstancePublication[] = [];
  readonly #records = new Map<string, ConfirmedProcessInstancePublication>();
  #failOnceFor: string | null;

  constructor(failOnceFor: string | null = null) {
    this.#failOnceFor = failOnceFor;
  }

  async recordConfirmedProcessInstance(
    confirmed: ConfirmedProcessInstancePublication,
  ): Promise<void> {
    const snapshot = structuredClone(confirmed);
    this.attempts.push(snapshot);
    if (this.#failOnceFor === snapshot.instance.processInstanceId) {
      this.#failOnceFor = null;
      throw new Error("delivery unavailable");
    }
    const existing = this.#records.get(snapshot.instance.processInstanceId);
    if (existing !== undefined && !samePublication(existing, snapshot)) {
      throw new ConfirmedProcessInstanceIntegrityError(
        snapshot.instance.processInstanceId,
      );
    }
    this.#records.set(snapshot.instance.processInstanceId, snapshot);
  }

  seed(confirmed: ConfirmedProcessInstancePublication): void {
    const snapshot = structuredClone(confirmed);
    this.#records.set(snapshot.instance.processInstanceId, snapshot);
  }

  retained(): ReadonlyArray<ConfirmedProcessInstancePublication> {
    return [...this.#records.values()]
      .sort((left, right) => {
        const leftId = left.instance.processInstanceId;
        const rightId = right.instance.processInstanceId;
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      })
      .map((record) => structuredClone(record));
  }
}

async function reserve(
  repository: InMemoryConfirmedProcessInstanceRepository,
  processInstanceId: string,
): Promise<void> {
  await repository.reserveDirect({
    ...confirmedPublication(processInstanceId, `${processInstanceId}-locator`),
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: processInstanceId.length.toString(16).padStart(64, "0"),
    },
    startCommandBytes: Uint8Array.from(emptyStartCommandBytes),
  });
}

function confirmedPublication(
  processInstanceId: string,
  locator: string,
): ConfirmedProcessInstancePublication {
  return {
    instance: {
      processInstanceId,
      definition: {
        processId: "Review_Process",
        version: 1,
        source: {
          kind: "bpmnSource",
          id: "review.bpmn",
          sha256: "3".repeat(64),
          byteLength: 42,
          declaredEncoding: null,
          decodedAs: "UTF-8",
        },
        semanticProfile: "profile-1",
        startCapabilities: { messageStarts: [], timerStarts: [] },
      },
    },
    locator,
  };
}

function samePublication(
  left: ConfirmedProcessInstancePublication,
  right: ConfirmedProcessInstancePublication,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
