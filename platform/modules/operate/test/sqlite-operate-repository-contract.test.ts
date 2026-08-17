import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteExecutionPublicationRepository,
  SqliteFlowNodeOccurrenceRepository,
  SqliteIncidentActionRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";

import {
  registerExecutionPublicationRepositoryContract,
} from "./support/execution-publication-repository-contract.ts";
import {
  registerFlowNodeOccurrenceRepositoryContract,
} from "./support/flow-node-occurrence-repository-contract.ts";
import {
  registerIncidentActionRepositoryContract,
} from "./support/incident-action-repository-contract.ts";
import {
  registerProcessInstanceRepositoryContract,
} from "./support/process-instance-repository-contract.ts";

registerProcessInstanceRepositoryContract(
  "SQLite Process registry contract",
  async () => {
    const store = await createStore();
    const repository = new SqliteProcessInstanceRepository(store.databaseFile);
    return {
      repository,
      dispose: async () => {
        repository.close();
        await store.dispose();
      },
    };
  },
);

registerIncidentActionRepositoryContract(
  "SQLite incident-action contract",
  async () => {
    const store = await createStore();
    const processes = new SqliteProcessInstanceRepository(store.databaseFile);
    const incidents = new SqliteIncidentActionRepository(store.databaseFile);
    return {
      processes,
      incidents,
      dispose: async () => {
        incidents.close();
        processes.close();
        await store.dispose();
      },
    };
  },
);

registerExecutionPublicationRepositoryContract(
  "SQLite committed-execution contract",
  async () => {
    const store = await createStore();
    const processes = new SqliteProcessInstanceRepository(store.databaseFile);
    const executions = new SqliteExecutionPublicationRepository(store.databaseFile);
    return {
      processes,
      executions,
      dispose: async () => {
        executions.close();
        processes.close();
        await store.dispose();
      },
    };
  },
);

registerFlowNodeOccurrenceRepositoryContract(
  "SQLite flow-node-occurrence contract",
  async () => {
    const store = await createStore();
    const processes = new SqliteProcessInstanceRepository(store.databaseFile);
    const executions = new SqliteExecutionPublicationRepository(store.databaseFile);
    const occurrences = new SqliteFlowNodeOccurrenceRepository(
      store.databaseFile,
      executions,
    );
    return {
      processes,
      executions,
      occurrences,
      dispose: async () => {
        occurrences.close();
        executions.close();
        processes.close();
        await store.dispose();
      },
    };
  },
);

async function createStore(): Promise<Readonly<{
  databaseFile: string;
  dispose: () => Promise<void>;
}>> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-operate-contract-"));
  return {
    databaseFile: join(root, "operate.sqlite"),
    dispose: async () => await rm(root, { recursive: true, force: true }),
  };
}
