/**
 * Message publication: the population command `publish` (`Kernel.Population.publish`), addressed by channel or by
 * Message name, without a process target. Unless start-only, the population delivers it to the one open wait among the
 * selected instances that its criteria and business key match at delivery time; when there is none and it is not
 * executions-only, it starts the one Message start candidate. Zero is `noMatch` and several are `ambiguous`, changing no
 * instance, as CIB Seven correlates (root decision, WP2, 2026-11-09). The receiver scan, the criteria refusals and the
 * target's recheck are the kernel's ([population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import {
  requireWireString,
  type EngineBinding,
  type EngineDefinitionIdentity,
  type EngineFailure,
  type EngineValue,
  type JsonValue,
} from "./common.js";
import type { EngineMessageChannel } from "./definition-capabilities.js";
import { engineDefinitionNotDeployedCode, engineDeployment } from "./definition-deployment.js";
import { engineHostRefusalCodes } from "./definition.js";
import type { EngineHost } from "./host.js";
import {
  EnginePopulationResolutionKind,
  populationCommandResult,
  type EnginePopulationCommandResult,
} from "./population-result.js";

/** The population's answer to a repeated command identifier with other content. */
const contentMismatchCode = "command-content-mismatch";

/** A channel as a definition's capabilities publish it, or a Message name as CIB addresses one. */
export type EngineMessageAddress =
  | Readonly<{ kind: "channel"; channel: EngineMessageChannel }>
  | Readonly<{ kind: "name"; name: string }>;

/**
 * What a criterion reads in a waiting instance: a Process variable, a variable of the waiting scope itself, the
 * instance's business key or its identifier. Under the modeled-key profile (CIB-LIM-0002) a correlation key matches as
 * a `processVariable` criterion named by the key (`EngineCorrelationCriterion.key`) with the String it binds.
 */
export type EngineCriterionTarget =
  | Readonly<{ kind: "processVariable"; name: string }>
  | Readonly<{ kind: "localVariable"; name: string }>
  | Readonly<{ kind: "businessKey" }>
  | Readonly<{ kind: "processInstance" }>;

/** A typed correlation criterion: a present null matches only a present null, and an absent name nothing. */
export type EngineCorrelationMatch = Readonly<{ target: EngineCriterionTarget; expected: EngineValue }>;

/**
 * The deployments a publication reaches: one stored definition version's, or the current version of a process key.
 * Without one, it reaches the instances of every registered deployment and the starts of every current one.
 */
export type EngineDefinitionSelector =
  | Readonly<{ kind: "version"; definition: EngineDefinitionIdentity }>
  | Readonly<{ kind: "currentVersion"; definitionKey: string }>;

export enum EngineMessagePublicationMode {
  /** A waiting catch first, a Message start otherwise. */
  Any = "any",
  ExecutionsOnly = "executionsOnly",
  StartOnly = "startOnly",
}

/**
 * `commandId` identifies the publication across retries: a repeat answers the recorded result, and other content under
 * it is an identity conflict. `payload` reaches the wait's Data Output or the start's, `variables` are installed in the
 * receiving scope as the profile allows (CIB-EXT-0025), and `businessKey` restricts the waits to instances with that key
 * and is a started instance's key.
 */
export type EngineMessagePublicationRequest = Readonly<{
  host: EngineHost;
  commandId: string;
  message: EngineMessageAddress;
  definition: EngineDefinitionSelector | null;
  criteria: readonly EngineCorrelationMatch[];
  payload: EngineValue | null;
  variables: readonly EngineBinding[];
  businessKey: string | null;
  mode: EngineMessagePublicationMode;
}>;

export enum EngineMessagePublicationStatus {
  /** The population settled the publication; its resolution says whether and where it took effect. */
  Resolved = "resolved",
  /** The command identifier already settled a publication with other content. */
  IdentityConflict = "identityConflict",
  /** The deployment does not serve Messages, or the selected definition version is not deployed; nothing was submitted. */
  Refused = "refused",
}

export type EngineMessagePublicationResult =
  | Readonly<{ status: EngineMessagePublicationStatus.Resolved; result: EnginePopulationCommandResult }>
  | Readonly<{ status: EngineMessagePublicationStatus.IdentityConflict }>
  | Readonly<{ status: EngineMessagePublicationStatus.Refused; failure: EngineFailure }>;

export async function publishEngineMessage(request: EngineMessagePublicationRequest): Promise<EngineMessagePublicationResult> {
  const commandId = requireWireString(request.commandId, "commandId");
  if (!request.host.served.messages) {
    return {
      status: EngineMessagePublicationStatus.Refused,
      failure: { code: engineHostRefusalCodes.messages, evidence: "The deployment does not serve Messages." },
    };
  }
  const selector = await selectorJson(request.host, request.definition);
  if (selector === null) {
    return {
      status: EngineMessagePublicationStatus.Refused,
      failure: { code: engineDefinitionNotDeployedCode, evidence: "No population registration holds the definition version." },
    };
  }
  const address = request.message.kind === "channel"
    ? { channel: structuredClone(request.message.channel) as JsonValue }
    : { name: requireWireString(request.message.name, "message.name") };
  const answer = await request.host.population.command("publish", {
    commandId,
    address: { ...address, ...selector },
    criteria: structuredClone(request.criteria) as unknown as JsonValue,
    ...(request.payload === null ? {} : { payload: structuredClone(request.payload) as JsonValue }),
    variables: structuredClone(request.variables) as unknown as JsonValue,
    ...(request.businessKey === null ? {} : { businessKey: requireWireString(request.businessKey, "businessKey") }),
    mode: request.mode,
  });
  const result = populationCommandResult(request.host, answer);
  const resolution = result.resolution;
  if (resolution.kind === EnginePopulationResolutionKind.Rejected && resolution.code === contentMismatchCode) {
    return { status: EngineMessagePublicationStatus.IdentityConflict };
  }
  return { status: EngineMessagePublicationStatus.Resolved, result };
}

/**
 * The population's selector member for `definition`: none without a selector, `null` for a definition version no
 * registration holds.
 */
async function selectorJson(host: EngineHost, selector: EngineDefinitionSelector | null):
  Promise<Readonly<Record<string, JsonValue>> | null> {
  if (selector === null) return {};
  switch (selector.kind) {
    case "version": {
      const deployment = await engineDeployment(host, selector.definition);
      return deployment === null ? null : { definition: { deploymentId: deployment.deploymentId } };
    }
    case "currentVersion":
      return { definition: { processKey: requireWireString(selector.definitionKey, "definitionKey") } };
  }
}
