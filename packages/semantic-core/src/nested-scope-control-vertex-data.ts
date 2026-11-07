/**
 * The data each vertex of the nested scope-control analysis carries: which Service Task and Call data the concurrent
 * account admits, and the reads and writes it contributes to the Start-name availability analysis (CSE-ADMIT-01,
 * CSD-ADMIT-01, CMCALL-ADMIT-01). Shared by the checked and Program projections of `nested-scope-control-admission.ts`.
 */
import { CallDataKind } from "./call-data-contract.js";
import type { CallDataInterface, VariableMappingCallData } from "./call-data-contract.js";
import { enclosingReads } from "./concurrent-scope-data-availability.js";
import type { ScopeDataAccess } from "./concurrent-scope-data-availability.js";
import { callMappingsAdmitted } from "./nested-scope-data-admission.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { serialBusinessEffectAdmitted, serialChainRulesForProfile } from "./serial-business-task-policy.js";
import type { ScopeLocalData, VariableMapping } from "./semantic-value-contract.js";

export type ModelData = Readonly<{ records: readonly ScopeLocalData[]; handlers: ReadonlySet<string> }>;

/** CSE-ADMIT-01: no mapping, no Error route, and the serial business-task Activity descriptor. */
function dataFreeServiceTask(effect: Readonly<{ inputMappings: readonly unknown[]; outputMappings: readonly unknown[] }>,
  bpmnErrorRoute: unknown): boolean {
  return effect.inputMappings.length === 0 && effect.outputMappings.length === 0 && bpmnErrorRoute === null &&
    serialBusinessEffectAdmitted(effect);
}

const scopeDataRules = serialChainRulesForProfile(SemanticProfileId.EmbeddedSubProcessCompletion);

/**
 * CSD-ADMIT-01 and CSSD-ADMIT-01: in a data-bearing model a Service Task may map data. Mapping admission reads only the
 * 1,024-byte literal ceiling, which both data profiles share; each profile's value policy applies when values arrive.
 */
export function admittedServiceTask(effect: Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }>,
  bpmnErrorRoute: unknown, data: ModelData | null): boolean {
  return data === null ? dataFreeServiceTask(effect, bpmnErrorRoute)
    : bpmnErrorRoute === null && serialBusinessEffectAdmitted(effect, data.handlers, scopeDataRules);
}

export function accessOf(effect: Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }>):
  ScopeDataAccess {
  return { reads: enclosingReads(effect.inputMappings), writes: effect.outputMappings.map(({ target }) => target) };
}

/** A mapped Call reads without requiring and definitely writes its outputs (CMCALL-AVAILABLE-01, CMCALL-START-01). */
export function callAccess(data: VariableMappingCallData): ScopeDataAccess {
  const writes = data.outputs.map(({ target }) => target);
  return { reads: [], writes, optional: [...enclosingReads(data.inputs), ...writes] };
}

/** CALLN-ADMIT-01's empty Call anywhere; in a data-bearing model also CVM-ADMIT-01's mappings (CMCALL-ADMIT-01). */
export function callDataAdmitted(callData: CallDataInterface, data: ModelData | null): boolean {
  switch (callData.kind) {
    case CallDataKind.Empty: return true;
    case CallDataKind.VariableMappings: return data !== null && callMappingsAdmitted(callData, data.handlers);
    case CallDataKind.Scalar: return false;
  }
}
