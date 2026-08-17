import {
  decodeFlowNodeOccurrencePublicationPage,
} from "@bpmn-lean/platform-contracts";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  applyFlowNodeOccurrencePage,
  canonicalBatchText,
  canonicalOccurrenceText,
  createEmptyFlowNodeOccurrenceProjection,
  FlowNodeOccurrenceIntegrityError,
  FlowNodeOccurrenceProjectionStatus,
  FlowNodeOccurrenceStoredValueError,
  occurrenceIdentityFromRegistration,
} from "./flow-node-occurrence-projection.js";
import type {
  FlowNodeOccurrenceProjectionImage,
  FlowNodeOccurrenceRepository,
  ProjectedFlowNodeOccurrence,
} from "./flow-node-occurrence-projection.js";
import {
  encodePostgresqlText,
  occurrenceIdentityText,
  readPostgresqlOccurrenceSnapshot,
  requireMatchingRegistration,
  snapshotProcessInstanceId,
  snapshotRegistration,
} from "./flow-node-occurrence-storage.js";
import type {
  PostgresqlOccurrenceSnapshot,
} from "./flow-node-occurrence-storage.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

/** Transactional occurrence projection over same-database E1; it never closes the caller-owned runtime. */
export class PostgresqlFlowNodeOccurrenceRepository
  implements FlowNodeOccurrenceRepository
{
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async get(
    processInstanceId: string,
  ): Promise<FlowNodeOccurrenceProjectionImage | null> {
    const exactId = snapshotProcessInstanceId(processInstanceId);
    try {
      const snapshot = await readPostgresqlOccurrenceSnapshot(
        this.#runtime,
        exactId,
      );
      return snapshot?.occurrence === undefined
        ? null
        : structuredClone(snapshot.occurrence);
    } catch (error: unknown) {
      if (error instanceof FlowNodeOccurrenceStoredValueError) throw error;
      throw new FlowNodeOccurrenceStoredValueError(error);
    }
  }

  async applyPage(
    registrationValue: OperateProcessRegistration,
    pageValue: FlowNodeOccurrencePage,
  ): Promise<FlowNodeOccurrenceProjectionImage> {
    const registration = snapshotRegistration(registrationValue);
    const page = snapshotPage(registration, pageValue);
    return await this.#runtime.transaction(async (session) => {
      const snapshot = await this.#lockAndRead(session, registration);
      if (snapshot.execution === null) {
        throw new FlowNodeOccurrenceIntegrityError(
          "occurrence publication has no retained E1 projection",
        );
      }
      const prior = snapshot.occurrence ?? createEmptyFlowNodeOccurrenceProjection(
        occurrenceIdentityFromRegistration(registration),
      );
      const next = applyFlowNodeOccurrencePage(
        prior,
        page,
        snapshot.execution,
        "mayBeAhead",
      );
      if (JSON.stringify(prior) !== JSON.stringify(next)) {
        await writePostgresqlOccurrenceHeader(session, next);
        await appendPostgresqlOccurrenceSuffix(session, prior, next);
      }
      return structuredClone(next);
    });
  }

  async replaceFromPages(
    registrationValue: OperateProcessRegistration,
    pageValues: readonly FlowNodeOccurrencePage[],
  ): Promise<FlowNodeOccurrenceProjectionImage> {
    const registration = snapshotRegistration(registrationValue);
    if (!Array.isArray(pageValues)) {
      throw new TypeError("occurrence pages must be an array");
    }
    const pages = pageValues.map((page) => snapshotPage(registration, page));
    return await this.#runtime.transaction(async (session) => {
      const snapshot = await this.#lockAndRead(session, registration);
      if (snapshot.execution === null) {
        throw new FlowNodeOccurrenceIntegrityError(
          "occurrence publication has no retained E1 projection",
        );
      }
      let candidate = createEmptyFlowNodeOccurrenceProjection(
        occurrenceIdentityFromRegistration(registration),
      );
      for (const page of pages) {
        candidate = applyFlowNodeOccurrencePage(
          candidate,
          page,
          snapshot.execution,
          "mayBeAhead",
        );
      }
      if (
        candidate.headRevision === 0 ||
        candidate.producerHeadRevision !== candidate.headRevision
      ) {
        throw new FlowNodeOccurrenceIntegrityError(
          "rebuilt occurrence publication did not reach one complete positive head",
        );
      }
      await replace(session, candidate);
      return structuredClone(candidate);
    });
  }

  async mark(
    registrationValue: OperateProcessRegistration,
    statusValue:
      | FlowNodeOccurrenceProjectionStatus.Gap
      | FlowNodeOccurrenceProjectionStatus.Unavailable,
  ): Promise<void> {
    const registration = snapshotRegistration(registrationValue);
    const status = snapshotMarkStatus(statusValue);
    await this.#runtime.transaction(async (session) => {
      const snapshot = await this.#lockAndRead(session, registration);
      const prior = snapshot.occurrence;
      if (prior === null) {
        await writePostgresqlOccurrenceHeader(session, {
          ...createEmptyFlowNodeOccurrenceProjection(
            occurrenceIdentityFromRegistration(registration),
          ),
          status,
        });
      } else if (prior.status !== status) {
        const result = await session.query({
          text: `
            UPDATE bpmn_platform.operate_flow_node_occurrence_publications
            SET status = $1
            WHERE process_instance_id = $2 AND status = $3
          `,
          values: [
            status,
            encodePostgresqlText(registration.instance.processInstanceId),
            prior.status,
          ],
        });
        if (result.rowCount !== 1) {
          throw new FlowNodeOccurrenceIntegrityError(
            "occurrence status classification lost its retained row",
          );
        }
      }
    });
  }

  async #lockAndRead(
    session: PostgresqlSession,
    registration: OperateProcessRegistration,
  ): Promise<PostgresqlOccurrenceSnapshot> {
    const processInstanceId = registration.instance.processInstanceId;
    const locked = await session.query({
      text: `
        SELECT process_instance_id
        FROM bpmn_platform.operate_process_instances
        WHERE process_instance_id = $1
        FOR UPDATE
      `,
      values: [encodePostgresqlText(processInstanceId)],
    });
    if (locked.rowCount !== 1) {
      throw new FlowNodeOccurrenceIntegrityError(
        "occurrence publication has no confirmed Process instance",
      );
    }
    const snapshot = await readPostgresqlOccurrenceSnapshot(
      session,
      processInstanceId,
    );
    if (snapshot === null) {
      throw new FlowNodeOccurrenceIntegrityError(
        "locked occurrence registration disappeared",
      );
    }
    requireMatchingRegistration(registration, snapshot.registration);
    return snapshot;
  }
}

function snapshotPage(
  registration: OperateProcessRegistration,
  pageValue: FlowNodeOccurrencePage,
): FlowNodeOccurrencePage {
  const page = structuredClone(pageValue);
  return decodeFlowNodeOccurrencePublicationPage(page, {
    ...occurrenceIdentityFromRegistration(registration),
    afterRevision: page.requestedAfterRevision,
    limit: 100,
  });
}

function snapshotMarkStatus(
  value:
    | FlowNodeOccurrenceProjectionStatus.Gap
    | FlowNodeOccurrenceProjectionStatus.Unavailable,
): typeof value {
  switch (value) {
    case FlowNodeOccurrenceProjectionStatus.Gap:
    case FlowNodeOccurrenceProjectionStatus.Unavailable:
      return value;
    default:
      throw new TypeError("occurrence mark status is invalid");
  }
}

export async function writePostgresqlOccurrenceHeader(
  session: PostgresqlSession,
  image: FlowNodeOccurrenceProjectionImage,
): Promise<void> {
  await session.query({
    text: `
      INSERT INTO bpmn_platform.operate_flow_node_occurrence_publications (
        process_instance_id, identity_json, status, head_revision,
        producer_head_revision, last_committed_at_epoch_ms, current_open_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (process_instance_id) DO UPDATE SET
        identity_json = excluded.identity_json,
        status = excluded.status,
        head_revision = excluded.head_revision,
        producer_head_revision = excluded.producer_head_revision,
        last_committed_at_epoch_ms = excluded.last_committed_at_epoch_ms,
        current_open_json = excluded.current_open_json
    `,
    values: [
      encodePostgresqlText(image.identity.processInstanceId),
      occurrenceIdentityText(image),
      image.status,
      image.headRevision,
      image.producerHeadRevision,
      image.lastCommittedAtEpochMs,
      JSON.stringify(image.currentOpen),
    ],
  });
}

async function replace(
  session: PostgresqlSession,
  image: FlowNodeOccurrenceProjectionImage,
): Promise<void> {
  const processInstanceId = image.identity.processInstanceId;
  await writePostgresqlOccurrenceHeader(session, image);
  await session.query({
    text: `
      DELETE FROM bpmn_platform.operate_flow_node_occurrences
      WHERE hosting_process_instance_id = $1
    `,
    values: [encodePostgresqlText(processInstanceId)],
  });
  await session.query({
    text: `
      DELETE FROM bpmn_platform.operate_flow_node_occurrence_batches
      WHERE process_instance_id = $1
    `,
    values: [encodePostgresqlText(processInstanceId)],
  });
  await insertBatches(session, processInstanceId, image.batches);
  await insertOccurrences(session, processInstanceId, image.occurrences);
}

export async function appendPostgresqlOccurrenceSuffix(
  session: PostgresqlSession,
  prior: FlowNodeOccurrenceProjectionImage,
  next: FlowNodeOccurrenceProjectionImage,
): Promise<void> {
  const processInstanceId = next.identity.processInstanceId;
  await insertBatches(
    session,
    processInstanceId,
    next.batches.slice(prior.batches.length),
  );
  const retained = new Map(prior.occurrences.map((occurrence) => [
    occurrenceKey(occurrence),
    occurrence,
  ]));
  const inserted: ProjectedFlowNodeOccurrence[] = [];
  for (const occurrence of next.occurrences) {
    const previous = retained.get(occurrenceKey(occurrence));
    if (previous === undefined) {
      inserted.push(occurrence);
    } else if (
      canonicalOccurrenceText(previous) !== canonicalOccurrenceText(occurrence)
    ) {
      requireTerminalSuccessor(previous, occurrence);
      const result = await session.query({
        text: `
          UPDATE bpmn_platform.operate_flow_node_occurrences
          SET occurrence_json = $1
          WHERE hosting_process_instance_id = $2
            AND start_revision = $3
            AND start_index = $4
            AND occurrence_json = $5
        `,
        values: [
          canonicalOccurrenceText(occurrence),
          encodePostgresqlText(processInstanceId),
          occurrence.id.startRevision,
          occurrence.id.startIndex,
          canonicalOccurrenceText(previous),
        ],
      });
      if (result.rowCount !== 1) {
        throw new FlowNodeOccurrenceIntegrityError(
          "occurrence terminal update lost its exact retained prefix",
        );
      }
    }
    retained.delete(occurrenceKey(occurrence));
  }
  if (retained.size > 0) {
    throw new FlowNodeOccurrenceIntegrityError(
      "occurrence suffix removed a retained occurrence",
    );
  }
  await insertOccurrences(session, processInstanceId, inserted);
}

async function insertBatches(
  session: PostgresqlSession,
  processInstanceId: string,
  batches: readonly FlowNodeOccurrenceBatch[],
): Promise<void> {
  for (const batch of batches) {
    await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_flow_node_occurrence_batches (
          process_instance_id, from_revision, through_revision, command_id,
          committed_at_epoch_ms, batch_json
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      values: [
        encodePostgresqlText(processInstanceId),
        batch.fromRevision,
        batch.throughRevision,
        encodePostgresqlText(batch.commandId),
        batch.committedAtEpochMs,
        canonicalBatchText(batch),
      ],
    });
  }
}

async function insertOccurrences(
  session: PostgresqlSession,
  processInstanceId: string,
  occurrences: readonly ProjectedFlowNodeOccurrence[],
): Promise<void> {
  for (const occurrence of occurrences) {
    await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_flow_node_occurrences (
          hosting_process_instance_id, start_revision, start_index, occurrence_json
        ) VALUES ($1, $2, $3, $4)
      `,
      values: [
        encodePostgresqlText(processInstanceId),
        occurrence.id.startRevision,
        occurrence.id.startIndex,
        canonicalOccurrenceText(occurrence),
      ],
    });
  }
}

function occurrenceKey(occurrence: ProjectedFlowNodeOccurrence): string {
  return JSON.stringify(occurrence.id);
}

function requireTerminalSuccessor(
  prior: ProjectedFlowNodeOccurrence,
  next: ProjectedFlowNodeOccurrence,
): void {
  if (
    prior.terminal !== null ||
    prior.terminalAtEpochMs !== null ||
    next.terminal === null ||
    next.terminalAtEpochMs === null ||
    canonicalOccurrenceText(next) !== canonicalOccurrenceText({
      ...prior,
      terminal: next.terminal,
      terminalAtEpochMs: next.terminalAtEpochMs,
    })
  ) {
    throw new FlowNodeOccurrenceIntegrityError(
      "occurrence suffix changed an accepted occurrence outside terminal closure",
    );
  }
}
