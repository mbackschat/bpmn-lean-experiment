/**
 * Program assembly for one deployment of a population (PC-SCOPE-03,
 * docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments): beside its own processes, a deployment's program
 * carries a copy of every process of every other listed deployment whose key one of its Calls names, transitively over
 * the Calls of the copies. Assembly is mechanical. It numbers no version, reads no deploy order and filters nothing:
 * `Kernel.Population.deploy` stamps versions, removes the copies of deployments later than the caller and validates the
 * stamps, and admission selects among the copies (`Program.calledProcessFor`).
 *
 * A Call names the key of its resolved QName's local part. That covers both `calledElementResolution` readings without
 * branching on a profile: under `cibKey` a literal names a process only when unprefixed, since an `xsd:ID` never
 * contains `:`, and a copy no selector admits is never reached.
 */
import { assertNever, compareIds } from "./wire.js";
import type { KernelJson } from "./wire.js";

/** One deployment of the population: its deploy ordinal, its reader program and its root process's version tag. */
export type AssemblyDeployment = Readonly<{ deploymentId: number; program: KernelJson; versionTag: string | null }>;

type Fields = { [key: string]: KernelJson };
type Rename = (id: string) => string;

/**
 * A copied element's identifier: unique in the program because a source document's identifiers are `xsd:ID`, which
 * never contains `@`, and one deployment is copied at most once per key. `Header.origin.sourceId` keeps the identifier
 * the author wrote, which publication shows.
 */
export const carriedId = (id: string, deploymentId: number): string => `${id}@${String(deploymentId)}`;

function fields(value: KernelJson | undefined, where: string): Fields {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`assembly: ${where} is not an object`);
  }
  return value;
}

function strings(value: KernelJson | undefined, where: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError(`assembly: ${where} is not a list of identifiers`);
  }
  return value as string[];
}

function string(value: KernelJson | undefined, where: string): string {
  if (typeof value !== "string") throw new TypeError(`assembly: ${where} is not a string`);
  return value;
}

const jsonList = (value: KernelJson | undefined, where: string): KernelJson[] => {
  if (!Array.isArray(value)) throw new TypeError(`assembly: ${where} is not a list`);
  return value;
};

const optional = (value: KernelJson | undefined, rename: Rename, where: string): KernelJson =>
  value === null ? null : rename(string(value, where));

/** A constructor in the IL's wire form: a nullary one is its name, any other `{"<name>": {<arguments>}}`. */
function variant(value: KernelJson | undefined, where: string): [string, Fields] {
  if (typeof value === "string") return [value, {}];
  const entries = Object.entries(fields(value, where));
  const [entry] = entries;
  if (entries.length !== 1 || entry === undefined) throw new TypeError(`assembly: ${where} is not a constructor`);
  return [entry[0], fields(entry[1], where)];
}

enum ElementKind { Activity = "activity", Scope = "scope", Event = "event", Gateway = "gateway", Start = "start" }
enum ThrowKind {
  None = "none", Message = "message", Signal = "signal", Error = "error", Escalation = "escalation",
  Compensation = "compensation", Cancel = "cancel", Terminate = "terminate",
}
enum RoleKind { Catch = "catch", Throw = "throw", LinkCatch = "linkCatch", LinkThrow = "linkThrow" }
enum GatewayKind { Exclusive = "exclusive", Parallel = "parallel", Inclusive = "inclusive", EventBased = "eventBased" }

function known<T extends string>(values: Record<string, T>, tag: string, where: string): T {
  const found = Object.values(values).find((value) => value === tag);
  if (found === undefined) throw new TypeError(`assembly: unknown ${where} ${tag}`);
  return found;
}

function renameThrow(record: KernelJson, rename: Rename): KernelJson {
  const [tag, args] = variant(record, "throw");
  const kind = known(ThrowKind, tag, "throw");
  switch (kind) {
    case ThrowKind.Compensation: {
      const payload = fields(args["payload"], "compensation throw");
      return { [tag]: { payload: { ...payload, activity: optional(payload["activity"], rename, "compensation activity") } } };
    }
    case ThrowKind.None: case ThrowKind.Message: case ThrowKind.Signal: case ThrowKind.Error: case ThrowKind.Escalation:
    case ThrowKind.Cancel: case ThrowKind.Terminate:
      return record;
  }
  return assertNever(kind);
}

/** A Link name pairs resource-wide (CIB-AGR-0018), so a copy's Links are renamed by their deployment as identifiers are. */
function renameRole(role: KernelJson, rename: Rename): KernelJson {
  const [tag, args] = variant(role, "event role");
  const kind = known(RoleKind, tag, "event role");
  switch (kind) {
    case RoleKind.Catch: return role;
    case RoleKind.Throw: return { [tag]: { ...args, record: renameThrow(args["record"] ?? null, rename) } };
    case RoleKind.LinkCatch: case RoleKind.LinkThrow: return { [tag]: { ...args, name: rename(string(args["name"], "Link name")) } };
  }
  return assertNever(kind);
}

function renameGatewayKind(gateway: KernelJson, rename: Rename): KernelJson {
  const [tag, args] = variant(gateway, "gateway kind");
  const kind = known(GatewayKind, tag, "gateway kind");
  switch (kind) {
    case GatewayKind.Exclusive: case GatewayKind.Inclusive:
      return { [tag]: { ...args, candidates: strings(args["candidates"], "candidates").map(rename),
        default: optional(args["default"], rename, "default flow") } };
    case GatewayKind.Parallel: case GatewayKind.EventBased:
      return gateway;
  }
  return assertNever(kind);
}

function renameEnvelope(envelope: KernelJson | undefined, rename: Rename): KernelJson {
  const own = fields(envelope, "envelope");
  return {
    ...own,
    incoming: strings(own["incoming"], "incoming").map(rename),
    outgoing: strings(own["outgoing"], "outgoing").map(rename),
    boundaries: jsonList(own["boundaries"], "boundaries").map((entry) => {
      const boundary = fields(entry, "boundary");
      return {
        ...boundary, id: rename(string(boundary["id"], "boundary id")), outgoing: strings(boundary["outgoing"], "outgoing").map(rename),
      };
    }),
    compensationHandlers: strings(own["compensationHandlers"], "compensation handlers").map(rename),
    defaultFlow: optional(own["defaultFlow"], rename, "default flow"),
  };
}

function renameElement(element: KernelJson, rename: Rename): KernelJson {
  const [tag, args] = variant(element, "element");
  const header = fields(args["header"], "header");
  const renamedHeader = { ...header, id: rename(string(header["id"], "element id")), parent: optional(header["parent"], rename, "parent") };
  const payload = fields(args["payload"], "payload");
  const flows = (key: string): string[] => strings(payload[key], key).map(rename);
  const kind = known(ElementKind, tag, "element");
  switch (kind) {
    case ElementKind.Activity:
      return { [tag]: { header: renamedHeader, payload: { ...payload, envelope: renameEnvelope(payload["envelope"], rename) } } };
    case ElementKind.Scope:
      return { [tag]: { header: renamedHeader, payload: {
        ...payload, children: flows("children"), envelope: renameEnvelope(payload["envelope"], rename),
      } } };
    case ElementKind.Event:
      return { [tag]: { header: renamedHeader, payload: {
        ...payload, role: renameRole(payload["role"] ?? null, rename), incoming: flows("incoming"), outgoing: flows("outgoing"),
        alternativeThrows: jsonList(payload["alternativeThrows"], "alternative throws").map((entry) => renameThrow(entry, rename)),
      } } };
    case ElementKind.Gateway:
      return { [tag]: { header: renamedHeader, payload: {
        ...payload, kind: renameGatewayKind(payload["kind"] ?? null, rename), incoming: flows("incoming"), outgoing: flows("outgoing"),
      } } };
    case ElementKind.Start:
      return { [tag]: { header: renamedHeader, payload: { ...payload, outgoing: flows("outgoing") } } };
  }
  return assertNever(kind);
}

const headerFields = (element: KernelJson): Fields => fields(variant(element, "element")[1]["header"], "header");

/** The keys a program's Calls name: each resolved QName's local part. */
function calledKeys(program: Fields): string[] {
  return jsonList(program["elements"], "elements").flatMap((element) => {
    const [tag, args] = variant(element, "element");
    if (tag !== ElementKind.Activity) return [];
    const [work, call] = variant(fields(args["payload"], "payload")["work"], "work");
    if (work !== "call") return [];
    const qName = fields(call["payload"], "call")["calledQName"] ?? null;
    return qName === null ? [] : [string(fields(qName, "called QName")["localName"], "called QName")];
  });
}

type Source = Readonly<{
  definition: Fields;
  topLevel: readonly string[];
  variables: KernelJson;
  executable: KernelJson;
}>;

/** The process of key `key` a deployment's program declares, its root or one of its called processes. */
function sourceProcess(deployment: AssemblyDeployment, key: string): Source | null {
  const program = fields(deployment.program, "program");
  const identity = fields(program["identity"], "identity");
  const processes = jsonList(program["processes"], "processes").map((entry) => fields(entry, "called process"));
  const stamp = (versionTag: KernelJson): Fields => ({
    key, namespace: identity["namespace"] ?? null, version: null, versionTag, deployment: deployment.deploymentId, tenant: null,
    sourceSha256: identity["sourceSha256"] ?? null,
  });
  if (identity["processId"] === key) {
    const called = new Set(processes.flatMap((process) => strings(process["children"], "children")));
    const topLevel = jsonList(program["elements"], "elements").map(headerFields)
      .filter((header) => header["parent"] === null && !called.has(string(header["id"], "element id")))
      .map((header) => string(header["id"], "element id"));
    return {
      definition: stamp(deployment.versionTag), topLevel, variables: program["variables"] ?? [], executable: program["executable"] ?? false,
    };
  }
  const process = processes.find((entry) => fields(entry["definition"], "definition")["key"] === key);
  if (process === undefined) return null;
  return {
    definition: stamp(fields(process["definition"], "definition")["versionTag"] ?? null),
    topLevel: strings(process["children"], "children"),
    variables: process["variables"] ?? [],
    executable: process["executable"] ?? false,
  };
}

type Copy = Readonly<{ process: KernelJson; elements: KernelJson[]; flows: KernelJson[]; calls: string[] }>;

/** A renamed copy of one process: its elements in program order, its boundaries' and elements' flows, its Calls' keys. */
function copyOf(deployment: AssemblyDeployment, source: Source): Copy {
  const program = fields(deployment.program, "program");
  const elements = jsonList(program["elements"], "elements");
  const parents = new Map(elements.map(headerFields).map((header) => [string(header["id"], "element id"), header["parent"]]));
  const topLevel = new Set(source.topLevel);
  const top = (id: string): string => {
    let current = id;
    for (let parent = parents.get(current); typeof parent === "string"; parent = parents.get(current)) current = parent;
    return current;
  };
  const members = elements.filter((element) => topLevel.has(top(string(headerFields(element)["id"], "element id"))));
  const owned = new Set(members.flatMap((element) => {
    const [, args] = variant(element, "element");
    const envelope = fields(args["payload"], "payload")["envelope"];
    const boundaries = envelope === undefined ? [] : jsonList(fields(envelope, "envelope")["boundaries"], "boundaries");
    const boundaryIds = boundaries.map((entry) => string(fields(entry, "boundary")["id"], "boundary id"));
    return [string(headerFields(element)["id"], "element id"), ...boundaryIds];
  }));
  const rename: Rename = (id) => carriedId(id, deployment.deploymentId);
  const flows = jsonList(program["flows"], "flows").map((entry) => fields(entry, "flow"))
    .filter((flow) => owned.has(string(flow["source"], "flow source")))
    .map((flow) => ({ ...flow, id: rename(string(flow["id"], "flow id")), source: rename(string(flow["source"], "flow source")),
      target: rename(string(flow["target"], "flow target")) }));
  return {
    process: {
      definition: source.definition, children: source.topLevel.map(rename), variables: source.variables, executable: source.executable,
    },
    elements: members.map((element) => renameElement(element, rename)),
    flows,
    calls: calledKeys({ elements: members }),
  };
}

/**
 * The program of deployment `deploymentId`: its reader program with a copy of every other deployment's process of each
 * key its Calls name, transitively. Copies follow the program's own processes, ordered by key and then by deployment,
 * and each copy's definition is stamped with its key, namespace, deployment, version tag and source digest.
 */
export function assembleProgram(deployments: ReadonlyArray<AssemblyDeployment>, deploymentId: number): KernelJson {
  const caller = deployments.find((deployment) => deployment.deploymentId === deploymentId);
  if (caller === undefined) throw new RangeError(`assembly: no deployment ${String(deploymentId)}`);
  const program = fields(caller.program, "program");
  const copies = new Map<string, Copy[]>();
  const pending = [...calledKeys(program)];
  for (let key = pending.shift(); key !== undefined; key = pending.shift()) {
    if (copies.has(key)) continue;
    const found = deployments.filter((deployment) => deployment.deploymentId !== deploymentId)
      .sort((left, right) => left.deploymentId - right.deploymentId)
      .flatMap((deployment) => {
        const source = sourceProcess(deployment, key);
        return source === null ? [] : [copyOf(deployment, source)];
      });
    copies.set(key, found);
    pending.push(...found.flatMap((copy) => copy.calls));
  }
  const ordered = [...copies.entries()].sort(([left], [right]) => compareIds(left, right)).flatMap(([, found]) => found);
  return {
    ...program,
    elements: [...jsonList(program["elements"], "elements"), ...ordered.flatMap((copy) => copy.elements)],
    flows: [...jsonList(program["flows"], "flows"), ...ordered.flatMap((copy) => copy.flows)],
    processes: [...jsonList(program["processes"], "processes"), ...ordered.map((copy) => copy.process)],
  };
}
