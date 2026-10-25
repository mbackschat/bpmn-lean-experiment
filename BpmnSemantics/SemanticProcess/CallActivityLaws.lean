module

public import BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # CallActivity laws

The laws that proofs consume, apart from the definitions in [`CallActivity`](CallActivity.lean): a proof edit here rebuilds no module that imports those definitions with `import all` to reduce their bodies ([hidden-edit fanout](../../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract)).
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Valid associations of a running instance include its hosting root occurrence. -/
theorem calledProcessAssociationsValid_hosting_root (state : RuntimeState) (hosting : SemanticId)
    (running : state.control = .running hosting) (valid : calledProcessAssociationsValid state = true) :
    ∃ root ∈ state.scopeOccurrences, root.id.processInstanceId = hosting := by
  unfold calledProcessAssociationsValid at valid
  simp only [rootInstanceId?, running] at valid
  split at valid
  · rename_i hostingRoot roots
    have member : hostingRoot ∈ state.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.parent.isNone && occurrence.id.processInstanceId = hosting)) := by
      rw [roots]; simp
    obtain ⟨member, named⟩ := List.mem_filter.mp member
    simp only [Bool.and_eq_true, decide_eq_true_eq] at named
    exact ⟨hostingRoot, member, named.2⟩
  · contradiction

/-- An instance no scope occurrence uses is not the hosting one, whose root valid associations keep live;
so a fresh called instance differs from the hosting instance whichever instance its caller lies in. -/
theorem fresh_instance_ne_hosting (state : RuntimeState) (hosting calledInstance : SemanticId)
    (running : state.control = .running hosting) (valid : calledProcessAssociationsValid state = true)
    (fresh : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id.processInstanceId = calledInstance)).length = 0) : calledInstance ≠ hosting := by
  intro same
  obtain ⟨root, member, identity⟩ := calledProcessAssociationsValid_hosting_root state hosting running valid
  have present : root ∈ state.scopeOccurrences.filter (fun occurrence =>
      decide (occurrence.id.processInstanceId = calledInstance)) :=
    List.mem_filter.mpr ⟨member, by simp [identity, same]⟩
  rw [List.length_eq_zero_iff.mp fresh] at present
  contradiction

/-- Association validity exposes each record's one caller occurrence, which Stage B lets be embedded
(CALLN-FRAME-01), and its parentless called root. -/
theorem calledProcessAssociationsValid_endpoints (state : RuntimeState)
    (valid : calledProcessAssociationsValid state = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) :
    (∃ caller ∈ state.scopeOccurrences, caller.id = record.caller) ∧
      (∃ root ∈ state.scopeOccurrences, root.id = record.calledRoot ∧ root.parent = none) := by
  unfold calledProcessAssociationsValid at valid
  split at valid
  · contradiction
  · split at valid
    · simp only [Bool.and_eq_true, List.all_eq_true] at valid
      have fields := valid.1.1 record member
      constructor
      · obtain ⟨caller, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true fields.1.1.1.1.1.1.2)
        have present : caller ∈ [caller] := List.mem_singleton_self _
        rw [← singleton] at present
        obtain ⟨present, identity⟩ := List.mem_filter.mp present
        exact ⟨caller, present, by simpa using identity⟩
      · obtain ⟨root, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true fields.2)
        have present : root ∈ [root] := List.mem_singleton_self _
        rw [← singleton] at present
        obtain ⟨present, fields⟩ := List.mem_filter.mp present
        simp only [Bool.and_eq_true, decide_eq_true_eq, Option.isNone_iff_eq_none] at fields
        exact ⟨root, present, fields⟩
    · contradiction

/-- Valid Call records that mint the same called Process identity have the same Call anchor. -/
theorem calledProcessAssociationsValid_called_instance_injective (state : RuntimeState)
    (left right : CalledProcessOccurrence)
    (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (rightMember : right ∈ state.calledProcessOccurrences)
    (sameCalledInstance : left.calledRoot.processInstanceId =
    right.calledRoot.processInstanceId) :
  left.id = right.id := by
  unfold calledProcessAssociationsValid at valid
  simp only [rootInstanceId?, running] at valid
  generalize rootsEq : (state.scopeOccurrences.filter fun occurrence =>
    decide (occurrence.parent.isNone &&
      occurrence.id.processInstanceId = instanceId)) = roots at valid
  cases roots with
  | nil => simp at valid
  | cons root rest => cases rest with
    | cons other tail => simp at valid
    | nil =>
        simp only [Bool.and_eq_true, List.all_eq_true] at valid
        have leftValid := valid.1.1 left leftMember
        have rightValid := valid.1.1 right rightMember
        have leftIdProcess : left.id.processInstanceId = left.caller.processInstanceId :=
          of_decide_eq_true leftValid.1.1.1.1.1.1.1.1.2
        have rightIdProcess : right.id.processInstanceId = right.caller.processInstanceId :=
          of_decide_eq_true rightValid.1.1.1.1.1.1.1.1.2
        have leftDerived : left.calledRoot.processInstanceId =
            deriveCalledProcessInstanceId left.caller.processInstanceId
              ⟨left.id.elementId.value⟩ left.id.activation :=
          of_decide_eq_true leftValid.1.1.1.1.1.2
        have rightDerived : right.calledRoot.processInstanceId =
            deriveCalledProcessInstanceId right.caller.processInstanceId
              ⟨right.id.elementId.value⟩ right.id.activation :=
          of_decide_eq_true rightValid.1.1.1.1.1.2
        have tuple := calledProcessIdentityTuple_injective
          left.caller.processInstanceId right.caller.processInstanceId
          ⟨left.id.elementId.value⟩ ⟨right.id.elementId.value⟩
          left.id.activation right.id.activation
          (leftDerived.symm.trans (sameCalledInstance.trans rightDerived))
        generalize leftIdentityEq : left.id = leftIdentity at leftIdProcess tuple ⊢
        generalize rightIdentityEq : right.id = rightIdentity at rightIdProcess tuple ⊢
        cases leftIdentity
        cases rightIdentity
        simp only [OccurrenceId.mk.injEq]
        exact ⟨leftIdProcess.trans (tuple.1.trans rightIdProcess.symm),
          congrArg (fun id : NodeId => (⟨id.value⟩ : SemanticId)) tuple.2.1,
          tuple.2.2⟩

end BpmnSemantics.SemanticProcess
