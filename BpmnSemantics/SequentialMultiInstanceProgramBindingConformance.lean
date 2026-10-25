module

public import BpmnSemantics.SequentialMultiInstanceProgramBindingConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.ProfileAdmission
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
public import BpmnSemantics.SequentialMultiInstanceDataFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream
/-! # Sequential Multi-Instance program binding conformance

The checked fixture preserves the complete reviewed data-role graph and lowers it to the distinct
`awaitSequentialMultiInstanceUserTask` operation. These facts bind exact profile admission, canonical
lowering, public command dispatch, strict trace replay, and the reference identities used at runtime.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

set_option synthInstance.maxSize 2000
theorem checked_process_is_well_formed : checkedWellFormed checkedProcess = true := by
  decide +kernel

theorem lowered_program_is_well_formed : programWellFormed program = true := by
  decide +kernel

theorem every_other_profile_refuses_the_distinct_sequential_multi_instance_operation
    (profile : ProfileId) (different : profile ≠ sequentialMultiInstanceUserTaskProfileId) :
    programProfileCapabilitiesValid (programForProfile profile) = false := by
  by_cases messageHandler : profile = interruptingMessageEventSubProcessProfileId
  · subst profile
    decide +kernel
  by_cases callData : profile = callDataCheckpointProfileId
  · subst profile
    decide +kernel
  by_cases subscription : profile = repeatableSubscriptionCheckpointProfileId
  · subst profile
    decide +kernel
  by_cases transaction : profile = transactionCancellationCheckpointProfileId
  · subst profile
    decide +kernel
  by_cases embedded : profile = ⟨embeddedCompletionProfile⟩
  · subst profile
    decide +kernel
  by_cases repeatedScope : profile.value = "cibseven-2.2.0-sequential-multi-instance-subprocess-draft"
  · obtain ⟨value⟩ := profile
    simp only at repeatedScope
    subst value
    decide +kernel
  have operationPresent : program.operations.any (fun
      | .awaitSequentialMultiInstanceUserTask .. => true
      | _ => false) = true := by
    decide +kernel
  have mismatched :
      programSequentialMultiInstanceProfileMatches (programForProfile profile) = false := by
    unfold programSequentialMultiInstanceProfileMatches programForProfile
    change ((program.operations.any (fun
      | .awaitSequentialMultiInstanceUserTask .. => true
      | _ => false)) == decide (profile = sequentialMultiInstanceUserTaskProfileId)) = false
    rw [operationPresent]
    simp only [different, decide_false, Bool.true_beq]
  have undispatched : programCapabilityDispatched (programForProfile profile).identity.semanticProfile = false := by
    simp only [programForProfile, programCapabilityDispatched, Bool.or_eq_false_iff, beq_eq_false_iff_ne, ne_eq]
    exact ⟨⟨⟨⟨⟨repeatedScope, messageHandler⟩, callData⟩, transaction⟩, decide_eq_false subscription⟩,
      fun same => embedded (by cases profile; simp_all)⟩
  rw [programProfileCapabilitiesValid_of_undispatched _ undispatched, programUndispatchedCapabilities, mismatched]
  simp only [Bool.false_and, Bool.and_false]

end BpmnSemantics.SequentialMultiInstanceProgramBindingConformance
