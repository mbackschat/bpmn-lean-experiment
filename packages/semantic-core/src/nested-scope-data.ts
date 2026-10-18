import type { EffectOccurrenceId, VariableBinding, VariableValue } from "./contract.js";
import { EffectMappingValuePolicy, effectMappingAcceptsValue } from "./effect-mapping-value-policy.js";
import { mergeProcessVariableBindings, projectActivityVariableScopeResultUnder } from "./semantic-process-data.js";
import type { SemanticOperation, SemanticOperationKind, SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { compareScopeOccurrenceIds, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopedVariables, ScopeOccurrenceId, ScopeVariableScope } from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { ScopeLocalData, VariableMapping } from "./semantic-value-contract.js";
import { canonicalNamedValueArrayUtf8ByteLength, cloneVariableBinding } from "./variable-value.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * Frame resolution, initialization, outputs and completion writes of the nested scope-data profile, per the
 * nested scope data proposal's stable rules (NSD-INIT-01 to NSD-RETIRE-01).
 *
 * The chain is walked over definition scopes, selecting the live frame of each one in the reading instance. The
 * profile's admission activates every definition at most once per instance, so that frame is the actual ancestor's;
 * a definition with more than one live frame refuses rather than choosing by storage order. Every operation reads only
 * the Program and the scoped variables, matching the independent Lean account in `NestedScopeData`.
 */

const itemPolicy = EffectMappingValuePolicy.SingletonBusinessItem;

/** NSD-TASK-01: one value allowance, the per-value limit of the portable value contract. */
export const nestedScopePatchByteLimit = 16_384;

export function nestedScopeDataProgram(program: Pick<SemanticProcessProgram, "identity">): boolean {
  return program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData;
}

/** Only the nested profile consults its table; admission separately refuses a table under any other profile. */
export function nestedScopeRecord(program: SemanticProcessProgram, scopeId: string): ScopeLocalData | undefined {
  if (!nestedScopeDataProgram(program)) return undefined;
  const records = (program.scopeLocalData ?? []).filter(record => record.scopeId === scopeId);
  return records.length === 1 ? records[0] : undefined;
}

/** `scopeId` and its ancestors, innermost first; the scope count bounds a cyclic parent relation. */
export function nestedDefinitionChain(program: SemanticProcessProgram, scopeId: string): readonly string[] {
  const chain: string[] = [];
  let current: string | null = scopeId;
  for (let fuel = program.definitionScopes.length; fuel > 0 && current !== null; fuel -= 1) {
    chain.push(current);
    const matching = program.definitionScopes.filter((scope): boolean => scope.id === current);
    current = matching.length === 1 ? matching[0]!.parentScopeId : null;
  }
  return chain;
}

function framesOf(variables: ScopedVariables, instanceId: string, scopeId: string): readonly ScopeVariableScope[] {
  return variables.scopes.filter(frame =>
    frame.owner.processInstanceId === instanceId && frame.owner.definitionScopeId === scopeId);
}

type Owner = Readonly<{ kind: "frame"; owner: ScopeOccurrenceId }> | Readonly<{ kind: "process" }>;

/** NSD-READ-01 and NSD-WRITE-01: the nearest chain scope whose frame declares `name`, a present null included. */
function resolveOwner(variables: ScopedVariables, instanceId: string, chain: readonly string[],
  name: string): Owner | null {
  for (const scopeId of chain) {
    const frames = framesOf(variables, instanceId, scopeId);
    if (frames.length > 1) return null;
    const frame = frames[0];
    if (frame !== undefined && frame.bindings.some(binding => binding.name === name)) {
      return { kind: "frame", owner: frame.owner };
    }
  }
  return { kind: "process" };
}

function uniqueValue(bindings: readonly VariableBinding[], name: string): VariableValue | undefined {
  const matching = bindings.filter(binding => binding.name === name);
  const value = matching.length === 1 ? matching[0]!.value : undefined;
  return value !== undefined && effectMappingAcceptsValue(itemPolicy, value, true) ? value : undefined;
}

function selectFrame(variables: ScopedVariables, owner: ScopeOccurrenceId): ScopeVariableScope | undefined {
  const matching = variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, owner));
  return matching.length === 1 ? matching[0] : undefined;
}

/** NSD-READ-01; every value is re-validated as a `SingletonBusinessItem`, never trusted for an earlier write. */
export function readNestedScopeVariable(program: SemanticProcessProgram, variables: ScopedVariables,
  instanceId: string, scopeId: string, name: string): VariableValue | undefined {
  const owner = resolveOwner(variables, instanceId, nestedDefinitionChain(program, scopeId), name);
  if (owner === null) return undefined;
  if (owner.kind === "process") return uniqueValue(variables.process.bindings, name);
  const frame = selectFrame(variables, owner.owner);
  return frame === undefined ? undefined : uniqueValue(frame.bindings, name);
}

/** NSD-WRITE-01: update the nearest declaring frame, else create or replace the Process binding. */
function writeOne(program: SemanticProcessProgram, variables: ScopedVariables, instanceId: string,
  scopeId: string, binding: VariableBinding): ScopedVariables | null {
  const owner = resolveOwner(variables, instanceId, nestedDefinitionChain(program, scopeId), binding.name);
  if (owner === null) return null;
  if (owner.kind === "process") {
    return { ...variables, process: { bindings: mergeProcessVariableBindings(variables.process.bindings, [binding]) } };
  }
  const frame = selectFrame(variables, owner.owner);
  if (frame === undefined) return null;
  return { ...variables, scopes: variables.scopes.map(candidate => sameScopeOccurrence(candidate.owner, owner.owner)
    ? { ...candidate, bindings: mergeProcessVariableBindings(candidate.bindings, [binding]) } : candidate) };
}

export function writeNestedScopeVariables(program: SemanticProcessProgram, variables: ScopedVariables,
  instanceId: string, scopeId: string, bindings: readonly VariableBinding[]): ScopedVariables | null {
  let current: ScopedVariables | null = variables;
  for (const binding of bindings) {
    if (current === null) return null;
    current = writeOne(program, current, instanceId, scopeId, binding);
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
    readNestedScopeVariable(program, state.variables, owner.processInstanceId, owner.definitionScopeId, name));
}

function occurrenceWithParent(state: RuntimeState, scopeId: string):
  Readonly<{ child: ScopeOccurrenceId; parent: ScopeOccurrenceId }> | null {
  const matching = state.scopeOccurrences.filter(occurrence => occurrence.id.definitionScopeId === scopeId);
  const occurrence = matching.length === 1 ? matching[0] : undefined;
  return occurrence === undefined || occurrence.parent === null ? null : { child: occurrence.id, parent: occurrence.parent };
}

/**
 * NSD-INIT-01 after the entry rewrite: inputs read the parent's whole chain before the new frame exists, so neither
 * declaration order nor a sibling input can influence a value. A scope without a record leaves the state unchanged.
 */
export function initializeNestedScopeFrame(program: SemanticProcessProgram, state: RuntimeState,
  childScopeId: string): RuntimeState | null {
  const record = nestedScopeRecord(program, childScopeId);
  if (record === undefined) return state;
  const located = occurrenceWithParent(state, childScopeId);
  if (located === null) return null;
  const { child, parent } = located;
  const bindings = evaluateNestedInputs(record.localInputs, name =>
    readNestedScopeVariable(program, state.variables, parent.processInstanceId, parent.definitionScopeId, name));
  if (bindings === null || state.variables.scopes.some(frame => sameScopeOccurrence(frame.owner, child))) return null;
  const insertion = state.variables.scopes.findIndex(frame => compareScopeOccurrenceIds(child, frame.owner) < 0);
  const index = insertion < 0 ? state.variables.scopes.length : insertion;
  const frame = { owner: { ...child }, bindings: mergeProcessVariableBindings([], bindings) };
  return { ...state, variables: { ...state.variables,
    scopes: [...state.variables.scopes.slice(0, index), frame, ...state.variables.scopes.slice(index)] } };
}

/**
 * NSD-OUTPUT-01 before the completion rewrite disposes the frame: every source is read from the completing frame
 * before any write, and the writes start at the parent, so no output can change another output's source.
 */
export function writeNestedScopeOutputs(program: SemanticProcessProgram, state: RuntimeState,
  scopeId: string): RuntimeState | null {
  const record = nestedScopeRecord(program, scopeId);
  if (record === undefined) return state;
  const located = occurrenceWithParent(state, scopeId);
  if (located === null) return null;
  const frame = selectFrame(state.variables, located.child);
  if (frame === undefined) return null;
  const values: VariableBinding[] = [];
  for (const mapping of record.localOutputs) {
    if (mapping.expression.kind !== MappingExpressionKind.LocalVariable) return null;
    const value = uniqueValue(frame.bindings, mapping.expression.name);
    if (value === undefined) return null;
    values.push(cloneVariableBinding({ name: mapping.target, value }));
  }
  const variables = writeNestedScopeVariables(program, state.variables, located.parent.processInstanceId,
    located.parent.definitionScopeId, values);
  return variables === null ? null : { ...state, variables };
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

/** The names a frame on `owner`'s chain declares: exactly the names a NSD-TASK-01 completion patch may carry. */
export function nestedScopeDeclaredNames(program: SemanticProcessProgram, variables: ScopedVariables,
  owner: ScopeOccurrenceId): ReadonlySet<string> {
  return new Set(nestedDefinitionChain(program, owner.definitionScopeId).flatMap(scopeId =>
    framesOf(variables, owner.processInstanceId, scopeId).flatMap(frame => frame.bindings.map(({ name }) => name))));
}

/**
 * NSD-TASK-01: distinct names in canonical order, each declared on the owner's chain, each an admitted
 * `SingletonBusinessItem`, and the canonical JSON of the whole binding array within one value allowance. The name
 * restriction is a profile admission restriction: CIB would create a root binding for an undeclared name.
 */
export function nestedScopePatchAdmitted(program: SemanticProcessProgram, variables: ScopedVariables,
  owner: ScopeOccurrenceId, patch: readonly VariableBinding[]): boolean {
  const declared = nestedScopeDeclaredNames(program, variables, owner);
  if (!patch.every((binding, index) => index === 0 || compareCanonicalStrings(patch[index - 1]!.name, binding.name) < 0) ||
      !patch.every(binding => declared.has(binding.name) && effectMappingAcceptsValue(itemPolicy, binding.value, true))) {
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
export function completeNestedScopeEffectData(program: SemanticProcessProgram, variables: ScopedVariables,
  wait: Readonly<{ id: EffectOccurrenceId; owner: ScopeOccurrenceId; outputMappings: readonly VariableMapping[] }>,
  localPatch: readonly VariableBinding[]): ScopedVariables | null {
  if (wait.id.processInstanceId !== wait.owner.processInstanceId) return null;
  const projected = projectActivityVariableScopeResultUnder(itemPolicy, variables, wait.id, wait.outputMappings,
    localPatch, true);
  return projected === null ? null : writeNestedScopeVariables(program, projected.variables,
    wait.owner.processInstanceId, wait.owner.definitionScopeId, projected.outputs);
}
