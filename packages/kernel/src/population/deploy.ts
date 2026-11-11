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
  programElement,
  triggerMessage,
  valueSourceLiteral,
  type CalledProcess,
  type ElementId,
  type Program,
} from "../il/types.js";
import {
  DeploymentOutcomeTag,
  type Deployment,
  type DeploymentRef,
  type DeploymentResult,
  type Refusable,
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
function versionOf(deployment: Deployment, key: string): number | null {
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
function current(registry: readonly Deployment[], key: string): Deployment | null {
  return registry.filter((deployment) => deployment.key === key).at(-1) ?? null;
}

/**
 * The program without the carried processes `drop` refuses: each process, every element whose top-level ancestor it
 * lists, and every flow touching one of them.
 */
function withoutCarried(program: Program, drop: (process: CalledProcess) => boolean): Program {
  const roots = program.processes.filter(drop).flatMap((process) => process.children);
  const topLevel = (fuel: number, id: ElementId): ElementId => {
    const element = programElement(program, id);
    const parent = element === null ? null : elementHeader(element).parent;
    return fuel === 0 || parent === null ? id : topLevel(fuel - 1, parent);
  };
  const removed = program.elements.map(elementHeader).filter((header) => roots.includes(topLevel(program.elements.length, header.id)))
    .map((header) => header.id);
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

/** The literal names of a program's root Message starts. */
function messageStartNames(program: Program): readonly string[] {
  return programChildren(program, null).flatMap((element) => {
    const trigger = elementStart(element)?.[1].subscription?.trigger;
    const name = trigger === undefined ? null : triggerMessage(trigger)?.name ?? null;
    const literal = name === null ? null : valueSourceLiteral(name);
    return literal === null ? [] : [literal];
  });
}

/**
 * Under `MessageNames.addresses` a root Message start name is unique across the current deployments of other keys: CIB
 * refuses deploying one another key's current deployment already subscribes (`BpmnDeployer.java:328-363`,
 * CIB-LIM-0028).
 */
function messageStartClash(registry: readonly Deployment[], program: Program): string | null {
  const others = [...new Set(registry.map((deployment) => deployment.key))].filter((key) => key !== program.identity.processId);
  const taken = others.flatMap((key) => {
    const deployment = current(registry, key);
    return deployment === null ? [] : messageStartNames(deployment.program);
  });
  return program.options.messageNames === MessageNames.Addresses && messageStartNames(program).some((name) => taken.includes(name))
    ? "deployment.messageStartName"
    : null;
}

/**
 * Deploy `program` as `deploymentId` at `atMs` (population contract §2.3, PC-SCOPE-03). Each key it contains takes 1 +
 * the number of registered deployments containing that key, so a refused deployment numbers nothing, as CIB registers
 * none. A copy of another deployment's process stays only if that deployment is registered and no later than this one:
 * a copy of a later or a refused deployment is removed, so no Call binds a callee deployed after its caller or never
 * deployed. The rest are stamped (`stampCarried`); then admission runs, then the Message start names are checked.
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
  const versions = ownKeys(deploymentId, program).map((key) =>
    [key, 1 + registry.filter((earlier) => earlier.versions.some(([known]) => known === key)).length] as const);
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
  const code = admission(stamped) ?? messageStartClash(registry, stamped);
  if (code !== null) return refusal(code);
  const deployment: Deployment = {
    deploymentId, definitionRef, ref, key: program.identity.processId, versions, deployedAtMs: atMs, program: stamped,
  };
  return [{ deploymentId, definitionRef, versions, outcome: { tag: DeploymentOutcomeTag.Deployed } }, deployment];
}
