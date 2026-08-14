import {
  decodeFlowNodeOccurrencePublicationResult,
  FlowNodeOccurrencePublicationResultKind,
} from "@bpmn-lean/platform-contracts";
import type { FlowNodeOccurrencePage } from "@bpmn-lean/platform-contracts";

import {
  FlowNodeOccurrenceIntegrityError,
  FlowNodeOccurrenceProjectionStatus,
  FlowNodeOccurrenceStoredValueError,
  occurrenceIdentityFromRegistration,
} from "./flow-node-occurrence-projection.js";
import type {
  FlowNodeOccurrenceGateway,
  FlowNodeOccurrenceProjectionImage,
  FlowNodeOccurrenceRepository,
} from "./flow-node-occurrence-projection.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

export enum FlowNodeOccurrenceReconciliationKind {
  Available = "available",
  NotReady = "notReady",
  Unavailable = "unavailable",
  Gap = "gap",
}

export type FlowNodeOccurrenceReconciliationResult =
  | Readonly<{
      kind: FlowNodeOccurrenceReconciliationKind.Available;
      projection: FlowNodeOccurrenceProjectionImage;
    }>
  | Readonly<{
      kind:
        | FlowNodeOccurrenceReconciliationKind.NotReady
        | FlowNodeOccurrenceReconciliationKind.Unavailable
        | FlowNodeOccurrenceReconciliationKind.Gap;
    }>;

export type FlowNodeOccurrenceReconciliationServiceOptions = Readonly<{
  publications: FlowNodeOccurrenceRepository;
  gateway: FlowNodeOccurrenceGateway;
  notReadyAttempts?: number;
  maxPagesPerReconciliation?: number;
  beforeNotReadyRetry?: (attempt: number) => Promise<void>;
}>;

/** Reconciles only strict public suffixes from the exact retained occurrence cursor. */
export class FlowNodeOccurrenceReconciliationService {
  readonly #options: Required<
    Omit<FlowNodeOccurrenceReconciliationServiceOptions, "beforeNotReadyRetry">
  > & Pick<FlowNodeOccurrenceReconciliationServiceOptions, "beforeNotReadyRetry">;

  constructor(options: FlowNodeOccurrenceReconciliationServiceOptions) {
    this.#options = {
      ...options,
      notReadyAttempts: options.notReadyAttempts ?? 3,
      maxPagesPerReconciliation: options.maxPagesPerReconciliation ?? 100,
    };
    requirePositive(this.#options.notReadyAttempts, "notReadyAttempts");
    requirePositive(
      this.#options.maxPagesPerReconciliation,
      "maxPagesPerReconciliation",
    );
  }

  reconcile(
    registration: OperateProcessRegistration,
  ): Promise<FlowNodeOccurrenceReconciliationResult> {
    return this.#reconcile(registration, false);
  }

  rebuild(
    registration: OperateProcessRegistration,
  ): Promise<FlowNodeOccurrenceReconciliationResult> {
    return this.#reconcile(registration, true);
  }

  async #reconcile(
    registration: OperateProcessRegistration,
    rebuild: boolean,
  ): Promise<FlowNodeOccurrenceReconciliationResult> {
    const pages: FlowNodeOccurrencePage[] = [];
    let afterRevision = 0;
    if (!rebuild) {
      const retained = this.#options.publications.get(
        registration.instance.processInstanceId,
      );
      if (retained?.status === FlowNodeOccurrenceProjectionStatus.Gap) {
        return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
      }
      if (retained?.status === FlowNodeOccurrenceProjectionStatus.Unavailable) {
        return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
      }
      afterRevision = retained?.headRevision ?? 0;
    }
    let notReadyAttempts = 0;
    let pageCount = 0;
    while (pageCount < this.#options.maxPagesPerReconciliation) {
      const observed = await this.#observe(registration, afterRevision);
      if (observed.kind === FlowNodeOccurrenceReconciliationKind.Unavailable) {
        this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Unavailable);
        return observed;
      }
      let result;
      try {
        result = decodeFlowNodeOccurrencePublicationResult(observed.value, {
          ...occurrenceIdentityFromRegistration(registration),
          afterRevision,
          limit: 100,
        });
      } catch {
        this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
        return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
      }
      switch (result.kind) {
        case FlowNodeOccurrencePublicationResultKind.Available: {
          pages.push(result.page);
          let projection: FlowNodeOccurrenceProjectionImage;
          try {
            projection = rebuild
              ? result.page.currentOpen === null
                ? this.#preview(registration, pages)
                : this.#options.publications.replaceFromPages(registration, pages)
              : this.#options.publications.applyPage(registration, result.page);
          } catch (error: unknown) {
            if (isIntegrityFailure(error)) {
              this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
              return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
            }
            throw error;
          }
          if (
            projection.headRevision === projection.producerHeadRevision &&
            result.page.currentOpen !== null
          ) {
            return {
              kind: FlowNodeOccurrenceReconciliationKind.Available,
              projection,
            };
          }
          afterRevision = result.page.pageThroughRevision;
          pageCount += 1;
          break;
        }
        case FlowNodeOccurrencePublicationResultKind.NotReady:
          if (afterRevision > 0) {
            this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
            return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
          }
          notReadyAttempts += 1;
          if (notReadyAttempts >= this.#options.notReadyAttempts) {
            return { kind: FlowNodeOccurrenceReconciliationKind.NotReady };
          }
          await this.#options.beforeNotReadyRetry?.(notReadyAttempts);
          break;
        case FlowNodeOccurrencePublicationResultKind.NotFound:
        case FlowNodeOccurrencePublicationResultKind.Unavailable:
          this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Unavailable);
          return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
        case FlowNodeOccurrencePublicationResultKind.Gap:
          this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
          return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
      }
    }
    this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Unavailable);
    return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
  }

  #preview(
    registration: OperateProcessRegistration,
    pages: readonly FlowNodeOccurrencePage[],
  ): FlowNodeOccurrenceProjectionImage {
    const retained = this.#options.publications.get(
      registration.instance.processInstanceId,
    );
    if (retained !== null) return retained;
    return {
      identity: occurrenceIdentityFromRegistration(registration),
      status: FlowNodeOccurrenceProjectionStatus.Healthy,
      headRevision: pages.at(-1)?.pageThroughRevision ?? 0,
      producerHeadRevision: pages.at(-1)?.headRevision ?? null,
      lastCommittedAtEpochMs:
        pages.at(-1)?.batches.at(-1)?.committedAtEpochMs ?? null,
      batches: [],
      occurrences: [],
      currentOpen: [],
    };
  }

  async #observe(
    registration: OperateProcessRegistration,
    afterRevision: number,
  ): Promise<
    | Readonly<{ kind: "observed"; value: unknown }>
    | Readonly<{ kind: FlowNodeOccurrenceReconciliationKind.Unavailable }>
  > {
    const identity = occurrenceIdentityFromRegistration(registration);
    try {
      return {
        kind: "observed",
        value: await this.#options.gateway.observe({
          locator: registration.locator,
          definition: identity.definition,
          processId: identity.processId,
          processInstanceId: identity.processInstanceId,
          afterRevision,
          limit: 100,
        }),
      };
    } catch {
      return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
    }
  }

  #mark(
    registration: OperateProcessRegistration,
    status:
      | FlowNodeOccurrenceProjectionStatus.Gap
      | FlowNodeOccurrenceProjectionStatus.Unavailable,
  ): void {
    this.#options.publications.mark(registration, status);
  }
}

function isIntegrityFailure(error: unknown): boolean {
  return error instanceof FlowNodeOccurrenceIntegrityError ||
    error instanceof FlowNodeOccurrenceStoredValueError ||
    error instanceof TypeError ||
    error instanceof RangeError;
}

function requirePositive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
