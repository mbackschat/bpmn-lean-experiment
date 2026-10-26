module

public import BpmnSemantics.SemanticProcess.EffectCompletion
public import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Concurrent scope effect laws

The per-command laws of the concurrent scope Service Task family (CSE-ISOLATE-01, CSE-QUIESCE-01): a
data-free effect completion before internal closure changes exactly the addressed wait, its Activity variable
scope and one token, and a scope occurrence owning an effect wait is never quiescent. The closure-level
isolation claim stays with the per-command sibling check of the preservation gate; see the
[concurrent scope Service Tasks proposal](../../docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#lean-assurance-lane).
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- CSE-ISOLATE-01: completing a data-free effect without an Error route commits only an empty success, and its
successor differs from the predecessor exactly in the erased wait, the removed Activity variable scope and one
token at the wait's output for its owner; every other field, Process variables included, is unchanged. -/
theorem completeEffect_data_free_frame
    {state successor : RuntimeState} {effectId : EffectOccurrenceId} {result : EffectExecutionResult}
    {wait : EffectWait}
    (found : state.effectWaits.find? (effectIdNamesWait effectId) = some wait)
    (dataFree : wait.outputMappings = []) (unrouted : wait.bpmnErrorRoute = none)
    (success : completeEffect state effectId result = some successor) :
    result = .success [] ∧
      successor =
        { state with
          effectWaits := state.effectWaits.erase wait
          variables :=
            { state.variables with
              activities := state.variables.activities.filter fun scope => !activityScopeMatches effectId scope }
          tokens := addToken state.tokens wait.output wait.owner } := by
  unfold completeEffect at success
  rw [found] at success
  simp only at success
  split at success
  · contradiction
  · rename_i variables mapping
    split at success
    · contradiction
    · rename_i output route
      cases success
      unfold completeActivityVariableScope at mapping
      split at mapping
      · cases result with
        | success patch =>
            cases patch with
            | nil =>
                simp [applyEffectResult, applyEffectPatch, dataFree] at mapping
                simp [effectResultOutput] at route
                subst mapping route
                exact ⟨rfl, rfl⟩
            | cons head tail => simp [applyEffectResult, applyEffectPatch, dataFree] at mapping
        | bpmnError code message patch => simp [effectResultOutput, unrouted] at route
      · contradiction

/-- CSE-QUIESCE-01: a scope occurrence that owns an effect wait is not quiescent, whatever its User Tasks. -/
theorem scopeQuiescent_false_of_owned_effect
    {state : RuntimeState} {owner : ScopeOccurrenceId} {wait : EffectWait}
    (member : wait ∈ state.effectWaits) (owned : wait.owner = owner) :
    scopeQuiescent state owner = false := by
  have present : (state.effectWaits.any fun candidate => candidate.owner == owner) = true :=
    List.any_eq_true.mpr ⟨wait, member, by simp [owned]⟩
  simp [scopeQuiescent, present]

end BpmnSemantics.SemanticProcess
