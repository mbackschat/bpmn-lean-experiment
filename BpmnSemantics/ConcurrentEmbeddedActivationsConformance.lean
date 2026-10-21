import BpmnSemantics.ConcurrentEmbeddedActivationsFixtures

/-! # Concurrent embedded activations conformance

Finite checked journeys of merge regions under the cumulative embedded completion profile. In the audit,
two parallel reviews merge into one Remediation Sub-Process, so each review starts its own concurrent
Remediation; in the intake, three checks start three concurrent Assess occurrences. Tasks are named by
element and activation. Each journey step is one dispatcher evaluation, and each theorem decides one
observation, so no kernel decision keeps another journey's reduction resident. They do not discharge a
quantified law; the quantified laws live in `ScopeOccurrenceEntry`, `ScopeCompletion` and
`MergeTargetOccurrenceLaws`. See the
[concurrent embedded activations proposal](../docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-PROPOSAL.md#separating-witnesses).
-/

namespace BpmnSemantics.ConcurrentEmbeddedActivationsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- CEA-MERGE-01: the first review passes the merge alone and opens its Remediation beside the other review. -/
theorem first_review_opens_its_remediation : openTasks audit [("RC", 1)] = some [("FF", 1), ("RP", 1)] := by
  decide +kernel

/-- CEA-OCCUR-01: the second review opens a second Remediation while the first is live. -/
theorem second_review_opens_a_second_remediation :
    openTasks audit [("RC", 1), ("RP", 1)] = some [("FF", 1), ("FF", 2)] := by
  decide +kernel

/-- CEA-ISOLATE-01: progressing the second Remediation leaves the first one's Fix finding open. -/
theorem second_remediation_progresses_alone :
    openTasks audit [("RC", 1), ("RP", 1), ("FF", 2)] = some [("FF", 1), ("VF", 1)] := by
  decide +kernel

/-- CEA-QUIESCE-01: completing the second Remediation leaves the first open and the closing task absent. -/
theorem second_remediation_completes_alone :
    openTasks audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1)] = some [("FF", 1), ("RF", 1)] := by
  decide +kernel

theorem audit_closes_after_both_remediations_report :
    openTasks audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1), ("RF", 1), ("FF", 1), ("VF", 2), ("RF", 2)] =
      some [("C", 1)] := by
  decide +kernel

theorem audit_completes :
    completed audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1), ("RF", 1), ("FF", 1), ("VF", 2), ("RF", 2),
      ("C", 1)] = true := by
  decide +kernel

/-- CEA-MERGE-01: reversed arrival and completion orders reach the same final observation. -/
theorem reversed_audit_reaches_the_same_closing_task :
    openTasks audit [("RP", 1), ("RC", 1), ("FF", 1), ("VF", 1), ("RF", 1), ("FF", 2), ("VF", 2), ("RF", 2)] =
      some [("C", 1)] := by
  decide +kernel

/-- CEA-REFUSE-01: re-sending the finished Fix finding 2 while Fix finding 1 is open is rejected unchanged;
a resolver matching by element alone would complete Fix finding 1 instead. -/
theorem stale_fix_finding_is_refused :
    refused audit [("RC", 1), ("RP", 1), ("FF", 2), ("VF", 1)] "FF" 2 = true := by
  decide +kernel

/-- CEA-OCCUR-01: three Assess occurrences coexist. -/
theorem three_assessments_coexist :
    openTasks intake [("IO", 1), ("I1", 1), ("I2", 1), ("I3", 1)] = some [("XS", 1), ("XS", 2), ("XS", 3)] := by
  decide +kernel

/-- CEA-QUIESCE-01: the three Assess occurrences complete in reverse order before Decide opens. -/
theorem three_assessments_complete_in_reverse_order :
    openTasks intake [("IO", 1), ("I1", 1), ("I2", 1), ("I3", 1), ("XS", 3), ("XS", 2), ("XS", 1)] =
      some [("D", 1)] := by
  decide +kernel

/-- CEA-OCCUR-01's hypothesis holds on the retained audit state with two live Remediations. -/
theorem audit_concurrent_state_satisfies_the_scope_bound :
    scopeIdentityBound (journey audit [("RC", 1), ("RP", 1), ("FF", 2)]).state = true := by
  decide +kernel

/-- CEA-OCCUR-01's hypothesis holds on the retained intake state with three live Assess occurrences. -/
theorem intake_concurrent_state_satisfies_the_scope_bound :
    scopeIdentityBound (journey intake [("IO", 1), ("I1", 1), ("I2", 1), ("I3", 1)]).state = true := by
  decide +kernel

/-- Checked non-law: definition-addressed completion is not total on states this profile reaches. With two
live Remediations, one quiescent, `completeScopeState?` refuses the audit's Remediation completion. -/
theorem definition_addressed_completion_refuses_two_live_remediations :
    remediationCompletion.map (fun operation => match operation with
      | .completeScope _ _ scopeId parentOutput => (completeScopeState? twoRemediations scopeId parentOutput).isNone
      | _ => false) = some true := by
  decide +kernel

/-- Checked non-law: the definition-addressed completion owner of the flow-node record is undetermined in
the same state. -/
theorem definition_addressed_completion_owner_is_undetermined :
    remediationCompletion.map (fun operation =>
      (flowNodeSelectedOperationOwner? twoRemediations operation).isNone) = some true := by
  decide +kernel

/-- The occurrence-addressed variant completes exactly the quiescent Remediation and leaves the other with
its open Fix finding. -/
theorem occurrence_addressed_completion_selects_the_quiescent_remediation :
    (remediationCompletion.bind fun operation =>
      InternalCommutation.applyInternalOperationOccurrence? (lowerCheckedProcess audit) twoRemediations
        ⟨operation.id, remediation 2⟩).map (fun after =>
          (after.scopeOccurrences.map (·.id), after.waits.map fun wait => (wait.task.id.value, wait.activation))) =
      some ([{ processInstanceId := ⟨"I"⟩, definitionScopeId := scope "P", activation := 1 }, remediation 1,
        { processInstanceId := ⟨"I"⟩, definitionScopeId := scope "S", activation := 1 }], [("FF", 1)]) := by
  decide +kernel

end BpmnSemantics.ConcurrentEmbeddedActivationsConformance
