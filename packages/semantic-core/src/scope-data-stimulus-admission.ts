import type { Stimulus } from "./contract.js";
import { nestedScopeControlProgramStartNameRule } from "./nested-scope-control-admission.js";
import { nestedScopeDataProgram } from "./nested-scope-data.js";
import { scopeDataStimulusWithin } from "./nested-scope-data-admission.js";
import { structuredScopeDataProgramStartNames } from "./structured-scope-data-routing.js";
import type { NestedScopeStartNames } from "./nested-scope-data-admission.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

/**
 * The data rules of every stimulus to a Program whose frames resolve by the occurrence chain: the nested scope-data
 * profile's serial analysis, or the concurrent analysis of a data-bearing embedded completion Program, which restricts
 * Start names only when the Program has a mapped Call (CMCALL-START-01). Other Programs are unaffected.
 */
export function scopeDataStimulusAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (!nestedScopeDataProgram(program)) return true;
  const names = startNames(program);
  return names !== null && scopeDataStimulusWithin(program, stimulus, names);
}

function startNames(program: SemanticProcessProgram): NestedScopeStartNames | null {
  if (program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData) {
    return structuredScopeDataProgramStartNames(program);
  }
  return nestedScopeControlProgramStartNameRule(program);
}
