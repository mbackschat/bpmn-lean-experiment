module

public import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
public import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.TransactionSourceAdmission
public import BpmnSemantics.SemanticProcess.RepeatableSubscriptionAdmission

/-! Existing profile capability counts discharge the root-only Compensation proof domain
without adding a premise to their public preservation guarantees. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def isCompensationOperation : SemanticOperation → Bool
  | .triggerCompensation .. | .cancelTransaction .. => true
  | _ => false

private theorem compensationCardinality (operations : List SemanticOperation) :
    (operationCardinalities operations).compensationTriggers =
      (operations.filter isCompensationOperation).length := by
  unfold operationCardinalities
  have count : ∀ counts : ShapeCardinalities,
      (operations.foldl addOperationCardinality counts).compensationTriggers =
        counts.compensationTriggers + (operations.filter isCompensationOperation).length := by
    intro counts
    induction operations generalizing counts with
    | nil => simp
    | cons operation rest ih =>
        rw [List.foldl_cons, ih]
        cases operation <;> simp [List.filter, addOperationCardinality, isCompensationOperation] <;> omega
  simpa using count {}

/-- Exact profile counts exclude an absent operation family without adding successor-state assumptions. The embedded
completion profile is excluded: it also admits nested structural trees, with joins, that its exact shape does not count. -/
theorem profile_operationCardinality_zero (program : Program) (field : ShapeCardinalities → Nat)
    (legacy : program.identity.semanticProfile ≠ repeatableSubscriptionCheckpointProfileId)
    (notEmbedded : program.identity.semanticProfile.value ≠ embeddedCompletionProfile)
    (zero : (programShape? program.identity.semanticProfile.value).map
      (fun entry => field entry.2) = some 0)
    (capabilities : programProfileCapabilitiesValid program = true) :
    field (operationCardinalities program.operations) = 0 := by
  have transaction : (program.identity.semanticProfile == transactionCancellationCheckpointProfileId) = false := by
    apply Bool.eq_false_iff.mpr
    intro selected
    have same : program.identity.semanticProfile = transactionCancellationCheckpointProfileId := by
      simpa only [beq_iff_eq] using selected
    rw [same] at zero
    change (none : Option Nat) = some 0 at zero
    contradiction
  have callData : (program.identity.semanticProfile == callDataCheckpointProfileId) = false := by
    apply Bool.eq_false_iff.mpr
    intro selected
    have same : program.identity.semanticProfile = callDataCheckpointProfileId := by
      simpa only [beq_iff_eq] using selected
    rw [same] at zero
    change (none : Option Nat) = some 0 at zero
    contradiction
  have messageHandler :
      (program.identity.semanticProfile == interruptingMessageEventSubProcessProfileId) = false := by
    apply Bool.eq_false_iff.mpr
    intro selected
    have same : program.identity.semanticProfile = interruptingMessageEventSubProcessProfileId := by
      simpa only [beq_iff_eq] using selected
    rw [same] at zero
    change (none : Option Nat) = some 0 at zero
    contradiction
  have repeatedScope : (program.identity.semanticProfile.value ==
      "cibseven-2.2.0-sequential-multi-instance-subprocess-draft") = false := by
    apply Bool.eq_false_iff.mpr
    intro selected
    have same : program.identity.semanticProfile.value =
        "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" := by simpa using selected
    rw [same] at zero
    change (none : Option Nat) = some 0 at zero
    contradiction
  have undispatched : programCapabilityDispatched program.identity.semanticProfile = false := by
    simp only [programCapabilityDispatched, Bool.or_eq_false_iff, decide_eq_false_iff_not]
    exact ⟨⟨⟨⟨⟨repeatedScope, messageHandler⟩, callData⟩, transaction⟩, legacy⟩, beq_eq_false_iff_ne.mpr notEmbedded⟩
  rw [programProfileCapabilitiesValid_of_undispatched program undispatched] at capabilities
  simp only [programUndispatchedCapabilities, Bool.and_eq_true] at capabilities
  cases shape : programShape? program.identity.semanticProfile.value with
  | none => simp [shape] at zero
  | some entry =>
      obtain ⟨scopes, expected⟩ := entry
      simp only [shape, Option.map_some, Option.some.injEq] at zero
      simp only [shape, programExactShape, Bool.and_eq_true, decide_eq_true_eq] at capabilities
      have same : operationCardinalities program.operations = expected := by grind
      rw [same, zero]

/-- The existing exact profile census excludes Cancel operations when it admits no compensation trigger. -/
theorem RootCompensationExecutionDomain.of_zero_profile (program : Program)
    (legacy : program.identity.semanticProfile ≠ repeatableSubscriptionCheckpointProfileId)
    (notEmbedded : program.identity.semanticProfile.value ≠ embeddedCompletionProfile)
    (zero : (programShape? program.identity.semanticProfile.value).map
      (fun entry => entry.2.compensationTriggers) = some 0)
    (capabilities : programProfileCapabilitiesValid program = true) :
    RootCompensationExecutionDomain program := by
  have count := profile_operationCardinality_zero program (·.compensationTriggers) legacy notEmbedded zero capabilities
  have empty : program.operations.filter isCompensationOperation = [] := by
    apply List.length_eq_zero_iff.mp
    rw [← compensationCardinality, count]
  intro operation member
  cases operation <;> try trivial
  rename_i id origin scope input output boundary
  have present : .cancelTransaction id origin scope input output boundary ∈
      program.operations.filter isCompensationOperation := List.mem_filter.mpr ⟨member, rfl⟩
  simp [empty] at present

/-- A profile with no repeated-scope entries preserves that invariant whenever controller storage is unchanged. -/
theorem sequentialScopeStateValid_zero_profile_frame (program : Program) (before after : RuntimeState)
    (legacy : program.identity.semanticProfile ≠ repeatableSubscriptionCheckpointProfileId)
    (notEmbedded : program.identity.semanticProfile.value ≠ embeddedCompletionProfile)
    (zero : (programShape? program.identity.semanticProfile.value).map
      (fun entry => entry.2.sequentialScopeEntries) = some 0)
    (capabilities : programProfileCapabilitiesValid program = true)
    (controllers : after.sequentialScopeControllers = before.sequentialScopeControllers)
    (valid : sequentialScopeStateValid program before = true) :
    sequentialScopeStateValid program after = true := by
  have count := profile_operationCardinality_zero program (·.sequentialScopeEntries) legacy notEmbedded zero capabilities
  have empty : program.operations.filterMap sequentialScopeEntry? = [] := by
    apply List.length_eq_zero_iff.mp
    rw [← repeatedScopeEntryCardinality, count]
  simpa only [sequentialScopeStateValid, empty, controllers, List.filter_nil, List.all_nil, Bool.and_true] using valid

theorem SharedParallelProgramAccount.rootCompensationDomain (program : Program)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope) :
    RootCompensationExecutionDomain program :=
  RootCompensationExecutionDomain.of_zero_profile program
    (by rw [account.profile]; decide +kernel) (by rw [account.profile]; decide +kernel) (by rw [account.profile]; rfl)
    account.capabilities

end BpmnSemantics.SemanticProcess
