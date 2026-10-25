module

public import BpmnSemantics.RepeatedNestedConcurrentCallsFixtures

/-! # Repeated, nested and concurrent Calls conformance

Finite checked journeys of the supplier onboarding forest under the cumulative embedded completion profile:
the tax and bank approvals run two concurrent instances of one called definition, risk review calls the
compliance check from its own called root, and final approval invokes the approval definition a third time.
Tasks are named by element and activation. Each journey step is one dispatcher evaluation, and each check
decides one observation. They do not discharge a quantified law; the invocation, return and association laws live in `CallActivity`,
`ScopeCreationCallAssociations` and `ScopeCompletion`. See the
[repeated, nested and concurrent Calls specification](../docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#separating-witnesses).
-/

@[expose] public section

namespace BpmnSemantics.RepeatedNestedConcurrentCallsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance (scope)

/-- CALLN-IDENTITY-01: the two approval instances open their first tasks at activations 1 and 2. -/
def tax_and_bank_approvals_open_two_instances : Bool := decide <|
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1)] = some [("FP", 1), ("FP", 2)]

def bank_approval_progresses_beside_the_tax_approval : Bool := decide <|
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2)] = some [("FP", 1), ("FV", 1)]

/-- CALLN-OUTSIDE-01: progressing the bank instance leaves the tax instance's record, root, wait and tokens
identical. -/
def bank_progress_leaves_the_tax_instance_identical : Bool := decide <|
    instanceSlice (journey supplier [("PR", 1), ("PT", 1), ("PB", 1)]).state (calledInstance "PX" 1) =
      instanceSlice (journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2)]).state
        (calledInstance "PX" 1)

/-- CALLN-RETURN-01: the bank instance returns first, into the bank branch only; the tax record stays live
and the join still waits. -/
def bank_returns_into_its_branch_alone : Bool := decide <|
    let result := journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1)]
    (result.outcome, result.state.calledProcessOccurrences.map (·.id.elementId.value),
        result.state.tokens.map fun token => (token.placeId, token.owner.definitionScopeId)) =
      (.committed, ["PX"], [(⟨"place:PY>PJ"⟩, scope "P")])

def tax_return_fires_the_join : Bool := decide <|
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1), ("FV", 2)] =
      some [("RS", 1)]

/-- CALLN-INVOKE-01 and CALLN-NEST-01: risk review invokes the compliance check from its own called root and
then holds no task, yet stays live. -/
def risk_review_waits_on_its_nested_call : Bool := decide <|
    let state := (journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1),
      ("FV", 2), ("RS", 1)]).state
    (state.calledProcessOccurrences.map fun record => (record.id.elementId.value, record.caller.definitionScopeId),
        state.waits.map fun wait => (wait.task.id.value, wait.owner.definitionScopeId),
        state.scopeOccurrences.map (·.id.definitionScopeId)) =
      ([("PK", scope "P"), ("RC", scope "R")], [("CS", scope "C")], [scope "P", scope "C", scope "R"])

/-- CALLN-NEST-01: screening sanctions returns twice in one closure, and final approval invokes the approval
definition a third time. -/
def nested_returns_reach_final_approval : Bool := decide <|
    openTasks supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1), ("FV", 2),
      ("RS", 1), ("CS", 1)] = some [("FP", 3)]

def bank_first_onboarding_completes : Bool := decide <|
    completed supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 2), ("FV", 1), ("FP", 1), ("FV", 2),
      ("RS", 1), ("CS", 1), ("FP", 3), ("FV", 3)] = true

def natural_order_onboarding_completes : Bool := decide <|
    completed supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 1), ("FV", 1), ("FP", 2), ("FV", 2),
      ("RS", 1), ("CS", 1), ("FP", 3), ("FV", 3)] = true

/-- CALLN-REFUSE-01: after the tax instance returns, completing its approval again is rejected unchanged. -/
def returned_instance_task_is_refused : Bool := decide <|
    let before := journey supplier [("PR", 1), ("PT", 1), ("PB", 1), ("FP", 1), ("FV", 1)]
    let after := applyStimulus scenarioClosureLimit (lowerCheckedProcess supplier) before.state
      (.completeUserTaskInstance ⟨"stale"⟩
        { processInstanceId := calledInstance "PX" 1, elementId := ⟨"FV"⟩, activation := 1 } [])
    (before.outcome == .committed && after.outcome == .rejected && after.state == before.state) = true

/-- CALLN-INVOKE-01: the entry closure batches two nested invocations from two different called roots. -/
def fork_batches_nested_invocations_from_two_called_roots : Bool := decide <|
    (journey forkIntoLeadingCalls []).state.calledProcessOccurrences.map
        (fun record => (record.id.elementId.value, record.caller.definitionScopeId)) =
      [("PB0V0", scope "P"), ("PB1V0", scope "P"), ("AV0", scope "A"), ("BV0", scope "B")]

def fork_into_leading_calls_opens_both_nested_tasks : Bool := decide <|
    openTasks forkIntoLeadingCalls [] = some [("DV0", 1), ("GV0", 1)]

/-- Checked non-law: a return selected by called definition is not the return CALLN-RETURN-01 selects. With
two live `A` instances, the first record calling `A` belongs to the entry root and its instance still
waits, while the quiescent instance is the one `B` calls. -/
def definition_addressed_return_selects_the_waiting_instance : Bool := decide <|
    (twoLiveInstances.calledProcessOccurrences.find? (·.calledRoot.definitionScopeId == scope "A")).map
        (fun record => (record.id.elementId.value, record.caller.definitionScopeId,
          scopeQuiescent twoLiveInstances record.calledRoot)) =
      some ("PB0V1", scope "P", false)

/-- The element-addressed return continues `B`'s root and leaves the entry root's `A` record live. -/
def element_addressed_return_continues_the_calling_root : Bool := decide <|
    (returnOf "BV1").bind (fun operation =>
        (fire? (lowerCheckedProcess twoCallers) operation twoLiveInstances).map fun after =>
          (after.tokens.map fun token => (token.placeId, token.owner.definitionScopeId),
            after.calledProcessOccurrences.map (·.id.elementId.value))) =
      some ([(⟨"place:BV1>BE"⟩, scope "B")], ["PB0V1", "PB1V1"])

def entry_root_return_is_refused_while_its_instance_waits : Bool := decide <|
    ((returnOf "PB0V1").bind fun operation =>
      fire? (lowerCheckedProcess twoCallers) operation twoLiveInstances).isNone = true

/-- Every check of this module, named for the executable driver's failure report. -/
def checks : List (String × Bool) := [
  ("tax_and_bank_approvals_open_two_instances", tax_and_bank_approvals_open_two_instances),
  ("bank_approval_progresses_beside_the_tax_approval", bank_approval_progresses_beside_the_tax_approval),
  ("bank_progress_leaves_the_tax_instance_identical", bank_progress_leaves_the_tax_instance_identical),
  ("bank_returns_into_its_branch_alone", bank_returns_into_its_branch_alone),
  ("tax_return_fires_the_join", tax_return_fires_the_join),
  ("risk_review_waits_on_its_nested_call", risk_review_waits_on_its_nested_call),
  ("nested_returns_reach_final_approval", nested_returns_reach_final_approval),
  ("bank_first_onboarding_completes", bank_first_onboarding_completes),
  ("natural_order_onboarding_completes", natural_order_onboarding_completes),
  ("returned_instance_task_is_refused", returned_instance_task_is_refused),
  ("fork_batches_nested_invocations_from_two_called_roots", fork_batches_nested_invocations_from_two_called_roots),
  ("fork_into_leading_calls_opens_both_nested_tasks", fork_into_leading_calls_opens_both_nested_tasks),
  ("definition_addressed_return_selects_the_waiting_instance", definition_addressed_return_selects_the_waiting_instance),
  ("element_addressed_return_continues_the_calling_root", element_addressed_return_continues_the_calling_root),
  ("entry_root_return_is_refused_while_its_instance_waits", entry_root_return_is_refused_while_its_instance_waits)
]

end BpmnSemantics.RepeatedNestedConcurrentCallsConformance
