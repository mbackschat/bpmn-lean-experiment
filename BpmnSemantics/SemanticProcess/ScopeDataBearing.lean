module

public import BpmnSemantics.SemanticProcessContract
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Data-bearing embedded completion Programs

Whether an embedded completion Program carries data: a scope declaration, a mapped Service Task or a mapped
Call, per the
[concurrent scope data specification](../../docs/capsules/CONCURRENT-SCOPE-DATA-SPEC.md#profile-and-public-contract)
and the [concurrent mapped Calls proposal](../../docs/capsules/CONCURRENT-MAPPED-CALLS-PROPOSAL.md#required-optional-and-excluded-scope).
Only such a Program resolves frames by the occurrence chain and takes the bounded String domain; a
data-free Program of that profile keeps its empty value domains and the scalar effect policy, so every
earlier admission of the profile is unchanged.
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

abbrev embeddedCompletionProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-embedded-subprocess-completion-draft"⟩

private def mapsEffectData : SemanticOperation → Bool
  | .awaitEffect _ _ _ _ effect _ => !effect.inputMappings.isEmpty || !effect.outputMappings.isEmpty
  | .invokeProcess _ _ _ _ _ _ _ (.variableMappings _ _) => true
  | _ => false

def embeddedScopeDataBearing (program : Program) : Bool :=
  program.identity.semanticProfile == embeddedCompletionProfileId &&
    (!program.scopeLocalData.isEmpty || program.operations.any mapsEffectData)

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`embeddedScopeDataBearing]

/-- Every other profile is data-free under this predicate, which profile-specific proofs consume by value. -/
theorem embeddedScopeDataBearing_of_profile_value {program : Program} {value : String}
    (selected : program.identity.semanticProfile.value = value)
    (distinct : value ≠ embeddedCompletionProfileId.value := by decide +kernel) :
    embeddedScopeDataBearing program = false := by
  simp only [embeddedScopeDataBearing, Bool.and_eq_false_iff, beq_eq_false_iff_ne]
  left
  intro same
  exact distinct (selected ▸ congrArg ProfileId.value same)

end BpmnSemantics.SemanticProcess
