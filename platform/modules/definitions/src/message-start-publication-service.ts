import type {
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionArtifactIntegrityError,
} from "./contracts.js";
import type {
  DefinitionMessageStartCapability,
  DefinitionMetadata,
} from "./contracts.js";
import {
  cloneDefinitionMetadata,
  equalDefinitionMetadata,
} from "./definition-values.js";
import {
  MessageStartPublicationConflictError,
  MessageStartPublicationDeliveryUnavailableError,
  MessageStartPublicationIntegrityError,
  MessageStartPublicationNotFoundError,
  MessageStartPublicationState,
  MessageStartPublicationValidationError,
} from "./message-start-publication-contracts.js";
import type {
  MessageStartPublicationHostRequest,
  MessageStartPublicationPrivateIdentity,
  MessageStartPublicationRecord,
  MessageStartPublicationServiceDependencies,
  NewMessageStartPublicationRecord,
  PutMessageStartPublicationResult,
} from "./message-start-publication-contracts.js";
import {
  cloneMessageStart,
  clonePutMessageStartPublicationRequest,
  equalMessageStart,
  projectMessageStartPublication,
  requirePublicationId,
} from "./message-start-publication-values.js";
import { toPublicDefinition } from "./definition-public-values.js";
import {
  messageStartPublicationHostRequest,
} from "./message-start-publication-host-request.js";

type PreparedTarget = Readonly<{
  definition: DefinitionMetadata;
  messageStart: DefinitionMessageStartCapability;
  identity: MessageStartPublicationPrivateIdentity;
  request: MessageStartPublicationHostRequest;
  intent: Readonly<{ protocol: string; intentSha256: string }>;
}>;

/** Coordinates exact-target durable Message Start publication and recovery. */
export class MessageStartPublicationService {
  readonly #dependencies: MessageStartPublicationServiceDependencies;

  constructor(dependencies: MessageStartPublicationServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async put(
    publicationId: string,
    input: PutMessageStartPublicationRequest,
  ): Promise<PutMessageStartPublicationResult> {
    requirePublicationId(publicationId);
    const request = clonePutMessageStartPublicationRequest(input);
    const previous = await this.#dependencies.publications.get(publicationId);
    if (previous?.state === MessageStartPublicationState.IntegrityFailure) {
      throw this.#integrityError();
    }
    if (previous !== null) {
      this.#requireSamePublicRequest(previous, request);
    }
    const prepared = await this.#prepare(publicationId, request, previous);
    const reservation = previous === null
      ? await this.#dependencies.publications.reserve({
          publicationId,
          definition: cloneDefinitionMetadata(prepared.definition),
          messageStart: cloneMessageStart(prepared.messageStart),
          identity: { ...prepared.identity },
          intent: { ...prepared.intent },
        })
      : { inserted: false, record: previous };
    this.#requireSamePublicRequest(reservation.record, request);
    await this.#requirePreparedRecord(reservation.record, prepared);
    const record = await this.#reconcile(
      reservation.record,
      prepared.request,
    );
    return {
      created: reservation.inserted,
      publication: projectMessageStartPublication(record),
    };
  }

  async get(publicationId: string) {
    requirePublicationId(publicationId);
    const record = await this.#dependencies.publications.get(publicationId);
    if (record === null) {
      return null;
    }
    if (record.state === MessageStartPublicationState.IntegrityFailure) {
      throw this.#integrityError();
    }
    const request = this.#requestFromRecord(record);
    const prepared = await this.#prepare(publicationId, request, record);
    return projectMessageStartPublication(
      await this.#reconcile(record, prepared.request),
    );
  }

  async reconcileAll(): Promise<void> {
    for (const candidate of await this.#dependencies.publications.listForReconciliation()) {
      await this.reconcilePublication(candidate.publicationId);
    }
  }

  /** Re-reads one exact publication identity before performing any host work. */
  async reconcilePublication(publicationId: string): Promise<void> {
    requirePublicationId(publicationId);
    const current = await this.#dependencies.publications.get(publicationId);
    if (current === null) return;
    if (current.state === MessageStartPublicationState.Accepted) {
      if (
        !await this.#dependencies.confirmedInstances.isConfirmed(
          current.identity.processInstanceId,
        )
      ) {
        await this.#publishAccepted(current);
      }
      return;
    }
    const request = this.#requestFromRecord(current);
    const prepared = await this.#prepare(publicationId, request, current);
    await this.#reconcile(current, prepared.request);
  }

  async #prepare(
    publicationId: string,
    request: PutMessageStartPublicationRequest,
    existing: MessageStartPublicationRecord | null,
  ): Promise<PreparedTarget> {
    let definition: DefinitionMetadata;
    let messageStart: DefinitionMessageStartCapability;
    try {
      definition = await this.#loadDefinition(request);
      messageStart = this.#requireSelectedMessageStart(definition, request);
    } catch (error: unknown) {
      if (existing !== null) {
        await this.#failIntegrity(
          existing,
          error instanceof Error
            ? error.message
            : "stored publication definition could not be revalidated",
        );
      }
      throw error;
    }
    const identity = this.#deriveIdentity(publicationId);
    if (existing !== null) {
      await this.#requireStoredPrivateIdentity(existing, identity);
      if (
        !equalDefinitionMetadata(existing.definition, definition) ||
        !equalMessageStart(existing.messageStart, messageStart)
      ) {
        await this.#failIntegrity(existing, "stored publication snapshot drifted");
      }
    }
    const artifact = await this.#dependencies.artifacts.get(definition.source.sha256);
    if (artifact === null) {
      if (existing !== null) {
        await this.#failIntegrity(existing, "stored publication artifact is missing");
      }
      throw new DefinitionArtifactIntegrityError(
        request.definition,
        definition.source.sha256,
      );
    }
    const bytes = Uint8Array.from(artifact);
    if (bytes.byteLength !== definition.source.byteLength) {
      if (existing !== null) {
        await this.#failIntegrity(
          existing,
          "stored publication artifact length drifted",
        );
      }
      throw new DefinitionArtifactIntegrityError(
        request.definition,
        definition.source.sha256,
        { expected: definition.source.byteLength, actual: bytes.byteLength },
      );
    }
    const preparation = await this.#dependencies.host.prepare(
      messageStartPublicationHostRequest(bytes, definition, messageStart, identity),
    );
    switch (preparation.status) {
      case "admitted":
        requirePrivateValue(preparation.intent.protocol, "intent protocol");
        requireSha256(preparation.intent.intentSha256, "intent digest");
        if (
          existing !== null &&
          (
            existing.intent.protocol !== preparation.intent.protocol ||
            existing.intent.intentSha256 !== preparation.intent.intentSha256
          )
        ) {
          await this.#failIntegrity(
            existing,
            "stored publication intent marker drifted",
          );
        }
        return {
          definition,
          messageStart,
          identity,
          request: messageStartPublicationHostRequest(
            bytes,
            definition,
            messageStart,
            identity,
          ),
          intent: { ...preparation.intent },
        };
      case "rejected":
        if (existing !== null) {
          await this.#failIntegrity(existing, preparation.evidence);
        }
        throw new MessageStartPublicationValidationError(preparation.evidence);
      case "integrityFailure":
        if (existing !== null) {
          await this.#failIntegrity(existing, preparation.evidence);
        }
        throw new MessageStartPublicationIntegrityError(preparation.evidence);
      default:
        return assertNever(preparation);
    }
  }

  async #loadDefinition(
    request: PutMessageStartPublicationRequest,
  ): Promise<DefinitionMetadata> {
    const stored = await this.#dependencies.definitions.get(request.definition);
    if (stored === null) {
      throw new MessageStartPublicationNotFoundError(request.definition);
    }
    const definition = cloneDefinitionMetadata(stored);
    if (
      definition.processId !== request.definition.processId ||
      definition.version !== request.definition.version
    ) {
      throw new MessageStartPublicationIntegrityError(
        "definition repository did not preserve the exact version binding",
      );
    }
    return definition;
  }

  #requireSelectedMessageStart(
    definition: DefinitionMetadata,
    request: PutMessageStartPublicationRequest,
  ): DefinitionMessageStartCapability {
    const matches = definition.startCapabilities.messageStarts.filter(
      (candidate) => equalMessageStart(candidate, request.messageStart),
    );
    if (matches.length !== 1) {
      throw new MessageStartPublicationValidationError(
        "definition must publish the selected Message Start capability exactly once",
      );
    }
    const selected = matches[0];
    if (selected === undefined) {
      throw new MessageStartPublicationIntegrityError(
        "selected Message Start capability disappeared",
      );
    }
    return cloneMessageStart(selected);
  }

  #deriveIdentity(publicationId: string): MessageStartPublicationPrivateIdentity {
    const processInstanceId = this.#dependencies.identities.processInstanceId(
      publicationId,
    );
    const commandId = this.#dependencies.identities.commandId(publicationId);
    const workflowId = this.#dependencies.identities.workflowId(processInstanceId);
    requirePrivateValue(processInstanceId, "processInstanceId");
    requirePrivateValue(commandId, "commandId");
    requirePrivateValue(workflowId, "workflowId");
    return { processInstanceId, commandId, workflowId };
  }

  async #reconcile(
    record: MessageStartPublicationRecord,
    request: MessageStartPublicationHostRequest,
  ): Promise<MessageStartPublicationRecord> {
    const reconciled = await this.#reconcileLifecycle(record, request);
    if (reconciled.state === MessageStartPublicationState.Accepted) {
      await this.#publishAccepted(reconciled);
    }
    return reconciled;
  }

  async #publishAccepted(record: MessageStartPublicationRecord): Promise<void> {
    await this.#dependencies.confirmedInstances.publishConfirmed({
      instance: {
        processInstanceId: record.identity.processInstanceId,
        definition: toPublicDefinition(record.definition),
      },
      locator: this.#dependencies.locators.canonicalLocator(
        record.identity.processInstanceId,
      ),
    });
  }

  async #reconcileLifecycle(
    record: MessageStartPublicationRecord,
    request: MessageStartPublicationHostRequest,
  ): Promise<MessageStartPublicationRecord> {
    switch (record.state) {
      case MessageStartPublicationState.Reserved: {
        const starting = await this.#dependencies.publications.compareAndSet(
          record.publicationId,
          MessageStartPublicationState.Reserved,
          MessageStartPublicationState.Starting,
        );
        return starting === null
          ? await this.#reconcileCurrent(record.publicationId, request)
          : await this.#dispatch(starting, request);
      }
      case MessageStartPublicationState.Starting:
      case MessageStartPublicationState.Indeterminate:
        return await this.#describe(record, request);
      case MessageStartPublicationState.Accepted:
        return record;
      case MessageStartPublicationState.IntegrityFailure:
        throw this.#integrityError();
      default:
        return assertNever(record.state);
    }
  }

  async #dispatch(
    starting: MessageStartPublicationRecord,
    request: MessageStartPublicationHostRequest,
  ): Promise<MessageStartPublicationRecord> {
    let result;
    try {
      result = await this.#dependencies.host.start({
        ...request,
        expectedIntent: { ...starting.intent },
      });
    } catch {
      return await this.#describe(starting, request);
    }
    switch (result.status) {
      case "started":
        return await this.#persistAccepted(starting.publicationId);
      case "rejected":
      case "integrityFailure":
        return await this.#failIntegrity(starting, result.evidence);
      default:
        return assertNever(result);
    }
  }

  async #describe(
    record: MessageStartPublicationRecord,
    request: MessageStartPublicationHostRequest,
  ): Promise<MessageStartPublicationRecord> {
    const result = await this.#dependencies.host.describe({
      workflowId: request.workflowId,
      expectedIntent: { ...record.intent },
    });
    switch (result.status) {
      case "matching":
        return await this.#persistAccepted(record.publicationId);
      case "missing":
        if (record.state === MessageStartPublicationState.Indeterminate) {
          return record;
        }
        return await this.#transitionOrCurrent(
          record,
          MessageStartPublicationState.Indeterminate,
        );
      case "divergent":
        return await this.#failIntegrity(
          record,
          "retained host identity diverged",
        );
      case "unavailable":
        throw new MessageStartPublicationDeliveryUnavailableError();
      default:
        return assertNever(result.status);
    }
  }

  async #persistAccepted(
    publicationId: string,
  ): Promise<MessageStartPublicationRecord> {
    for (;;) {
      const current = await this.#requireCurrent(publicationId);
      switch (current.state) {
        case MessageStartPublicationState.Accepted:
          return current;
        case MessageStartPublicationState.Starting:
        case MessageStartPublicationState.Indeterminate: {
          const accepted = await this.#dependencies.publications.compareAndSet(
            publicationId,
            current.state,
            MessageStartPublicationState.Accepted,
          );
          if (accepted !== null) {
            return accepted;
          }
          break;
        }
        case MessageStartPublicationState.IntegrityFailure:
          throw this.#integrityError();
        case MessageStartPublicationState.Reserved:
          throw new MessageStartPublicationIntegrityError(
            "accepted host result preceded the durable dispatch boundary",
          );
        default:
          assertNever(current.state);
      }
    }
  }

  async #transitionOrCurrent(
    record: MessageStartPublicationRecord,
    state: MessageStartPublicationState,
  ): Promise<MessageStartPublicationRecord> {
    return (await this.#dependencies.publications.compareAndSet(
      record.publicationId,
      record.state,
      state,
    )) ?? await this.#requireCurrent(record.publicationId);
  }

  async #reconcileCurrent(
    publicationId: string,
    request: MessageStartPublicationHostRequest,
  ): Promise<MessageStartPublicationRecord> {
    return await this.#reconcileLifecycle(
      await this.#requireCurrent(publicationId),
      request,
    );
  }

  async #requireCurrent(
    publicationId: string,
  ): Promise<MessageStartPublicationRecord> {
    const current = await this.#dependencies.publications.get(publicationId);
    if (current === null) {
      throw new MessageStartPublicationIntegrityError(
        "publication disappeared during reconciliation",
      );
    }
    return current;
  }

  #requireSamePublicRequest(
    record: MessageStartPublicationRecord,
    request: PutMessageStartPublicationRequest,
  ): void {
    if (
      record.definition.processId !== request.definition.processId ||
      record.definition.version !== request.definition.version ||
      !equalMessageStart(record.messageStart, request.messageStart)
    ) {
      throw new MessageStartPublicationConflictError(
        "publication identity is already bound to another immutable request",
      );
    }
  }

  async #requirePreparedRecord(
    record: MessageStartPublicationRecord,
    prepared: PreparedTarget,
  ): Promise<void> {
    if (
      !equalDefinitionMetadata(record.definition, prepared.definition) ||
      !equalMessageStart(record.messageStart, prepared.messageStart) ||
      !equalIdentity(record.identity, prepared.identity) ||
      record.intent.protocol !== prepared.intent.protocol ||
      record.intent.intentSha256 !== prepared.intent.intentSha256
    ) {
      await this.#failIntegrity(
        record,
        "reserved publication did not preserve its intent",
      );
    }
  }

  async #requireStoredPrivateIdentity(
    record: MessageStartPublicationRecord,
    expected: MessageStartPublicationPrivateIdentity,
  ): Promise<void> {
    if (!equalIdentity(record.identity, expected)) {
      await this.#failIntegrity(
        record,
        "stored publication private identity drifted",
      );
    }
  }

  #requestFromRecord(
    record: MessageStartPublicationRecord,
  ): PutMessageStartPublicationRequest {
    return {
      definition: {
        processId: record.definition.processId,
        version: record.definition.version,
      },
      messageStart: cloneMessageStart(record.messageStart),
    };
  }

  async #failIntegrity(
    record: MessageStartPublicationRecord,
    evidence: string,
  ): Promise<never> {
    let current = record;
    while (current.state !== MessageStartPublicationState.IntegrityFailure) {
      const failed = await this.#dependencies.publications.compareAndSet(
        current.publicationId,
        current.state,
        MessageStartPublicationState.IntegrityFailure,
      );
      if (failed !== null) {
        throw new MessageStartPublicationIntegrityError(evidence);
      }
      current = await this.#requireCurrent(current.publicationId);
    }
    throw new MessageStartPublicationIntegrityError(evidence);
  }

  #integrityError(): MessageStartPublicationIntegrityError {
    return new MessageStartPublicationIntegrityError(
      "Message Start publication has a durable integrity failure",
    );
  }
}

function equalIdentity(
  left: MessageStartPublicationPrivateIdentity,
  right: MessageStartPublicationPrivateIdentity,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.commandId === right.commandId &&
    left.workflowId === right.workflowId;
}

function requirePrivateValue(value: string, name: string): void {
  if (value.length === 0 || !value.isWellFormed()) {
    throw new MessageStartPublicationIntegrityError(
      `${name} must be nonempty well-formed Unicode`,
    );
  }
}

function requireSha256(value: string, name: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new MessageStartPublicationIntegrityError(`${name} must be lowercase SHA-256`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Message Start publication variant: ${String(value)}`);
}
