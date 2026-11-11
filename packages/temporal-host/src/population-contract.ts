/**
 * The data half of the population ingress's Temporal contract ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * the arguments of the ingress and deployment Workflows, their Update payloads and the Activities' requests. It imports
 * nothing from the Temporal SDK; `protocol.ts` adds the SDK definitions.
 */
import type { HostConfig } from "./host-contract.js";
import type {
  Action,
  Answer,
  ChainRegistration,
  CommandAnswer,
  DeploymentAnswer,
  EmitReference,
  IngressState,
} from "./population.js";
import type { JsonValue, ReachOutcome, Wire } from "./port.js";

/** The Workflow type of the one population ingress of an engine population. */
export const populationIngressWorkflowType = "runPopulationIngress";
/** The Workflow type that holds one registered deployment's program and answers Queries over it. */
export const deploymentWorkflowType = "runDeployment";
/** The Workflow type a Timer start's Schedule action starts: it fires one occurrence through the population. */
export const timerFiringWorkflowType = "runTimerStartFiring";

/** The population a process chain belongs to, and the deployment it runs. */
export interface PopulationScope {
  readonly population: string;
  readonly deploymentId: number;
}

/**
 * `config` is the configuration of the chains the ingress starts; `rolloverEvents` overrides the history length at which
 * it continues as new, so a test can force a rollover; `carried` is its state across Continue-As-New.
 */
export interface PopulationIngressArgs {
  readonly population: string;
  readonly config: HostConfig;
  readonly rolloverEvents: number | null;
  readonly carried: IngressState<Wire> | null;
}

export interface DeploymentArgs {
  readonly population: string;
  readonly deploymentId: number;
  readonly program: JsonValue;
}

/** A registered deployment: its deploy ordinal and the program it was registered with. */
export interface RegisteredDeployment {
  readonly deploymentId: number;
  readonly program: JsonValue;
}

/**
 * A deployment to register: the caller's request identifier, its definition identity's digest and its program; `config`
 * is the chain configuration the caller expects the ingress to run with (`configurationConflict`).
 */
export interface DeploymentRequest {
  readonly config: HostConfig;
  readonly deploymentRequestId: string;
  readonly digest: string;
  readonly program: JsonValue;
}

/** A population command in the population scenario contract's form; `digest` is its content's, `config` as above. */
export interface PopulationCommandRequest {
  readonly config: HostConfig;
  readonly commandId: string;
  readonly kind: string;
  readonly command: JsonValue;
  readonly digest: string;
}

/**
 * A command's answer, or `pending` when the ingress continued as new before it settled: the caller then reads the
 * answer from `populationResult`.
 */
export type PopulationCommandOutcome =
  | { readonly kind: "answered"; readonly answer: CommandAnswer }
  | { readonly kind: "pending" };

export type { Action, Answer, ChainRegistration, CommandAnswer, DeploymentAnswer, EmitReference, IngressState };

/** A recorded command answer, or whether the command is still queued or in flight (`pending`) or `unknown`. */
export type PopulationResult =
  | { readonly kind: "settled"; readonly answer: CommandAnswer }
  | { readonly kind: "pending" | "unknown" };

/** A request the ingress refused before acceptance: a full queue, a malformed request or a configuration conflict. */
export class PopulationRefused extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PopulationRefused";
  }
}

/** One delivery to a chain; `deliveryId` is its Update ID and its key in the chain's delivery ledger. */
export interface PopulationDelivery {
  readonly deliveryId: string;
  readonly delivery: Wire;
}

/** A Signal scan's question to one chain. */
export interface SignalQuestion {
  readonly address: Wire;
  readonly emitter: string | null;
}

/** One chain's answer to a Signal scan. */
export interface ChainSignalAnswer {
  readonly instanceId: string | null;
  readonly receivers: readonly Wire[];
  readonly refusesVariables: boolean;
}

/** The intents one committed input left, which the chain holds until the ingress settles their emit. */
export interface HeldIntents {
  readonly instanceId: string;
  readonly intents: readonly Wire[];
}

/** A chain's population start: the start request the ingress made, applied at the chain's own logical time. */
export interface PopulationStartArgs {
  readonly scope: PopulationScope;
  readonly request: Wire;
}

export interface ScanRequest {
  readonly population: string;
  readonly action: Extract<Action, { readonly kind: "scanSignal" | "scanMessage" | "scanMessageStarts" | "scanConditionalStarts" }>;
}

export interface DeliverRequest {
  readonly workflowId: string;
  readonly deliveryId: string;
  readonly delivery: Wire;
}

export interface PopulationStartRequest {
  readonly population: string;
  readonly config: HostConfig;
  readonly deploymentId: number;
  readonly instanceId: string;
  readonly request: Wire;
}

export interface RegistrationRequest {
  readonly population: string;
  readonly registration: ChainRegistration;
}

export interface EmitRequest {
  readonly population: string;
  readonly reference: EmitReference;
}

export interface IntentsRequest {
  readonly workflowId: string;
  readonly commandId: string;
}

export interface StartDeploymentRequest {
  readonly population: string;
  readonly deploymentId: number;
  readonly program: JsonValue;
}

/**
 * One Timer-start occurrence of a registered deployment, named by its due instant, and the chain configuration the
 * population's ingress runs with (`configurationConflict`).
 */
export interface TimerFiringArgs {
  readonly population: string;
  readonly config: HostConfig;
  readonly deploymentId: number;
  readonly startEvent: string;
  readonly dueMs: number;
}

/** A firing's population command; `commandId` is the firing Workflow's own ID. */
export interface TimerFiringRequest extends TimerFiringArgs {
  readonly commandId: string;
}

/** The Activities the population ingress and its chains call; each only transports and retries transport failures. */
export interface PopulationActivities {
  readonly scanPopulation: (request: ScanRequest) => Promise<Answer>;
  readonly deliverPopulation: (request: DeliverRequest) => Promise<ReachOutcome | { readonly kind: "gone" }>;
  readonly startPopulation: (request: PopulationStartRequest) => Promise<PopulationStartAnswer>;
  readonly readPopulationIntents: (request: IntentsRequest) => Promise<HeldIntents | null>;
  readonly settlePopulationEmit: (request: IntentsRequest) => Promise<void>;
  /** Returns the ingress's refusal code, `null` when registered. */
  readonly registerPopulation: (request: RegistrationRequest) => Promise<string | null>;
  readonly emitPopulation: (request: EmitRequest) => Promise<void>;
  readonly startDeployment: (request: StartDeploymentRequest) => Promise<void>;
  /** Submits a firing's `timerStart` and returns the population's answer to it. */
  readonly fireTimerStart: (request: TimerFiringRequest) => Promise<CommandAnswer>;
}

/** The answer a chain's population start leaves for a repeated start of the same instance identity. */
export type PopulationStartOutcome = ReachOutcome;

/** A population start's answer: its outcome, or `identityInUse` when a chain no population start made holds the identity. */
export type PopulationStartAnswer = ReachOutcome | { readonly kind: "identityInUse" };

/** The Signals one committed non-population input threw, with whether the ingress accepted their emit. */
export interface UnsettledEmit {
  readonly commandId: string;
  readonly held: HeldIntents;
  readonly accepted: boolean;
}

/** What a population chain carries across Continue-As-New beside its state. */
export interface PopulationCarry {
  readonly registeredAddresses: JsonValue;
  readonly deliveries: readonly (readonly [string, ReachOutcome])[];
  readonly emits: readonly UnsettledEmit[];
  readonly startOutcome: PopulationStartOutcome | null;
}
