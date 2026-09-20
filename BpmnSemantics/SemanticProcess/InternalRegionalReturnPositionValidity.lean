import BpmnSemantics.SemanticProcess.InternalRegionalCallPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity

/-! # Return continuation position

Normal Return requires a quiescent called root. Together with the actual Call association
validator, that excludes outgoing Calls from its entire Process instance and protects the caller
from cleanup. The continuation still needs its declared static place binding: the raw evaluator
receives an output identifier rather than a Program.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Parentless Call endpoints and the unique Process-root census lift exact-root quiescence to
the complete Process instance, including callers whose identity was not supplied by selection. -/
theorem quiescent_root_excludes_call_caller (state : RuntimeState) (instanceId : SemanticId)
    (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (quiescent : scopeQuiescent state root.id = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) :
    record.caller.processInstanceId ≠ root.id.processInstanceId := by
  intro same
  obtain ⟨⟨caller, callerMember, callerId, callerParent⟩, _⟩ :=
    calledProcessAssociationsValid_parentless_endpoints state valid record member
  have equal := calledProcessAssociationsValid_parentless_root_unique state instanceId running valid
    caller root callerMember rootMember callerParent parentless (by rw [callerId, same])
  have callerRoot : record.caller = root.id := callerId.symm.trans equal
  have present : (state.calledProcessOccurrences.any fun candidate => candidate.caller == root.id) = true := by
    exact List.any_eq_true.mpr ⟨record, member, by simp [callerRoot]⟩
  simp [scopeQuiescent, present] at quiescent

/-- A quiescent Process root has no outgoing Call edge, so actual cleanup traversal contains
only its seed at every fuel bound; normal Return cannot silently include its caller. -/
theorem quiescent_root_call_closure_membership (state : RuntimeState) (instanceId : SemanticId)
    (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (quiescent : scopeQuiescent state root.id = true)
    (fuel : Nat) (process : SemanticId) :
    process ∈ processInstanceClosureWithin state.calledProcessOccurrences [root.id.processInstanceId] fuel ↔
      process = root.id.processInstanceId := by
  constructor
  · apply processInstanceClosureWithin_least _ _ _ (fun candidate => candidate = root.id.processInstanceId)
    · intro candidate member; exact List.mem_singleton.mp member
    · intro record member same
      exact False.elim (quiescent_root_excludes_call_caller state instanceId running valid
        root rootMember parentless quiescent record member same)
  · intro same
    exact processInstanceClosureWithin_seed_subset _ _ _ (by simp [same])

/-- Actual Return preserves complete position when its output is uniquely declared and bound
to the selected caller's scope. These are predecessor Program facts, not successor-validity premises. -/
theorem returnProcessState_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (id : OperationId) (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (placeDeclared : ∃ declared, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = callerOutput)) = [declared])
    (continuationBinding : ∀ record ∈ before.calledProcessOccurrences,
      record.returnOperationId = id → record.id.elementId.value = origin.elementId.value →
      program.controlPlaceScopes.filter (fun ownership =>
        decide (ownership.controlPlaceId = callerOutput)) =
          [{ controlPlaceId := callerOutput, scopeId := record.caller.definitionScopeId }])
    (result : returnProcessState? before id origin calledProcessId calledRootScopeId callerOutput = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  have step := returnProcessState_sound before after id origin calledProcessId calledRootScopeId callerOutput result
  cases step with
  | permitted record root associations uniqueReturn processMatches scopeMatches uniqueRoot
      parentless uniqueCaller uniqueProcessRoot quiescent =>
      have recordIn : record ∈ before.calledProcessOccurrences.filter (fun candidate =>
          decide (candidate.returnOperationId = id &&
            candidate.id.elementId.value = origin.elementId.value)) := by rw [uniqueReturn]; simp
      obtain ⟨recordMember, selected⟩ := List.mem_filter.mp recordIn
      simp only [decide_eq_true_eq, Bool.and_eq_true] at selected
      have rootIn : root ∈ before.scopeOccurrences.filter (fun occurrence =>
          decide (occurrence.id = record.calledRoot)) := by rw [uniqueRoot]; simp
      obtain ⟨rootMember, rootIdentity⟩ := List.mem_filter.mp rootIn
      have rootId := of_decide_eq_true rootIdentity
      have outside : record.caller.processInstanceId ∉ processInstanceClosureWithin
          before.calledProcessOccurrences [record.calledRoot.processInstanceId]
          (before.calledProcessOccurrences.length + 1) := by
        rw [← rootId, quiescent_root_call_closure_membership before instanceId running associations
          root rootMember parentless quiescent]
        exact quiescent_root_excludes_call_caller before instanceId running associations
          root rootMember parentless quiescent record recordMember
      apply runtimePositionValid_addToken program expectedInstanceId
        (removeCalledProcessTree before record) callerOutput record.caller
      · exact removeCalledProcessTree_preserves_position program before expectedInstanceId instanceId record
          valid running recordMember
      · apply removeCalledProcessTree_preserves_live_owner before record record.caller _ outside
        simpa only [exactLiveOccurrence, decide_eq_true_eq] using uniqueCaller
      · exact placeDeclared
      · exact continuationBinding record recordMember selected.1 selected.2

end BpmnSemantics.SemanticProcess
