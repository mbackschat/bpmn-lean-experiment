module

public import BpmnSemantics.ConcurrentEmbeddedActivationsFixtures

/-! # Concurrent embedded activations conformance

Finite checked journeys of merge regions under the cumulative embedded completion profile. In the audit,
two parallel reviews merge into one Remediation Sub-Process, so each review starts its own concurrent
Remediation; in the intake, three checks start three concurrent Assess occurrences. Tasks are named by
element and activation. Each journey step is one dispatcher evaluation, and each theorem decides one
observation, so no kernel decision keeps another journey's reduction resident. They do not discharge a
quantified law; the quantified laws live in `ScopeOccurrenceEntry`, `ScopeCompletion` and
`MergeTargetOccurrenceLaws`. See the
[concurrent embedded activations specification](../docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#separating-witnesses).
-/

@[expose] public section

namespace BpmnSemantics.ConcurrentEmbeddedActivationsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- CEA-MERGE-01: the first review passes the merge alone and opens its Remediation beside the other review. -/
def first_review_opens_its_remediation : Bool := decide <| openTasks audit [("RC", 1)] = some [("FF", 1), ("RP", 1)]

/-- CEA-OCCUR-01: the second review opens a second Remediation while the first is live. -/
def second_review_opens_a_second_remediation : Bool := decide <|
    openTasks audit [("RC", 1), ("RP", 1)] = some [("FF", 1), ("FF", 2)]

/-- CEA-ISOLATE-01: progressing the second Remediation leaves the first one's Fix finding open. -/
def second_remediation_progresses_alone : Bool := decide <|
    openTasks audit [("RC", 1), ("RP", 1), ("FF", 2)] = some [("FF", 1), ("VF", 1)]

/-- CEA-QUIESCE-01: completing the second Remediation leaves the first open and the closing task absent. -/
def second_remediation_completes_alone : Bool := decide <|
    openTasks audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1)] = some [("FF", 1), ("RF", 1)]

def audit_closes_after_both_remediations_report : Bool := decide <|
    openTasks audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1), ("RF", 1), ("FF", 1), ("VF", 2), ("RF", 2)] =
      some [("C", 1)]

def audit_completes : Bool := decide <|
    completed audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1), ("RF", 1), ("FF", 1), ("VF", 2), ("RF", 2),
      ("C", 1)] = true

/-- CEA-MERGE-01: reversed arrival and completion orders reach the same final observation. -/
def reversed_audit_reaches_the_same_closing_task : Bool := decide <|
    openTasks audit [("RP", 1), ("RC", 1), ("FF", 1), ("VF", 1), ("RF", 1), ("FF", 2), ("VF", 2), ("RF", 2)] =
      some [("C", 1)]

/-- CEA-REFUSE-01: re-sending the finished Fix finding 2 while Fix finding 1 is open is rejected unchanged;
a resolver matching by element alone would complete Fix finding 1 instead. -/
def stale_fix_finding_is_refused : Bool := decide <|
    refused audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1)] "FF" 2 = true

/-- CEA-OCCUR-01: three Assess occurrences coexist. -/
def three_assessments_coexist : Bool := decide <|
    openTasks intake [("IO", 1), ("I1", 1), ("I2", 1), ("I3", 1)] = some [("XS", 1), ("XS", 2), ("XS", 3)]

/-- CEA-QUIESCE-01: the three Assess occurrences complete in reverse order before Decide opens. -/
def three_assessments_complete_in_reverse_order : Bool := decide <|
    openTasks intake [("IO", 1), ("I1", 1), ("I2", 1), ("I3", 1), ("XS", 3), ("XS", 2), ("XS", 1)] =
      some [("D", 1)]

/-- CEA-OCCUR-01's hypothesis holds on the retained audit state with two live Remediations. -/
def audit_concurrent_state_satisfies_the_scope_bound : Bool := decide <|
    scopeIdentityBound (journey audit [("RC", 1), ("RP", 1), ("FF", 2)]).state = true

/-- CEA-OCCUR-01's hypothesis holds on the retained intake state with three live Assess occurrences. -/
def intake_concurrent_state_satisfies_the_scope_bound : Bool := decide <|
    scopeIdentityBound (journey intake [("IO", 1), ("I1", 1), ("I2", 1), ("I3", 1)]).state = true

/-- Checked non-law: definition-addressed completion is not total on states this profile reaches. With two
live Remediations, one quiescent, `completeScopeState?` refuses the audit's Remediation completion. -/
def definition_addressed_completion_refuses_two_live_remediations : Bool := decide <|
    remediationCompletion.map (fun operation => match operation with
      | .completeScope _ _ scopeId parentOutput => (completeScopeState? twoRemediations scopeId parentOutput).isNone
      | _ => false) = some true

/-- Checked non-law: the definition-addressed completion owner of the flow-node record is undetermined in
the same state. -/
def definition_addressed_completion_owner_is_undetermined : Bool := decide <|
    remediationCompletion.map (fun operation =>
      (flowNodeSelectedOperationOwner? twoRemediations operation).isNone) = some true

/-- The occurrence-addressed variant completes exactly the quiescent Remediation and leaves the other with
its open Fix finding. -/
def occurrence_addressed_completion_selects_the_quiescent_remediation : Bool := decide <|
    (remediationCompletion.bind fun operation =>
      InternalCommutation.applyInternalOperationOccurrence? (lowerCheckedProcess audit) twoRemediations
        ⟨operation.id, remediation 2⟩).map (fun after =>
          (after.scopeOccurrences.map (·.id), after.waits.map fun wait => (wait.task.id.value, wait.activation))) =
      some ([{ processInstanceId := ⟨"I"⟩, definitionScopeId := scope "P", activation := 1 }, remediation 1,
        { processInstanceId := ⟨"I"⟩, definitionScopeId := scope "S", activation := 1 }], [("FF", 1)])

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("first_review_opens_its_remediation", first_review_opens_its_remediation),
  ("second_review_opens_a_second_remediation", second_review_opens_a_second_remediation),
  ("second_remediation_progresses_alone", second_remediation_progresses_alone),
  ("second_remediation_completes_alone", second_remediation_completes_alone),
  ("audit_closes_after_both_remediations_report", audit_closes_after_both_remediations_report),
  ("audit_completes", audit_completes),
  ("reversed_audit_reaches_the_same_closing_task", reversed_audit_reaches_the_same_closing_task),
  ("stale_fix_finding_is_refused", stale_fix_finding_is_refused),
  ("three_assessments_coexist", three_assessments_coexist),
  ("three_assessments_complete_in_reverse_order", three_assessments_complete_in_reverse_order),
  ("audit_concurrent_state_satisfies_the_scope_bound", audit_concurrent_state_satisfies_the_scope_bound),
  ("intake_concurrent_state_satisfies_the_scope_bound", intake_concurrent_state_satisfies_the_scope_bound),
  ("definition_addressed_completion_refuses_two_live_remediations", definition_addressed_completion_refuses_two_live_remediations),
  ("definition_addressed_completion_owner_is_undetermined", definition_addressed_completion_owner_is_undetermined),
  ("occurrence_addressed_completion_selects_the_quiescent_remediation", occurrence_addressed_completion_selects_the_quiescent_remediation)
]

end BpmnSemantics.ConcurrentEmbeddedActivationsConformance
