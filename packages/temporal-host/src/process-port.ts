/**
 * The process and population operations a client of the host uses, as ports: `ProcessClient` and `PopulationClient`
 * realize them over Temporal and the memory host in process. It imports nothing from the Temporal SDK, so its users
 * type-check without the SDK.
 */
import type { CommandResult, HostConfig, HostSnapshot } from "./host-contract.js";
import type { PublicationPage } from "./publication.js";
import type {
  CommandAnswer,
  DeploymentAnswer,
  DeploymentRequest,
  PopulationResult,
  PopulationScope,
  RegisteredDeployment,
} from "./population-contract.js";
import type { JsonValue } from "./port.js";

export interface StartRequest {
  readonly workflowId: string;
  readonly program: JsonValue;
  readonly config: HostConfig;
  /** The start stimulus, in the scenario contract's form. */
  readonly start: JsonValue;
  /**
   * The population the instance registers its Message and Signal waits with, and the deployment it runs; its
   * population's commands reach them. Absent, only an addressed delivery reaches them.
   */
  readonly population?: PopulationScope;
  /** Caller-owned facts about the start, returned verbatim by `describe`; the host never reads them. */
  readonly memo?: Readonly<Record<string, JsonValue>>;
}

/** A chain as Temporal retains it; `running` is false once the chain has ended, however it ended. */
export interface ProcessDescription {
  readonly workflowId: string;
  readonly workflowType: string;
  readonly taskQueue: string;
  readonly running: boolean;
  readonly memo: Readonly<Record<string, JsonValue>> | null;
}

export interface ProcessHost {
  start(request: StartRequest): Promise<CommandResult>;
  command(workflowId: string, stimulus: JsonValue): Promise<CommandResult>;
  deliver(workflowId: string, stimulus: JsonValue): Promise<CommandResult>;
  observation(workflowId: string): Promise<JsonValue>;
  hostView(workflowId: string): Promise<HostSnapshot>;
  publication(workflowId: string, afterRevision: number, limit?: number): Promise<PublicationPage>;
  /** `null` when Temporal retains no chain under the Workflow ID. */
  describe(workflowId: string): Promise<ProcessDescription | null>;
}

/**
 * One population's ingress as its caller uses it, under the chain configuration the caller gave: a caller with another
 * configuration than the running ingress's is refused (`PopulationRefused`, `host.population.configurationConflict`),
 * as is a command the full queue cannot take.
 */
export interface PopulationHost {
  readonly population: string;
  /** Registers a deployment; the same request identifier answers as before, with another digest it is refused. */
  registerDeployment(request: Omit<DeploymentRequest, "config">): Promise<DeploymentAnswer>;
  /** The answer a deployment request received, `null` when it was never registered. */
  deployment(deploymentRequestId: string): Promise<DeploymentAnswer | null>;
  /** Every registered deployment with its program, in deploy order; none before the first registration. */
  deployments(): Promise<readonly RegisteredDeployment[]>;
  /** Submits a command in the population scenario contract's form, `kind` its step kind; its answer once it settled. */
  command(kind: string, command: JsonValue & { readonly commandId: string }): Promise<CommandAnswer>;
  result(commandId: string): Promise<PopulationResult>;
}
