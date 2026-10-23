import BpmnSemantics.RepeatedNestedConcurrentCallsFixtures

/-! # Repeated, nested and concurrent Calls conformance

Finite checked journeys of the supplier onboarding forest under the cumulative embedded completion profile:
the tax and bank approvals run two concurrent instances of one called definition, risk review calls the
compliance check from its own called root, and final approval invokes the approval definition a third time.
Tasks are named by element and activation. Each journey step is one dispatcher evaluation, and each theorem
decides one observation, so no kernel decision keeps another journey's reduction resident. They do not
discharge a quantified law; the invocation, return and association laws live in `CallActivity`,
`ScopeCreationCallAssociations` and `ScopeCompletion`. See the
[repeated, nested and concurrent Calls proposal](../docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-PROPOSAL.md#separating-witnesses).
-/

namespace BpmnSemantics.RepeatedNestedConcurrentCallsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance (scope)

/-- CALLN-IDENTITY-01: the two approval instances open their first tasks at activations 1 and 2. -/
theorem tax_and_bank_approvals_open_two_instances :
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1)] = some [("FP", 1), ("FP", 2)] := by
  decide +kernel

theorem bank_approval_progresses_beside_the_tax_approval :
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2)] = some [("FP", 1), ("FV", 1)] := by
  decide +kernel

/-- CALLN-OUTSIDE-01: progressing the bank instance leaves the tax instance's record, root, wait and tokens
identical. -/
theorem bank_progress_leaves_the_tax_instance_identical :
    instanceSlice (journey supplier [("PR", 1), ("PT", 1), ("PB", 1)]).state (calledInstance "PX" 1) =
      instanceSlice (journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2)]).state
        (calledInstance "PX" 1) := by
  decide +kernel

/-- CALLN-RETURN-01: the bank instance returns first, into the bank branch only; the tax record stays live
and the join still waits. -/
theorem bank_returns_into_its_branch_alone :
    let result := journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1)]
    (result.outcome, result.state.calledProcessOccurrences.map (·.id.elementId.value),
        result.state.tokens.map fun token => (token.placeId, token.owner.definitionScopeId)) =
      (.committed, ["PX"], [(⟨"place:PY>PJ"⟩, scope "P")]) := by
  decide +kernel

theorem tax_return_fires_the_join :
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1), ("FV", 2)] =
      some [("RS", 1)] := by
  decide +kernel

/-- CALLN-INVOKE-01 and CALLN-NEST-01: risk review invokes the compliance check from its own called root and
then holds no task, yet stays live. -/
theorem risk_review_waits_on_its_nested_call :
    let state := (journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1),
      ("FV", 2), ("RS", 1)]).state
    (state.calledProcessOccurrences.map fun record => (record.id.elementId.value, record.caller.definitionScopeId),
        state.waits.map fun wait => (wait.task.id.value, wait.owner.definitionScopeId),
        state.scopeOccurrences.map (·.id.definitionScopeId)) =
      ([("PK", scope "P"), ("RC", scope "R")], [("CS", scope "C")], [scope "P", scope "C", scope "R"]) := by
  decide +kernel

/-- CALLN-NEST-01: screening sanctions returns twice in one closure, and final approval invokes the approval
definition a third time. -/
theorem nested_returns_reach_final_approval :
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1), ("FV", 2),
      ("RS", 1), ("CS", 1)] = some [("FP", 3)] := by
  decide +kernel

theorem bank_first_onboarding_completes :
    completed supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1), ("FV", 2),
      ("RS", 1), ("CS", 1), ("FP", 3), ("FV", 3)] = true := by
  decide +kernel

theorem natural_order_onboarding_completes :
    completed supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 1), ("FV", 1), ("FP", 2), ("FV", 2),
      ("RS", 1), ("CS", 1), ("FP", 3), ("FV", 3)] = true := by
  decide +kernel

/-- CALLN-REFUSE-01: after the tax instance returns, completing its approval again is rejected unchanged. -/
theorem returned_instance_task_is_refused :
    let before := journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 1), ("FV", 1)]
    let after := applyStimulus scenarioClosureLimit (lowerCheckedProcess supplier) before.state
      (.completeUserTaskInstance ⟨"stale"⟩
        { processInstanceId := calledInstance "PX" 1, elementId := ⟨"FV"⟩, activation := 1 } [])
    (before.outcome == .committed && after.outcome == .rejected && after.state == before.state) = true := by
  decide +kernel

/-- CALLN-INVOKE-01: the entry closure batches two nested invocations from two different called roots. -/
theorem fork_batches_nested_invocations_from_two_called_roots :
    (journey forkIntoLeadingCalls []).state.calledProcessOccurrences.map
        (fun record => (record.id.elementId.value, record.caller.definitionScopeId)) =
      [("PB0V0", scope "P"), ("PB1V0", scope "P"), ("AV0", scope "A"), ("BV0", scope "B")] := by
  decide +kernel

theorem fork_into_leading_calls_opens_both_nested_tasks :
    openTasks forkIntoLeadingCalls [] = some [("DV0", 1), ("GV0", 1)] := by
  decide +kernel

/-- Checked non-law: a return selected by called definition is not the return CALLN-RETURN-01 selects. With
two live `A` instances, the first record calling `A` belongs to the entry root and its instance still
waits, while the quiescent instance is the one `B` calls. -/
theorem definition_addressed_return_selects_the_waiting_instance :
    (twoLiveInstances.calledProcessOccurrences.find? (·.calledRoot.definitionScopeId == scope "A")).map
        (fun record => (record.id.elementId.value, record.caller.definitionScopeId,
          scopeQuiescent twoLiveInstances record.calledRoot)) =
      some ("PB0V1", scope "P", false) := by
  decide +kernel

/-- The element-addressed return continues `B`'s root and leaves the entry root's `A` record live. -/
theorem element_addressed_return_continues_the_calling_root :
    (returnOf "BV1").bind (fun operation =>
        (fire? (lowerCheckedProcess twoCallers) operation twoLiveInstances).map fun after =>
          (after.tokens.map fun token => (token.placeId, token.owner.definitionScopeId),
            after.calledProcessOccurrences.map (·.id.elementId.value))) =
      some ([(⟨"place:BV1>BE"⟩, scope "B")], ["PB0V1", "PB1V1"]) := by
  decide +kernel

theorem entry_root_return_is_refused_while_its_instance_waits :
    ((returnOf "PB0V1").bind fun operation =>
      fire? (lowerCheckedProcess twoCallers) operation twoLiveInstances).isNone = true := by
  decide +kernel

end BpmnSemantics.RepeatedNestedConcurrentCallsConformance
