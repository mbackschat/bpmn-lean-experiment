/**
 * References between definitions, transcribed from `Kernel/IL/Types/Reference.lean`: qualified names, the definition a
 * process is bound to, a program's identity and a Call Activity's selector, with the one query that says which carried
 * definitions a selector admits. Part of `il/types.ts`, which re-exports it.
 */
import { type Expression, type Mapping, type ValueSource, ValueSourceTag } from "./expression.js";
import { parseJavaInt } from "./lexical.js";
import { CalledElementResolution } from "./options.js";

/**
 * An XML QName as the reader resolved it: the namespace its prefix is bound to (the Definitions' `targetNamespace` for
 * an unprefixed name), and its local part, which names an element by its id (BPMN 2.0.2 §15.3.2).
 */
export interface QName { readonly namespace: string | null; readonly localName: string; }

export enum CallBindingTag {
  Latest = "latest",
  Deployment = "deployment",
  Version = "version",
  VersionTag = "versionTag",
}

export type CallBinding =
  | { readonly tag: CallBindingTag.Latest }
  | { readonly tag: CallBindingTag.Deployment }
  | { readonly tag: CallBindingTag.Version; readonly value: ValueSource }
  | { readonly tag: CallBindingTag.VersionTag; readonly value: ValueSource };

/**
 * `calledElement` is the attribute's text, `calledQName` the QName the reader resolved it to: `null` for an expression
 * or a prefix without a namespace binding (`Semantic.xsd` types `calledElement` as `xsd:QName`, PC-SCOPE-03).
 */
export interface CallWork {
  readonly calledElement: ValueSource;
  readonly calledQName: QName | null;
  readonly binding: CallBinding;
  readonly tenant: ValueSource | null;
  readonly businessKey: Expression | null;
  readonly inputs: readonly Mapping[];
  readonly outputs: readonly Mapping[];
  readonly propagateAllInputs: boolean;
  readonly propagateAllOutputs: boolean;
}

/**
 * The definition a called process is bound to: its key and the namespace of the Definitions that declare it. `version`
 * to `tenant` name a binding of a Call Activity, `null` for the process this program carries; `deployment` is the deploy
 * ordinal of the deployment that carries it; `sourceSha256` pins the source (PC-SCOPE-03).
 */
export interface DefinitionRef {
  readonly key: string;
  readonly namespace: string | null;
  readonly version: number | null;
  readonly versionTag: string | null;
  readonly deployment: number | null;
  readonly tenant: string | null;
  readonly sourceSha256: string | null;
}

/**
 * `namespace` is the root process's Definitions' `targetNamespace`, so that a Call resolved by QName can tell the root
 * process from a same-id process of another namespace; `deployment` is the root's own deploy ordinal.
 */
export interface ProgramIdentity {
  readonly processId: string;
  readonly namespace: string | null;
  readonly sourceSha256: string;
  readonly profile: string;
  readonly deployment: number | null;
}

/** Lean's derived `DecidableEq DefinitionRef`. */
export function definitionRefEquals(left: DefinitionRef, right: DefinitionRef): boolean {
  return left.key === right.key && left.namespace === right.namespace && left.version === right.version &&
    left.versionTag === right.versionTag && left.deployment === right.deployment && left.tenant === right.tenant &&
    left.sourceSha256 === right.sourceSha256;
}

/**
 * Whether `definition` belongs to a deployment no later than the caller's: every carried definition when the caller has
 * no deploy ordinal, and an unstamped definition always (PC-SCOPE-03: a Call binds among callees deployed at or before
 * its caller).
 */
export function definitionRefEligibleFor(callerDeployment: number | null, definition: DefinitionRef): boolean {
  return callerDeployment === null || definition.deployment === null || definition.deployment <= callerDeployment;
}

/**
 * Whether a Call's target names `definition`: its resolved QName under `qualifiedName`, its literal text as the key
 * under `cibKey` (PC-SCOPE-03).
 */
export function callWorkNamesDefinition(resolution: CalledElementResolution, work: CallWork, definition: DefinitionRef): boolean {
  return resolution === CalledElementResolution.QualifiedName
    ? work.calledQName !== null && work.calledQName.namespace === definition.namespace && work.calledQName.localName === definition.key
    : work.calledElement.tag === ValueSourceTag.Literal && work.calledElement.value === definition.key;
}

/**
 * The definitions among `carried` a Call's selector admits for a caller deployed at `callerDeployment`: the eligible ones
 * it targets, narrowed by its binding. `latest` keeps the highest version; `deployment` the caller's own deployment; a
 * literal `version` or `versionTag` the definitions carrying it; an expression admits none. A definition no population
 * stamped is version 1, as every process of a single-instance program is its one deployment's first
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments). More than one result is an ambiguous selector, none a missing one.
 */
export function callWorkSelects(resolution: CalledElementResolution, callerDeployment: number | null, work: CallWork,
  carried: readonly DefinitionRef[]): readonly DefinitionRef[] {
  const targets = carried.filter((definition) =>
    definitionRefEligibleFor(callerDeployment, definition) && callWorkNamesDefinition(resolution, work, definition));
  const literal = (value: ValueSource, keep: (text: string, definition: DefinitionRef) => boolean): readonly DefinitionRef[] =>
    value.tag === ValueSourceTag.Literal ? targets.filter((definition) => keep(value.value, definition)) : [];
  const binding = work.binding;
  if (binding.tag === CallBindingTag.Latest) {
    const highest = targets.reduce((top, definition) => Math.max(top, definition.version ?? 1), 1);
    return targets.filter((definition) => (definition.version ?? 1) === highest);
  }
  if (binding.tag === CallBindingTag.Deployment) return targets.filter((definition) => definition.deployment === callerDeployment);
  // CIB reads a literal version with `Integer.valueOf`, `parseInt`'s decimal reading (`BaseCallableElement.java:95-100`).
  if (binding.tag === CallBindingTag.Version) {
    return literal(binding.value, (text, definition) => {
      const number = parseJavaInt(text);
      return number !== null && number >= 0n && (definition.version ?? 1) === Number(number);
    });
  }
  return literal(binding.value, (text, definition) => definition.versionTag === text);
}
