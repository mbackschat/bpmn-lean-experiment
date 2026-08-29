import type { PublicWorkTask } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import type { HumanTaskCatalogReader } from "./human-task-catalog-reader.js";
import { readBoundHumanTaskDefinition } from "./human-task-catalog-reader.js";
import {
  PostgresqlWorkSnapshotStoredValueError,
} from "./postgresql-work-snapshot-generation.js";
import {
  applyPreparedWorkSnapshot,
  readPreparedWorkSnapshotItem,
  WorkSnapshotObservationKind,
} from "./postgresql-work-snapshot-storage.js";
import type {
  PreparedWorkSnapshotItem,
  PreparedWorkSnapshotTask,
} from "./postgresql-work-snapshot-storage.js";
import { projectEngineOpenWorkTask } from "./work-task-projection.js";

export const PostgresqlWorkSnapshotStepKind = {
  Complete: "complete",
  Retry: "retry",
  Fail: "fail",
} as const;

export const PostgresqlWorkSnapshotRetryReason = {
  GatewayUnavailable: "gatewayUnavailable",
  ProducerUnknown: "producerUnknown",
} as const;

export const PostgresqlWorkSnapshotFailureCode = {
  StoredCorruption: "storedCorruption",
  ProducerDivergence: "producerDivergence",
} as const;

export const PostgresqlWorkSnapshotFailureEvidence = {
  GenerationItem: "generationItem",
  ProducerResult: "producerResult",
} as const;

export type PostgresqlWorkSnapshotStepResult =
  | Readonly<{
      kind: typeof PostgresqlWorkSnapshotStepKind.Complete;
      apply: (session: PostgresqlSession) => Promise<void>;
    }>
  | Readonly<{
      kind: typeof PostgresqlWorkSnapshotStepKind.Retry;
      reason: typeof PostgresqlWorkSnapshotRetryReason[
        keyof typeof PostgresqlWorkSnapshotRetryReason
      ];
    }>
  | Readonly<{
      kind: typeof PostgresqlWorkSnapshotStepKind.Fail;
      code: typeof PostgresqlWorkSnapshotFailureCode[
        keyof typeof PostgresqlWorkSnapshotFailureCode
      ];
      evidence: typeof PostgresqlWorkSnapshotFailureEvidence[
        keyof typeof PostgresqlWorkSnapshotFailureEvidence
      ];
    }>;

type WorkObservationGateway = Readonly<{
  observeOpenWork(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
  }>): Promise<
    | Readonly<{ status: "open"; openUserTasks: readonly unknown[] }>
    | Readonly<{ status: "closed" | "unknown" | "unavailable" }>
  >;
}>;

export type PostgresqlWorkSnapshotRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  gateway: WorkObservationGateway;
  catalogs: HumanTaskCatalogReader;
  maxTasks: number;
}>;

/** Prepares one exact Process observation and leaves all durable change behind the lease fence. */
export class PostgresqlWorkSnapshotRecoveryStep {
  readonly #options: PostgresqlWorkSnapshotRecoveryStepOptions;

  constructor(options: PostgresqlWorkSnapshotRecoveryStepOptions) {
    if (!Number.isSafeInteger(options.maxTasks) || options.maxTasks < 1) {
      throw new TypeError("Work snapshot task ceiling must be a positive safe integer");
    }
    this.#options = options;
  }

  async prepare(candidateKey: Uint8Array): Promise<PostgresqlWorkSnapshotStepResult> {
    const processInstanceId = decodeWorkSnapshotCandidateKey(candidateKey);
    let prepared;
    try {
      prepared = await readPreparedWorkSnapshotItem(
        this.#options.runtime,
        processInstanceId,
      );
    } catch (error: unknown) {
      if (!(error instanceof PostgresqlWorkSnapshotStoredValueError)) throw error;
      return failStored();
    }
    if (prepared === null) return completeWithoutChange();
    if (prepared.currentRegistration.observation === "closed") {
      return complete(
        prepared,
        WorkSnapshotObservationKind.RetainedClosed,
        [],
        this.#options.maxTasks,
      );
    }

    let observation;
    try {
      observation = await this.#options.gateway.observeOpenWork({
        locator: prepared.currentRegistration.locator,
        hostingProcessInstanceId: processInstanceId,
      });
    } catch {
      return {
        kind: PostgresqlWorkSnapshotStepKind.Retry,
        reason: PostgresqlWorkSnapshotRetryReason.GatewayUnavailable,
      };
    }
    switch (observation.status) {
      case "unknown":
        return {
          kind: PostgresqlWorkSnapshotStepKind.Retry,
          reason: PostgresqlWorkSnapshotRetryReason.ProducerUnknown,
        };
      case "unavailable":
        return {
          kind: PostgresqlWorkSnapshotStepKind.Retry,
          reason: PostgresqlWorkSnapshotRetryReason.GatewayUnavailable,
        };
      case "closed":
        return complete(
          prepared,
          WorkSnapshotObservationKind.Closed,
          [],
          this.#options.maxTasks,
        );
      case "open":
        return await this.#prepareOpen(prepared, observation.openUserTasks);
      default:
        return failProducer();
    }
  }

  async #prepareOpen(
    prepared: PreparedWorkSnapshotItem,
    tasksValue: readonly unknown[],
  ): Promise<PostgresqlWorkSnapshotStepResult> {
    if (!Array.isArray(tasksValue) || tasksValue.length > this.#options.maxTasks) {
      return failProducer();
    }
    const tasks: PreparedWorkSnapshotTask[] = [];
    const seen = new Set<string>();
    try {
      for (const taskValue of tasksValue) {
        const task = projectEngineOpenWorkTask(
          taskValue,
          prepared.currentRegistration.instance,
        );
        const identity = JSON.stringify(task.id);
        if (seen.has(identity)) return failProducer();
        seen.add(identity);
        tasks.push({
          task,
          structuredTask: await readBoundHumanTaskDefinition(
            this.#options.catalogs,
            prepared.currentRegistration.instance,
            task.id.elementId,
          ),
        });
      }
    } catch {
      return failProducer();
    }
    return complete(
      prepared,
      WorkSnapshotObservationKind.Open,
      tasks,
      this.#options.maxTasks,
    );
  }
}

export function decodeWorkSnapshotCandidateKey(value: Uint8Array): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("Work snapshot candidate key must be nonempty exact UTF-8");
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new TypeError("Work snapshot candidate key must be nonempty exact UTF-8");
  }
  if (decoded.length === 0 || !decoded.isWellFormed()) {
    throw new TypeError("Work snapshot candidate key must be nonempty exact UTF-8");
  }
  const encoded = new TextEncoder().encode(decoded);
  if (encoded.length !== value.length ||
      !encoded.every((byte, index) => byte === value[index])) {
    throw new TypeError("Work snapshot candidate key must be nonempty exact UTF-8");
  }
  return decoded;
}

function complete(
  prepared: PreparedWorkSnapshotItem,
  observation: WorkSnapshotObservationKind,
  tasks: readonly PreparedWorkSnapshotTask[],
  maximumTasks: number,
): PostgresqlWorkSnapshotStepResult {
  const expected = structuredClone(prepared);
  const exactTasks = structuredClone(tasks);
  return {
    kind: PostgresqlWorkSnapshotStepKind.Complete,
    apply: async (session) => {
      await applyPreparedWorkSnapshot(
        session,
        expected,
        observation,
        exactTasks,
        maximumTasks,
      );
    },
  };
}

function completeWithoutChange(): PostgresqlWorkSnapshotStepResult {
  return {
    kind: PostgresqlWorkSnapshotStepKind.Complete,
    apply: async () => undefined,
  };
}

function failStored(): PostgresqlWorkSnapshotStepResult {
  return {
    kind: PostgresqlWorkSnapshotStepKind.Fail,
    code: PostgresqlWorkSnapshotFailureCode.StoredCorruption,
    evidence: PostgresqlWorkSnapshotFailureEvidence.GenerationItem,
  };
}

function failProducer(): PostgresqlWorkSnapshotStepResult {
  return {
    kind: PostgresqlWorkSnapshotStepKind.Fail,
    code: PostgresqlWorkSnapshotFailureCode.ProducerDivergence,
    evidence: PostgresqlWorkSnapshotFailureEvidence.ProducerResult,
  };
}
