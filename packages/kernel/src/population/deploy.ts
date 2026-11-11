/**
 * Population: deployments, transcribed from `Kernel/Population/Deploy.lean`: deploy ordinals, versions per process key
 * and the copies of other deployments' processes a deployment may carry
 * ([specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments)).
 */
import {
  MessageNames,
  elementHeader,
  elementStart,
  programChildren,
  programProcessOf,
  programPublicId,
  triggerMessage,
  triggerTimer,
  valueSourceLiteral,
  type CalledProcess,
  type Header,
  type MessageTrigger,
  type Program,
} from "../il/types.js";
import { resolve, type Resolved } from "../il/timer.js";

// `Kernel/Population/Deploy.lean` imports `Kernel.IL.Timer` publicly, so `Timers` reads it through Deploy.
export { occurs, type Resolved } from "../il/timer.js";
import {
  DeploymentOutcomeTag,
  type Deployment,
  type DeploymentRef,
  type DeploymentResult,
  type Refusable,
} from "./contract.js";

// `Kernel/Population/Deploy.lean` imports `Contract` publicly, so its importers read the contract through it.
export {
  cascadeInstanceId,
  commandIdOf,
  CommandTag,
  DefinitionSelectorTag,
  DeploymentOutcomeTag,
  FanOutEntryTag,
  MessageAddressTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  startedInstanceId,
  StimulusTag,
  type Broadcast,
  type Command,
  type ConditionEvaluation,
  type DefinitionSelector,
  type Deployment,
  type DeploymentRef,
  type DeploymentResult,
  type FanOutEntry,
  type Instance,
  type LedgerEntry,
  type MessageAddress,
  type Publication,
  type Receiver,
  type Refusable,
  type Resolution,
  type Result,
  type StepResult,
  type Stimulus,
  type TimerOccurrence,
  type TimerStart,
} from "./contract.js";

/**
 * Whether a carried process is the deploying document's own: unstamped, or stamped with `deploymentId` itself; any other
 * stamp is a copy `bpmn-source`'s assembly made from that deployment.
 */
function ownProcess(deploymentId: number, process: CalledProcess): boolean {
  return process.definition.deployment === null || process.definition.deployment === deploymentId;
}

/** The process keys a deployment contains: its root and its own document's processes. */
function ownKeys(deploymentId: number, program: Program): readonly string[] {
  return [program.identity.processId,
    ...program.processes.filter((process) => ownProcess(deploymentId, process)).map((process) => process.definition.key)];
}

/** The version a registered deployment gave `key`. */
export function versionOf(deployment: Deployment, key: string): number | null {
  return deployment.versions.find(([known]) => known === key)?.[1] ?? null;
}

/** The namespace a registered deployment declares `key` in: its root's, or its own process's; `undefined` for none. */
function namespaceOf(deployment: Deployment, key: string): string | null | undefined {
  if (deployment.key === key) return deployment.program.identity.namespace;
  return deployment.program.processes.find((process) => ownProcess(deployment.deploymentId, process) && process.definition.key === key)
    ?.definition.namespace;
}

/**
 * The current deployment of `key`: the last registered deployment whose root it is; redeploying a key supersedes its
 * earlier versions' start subscriptions (`BpmnDeployer.java:232-292`).
 */
export function current(registry: readonly Deployment[], key: string): Deployment | null {
  return registry.filter((deployment) => deployment.key === key).at(-1) ?? null;
}

/** The current deployment of every key, in deploy order. */
export function currentDeployments(registry: readonly Deployment[]): readonly Deployment[] {
  return registry.filter((deployment) => current(registry, deployment.key)?.deploymentId === deployment.deploymentId);
}

/**
 * The program without the carried processes `drop` refuses: each process, every element whose top-level ancestor it
 * lists, and every flow touching one of them.
 */
function withoutCarried(program: Program, drop: (process: CalledProcess) => boolean): Program {
  const removed = program.elements.map(elementHeader).filter((header) => {
    const process = programProcessOf(program, header);
    return process !== null && drop(process);
  }).map((header) => header.id);
  return {
    ...program,
    processes: program.processes.filter((process) => !drop(process)),
    elements: program.elements.filter((element) => !removed.includes(elementHeader(element).id)),
    flows: program.flows.filter((flow) => !removed.includes(flow.source) && !removed.includes(flow.target)),
  };
}

/**
 * Stamp a carried process with its version, or refuse its stamp. The deploying document's own process takes this
 * deployment and `versions`; a copy must name a registered deployment that contains its key in its namespace from its
 * source (`population.callee.stamp` otherwise), whose version it takes.
 */
function stampCarried(
  registry: readonly Deployment[],
  deploymentId: number,
  versions: readonly (readonly [string, number])[],
  process: CalledProcess,
): Refusable<CalledProcess> {
  const definition = process.definition;
  if (ownProcess(deploymentId, process)) {
    const version = versions.find(([key]) => key === definition.key)?.[1] ?? null;
    return { ok: true, value: { ...process, definition: { ...definition, deployment: deploymentId, version } } };
  }
  const source = registry.find((deployment) => definition.deployment === deployment.deploymentId);
  const version = source === undefined ? null : versionOf(source, definition.key);
  if (source === undefined || version === null || namespaceOf(source, definition.key) !== definition.namespace ||
    (definition.sourceSha256 !== null && definition.sourceSha256 !== source.program.identity.sourceSha256)) {
    return { ok: false, error: "population.callee.stamp" };
  }
  return { ok: true, value: { ...process, definition: { ...definition, version } } };
}

/** A program's root Message starts with their triggers, in document order. */
export function messageStarts(program: Program): readonly (readonly [Header, MessageTrigger])[] {
  return programChildren(program, null).flatMap((element) => {
    const started = elementStart(element);
    const trigger = started?.[1].subscription?.trigger;
    const sent = trigger === undefined ? null : triggerMessage(trigger);
    return started === null || sent === null ? [] : [[started[0], sent] as const];
  });
}

/** The literal names of a program's root Message starts. */
function messageStartNames(program: Program): readonly string[] {
  return messageStarts(program).flatMap(([, trigger]) => {
    const literal = trigger.name === null ? null : valueSourceLiteral(trigger.name);
    return literal === null ? [] : [literal];
  });
}

/** A program's root Timer starts whose schedule resolves to what a host arms, in document order. */
export function timerStarts(program: Program): readonly (readonly [Header, Resolved])[] {
  return programChildren(program, null).flatMap((element) => {
    const started = elementStart(element);
    const trigger = started?.[1].subscription?.trigger;
    const timer = trigger === undefined ? null : triggerTimer(trigger);
    const resolved = timer === null ? null : resolve(timer.schedule);
    return started === null || resolved === null || !resolved.ok ? [] : [[started[0], resolved.value] as const];
  });
}

/**
 * What registering a deployment and firing its Timer starts read of it, as plain data a host keeps without the program:
 * its deploy ordinal, root key and own keys with their versions, its deploy time, whether Message names address its
 * starts (CIB-LIM-0022), its root Message start names and its root Timer starts by public identifier.
 */
export interface DeploymentSummary {
  readonly deploymentId: number;
  readonly key: string;
  readonly keys: readonly string[];
  readonly versions: readonly (readonly [string, number])[];
  readonly deployedAtMs: number;
  readonly namesAddress: boolean;
  readonly messageStartNames: readonly string[];
  readonly timerStarts: readonly (readonly [string, Resolved])[];
}

/**
 * The summary of `program`, not yet registered: its ordinal is the deployment its identity names, 0 for none, and it has
 * no versions and the deploy time 0 until it is registered.
 */
export function deploymentSummary(program: Program): DeploymentSummary {
  const deploymentId = program.identity.deployment ?? 0;
  return {
    deploymentId, key: program.identity.processId, keys: ownKeys(deploymentId, program), versions: [], deployedAtMs: 0,
    namesAddress: program.options.messageNames === MessageNames.Addresses, messageStartNames: messageStartNames(program),
    timerStarts: timerStarts(program).map(([header, resolved]) => [programPublicId(program, header.id), resolved] as const),
  };
}

/** A registered deployment's summary. */
export function deploymentSummaryOf(deployment: Deployment): DeploymentSummary {
  return {
    ...deploymentSummary(deployment.program),
    deploymentId: deployment.deploymentId, versions: deployment.versions, deployedAtMs: deployment.deployedAtMs,
  };
}

/** The current summary of `key`: its last registered deployment. */
export function currentSummary(registry: readonly DeploymentSummary[], key: string): DeploymentSummary | null {
  return registry.filter((summary) => summary.key === key).at(-1) ?? null;
}

/** The version each key of `candidate` takes: 1 + the number of registered deployments containing that key. */
function summaryVersions(registry: readonly DeploymentSummary[], candidate: DeploymentSummary): readonly (readonly [string, number])[] {
  return candidate.keys.map((key) => [key, 1 + registry.filter((earlier) => earlier.versions.some(([known]) => known === key)).length] as const);
}

/**
 * Under `MessageNames.addresses` a root Message start name is unique across the current deployments of other keys: CIB
 * refuses deploying one another key's current deployment already subscribes (`BpmnDeployer.java:328-363`,
 * CIB-LIM-0028).
 */
function summaryClash(registry: readonly DeploymentSummary[], candidate: DeploymentSummary): string | null {
  const others = [...new Set(registry.map((summary) => summary.key))].filter((key) => key !== candidate.key);
  const taken = others.flatMap((key) => currentSummary(registry, key)?.messageStartNames ?? []);
  return candidate.namesAddress && candidate.messageStartNames.some((name) => taken.includes(name)) ? "deployment.messageStartName" : null;
}

/**
 * Register `candidate` as `deploymentId` over the summaries of the registered deployments: its versions, or the refusal
 * of a Message start name another key's current deployment subscribes.
 */
export function registerSummary(
  registry: readonly DeploymentSummary[],
  deploymentId: number,
  candidate: DeploymentSummary,
): Refusable<{ readonly deploymentId: number; readonly versions: readonly (readonly [string, number])[] }> {
  const code = summaryClash(registry, candidate);
  return code === null ? { ok: true, value: { deploymentId, versions: summaryVersions(registry, candidate) } } : { ok: false, error: code };
}

/**
 * Deploy `program` as `deploymentId` at `atMs` (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments,
 * PC-SCOPE-03). Each key it contains takes 1 + the number of registered deployments containing that key, so a refused
 * deployment numbers nothing, as CIB registers none. A copy of another deployment's process stays only if that
 * deployment is registered and no later than this one: a copy of a later or a refused deployment is removed, so no Call
 * binds a callee deployed after its caller or never deployed. The rest are stamped (`stampCarried`); then admission
 * runs, then the Message start names are checked.
 */
export function deploy(
  admission: (program: Program) => string | null,
  registry: readonly Deployment[],
  refused: readonly number[],
  deploymentId: number,
  definitionRef: string,
  ref: DeploymentRef,
  program: Program,
  atMs: number,
): readonly [DeploymentResult, Deployment | null] {
  const refusal = (code: string): readonly [DeploymentResult, Deployment | null] =>
    [{ deploymentId, definitionRef, versions: [], outcome: { tag: DeploymentOutcomeTag.Refused, code } }, null];
  const summaries = registry.map(deploymentSummaryOf);
  const candidate = deploymentSummary({ ...program, identity: { ...program.identity, deployment: deploymentId } });
  const versions = summaryVersions(summaries, candidate);
  const unreachable = (process: CalledProcess): boolean => {
    const source = process.definition.deployment;
    return source !== null && (source > deploymentId || refused.includes(source));
  };
  const carried = withoutCarried(program, unreachable);
  const processes: CalledProcess[] = [];
  for (const process of carried.processes) {
    const stamped = stampCarried(registry, deploymentId, versions, process);
    if (!stamped.ok) return refusal(stamped.error);
    processes.push(stamped.value);
  }
  const stamped: Program = { ...carried, processes, identity: { ...carried.identity, deployment: deploymentId } };
  const code = admission(stamped) ?? summaryClash(summaries, candidate);
  if (code !== null) return refusal(code);
  const deployment: Deployment = {
    deploymentId, definitionRef, ref, key: program.identity.processId, versions, deployedAtMs: atMs, program: stamped,
  };
  return [{ deploymentId, definitionRef, versions, outcome: { tag: DeploymentOutcomeTag.Deployed } }, deployment];
}
