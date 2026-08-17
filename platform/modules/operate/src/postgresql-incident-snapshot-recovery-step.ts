import type { PublicIncident } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import type { IncidentOperationsGateway } from "./incident-contracts.js";
import { snapshotObservationResult } from "./incident-values.js";
import {
  decodeOperateRecoveryCandidateKey,
} from "./postgresql-operate-recovery-candidates.js";
import {
  PostgresqlOperateRecoveryFailureCode,
  PostgresqlOperateRecoveryFailureEvidence,
  PostgresqlOperateRecoveryRetryReason,
  PostgresqlOperateRecoveryStepKind,
} from "./postgresql-operate-recovery-step.js";
import type {
  PostgresqlOperateRecoveryStepResult,
} from "./postgresql-operate-recovery-step.js";
import {
  PostgresqlIncidentSnapshotStoredValueError,
} from "./postgresql-incident-snapshot-generation.js";
import {
  applyPreparedIncidentSnapshot,
  IncidentSnapshotObservationKind,
  readPreparedIncidentSnapshotItem,
} from "./postgresql-incident-snapshot-storage.js";
import type {
  PreparedIncidentSnapshotItem,
} from "./postgresql-incident-snapshot-storage.js";

export type PostgresqlIncidentSnapshotRecoveryStepOptions = Readonly<{
  runtime: PostgresqlRuntime;
  gateway: Pick<IncidentOperationsGateway, "observeIncidents">;
  maxIncidentsPerProcess: number;
}>;

/** Observes one Process outside PostgreSQL and leaves every durable write behind the fence. */
export class PostgresqlIncidentSnapshotRecoveryStep {
  readonly #options: PostgresqlIncidentSnapshotRecoveryStepOptions;

  constructor(options: PostgresqlIncidentSnapshotRecoveryStepOptions) {
    requireCeiling(options.maxIncidentsPerProcess);
    this.#options = options;
  }

  async prepare(candidateKey: Uint8Array): Promise<PostgresqlOperateRecoveryStepResult> {
    const processInstanceId = decodeOperateRecoveryCandidateKey(candidateKey);
    let prepared: PreparedIncidentSnapshotItem | null;
    try {
      prepared = await readPreparedIncidentSnapshotItem(
        this.#options.runtime,
        processInstanceId,
      );
    } catch (error: unknown) {
      return error instanceof PostgresqlIncidentSnapshotStoredValueError
        ? failStored()
        : retryUnavailable();
    }
    if (prepared === null) return completeWithoutChange();
    if (prepared.currentRegistration.observation === "closed") {
      return complete(
        prepared,
        IncidentSnapshotObservationKind.RetainedClosed,
        [],
        this.#options.maxIncidentsPerProcess,
        false,
      );
    }

    let result: unknown;
    try {
      result = await this.#options.gateway.observeIncidents({
        locator: prepared.currentRegistration.locator,
        hostingProcessInstanceId: processInstanceId,
      });
    } catch {
      return retryUnavailable();
    }
    let observation;
    try {
      observation = snapshotObservationResult(result, processInstanceId);
    } catch {
      return failProducer();
    }
    switch (observation.status) {
      case "unknown":
        return {
          kind: PostgresqlOperateRecoveryStepKind.Retry,
          reason: PostgresqlOperateRecoveryRetryReason.ProducerNotReady,
        };
      case "unavailable":
        return retryUnavailable();
      case "closed":
        return complete(
          prepared,
          IncidentSnapshotObservationKind.Closed,
          [],
          this.#options.maxIncidentsPerProcess,
          true,
        );
      case "observed": {
        if (observation.incidents.length > this.#options.maxIncidentsPerProcess) {
          return failProducer();
        }
        const incidents: PublicIncident[] = observation.incidents.map((published) => ({
          hostingInstance: structuredClone(prepared.currentRegistration.instance),
          incident: structuredClone(published.incident),
          availableInteractions: structuredClone(published.interactions),
        }));
        return complete(
          prepared,
          IncidentSnapshotObservationKind.Observed,
          incidents,
          this.#options.maxIncidentsPerProcess,
          true,
        );
      }
    }
  }
}

function complete(
  preparedValue: PreparedIncidentSnapshotItem,
  kind: IncidentSnapshotObservationKind,
  incidentsValue: readonly PublicIncident[],
  ceiling: number,
  productObservationContributed: boolean,
): PostgresqlOperateRecoveryStepResult {
  const prepared = structuredClone(preparedValue);
  const incidents = structuredClone(incidentsValue);
  return {
    kind: PostgresqlOperateRecoveryStepKind.Complete,
    apply: async (session: PostgresqlSession) => {
      await applyPreparedIncidentSnapshot(
        session,
        prepared,
        kind,
        incidents,
        ceiling,
        productObservationContributed,
      );
    },
  };
}

function completeWithoutChange(): PostgresqlOperateRecoveryStepResult {
  return {
    kind: PostgresqlOperateRecoveryStepKind.Complete,
    apply: async () => undefined,
  };
}

function retryUnavailable(): PostgresqlOperateRecoveryStepResult {
  return {
    kind: PostgresqlOperateRecoveryStepKind.Retry,
    reason: PostgresqlOperateRecoveryRetryReason.GatewayUnavailable,
  };
}

function failStored(): PostgresqlOperateRecoveryStepResult {
  return {
    kind: PostgresqlOperateRecoveryStepKind.Fail,
    code: PostgresqlOperateRecoveryFailureCode.StoredCorruption,
    evidence: PostgresqlOperateRecoveryFailureEvidence.RegistrationAndProjection,
  };
}

function failProducer(): PostgresqlOperateRecoveryStepResult {
  return {
    kind: PostgresqlOperateRecoveryStepKind.Fail,
    code: PostgresqlOperateRecoveryFailureCode.DecoderDivergence,
    evidence: PostgresqlOperateRecoveryFailureEvidence.ProducerResult,
  };
}

function requireCeiling(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("incident snapshot per-Process ceiling must be a positive safe integer");
  }
}
