import type { EffectOccurrenceId, VariableBinding, VariableValue } from "./contract.js";
import { effectMappingAcceptsValue, effectMappingValuePolicyForProgram } from "./effect-mapping-value-policy.js";
import type { EffectMappingValuePolicy } from "./effect-mapping-value-policy.js";
import { CallDataKind } from "./call-data-contract.js";
import type { VariableMappingCallData } from "./call-data-contract.js";
import { mergeProcessVariableBindings, projectActivityVariableScopeResultUnder } from "./semantic-process-data.js";
import { SemanticOperationKind as SemanticOperationKindValue } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticOperationKind, SemanticProcessProgram } from "./semantic-process-contract.js";
import { embeddedScopeDataBearing } from "./scope-data-bearing.js";
import type { DataGateProgram } from "./scope-data-bearing.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { compareScopeOccurrenceIds, sameScopeOccurrence } from "./semantic-process-state.js";
import type {
  CalledProcessOccurrence, RuntimeScopeOccurrence, RuntimeState, ScopedVariables, ScopeOccurrenceId, ScopeVariableScope,
} from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { ScopeLocalData, VariableMapping } from "./semantic-value-contract.js";
import { canonicalNamedValueArrayUtf8ByteLength, cloneVariableBinding } from "./variable-value.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * Frame resolution, initialization, outputs and completion writes of the nested scope-data profile, per the
 * nested scope data specification's stable rules (NSD-INIT-01 to NSD-RETIRE-01).
 *
 * The chain is walked over live scope occurrences, from the performing occurrence through its parents to its instance
 * root, selecting each frame by exact owner (CSD-CHAIN-01 of the concurrent scope data proposal). Two live occurrences
 * of one definition are therefore two owners, and a sibling's frame is never on the chain. Every operation reads only
 * the Program, the live occurrences and the scoped variables, matching the independent Lean account in `NestedScopeData`.
 */

/** NSD-TASK-01: one value allowance, the per-value limit of the portable value contract. */
export const nestedScopePatchByteLimit = 16_384;

/**
 * The nested scope-data profile, and a data-bearing Program of the embedded completion profile, whose frames resolve by
 * the same occurrence chain; every value check takes that Program's effect policy.
 */
export function nestedScopeDataProgram(program: DataGateProgram): boolean {
  return program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData || embeddedScopeDataBearing(program);
}

/** Only the nested profile consults its table; admission separately refuses a table under any other profile. */
export function nestedScopeRecord(program: SemanticProcessProgram, scopeId: string): ScopeLocalData | undefined {
  if (!nestedScopeDataProgram(program)) return undefined;
  const records = (program.scopeLocalData ?? []).filter(record => record.scopeId === scopeId);
  return records.length === 1 ? records[0] : undefined;
}

/**
 * `owner` and its live ancestors, innermost first, ending at the parentless instance root. An occurrence that is not
 * live, or a parent link the fuel cannot finish, refuses with `null` rather than resolving past a gap.
 */
export function nestedOccurrenceChain(occurrences: readonly RuntimeScopeOccurrence[],
  owner: ScopeOccurrenceId): readonly ScopeOccurrenceId[] | null {
  const chain: ScopeOccurrenceId[] = [];
  let current: ScopeOccurrenceId | null = owner;
  for (let fuel = occurrences.length; fuel > 0 && current !== null; fuel -= 1) {
    const at: ScopeOccurrenceId = current;
    const matching = occurrences.filter(({ id }) => sameScopeOccurrence(id, at));
    if (matching.length !== 1) return null;
    chain.push(at);
    current = matching[0]!.parent;
  }
  return current === null ? chain : null;
}

/**
 * Whether `scopeId` is the root of a variable-mapping called Process: some invocation targets it and every one carries
 * mappings. Its frame is the called instance's Process store (CVM-ISOLATE-01), so resolution ends there instead of at
 * the caller. Two Calls of one definition may map differently, so this answers only the kind, never the mappings.
 */
export function mappedCalledRoot(program: SemanticProcessProgram, scopeId: string): boolean {
  if (!nestedScopeDataProgram(program)) return false;
  const invocations = program.operations.filter(operation =>
    operation.kind === SemanticOperationKindValue.InvokeProcess && operation.calledRootScopeId === scopeId);
  return invocations.length > 0 && invocations.every(operation =>
    operation.kind === SemanticOperationKindValue.InvokeProcess && operation.data.kind === CallDataKind.VariableMappings);
}

/**
 * The mappings of the Call that created the called root `root`: its one live record names the return operation, which
 * belongs to exactly one invocation. Selecting by called definition instead would give the second of two Calls of one
 * definition the first Call's mappings (CALLN-FRAME-01).
 */
export function calledRootMappings(program: SemanticProcessProgram, calls: readonly CalledProcessOccurrence[],
  root: ScopeOccurrenceId): VariableMappingCallData | undefined {
  if (!nestedScopeDataProgram(program)) return undefined;
  const records = calls.filter(({ calledRoot }) => sameScopeOccurrence(calledRoot, root));
  const record = records.length === 1 ? records[0] : undefined;
  const invocations = record === undefined ? [] : program.operations.filter(operation =>
    operation.kind === SemanticOperationKindValue.InvokeProcess &&
    operation.returnOperationId === record.returnOperationId && operation.calledRootScopeId === root.definitionScopeId);
  const data = invocations.length === 1 && invocations[0]!.kind === SemanticOperationKindValue.InvokeProcess
    ? invocations[0]!.data : undefined;
  return data?.kind === CallDataKind.VariableMappings ? data : undefined;
}

/**
 * `calledRoot` is the called-root frame reached without a declaring frame: a read there is absent and a write creates
 * the binding, as CIB's `setVariable` does on a process instance, never the caller's Process binding.
 */
type Owner =
  | Readonly<{ kind: "frame"; owner: ScopeOccurrenceId }>
  | Readonly<{ kind: "calledRoot"; owner: ScopeOccurrenceId }>
  | Readonly<{ kind: "process" }>;

/** NSD-READ-01 and NSD-WRITE-01: the nearest chain occurrence whose frame declares `name`, a present null included. */
function resolveOwner(program: SemanticProcessProgram, occurrences: readonly RuntimeScopeOccurrence[],
  variables: ScopedVariables, owner: ScopeOccurrenceId, name: string): Owner | null {
  const chain = nestedOccurrenceChain(occurrences, owner);
  if (chain === null) return null;
  for (const occurrence of chain) {
    const frames = variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, occurrence));
    if (frames.length > 1) return null;
    if (frames[0]?.bindings.some(binding => binding.name === name)) return { kind: "frame", owner: occurrence };
  }
  const root = chain[chain.length - 1];
  if (root === undefined || !mappedCalledRoot(program, root.definitionScopeId)) return { kind: "process" };
  return selectFrame(variables, root) === undefined ? null : { kind: "calledRoot", owner: root };
}

/**
 * What resolving `names` from `reader` consults: every chain link, each chain frame up to the one that declares a
 * name (all of them when it falls through), and the Process names that fall through. These are the precise read atoms
 * of a nested input evaluation; `null` when the chain cannot be walked.
 */
export type NestedScopeReadSet = Readonly<{
  links: readonly RuntimeScopeOccurrence[];
  frames: readonly ScopeOccurrenceId[];
  processNames: readonly string[];
}>;

export function nestedScopeReadSet(program: SemanticProcessProgram, state: RuntimeState, reader: ScopeOccurrenceId,
  names: readonly string[]): NestedScopeReadSet | null {
  const chain = nestedOccurrenceChain(state.scopeOccurrences, reader);
  if (chain === null) return null;
  const frames: ScopeOccurrenceId[] = [];
  const processNames: string[] = [];
  for (const name of names) {
    const owner = resolveOwner(program, state.scopeOccurrences, state.variables, reader, name);
    if (owner === null) return null;
    const consulted = owner.kind === "frame" ? chain.findIndex(occurrence => sameScopeOccurrence(occurrence, owner.owner)) + 1
      : chain.length;
    frames.push(...chain.slice(0, consulted).filter(occurrence => !frames.some(frame => sameScopeOccurrence(frame, occurrence))));
    if (owner.kind === "process") processNames.push(name);
  }
  const links = chain.map(id => state.scopeOccurrences.find(occurrence => sameScopeOccurrence(occurrence.id, id))!);
  return { links, frames, processNames };
}

function uniqueValue(policy: EffectMappingValuePolicy, bindings: readonly VariableBinding[], name: string): VariableValue | undefined {
  const matching = bindings.filter(binding => binding.name === name);
  const value = matching.length === 1 ? matching[0]!.value : undefined;
  return value !== undefined && effectMappingAcceptsValue(policy, value, true) ? value : undefined;
}

function selectFrame(variables: ScopedVariables, owner: ScopeOccurrenceId): ScopeVariableScope | undefined {
  const matching = variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, owner));
  return matching.length === 1 ? matching[0] : undefined;
}

export enum NestedScopeReadKind {
  Present = "present",
  Absent = "absent",
  Refused = "refused",
}

/**
 * The three outcomes a Call mapping distinguishes: an absent name becomes a present null (CVM-IN-01, CVM-OUT-01), while a
 * refused resolution (a chain through an occurrence that is not live, a repeated binding, a value outside the domain) disables the
 * step rather than fabricating a null.
 */
export type NestedScopeRead =
  | Readonly<{ kind: NestedScopeReadKind.Present; value: VariableValue }>
  | Readonly<{ kind: NestedScopeReadKind.Absent }>
  | Readonly<{ kind: NestedScopeReadKind.Refused }>;

const absent = { kind: NestedScopeReadKind.Absent } as const;
const refused = { kind: NestedScopeReadKind.Refused } as const;

/** One name of one binding list: absent when unbound, refused when repeated or outside the Program's value domain. */
export function readBindingOutcome(policy: EffectMappingValuePolicy, bindings: readonly VariableBinding[],
  name: string): NestedScopeRead {
  const matching = bindings.filter(binding => binding.name === name);
  if (matching.length === 0) return absent;
  const value = matching.length === 1 ? matching[0]!.value : undefined;
  return value !== undefined && effectMappingAcceptsValue(policy, value, true)
    ? { kind: NestedScopeReadKind.Present, value } : refused;
}

/** NSD-READ-01 with its three outcomes; a called-root chain ends at its own frame (CVM-RESOLVE-01's isolation). */
export function resolveNestedScopeRead(program: SemanticProcessProgram, occurrences: readonly RuntimeScopeOccurrence[],
  variables: ScopedVariables, reader: ScopeOccurrenceId, name: string): NestedScopeRead {
  const owner = resolveOwner(program, occurrences, variables, reader, name);
  if (owner === null) return refused;
  switch (owner.kind) {
    case "process": return readBindingOutcome(effectMappingValuePolicyForProgram(program), variables.process.bindings, name);
    case "calledRoot": return absent;
    case "frame": {
      const frame = selectFrame(variables, owner.owner);
      return frame === undefined ? refused : readBindingOutcome(effectMappingValuePolicyForProgram(program), frame.bindings, name);
    }
  }
}

/** NSD-READ-01; every value is re-validated as a `SingletonBusinessItem`, never trusted for an earlier write. */
export function readNestedScopeVariable(program: SemanticProcessProgram, occurrences: readonly RuntimeScopeOccurrence[],
  variables: ScopedVariables, reader: ScopeOccurrenceId, name: string): VariableValue | undefined {
  const read = resolveNestedScopeRead(program, occurrences, variables, reader, name);
  return read.kind === NestedScopeReadKind.Present ? read.value : undefined;
}

/** NSD-WRITE-01: update the nearest declaring frame, else create or replace the Process or called-root binding. */
function writeOne(program: SemanticProcessProgram, occurrences: readonly RuntimeScopeOccurrence[],
  variables: ScopedVariables, writer: ScopeOccurrenceId, binding: VariableBinding): ScopedVariables | null {
  const owner = resolveOwner(program, occurrences, variables, writer, binding.name);
  if (owner === null) return null;
  if (owner.kind === "process") {
    return { ...variables, process: { bindings: mergeProcessVariableBindings(variables.process.bindings, [binding]) } };
  }
  const frame = selectFrame(variables, owner.owner);
  if (frame === undefined) return null;
  return { ...variables, scopes: variables.scopes.map(candidate => sameScopeOccurrence(candidate.owner, owner.owner)
    ? { ...candidate, bindings: mergeProcessVariableBindings(candidate.bindings, [binding]) } : candidate) };
}

export function writeNestedScopeVariables(program: SemanticProcessProgram,
  occurrences: readonly RuntimeScopeOccurrence[], variables: ScopedVariables, writer: ScopeOccurrenceId,
  bindings: readonly VariableBinding[]): ScopedVariables | null {
  let current: ScopedVariables | null = variables;
  for (const binding of bindings) {
    if (current === null) return null;
    current = writeOne(program, occurrences, current, writer, binding);
  }
  return current;
}

/** Evaluates input mappings in canonical target order against `read`, refusing a duplicate target. */
export function evaluateNestedInputs(mappings: readonly VariableMapping[],
  read: (name: string) => VariableValue | undefined): readonly VariableBinding[] | null {
  const ordered = [...mappings].sort((left, right) => compareCanonicalStrings(left.target, right.target));
  const result: VariableBinding[] = [];
  for (const [index, mapping] of ordered.entries()) {
    if (index > 0 && ordered[index - 1]!.target === mapping.target) return null;
    switch (mapping.expression.kind) {
      case MappingExpressionKind.StringLiteral:
        result.push({ name: mapping.target, value: { kind: "string", value: mapping.expression.value } as VariableValue });
        break;
      case MappingExpressionKind.EnclosingVariable: {
        const value = read(mapping.expression.name);
        if (value === undefined) return null;
        result.push(cloneVariableBinding({ name: mapping.target, value }));
        break;
      }
      case MappingExpressionKind.LocalVariable:
        return null;
    }
  }
  return result;
}

/** NSD-READ-01 for an Activity's input mappings: names resolve from the owner scope's frame chain outward. */
export function evaluateNestedEffectInputs(program: SemanticProcessProgram, state: RuntimeState,
  owner: ScopeOccurrenceId, mappings: readonly VariableMapping[]): readonly VariableBinding[] | null {
  return evaluateNestedInputs(mappings, name =>
    readNestedScopeVariable(program, state.scopeOccurrences, state.variables, owner, name));
}

function occurrenceWithParent(state: RuntimeState, scopeId: string):
  Readonly<{ child: ScopeOccurrenceId; parent: ScopeOccurrenceId }> | null {
  const matching = state.scopeOccurrences.filter(occurrence => occurrence.id.definitionScopeId === scopeId);
  const occurrence = matching.length === 1 ? matching[0] : undefined;
  return occurrence === undefined || occurrence.parent === null ? null : { child: occurrence.id, parent: occurrence.parent };
}

/**
 * NSD-INIT-01 for the occurrence `child` of `parent`: inputs read the parent's whole chain before the child's frame
 * exists, so neither declaration order nor a sibling input can influence a value. Reading the pre-entry state gives the
 * same values, because entry adds only the child, whose frame is not on its parent's chain.
 */
export function evaluateNestedScopeFrame(program: SemanticProcessProgram, state: RuntimeState, record: ScopeLocalData,
  child: ScopeOccurrenceId, parent: ScopeOccurrenceId): ScopeVariableScope | null {
  const bindings = evaluateNestedInputs(record.localInputs, name =>
    readNestedScopeVariable(program, state.scopeOccurrences, state.variables, parent, name));
  return bindings === null || state.variables.scopes.some(frame => sameScopeOccurrence(frame.owner, child)) ? null
    : { owner: { ...child }, bindings: mergeProcessVariableBindings([], bindings) };
}

/** Inserts a frame at its canonical owner position; only `variables.scopes` changes. */
export function insertNestedScopeFrame(variables: ScopedVariables, frame: ScopeVariableScope): ScopedVariables {
  const insertion = variables.scopes.findIndex(candidate => compareScopeOccurrenceIds(frame.owner, candidate.owner) < 0);
  const index = insertion < 0 ? variables.scopes.length : insertion;
  return { ...variables, scopes: [...variables.scopes.slice(0, index), frame, ...variables.scopes.slice(index)] };
}

/** NSD-INIT-01 after a definition-addressed entry rewrite; a scope without a record leaves the state unchanged. */
export function initializeNestedScopeFrame(program: SemanticProcessProgram, state: RuntimeState,
  childScopeId: string): RuntimeState | null {
  const record = nestedScopeRecord(program, childScopeId);
  if (record === undefined) return state;
  const located = occurrenceWithParent(state, childScopeId);
  return located === null ? null : initializeNestedScopeFrameAt(program, state, record, located.child, located.parent);
}

function initializeNestedScopeFrameAt(program: SemanticProcessProgram, state: RuntimeState, record: ScopeLocalData,
  child: ScopeOccurrenceId, parent: ScopeOccurrenceId): RuntimeState | null {
  const frame = evaluateNestedScopeFrame(program, state, record, child, parent);
  return frame === null ? null : { ...state, variables: insertNestedScopeFrame(state.variables, frame) };
}

/** NSD-OUTPUT-01 before a definition-addressed completion rewrite disposes the frame. */
export function writeNestedScopeOutputs(program: SemanticProcessProgram, state: RuntimeState,
  scopeId: string): RuntimeState | null {
  const record = nestedScopeRecord(program, scopeId);
  if (record === undefined) return state;
  const located = occurrenceWithParent(state, scopeId);
  return located === null ? null : writeNestedScopeOutputsAt(program, state, record, located.child, located.parent);
}

/**
 * NSD-OUTPUT-01 for the completing occurrence `child`: every source is read from its frame before any write, and the
 * writes start at `parent`, so no output can change another output's source.
 */
function writeNestedScopeOutputsAt(program: SemanticProcessProgram, state: RuntimeState, record: ScopeLocalData,
  child: ScopeOccurrenceId, parent: ScopeOccurrenceId): RuntimeState | null {
  const frame = selectFrame(state.variables, child);
  if (frame === undefined) return null;
  const values: VariableBinding[] = [];
  for (const mapping of record.localOutputs) {
    if (mapping.expression.kind !== MappingExpressionKind.LocalVariable) return null;
    const value = uniqueValue(effectMappingValuePolicyForProgram(program), frame.bindings, mapping.expression.name);
    if (value === undefined) return null;
    values.push(cloneVariableBinding({ name: mapping.target, value }));
  }
  const variables = writeNestedScopeVariables(program, state.scopeOccurrences, state.variables, parent, values);
  return variables === null ? null : { ...state, variables };
}

/**
 * NSD-INIT-01 and NSD-RETIRE-01 as one committed-state property: frames correspond one-to-one with the live occurrences
 * of declaring scopes, and each frame holds exactly its scope's declared locals with values in the item domain. Writes
 * never add a name, so the declared set is the frame's whole lifetime. Outside the nested profile no frame may exist.
 */
export function nestedScopeFramesValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  if (!nestedScopeDataProgram(program)) return state.variables.scopes.length === 0;
  const declaredOccurrences = state.scopeOccurrences.filter(({ id }) => nestedScopeRecord(program, id.definitionScopeId));
  const calledRoots = state.scopeOccurrences.filter(({ id, parent }) =>
    parent === null && mappedCalledRoot(program, id.definitionScopeId));
  return state.variables.scopes.length === declaredOccurrences.length + calledRoots.length &&
    calledRoots.every(({ id }) => calledRootFrameValid(program, state, id)) &&
    declaredOccurrences.every(({ id }) => {
      const frames = state.variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, id));
      const record = nestedScopeRecord(program, id.definitionScopeId);
      const frame = frames[0];
      if (frames.length !== 1 || frame === undefined || record === undefined) return false;
      const names = frame.bindings.map(binding => binding.name);
      return new Set(names).size === names.length && names.length === record.localInputs.length &&
        record.localInputs.every(input => names.includes(input.target)) &&
        frame.bindings.every(binding => effectMappingAcceptsValue(effectMappingValuePolicyForProgram(program), binding.value, true));
    });
}

/**
 * The called-root arm of frame validity (the proposal's runtime-only invariant): exactly one frame, distinct names with
 * input targets ⊆ names ⊆ input targets ∪ output sources, every value in the item domain.
 */
function calledRootFrameValid(program: SemanticProcessProgram, state: RuntimeState, root: ScopeOccurrenceId): boolean {
  const data = calledRootMappings(program, state.calledProcessOccurrences, root);
  const frames = state.variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, root));
  const frame = frames[0];
  if (data === undefined || frames.length !== 1 || frame === undefined) return false;
  const names = frame.bindings.map(binding => binding.name);
  const allowed = calledRootPatchNames(data);
  return new Set(names).size === names.length && data.inputs.every(({ target }) => names.includes(target)) &&
    names.every(name => allowed.has(name)) &&
    frame.bindings.every(binding => effectMappingAcceptsValue(effectMappingValuePolicyForProgram(program), binding.value, true));
}

/** CVM-TASK-01: the names a called-root frame may hold, the input targets and the output sources. */
export function calledRootPatchNames(data: VariableMappingCallData): ReadonlySet<string> {
  return new Set([...data.inputs.map(({ target }) => target),
    ...data.outputs.flatMap(({ expression }) => expression.kind === MappingExpressionKind.LocalVariable ? [expression.name] : [])]);
}

/** NSD-INIT-01 around an entry rewrite; an undeclared child keeps exactly `enter`. */
export function enterDeclaredScope(program: SemanticProcessProgram, childScopeId: string,
  enter: () => RuntimeState | null): RuntimeState | null {
  const entered = enter();
  return entered === null ? null : initializeNestedScopeFrame(program, entered, childScopeId);
}

/** NSD-OUTPUT-01 around a completion rewrite; root completion and undeclared scopes keep exactly `complete`. */
export function completeDeclaredScope(program: SemanticProcessProgram,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteScope }>, state: RuntimeState,
  complete: (state: RuntimeState) => RuntimeState | null): RuntimeState | null {
  if (operation.parentOutput === null) return complete(state);
  const written = writeNestedScopeOutputs(program, state, operation.scopeId);
  return written === null ? null : complete(written);
}

/**
 * CSD-INIT-01 for a merge target, entered by occurrence beside live siblings: `enter` issues `child` under `parent`,
 * whose chain the inputs read. An undeclared child keeps exactly `enter`.
 */
export function enterDeclaredScopeOccurrence(program: SemanticProcessProgram, childScopeId: string,
  child: ScopeOccurrenceId, parent: ScopeOccurrenceId, enter: () => RuntimeState | null): RuntimeState | null {
  const entered = enter();
  const record = nestedScopeRecord(program, childScopeId);
  return entered === null || record === undefined ? entered
    : initializeNestedScopeFrameAt(program, entered, record, child, parent);
}

/**
 * CSD-RETIRE-01 for a merge target completed by occurrence: `owner` writes its outputs through its own parent's chain
 * before `complete` disposes exactly its frame. Root completion and undeclared scopes keep exactly `complete`.
 */
export function completeDeclaredScopeOccurrence(program: SemanticProcessProgram,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteScope }>, state: RuntimeState,
  owner: ScopeOccurrenceId, complete: (state: RuntimeState) => RuntimeState | null): RuntimeState | null {
  const record = nestedScopeRecord(program, operation.scopeId);
  if (operation.parentOutput === null || record === undefined) return complete(state);
  const occurrences = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner));
  const parent = occurrences.length === 1 ? occurrences[0]!.parent : null;
  if (parent === null || owner.definitionScopeId !== operation.scopeId) return null;
  const written = writeNestedScopeOutputsAt(program, state, record, owner, parent);
  return written === null ? null : complete(written);
}

/**
 * Exactly the names a completion patch from `owner` may carry, the single owner for admission and capacity
 * reservation: NSD-TASK-01's names declared by a frame on the chain, or inside a called instance CVM-TASK-01's
 * called-root names, since that frame grows by output sources the callee has not yet set.
 */
export function nestedScopeDeclaredNames(program: SemanticProcessProgram, state: RuntimeState,
  owner: ScopeOccurrenceId): ReadonlySet<string> {
  const chain = nestedOccurrenceChain(state.scopeOccurrences, owner);
  const root = chain?.[chain.length - 1];
  if (chain === null || root === undefined) return new Set();
  if (mappedCalledRoot(program, root.definitionScopeId)) {
    const called = calledRootMappings(program, state.calledProcessOccurrences, root);
    return called === undefined ? new Set() : calledRootPatchNames(called);
  }
  return new Set(chain.flatMap(occurrence => state.variables.scopes
    .filter(frame => sameScopeOccurrence(frame.owner, occurrence)).flatMap(frame => frame.bindings.map(({ name }) => name))));
}

/**
 * NSD-TASK-01: distinct names in canonical order, each declared on the owner's chain, each an admitted
 * `SingletonBusinessItem`, and the canonical JSON of the whole binding array within one value allowance. The name
 * restriction is a profile admission restriction: CIB would create a root binding for an undeclared name.
 */
export function nestedScopePatchAdmitted(program: SemanticProcessProgram, state: RuntimeState,
  owner: ScopeOccurrenceId, patch: readonly VariableBinding[]): boolean {
  const declared = nestedScopeDeclaredNames(program, state, owner);
  if (!patch.every((binding, index) => index === 0 || compareCanonicalStrings(patch[index - 1]!.name, binding.name) < 0) ||
      !patch.every(binding => declared.has(binding.name) && effectMappingAcceptsValue(effectMappingValuePolicyForProgram(program), binding.value, true))) {
    return false;
  }
  const entries = [];
  for (const binding of patch) {
    if (binding.value.kind === "stringList") return false;
    entries.push({ name: binding.name, value: binding.value });
  }
  return canonicalNamedValueArrayUtf8ByteLength(entries) <= nestedScopePatchByteLimit;
}

/**
 * NSD-WRITE-01 for a successful effect result: the patch is validated and projected exactly as for the structured
 * effect-data profile, and only the landing owner of each output differs. BPMN Error results are not admitted.
 */
export function completeNestedScopeEffectData(program: SemanticProcessProgram,
  occurrences: readonly RuntimeScopeOccurrence[], variables: ScopedVariables,
  wait: Readonly<{ id: EffectOccurrenceId; owner: ScopeOccurrenceId; outputMappings: readonly VariableMapping[] }>,
  localPatch: readonly VariableBinding[]): ScopedVariables | null {
  if (wait.id.processInstanceId !== wait.owner.processInstanceId) return null;
  const projected = projectActivityVariableScopeResultUnder(effectMappingValuePolicyForProgram(program), variables, wait.id, wait.outputMappings,
    localPatch, true);
  return projected === null ? null : writeNestedScopeVariables(program, occurrences, projected.variables, wait.owner,
    projected.outputs);
}
