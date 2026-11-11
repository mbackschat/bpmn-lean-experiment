/**
 * A population's client: it registers deployments with the population ingress and submits population commands to it,
 * each by Update-with-Start, so the first call starts the ingress and every later one reaches the running one. Every
 * call names the chain configuration it expects, and an ingress running with another refuses it
 * (`host.population.configurationConflict`). A command answered `pending` (the ingress continued as new before it
 * settled) is read back from `populationResult`.
 */
import {
  ApplicationFailure,
  WithStartWorkflowOperation,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
  type Client,
} from "@temporalio/client";

import type { HostConfig } from "./host-contract.js";
import { populationCommandDigest, populationCommandUpdateId, populationIngressWorkflowId } from "./population-address.js";
import {
  populationIngressWorkflowType,
  type CommandAnswer,
  type DeploymentAnswer,
  type DeploymentRequest,
  type PopulationIngressArgs,
} from "./population-contract.js";
import type { JsonValue } from "./port.js";
import {
  populationBacklogQuery,
  populationCommandUpdate,
  populationDeploymentQuery,
  populationResultQuery,
  registerDeploymentUpdate,
  rejectionType,
} from "./protocol.js";

type Ingress = (args: PopulationIngressArgs) => Promise<void>;

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

async function refusing<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof WorkflowUpdateFailedError && error.cause instanceof ApplicationFailure &&
        error.cause.type === rejectionType) {
      throw new PopulationRefused(error.cause.message);
    }
    throw error;
  }
}

export class PopulationClient {
  /**
   * `config` is the configuration of the chains the ingress starts for the population's receivers; `rolloverEvents`
   * forces the ingress to continue as new, for tests.
   */
  constructor(
    private readonly client: Client,
    private readonly taskQueue: string,
    private readonly population: string,
    private readonly config: HostConfig,
    private readonly rolloverEvents: number | null = null,
    private readonly pollMs = 200,
  ) {}

  registerDeployment(request: Omit<DeploymentRequest, "config">): Promise<DeploymentAnswer> {
    return refusing(() => this.client.workflow.executeUpdateWithStart(registerDeploymentUpdate, {
      args: [{ ...request, config: this.config }], startWorkflowOperation: this.start(),
    }));
  }

  /** The answer a deployment request received, `null` when it was never registered or no ingress runs. */
  async deployment(deploymentRequestId: string): Promise<DeploymentAnswer | null> {
    try {
      return await this.ingress().query(populationDeploymentQuery, deploymentRequestId);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) return null;
      throw error;
    }
  }

  /** Submit a command in the population scenario contract's form, `kind` its step kind; its answer once it settled. */
  async command(kind: string, command: JsonValue & { readonly commandId: string }): Promise<CommandAnswer> {
    const request = {
      commandId: command.commandId, kind, command, digest: populationCommandDigest(kind, command), config: this.config,
    };
    const outcome = await refusing(() => this.client.workflow.executeUpdateWithStart(populationCommandUpdate, {
      args: [request], updateId: populationCommandUpdateId(request), startWorkflowOperation: this.start(),
    }));
    if (outcome.kind === "answered") return outcome.answer;
    for (;;) {
      const recorded = await this.result(command.commandId);
      if (recorded.kind === "settled") return recorded.answer;
      if (recorded.kind === "unknown") throw new Error(`population command ${command.commandId} left the ledger unread`);
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }

  async result(commandId: string): Promise<PopulationResult> {
    return await this.ingress().query(populationResultQuery, commandId) as PopulationResult;
  }

  /** How many commands and hand-offs the ingress has queued or in flight. */
  backlog(): Promise<number> {
    return this.ingress().query(populationBacklogQuery);
  }

  private ingress() {
    return this.client.workflow.getHandle<Ingress>(populationIngressWorkflowId(this.population));
  }

  private start(): WithStartWorkflowOperation<Ingress> {
    return new WithStartWorkflowOperation<Ingress>(populationIngressWorkflowType, {
      workflowId: populationIngressWorkflowId(this.population),
      taskQueue: this.taskQueue,
      workflowIdConflictPolicy: "USE_EXISTING",
      args: [{ population: this.population, config: this.config, rolloverEvents: this.rolloverEvents, carried: null }],
    });
  }
}
