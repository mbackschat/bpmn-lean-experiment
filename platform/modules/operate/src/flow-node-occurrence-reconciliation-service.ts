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
        | FlowNodeOccurrenceReconciliationKind.Unavailable
        | FlowNodeOccurrenceReconciliationKind.Gap;
    }>;

export type FlowNodeOccurrenceReconciliationServiceOptions = Readonly<{
  publications: FlowNodeOccurrenceRepository;
  gateway: FlowNodeOccurrenceGateway;
  maxPagesPerReconciliation?: number;
}>;

/**
 * Reconciles only strict public suffixes from the exact retained occurrence cursor; paging is complete when a page
 * reaches the producer head. An engine `integrityFailure` is classified `gap`, like a local integrity failure.
 */
export class FlowNodeOccurrenceReconciliationService {
  readonly #options: Required<FlowNodeOccurrenceReconciliationServiceOptions>;

  constructor(options: FlowNodeOccurrenceReconciliationServiceOptions) {
    this.#options = {
      ...options,
      maxPagesPerReconciliation: options.maxPagesPerReconciliation ?? 100,
    };
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
      const retained = await this.#options.publications.get(
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
    let pageCount = 0;
    while (pageCount < this.#options.maxPagesPerReconciliation) {
      const observed = await this.#observe(registration, afterRevision);
      if (observed.kind === FlowNodeOccurrenceReconciliationKind.Unavailable) {
        await this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Unavailable);
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
        await this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
        return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
      }
      switch (result.kind) {
        case FlowNodeOccurrencePublicationResultKind.Available: {
          pages.push(result.page);
          const complete = result.page.pageThroughRevision === result.page.headRevision;
          if (rebuild && !complete) {
            afterRevision = result.page.pageThroughRevision;
            pageCount += 1;
            break;
          }
          let projection: FlowNodeOccurrenceProjectionImage;
          try {
            projection = rebuild
              ? await this.#options.publications.replaceFromPages(registration, pages)
              : await this.#options.publications.applyPage(registration, result.page);
          } catch (error: unknown) {
            if (isIntegrityFailure(error)) {
              await this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
              return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
            }
            throw error;
          }
          if (complete) {
            return {
              kind: FlowNodeOccurrenceReconciliationKind.Available,
              projection,
            };
          }
          afterRevision = result.page.pageThroughRevision;
          pageCount += 1;
          break;
        }
        case FlowNodeOccurrencePublicationResultKind.NotFound:
        case FlowNodeOccurrencePublicationResultKind.Unavailable:
          await this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Unavailable);
          return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
        case FlowNodeOccurrencePublicationResultKind.Gap:
        case FlowNodeOccurrencePublicationResultKind.IntegrityFailure:
          await this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Gap);
          return { kind: FlowNodeOccurrenceReconciliationKind.Gap };
      }
    }
    await this.#mark(registration, FlowNodeOccurrenceProjectionStatus.Unavailable);
    return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
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
          processInstanceId: identity.processInstanceId,
          afterRevision,
          limit: 100,
        }),
      };
    } catch {
      return { kind: FlowNodeOccurrenceReconciliationKind.Unavailable };
    }
  }

  async #mark(
    registration: OperateProcessRegistration,
    status:
      | FlowNodeOccurrenceProjectionStatus.Gap
      | FlowNodeOccurrenceProjectionStatus.Unavailable,
  ): Promise<void> {
    await this.#options.publications.mark(registration, status);
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
