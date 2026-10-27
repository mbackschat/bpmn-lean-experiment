import type { Stimulus } from "./contract.js";
import { nestedScopeControlProgramStartNames } from "./nested-scope-control-admission.js";
import { nestedScopeDataProgram } from "./nested-scope-data.js";
import { nestedScopeProgramStartNames, scopeDataStimulusWithin } from "./nested-scope-data-admission.js";
import type { NestedScopeStartNames } from "./nested-scope-data-admission.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

/**
 * The data rules of every stimulus to a Program whose frames resolve by the occurrence chain: the nested scope-data
 * profile's serial analysis, or the concurrent analysis of a data-bearing embedded completion Program, which admits no
 * Call and so leaves every admitted Start name allowed (CSD-ADMIT-01). Other Programs are unaffected.
 */
export function scopeDataStimulusAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (!nestedScopeDataProgram(program)) return true;
  const names = startNames(program);
  return names !== null && scopeDataStimulusWithin(program, stimulus, names);
}

function startNames(program: SemanticProcessProgram): NestedScopeStartNames | null {
  if (program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData) {
    return nestedScopeProgramStartNames(program);
  }
  const required = nestedScopeControlProgramStartNames(program);
  return required === null ? null : { required, optional: null };
}
