import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import {
  decodePublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationIdentity,
  OpenFlowNodeOccurrence,
} from "@bpmn-lean/platform-contracts";

import type {
  ExecutionPublicationProjectionImage,
  ExecutionPublicationRepository,
} from "./execution-publication-contracts.js";
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
import type { OperateProcessRegistration } from "./incident-contracts.js";
import { initializeOperateSchema } from "./sqlite-operate-schema.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable owner of the occurrence prefix, separate from every E1 table. */
export class SqliteFlowNodeOccurrenceRepository
  implements FlowNodeOccurrenceRepository
{
  readonly #database: DatabaseSync;
  readonly #executions: Pick<ExecutionPublicationRepository, "get">;

  constructor(
    databaseFile: string,
    executions: Pick<ExecutionPublicationRepository, "get">,
    busyTimeoutMs: number = defaultBusyTimeoutMs,
  ) {
    requirePositive(busyTimeoutMs, "busyTimeoutMs");
    this.#executions = executions;
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      initializeOperateSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  async get(
    processInstanceId: string,
  ): Promise<FlowNodeOccurrenceProjectionImage | null> {
    try {
      const exactId = requireText(processInstanceId, "processInstanceId");
      const execution = this.#hasPositiveHead(exactId)
        ? await this.#requireExecution(exactId)
        : null;
      return this.#read(exactId, execution);
    } catch (error: unknown) {
      if (error instanceof FlowNodeOccurrenceStoredValueError) throw error;
      throw new FlowNodeOccurrenceStoredValueError(error);
    }
  }

  async applyPage(
    registration: OperateProcessRegistration,
    page: FlowNodeOccurrencePage,
  ): Promise<FlowNodeOccurrenceProjectionImage> {
    const execution = await this.#requireExecution(
      registration.instance.processInstanceId,
    );
    return this.#transaction(() => {
      this.#requireRegistration(registration);
      const identity = occurrenceIdentityFromRegistration(registration);
      const prior = this.#read(registration.instance.processInstanceId, execution) ??
        createEmptyFlowNodeOccurrenceProjection(identity);
      const next = applyFlowNodeOccurrencePage(prior, page, execution);
      if (JSON.stringify(prior) !== JSON.stringify(next)) {
        this.#writeHeader(next);
        this.#appendSuffix(prior, next);
      }
      return structuredClone(next);
    });
  }

  async replaceFromPages(
    registration: OperateProcessRegistration,
    pages: readonly FlowNodeOccurrencePage[],
  ): Promise<FlowNodeOccurrenceProjectionImage> {
    const execution = await this.#requireExecution(
      registration.instance.processInstanceId,
    );
    let candidate = createEmptyFlowNodeOccurrenceProjection(
      occurrenceIdentityFromRegistration(registration),
    );
    for (const page of pages) {
      candidate = applyFlowNodeOccurrencePage(candidate, page, execution);
    }
    if (
      candidate.headRevision === 0 ||
      candidate.producerHeadRevision !== candidate.headRevision
    ) {
      throw new FlowNodeOccurrenceIntegrityError(
        "rebuilt occurrence publication did not reach one complete positive head",
      );
    }
    const retainedExecution = await this.#requireExecution(
      registration.instance.processInstanceId,
    );
    return this.#transaction(() => {
      this.#requireRegistration(registration);
      let verified = createEmptyFlowNodeOccurrenceProjection(
        occurrenceIdentityFromRegistration(registration),
      );
      for (const page of pages) {
        verified = applyFlowNodeOccurrencePage(
          verified,
          page,
          retainedExecution,
        );
      }
      if (
        verified.headRevision === 0 ||
        verified.producerHeadRevision !== verified.headRevision
      ) {
        throw new FlowNodeOccurrenceIntegrityError(
          "rebuilt occurrence publication changed before persistence",
        );
      }
      this.#replace(verified);
      return structuredClone(verified);
    });
  }

  async mark(
    registration: OperateProcessRegistration,
    status:
      | FlowNodeOccurrenceProjectionStatus.Gap
      | FlowNodeOccurrenceProjectionStatus.Unavailable,
  ): Promise<void> {
    const processInstanceId = registration.instance.processInstanceId;
    const execution = this.#hasPositiveHead(processInstanceId)
      ? await this.#requireExecution(processInstanceId)
      : null;
    this.#transaction(() => {
      this.#requireRegistration(registration);
      const identity = occurrenceIdentityFromRegistration(registration);
      const prior = this.#read(processInstanceId, execution);
      if (prior === null) {
        this.#writeHeader({
          ...createEmptyFlowNodeOccurrenceProjection(identity),
          status,
        });
      } else if (prior.status !== status) {
        const changes = this.#database.prepare(`
          UPDATE flow_node_occurrence_publications
          SET status = ?
          WHERE process_instance_id = ?
        `).run(status, registration.instance.processInstanceId).changes;
        if (changes !== 1) {
          throw new FlowNodeOccurrenceIntegrityError(
            "occurrence status classification lost its retained row",
          );
        }
      }
    });
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  #read(
    processInstanceId: string,
    execution: ExecutionPublicationProjectionImage | null,
  ): FlowNodeOccurrenceProjectionImage | null {
    const row = this.#database.prepare(`
      SELECT
        o.identity_json,
        o.status,
        o.head_revision,
        o.producer_head_revision,
        o.last_committed_at_epoch_ms,
        o.current_open_json,
        p.public_identity_json
      FROM flow_node_occurrence_publications o
      JOIN process_instances p USING (process_instance_id)
      WHERE o.process_instance_id = ?
    `).get(processInstanceId);
    if (row === undefined) return null;
    const publicInstance = decodePublicProcessInstanceIdentity(
      JSON.parse(requireText(row.public_identity_json, "public_identity_json")),
    );
    const identity = occurrenceIdentityFromRegistration({ instance: publicInstance });
    if (requireText(row.identity_json, "identity_json") !== identityText(identity)) {
      throw new TypeError("stored occurrence identity disagrees with registration");
    }
    const status = requireStatus(row.status);
    const headRevision = requireNonnegative(row.head_revision, "head_revision");
    const producerHeadRevision = row.producer_head_revision === null
      ? null
      : requirePositive(row.producer_head_revision, "producer_head_revision");
    const lastCommittedAtEpochMs = row.last_committed_at_epoch_ms === null
      ? null
      : requireNonnegative(
          row.last_committed_at_epoch_ms,
          "last_committed_at_epoch_ms",
        );
    const storedCurrentOpenText = requireText(
      row.current_open_json,
      "current_open_json",
    );
    const batches = this.#readBatches(processInstanceId);
    let image = createEmptyFlowNodeOccurrenceProjection(identity);
    if (headRevision > 0) {
      if (producerHeadRevision === null || execution === null) {
        throw new TypeError("positive occurrence head has no producer authority");
      }
      for (const batch of batches) {
        const reachesHead = batch.throughRevision === producerHeadRevision;
        const page: FlowNodeOccurrencePage = {
          ...identity,
          requestedAfterRevision: batch.fromRevision,
          pageThroughRevision: batch.throughRevision,
          headRevision: producerHeadRevision,
          batches: [batch],
          currentOpen: reachesHead
            ? JSON.parse(storedCurrentOpenText) as OpenFlowNodeOccurrence[]
            : null,
        };
        image = applyFlowNodeOccurrencePage(
          image,
          page,
          execution,
          "mayBeAhead",
        );
      }
    } else if (
      batches.length > 0 ||
      producerHeadRevision !== null ||
      lastCommittedAtEpochMs !== null ||
      storedCurrentOpenText !== "[]"
    ) {
      throw new TypeError("revision-zero occurrence projection retained content");
    }
    const storedOccurrences = this.#readOccurrences(processInstanceId);
    if (
      image.headRevision !== headRevision ||
      image.lastCommittedAtEpochMs !== lastCommittedAtEpochMs ||
      JSON.stringify(image.currentOpen) !== storedCurrentOpenText ||
      storedOccurrences.length !== image.occurrences.length ||
      storedOccurrences.some((occurrence, index) =>
        canonicalOccurrenceText(occurrence) !==
          canonicalOccurrenceText(image.occurrences[index]!)
      )
    ) {
      throw new TypeError("stored occurrence projection columns disagree");
    }
    return { ...image, status };
  }

  #readBatches(processInstanceId: string): FlowNodeOccurrenceBatch[] {
    return this.#database.prepare(`
      SELECT
        from_revision,
        through_revision,
        command_id,
        committed_at_epoch_ms,
        batch_json
      FROM flow_node_occurrence_batches
      WHERE process_instance_id = ?
      ORDER BY from_revision ASC
    `).all(processInstanceId).map((row) => {
      const encoded = requireText(row.batch_json, "batch_json");
      const batch = JSON.parse(encoded) as FlowNodeOccurrenceBatch;
      if (
        canonicalBatchText(batch) !== encoded ||
        batch.fromRevision !== requireNonnegative(row.from_revision, "from_revision") ||
        batch.throughRevision !== requirePositive(row.through_revision, "through_revision") ||
        batch.commandId !== requireText(row.command_id, "command_id") ||
        batch.committedAtEpochMs !== requireNonnegative(
          row.committed_at_epoch_ms,
          "committed_at_epoch_ms",
        )
      ) {
        throw new TypeError("stored occurrence batch columns disagree");
      }
      return batch;
    });
  }

  #readOccurrences(processInstanceId: string): ProjectedFlowNodeOccurrence[] {
    return this.#database.prepare(`
      SELECT start_revision, start_index, occurrence_json
      FROM flow_node_occurrences
      WHERE hosting_process_instance_id = ?
      ORDER BY start_revision ASC, start_index ASC
    `).all(processInstanceId).map((row) => {
      const encoded = requireText(row.occurrence_json, "occurrence_json");
      const occurrence = JSON.parse(encoded) as ProjectedFlowNodeOccurrence;
      if (
        canonicalOccurrenceText(occurrence) !== encoded ||
        occurrence.id.processInstanceId !== processInstanceId ||
        occurrence.id.startRevision !== requirePositive(
          row.start_revision,
          "start_revision",
        ) ||
        occurrence.id.startIndex !== requireNonnegative(row.start_index, "start_index")
      ) {
        throw new TypeError("stored occurrence row columns disagree");
      }
      return occurrence;
    });
  }

  #requireRegistration(registration: OperateProcessRegistration): void {
    const row = this.#database.prepare(`
      SELECT public_identity_json, process_locator
      FROM process_instances WHERE process_instance_id = ?
    `).get(registration.instance.processInstanceId);
    if (
      row === undefined ||
      requireText(row.public_identity_json, "public_identity_json") !==
        JSON.stringify(registration.instance) ||
      requireText(row.process_locator, "process_locator") !== registration.locator
    ) {
      throw new FlowNodeOccurrenceIntegrityError(
        "occurrence publication registration changed",
      );
    }
  }

  #hasPositiveHead(processInstanceId: string): boolean {
    const row = this.#database.prepare(`
      SELECT head_revision FROM flow_node_occurrence_publications
      WHERE process_instance_id = ?
    `).get(processInstanceId);
    return row !== undefined &&
      requireNonnegative(row.head_revision, "head_revision") > 0;
  }

  async #requireExecution(
    processInstanceId: string,
  ): Promise<ExecutionPublicationProjectionImage> {
    const execution = await this.#executions.get(processInstanceId);
    if (execution === null) {
      throw new FlowNodeOccurrenceIntegrityError(
        "occurrence publication has no retained E1 projection",
      );
    }
    return execution;
  }

  #writeHeader(image: FlowNodeOccurrenceProjectionImage): void {
    const processInstanceId = image.identity.processInstanceId;
    this.#database.prepare(`
      INSERT INTO flow_node_occurrence_publications (
        process_instance_id,
        identity_json,
        status,
        head_revision,
        producer_head_revision,
        last_committed_at_epoch_ms,
        current_open_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(process_instance_id) DO UPDATE SET
        identity_json = excluded.identity_json,
        status = excluded.status,
        head_revision = excluded.head_revision,
        producer_head_revision = excluded.producer_head_revision,
        last_committed_at_epoch_ms = excluded.last_committed_at_epoch_ms,
        current_open_json = excluded.current_open_json
    `).run(
      processInstanceId,
      identityText(image.identity),
      image.status,
      image.headRevision,
      image.producerHeadRevision,
      image.lastCommittedAtEpochMs,
      JSON.stringify(image.currentOpen),
    );
  }

  #replace(image: FlowNodeOccurrenceProjectionImage): void {
    const processInstanceId = image.identity.processInstanceId;
    this.#writeHeader(image);
    this.#database.prepare(`
      DELETE FROM flow_node_occurrence_batches WHERE process_instance_id = ?
    `).run(processInstanceId);
    this.#database.prepare(`
      DELETE FROM flow_node_occurrences WHERE hosting_process_instance_id = ?
    `).run(processInstanceId);
    this.#insertBatches(processInstanceId, image.batches);
    this.#insertOccurrences(processInstanceId, image.occurrences);
  }

  #appendSuffix(
    prior: FlowNodeOccurrenceProjectionImage,
    next: FlowNodeOccurrenceProjectionImage,
  ): void {
    const processInstanceId = next.identity.processInstanceId;
    this.#insertBatches(
      processInstanceId,
      next.batches.slice(prior.batches.length),
    );
    const priorById = new Map(prior.occurrences.map((occurrence) => [
      occurrenceKey(occurrence),
      occurrence,
    ]));
    const newOccurrences: ProjectedFlowNodeOccurrence[] = [];
    const updateOccurrence = this.#database.prepare(`
      UPDATE flow_node_occurrences SET occurrence_json = ?
      WHERE hosting_process_instance_id = ?
        AND start_revision = ?
        AND start_index = ?
        AND occurrence_json = ?
    `);
    for (const occurrence of next.occurrences) {
      const priorOccurrence = priorById.get(occurrenceKey(occurrence));
      if (priorOccurrence === undefined) {
        newOccurrences.push(occurrence);
      } else if (
        canonicalOccurrenceText(priorOccurrence) !== canonicalOccurrenceText(occurrence)
      ) {
        requireTerminalSuccessor(priorOccurrence, occurrence);
        const changes = updateOccurrence.run(
          canonicalOccurrenceText(occurrence),
          processInstanceId,
          occurrence.id.startRevision,
          occurrence.id.startIndex,
          canonicalOccurrenceText(priorOccurrence),
        ).changes;
        if (changes !== 1) {
          throw new FlowNodeOccurrenceIntegrityError(
            "occurrence terminal update lost its exact retained prefix",
          );
        }
      }
      priorById.delete(occurrenceKey(occurrence));
    }
    if (priorById.size > 0) {
      throw new FlowNodeOccurrenceIntegrityError(
        "occurrence suffix removed a retained occurrence",
      );
    }
    this.#insertOccurrences(processInstanceId, newOccurrences);
  }

  #insertBatches(
    processInstanceId: string,
    batches: readonly FlowNodeOccurrenceBatch[],
  ): void {
    const insertBatch = this.#database.prepare(`
      INSERT INTO flow_node_occurrence_batches (
        process_instance_id,
        from_revision,
        through_revision,
        command_id,
        committed_at_epoch_ms,
        batch_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const batch of batches) {
      insertBatch.run(
        processInstanceId,
        batch.fromRevision,
        batch.throughRevision,
        batch.commandId,
        batch.committedAtEpochMs,
        canonicalBatchText(batch),
      );
    }
  }

  #insertOccurrences(
    processInstanceId: string,
    occurrences: readonly ProjectedFlowNodeOccurrence[],
  ): void {
    const insertOccurrence = this.#database.prepare(`
      INSERT INTO flow_node_occurrences (
        hosting_process_instance_id,
        start_revision,
        start_index,
        occurrence_json
      ) VALUES (?, ?, ?, ?)
    `);
    for (const occurrence of occurrences) {
      insertOccurrence.run(
        processInstanceId,
        occurrence.id.startRevision,
        occurrence.id.startIndex,
        canonicalOccurrenceText(occurrence),
      );
    }
  }

  #transaction<T>(run: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.#database.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
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

function identityText(identity: FlowNodeOccurrencePublicationIdentity): string {
  return JSON.stringify({
    definition: {
      compiler: identity.definition.compiler,
      semanticProfile: identity.definition.semanticProfile,
      sourceId: identity.definition.sourceId,
      sourceSha256: identity.definition.sourceSha256,
      sourceOverlay: identity.definition.sourceOverlay,
    },
    processId: identity.processId,
    processInstanceId: identity.processInstanceId,
  });
}

function requireStatus(value: SQLOutputValue | undefined): FlowNodeOccurrenceProjectionStatus {
  switch (value) {
    case FlowNodeOccurrenceProjectionStatus.Healthy:
    case FlowNodeOccurrenceProjectionStatus.Gap:
    case FlowNodeOccurrenceProjectionStatus.Unavailable:
      return value;
    default:
      throw new TypeError("stored occurrence status is invalid");
  }
}

function requireText(value: SQLOutputValue | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be nonempty text`);
  }
  return value;
}

function requirePositive(
  value: SQLOutputValue | number | undefined,
  name: string,
): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return number;
}

function requireNonnegative(
  value: SQLOutputValue | undefined,
  name: string,
): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
  return number;
}
