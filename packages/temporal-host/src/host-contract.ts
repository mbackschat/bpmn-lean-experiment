/**
 * The data half of the Workflow's public contract: the start and continuation arguments, the results and the host
 * configuration. It imports nothing from the Temporal SDK, so a client that only names these types type-checks
 * without the SDK's declarations; `protocol.ts` adds the SDK definitions of the Updates, queries and Activities.
 */
import type { Registered } from "./correlation.js";
import type { PublicationCursor } from "./publication.js";
import type { PopulationCarry, PopulationScope } from "./population-contract.js";
import type { HostView, JsonValue, OccurrenceId, Wire } from "./port.js";

/** The Workflow type every process instance runs. */
export const workflowType = "runProcess";

/** The Workflow type of a correlation ingress, one per correlation scope and Message channel. */
export const ingressWorkflowType = "runCorrelationIngress";

/**
 * Who submits timer firings and effect results. `durable`: the host, from durable timers and Activities, as in
 * production. `external`: the caller, through the `timerFire` and `effectResult` Updates, so a scenario's logical
 * times and effect outcomes stay explicit inputs.
 */
export enum Scheduling {
  Durable = "durable",
  External = "external",
}

export interface HostConfig {
  readonly scheduling: Scheduling;
  /** Activity start-to-close bound, a transport limit: a breach is retried and never reaches the kernel. */
  readonly effectStartToCloseMs: number;
  /** Overrides the history length derived from the program's requirements, so a test can force a rollover. */
  readonly historyEventBudget: number | null;
}

export enum RunKind {
  Start = "start",
  /** A start the population ingress makes for a receiver: its outcome is the `populationStart` Update's answer. */
  PopulationStart = "populationStart",
  Continue = "continue",
}

/**
 * `program` is the kernel IL in its wire form, decoded afresh in every Run. `correlationScope` is the caller's opaque
 * name of the deployed definition the instance runs: the instance registers its open correlated waits with the ingress
 * of that scope, so a correlated publication to it can reach them; `null` registers nothing, and only an addressed
 * delivery reaches its waits. A continued Run carries what the chain last registered.
 */
export type RunProcessArgs =
  | {
      readonly kind: RunKind.Start;
      readonly program: JsonValue;
      readonly config: HostConfig;
      readonly correlationScope: string | null;
      readonly population: PopulationScope | null;
      readonly start: JsonValue;
    }
  | {
      readonly kind: RunKind.PopulationStart;
      readonly program: JsonValue;
      readonly config: HostConfig;
      readonly correlationScope: null;
      readonly population: PopulationScope;
      readonly request: Wire;
    }
  | {
      readonly kind: RunKind.Continue;
      readonly program: JsonValue;
      readonly config: HostConfig;
      readonly correlationScope: string | null;
      readonly population: PopulationScope | null;
      readonly state: JsonValue;
      readonly cursor: PublicationCursor;
      readonly registered: readonly Registered[];
      readonly carry: PopulationCarry;
    };

/** The kernel's verdict on one input as a client sees it. A rejection reaches the client as a refused Update. */
export interface CommandResult {
  readonly outcome: string;
  readonly code: string | null;
  /** The publication head after the input; `null` for an input the Workflow never received. */
  readonly revision: number | null;
}

/** A host-generated input the kernel would neither commit nor reject as stale: the schedule cannot go on. */
export interface Halt {
  readonly commandId: string;
  readonly outcome: string;
  readonly code: string;
}

export enum ResultKind {
  Ended = "ended",
  NotStarted = "notStarted",
  Halted = "halted",
  Refused = "refused",
}

export type ProcessResult =
  | { readonly kind: ResultKind.Ended; readonly status: string; readonly revision: number }
  | { readonly kind: ResultKind.NotStarted; readonly outcome: string; readonly code: string }
  | { readonly kind: ResultKind.Halted; readonly halt: Halt; readonly revision: number }
  /** The program is not admitted: the admission registry's code. */
  | { readonly kind: ResultKind.Refused; readonly code: string };

/**
 * A host view without its journal. One input's journal grows with its closure (2.2 MB for a 2,000-step automatic loop,
 * 2026-11-10), past Temporal's 2 MB query limit; the publication pages carry those facts in bounded pages.
 */
export type SnapshotView = Omit<HostView, "journal">;

export function snapshotView(view: HostView): SnapshotView {
  const { journal: _journal, ...open } = view;
  return open;
}

export interface HostSnapshot {
  readonly revision: number;
  /** `null` before a committed start. */
  readonly view: SnapshotView | null;
  readonly halt: Halt | null;
  /**
   * The instance's open correlated waits are not yet all registered with their ingress. An input's Update returns only
   * once they are, and a start's caller waits on the `settle` Update, so a publication sent after the caller saw a
   * commit finds every wait that commit opened.
   */
  readonly registering: boolean;
}

/**
 * A correlated Message publication: it names a correlation scope and a Message channel, never an instance. The
 * ingress of that address delivers it to the one open correlated wait whose criteria the kernel matches at delivery
 * time. `correlation` and `payload` are the scenario contract's members of the delivery that carries it; `payload` is
 * `null` for a subscription that writes none.
 */
export interface CorrelatedPublication {
  readonly correlationScope: string;
  readonly channel: JsonValue;
  readonly commandId: string;
  readonly correlation: JsonValue;
  readonly payload: JsonValue | null;
}

/** The wait a publication was delivered to, and the chain holding it. */
export interface CorrelationTarget {
  readonly workflowId: string;
  readonly occurrence: OccurrenceId;
}

export enum PublicationOutcome {
  Delivered = "delivered",
  /** The sole matching wait's instance refused the delivery when it rechecked it; no instance changed. */
  TargetRefused = "targetRefused",
  NotCorrelated = "notCorrelated",
  Ambiguous = "ambiguous",
  /** The command identifier already settled a publication with other content. */
  IdentityConflict = "identityConflict",
}

/** The stable codes of a publication no single wait matched. */
export const notCorrelatedCode = "message.notCorrelated";
export const correlationAmbiguousCode = "message.correlationAmbiguous";

/** `ordinal` numbers an ingress's publications in arrival order from 1. */
export type PublicationResult =
  | { readonly kind: PublicationOutcome.Delivered; readonly ordinal: number; readonly target: CorrelationTarget }
  | {
      readonly kind: PublicationOutcome.TargetRefused;
      readonly ordinal: number;
      readonly target: CorrelationTarget;
      readonly outcome: string;
      readonly code: string;
    }
  | { readonly kind: PublicationOutcome.NotCorrelated; readonly ordinal: number; readonly code: typeof notCorrelatedCode }
  | {
      readonly kind: PublicationOutcome.Ambiguous;
      readonly ordinal: number;
      readonly code: typeof correlationAmbiguousCode;
      readonly matches: number;
    }
  | { readonly kind: PublicationOutcome.IdentityConflict };

/** The failure type a validator refuses with; the message is the kernel's or the host's refusal code. */
export const rejectionType = "rejected";

/** The host's verdict for an input sent to a chain that has ended: there is no Workflow left to judge it. */
export const workflowClosed = "workflow-closed";
