module

import BpmnSemantics.SemanticProcess.CallReachability
public import BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.ScopeStorageOrder

/-! # Call associations under scope creation

The [scope-creation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md) requires the
parentless-root and Call-record bijection to survive the actual selected insertion.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def RecordFacts (state : RuntimeState) (hosting : SemanticId)
    (record : CalledProcessOccurrence) : Prop :=
  (state.calledProcessOccurrences.filter fun candidate =>
    decide (candidate.id.elementId.value = record.id.elementId.value)).length = 1 ∧
  record.id.processInstanceId = record.caller.processInstanceId ∧
  record.id.activation > 0 ∧
  (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = record.caller)).length = 1 ∧
  record.calledRoot.processInstanceId = deriveCalledProcessInstanceId
    record.caller.processInstanceId ⟨record.id.elementId.value⟩ record.id.activation ∧
  record.calledRoot.processInstanceId ≠ hosting ∧
  record.calledRoot.definitionScopeId ≠ record.caller.definitionScopeId ∧
  record.calledRoot.activation = 1 ∧
  (state.calledProcessOccurrences.filter fun candidate =>
    decide (candidate.caller = record.caller ∧
      candidate.id.elementId.value = record.id.elementId.value)).length = 1 ∧
  (state.scopeOccurrences.filter fun occurrence =>
    decide (occurrence.id = record.calledRoot ∧ occurrence.parent.isNone)).length = 1

def AssociationFacts (state : RuntimeState) (hosting : SemanticId) : Prop :=
  (state.scopeOccurrences.filter fun occurrence =>
    decide (occurrence.parent.isNone ∧ occurrence.id.processInstanceId = hosting)).length = 1 ∧
  (∀ record ∈ state.calledProcessOccurrences, RecordFacts state hosting record) ∧
  (∀ occurrence ∈ state.scopeOccurrences,
    occurrence.parent.isNone → occurrence.id.processInstanceId ≠ hosting →
      (state.calledProcessOccurrences.filter fun record =>
        decide (record.calledRoot = occurrence.id)).length = 1) ∧
  (∀ record ∈ state.calledProcessOccurrences,
    record.calledRoot.processInstanceId ∈ processInstanceClosureWithin
      state.calledProcessOccurrences [hosting] (state.calledProcessOccurrences.length + 1))

private theorem associations_iff (state : RuntimeState) (hosting : SemanticId)
    (running : state.control = .running hosting) :
    calledProcessAssociationsValid state = true ↔ AssociationFacts state hosting := by
  unfold calledProcessAssociationsValid
  conv =>
    lhs
    lhs
    arg 2
    change (match state.control with
      | .running id | .completed id | .cancelled id => some id
      | .notStarted | .failed .. => none)
    rw [running]
  simp only []
  generalize rootsEq : (state.scopeOccurrences.filter fun occurrence =>
    decide (occurrence.parent.isNone && occurrence.id.processInstanceId = hosting)) = roots
  have rootsCount : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.parent.isNone ∧ occurrence.id.processInstanceId = hosting)).length =
      roots.length := by
        simpa only [Bool.and_eq_true, decide_eq_true_eq] using congrArg List.length rootsEq
  cases roots with
  | nil => simp only [AssociationFacts, rootsCount, List.length_nil, Bool.false_eq_true,
      Nat.zero_ne_one, false_and]
  | cons root rest => cases rest with
    | cons other rest =>
        have impossible : rest.length + 1 + 1 ≠ 1 := by omega
        simp only [AssociationFacts, rootsCount, List.length_cons, Bool.false_eq_true,
          impossible, false_and]
    | nil =>
        have rootHosting : root.id.processInstanceId = hosting := by
          have member : root ∈ state.scopeOccurrences.filter (fun occurrence =>
              decide (occurrence.parent.isNone && occurrence.id.processInstanceId = hosting)) := by
            rw [rootsEq]; simp
          exact (by simpa only [decide_eq_true_eq, Bool.and_eq_true] using
            (List.mem_filter.mp member).2 : root.parent.isNone ∧
              root.id.processInstanceId = hosting).2
        simp only [AssociationFacts, rootsCount, List.length_singleton, true_and, rootHosting,
          Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true, List.contains_iff_mem]
        unfold RecordFacts
        constructor
        · intro valid
          refine ⟨?_, ?_, valid.2⟩
          · intro record member
            have fields := valid.1.1 record member
            simp only [and_assoc] at fields
            obtain ⟨u,a,b,c,d,e,f,g,h,i⟩ := fields
            refine ⟨u,a,b,c,d,e,f,g,?_,i⟩
            change (state.calledProcessOccurrences.filter (fun candidate =>
              decide (candidate.caller = record.caller) &&
                decide (candidate.id.elementId.value = record.id.elementId.value))).length = 1 at h
            simpa only [Bool.decide_and] using h
          · intro occurrence member parent different
            have fields := valid.1.2 occurrence member
            simpa [parent, different] using fields
        · rintro ⟨records, roots, reach⟩
          refine ⟨⟨?_, ?_⟩, reach⟩
          · intro record member
            have fields := records record member
            simp only [and_assoc]
            obtain ⟨u,a,b,c,d,e,f,g,h,i⟩ := fields
            refine ⟨u,a,b,c,d,e,f,g,?_,i⟩
            change (state.calledProcessOccurrences.filter (fun candidate =>
              decide (candidate.caller = record.caller) &&
                decide (candidate.id.elementId.value = record.id.elementId.value))).length = 1
            simpa only [Bool.decide_and] using h
          · intro occurrence member
            split
            · next condition =>
                simpa only [decide_eq_true_eq] using
                  roots occurrence member condition.1 condition.2
            · rfl

private theorem scope_present_of_id_count (scopes : List RuntimeScopeOccurrence)
    (owner : ScopeOccurrenceId)
    (count : (scopes.filter fun scope => decide (scope.id = owner)).length = 1) :
    ∃ scope ∈ scopes, scope.id = owner := by
  obtain ⟨scope, member⟩ := List.exists_mem_of_length_pos (by omega : 0 < (scopes.filter fun scope =>
    decide (scope.id = owner)).length)
  exact ⟨scope, (List.mem_filter.mp member).1, of_decide_eq_true (List.mem_filter.mp member).2⟩

private theorem child_insert_associations (state : RuntimeState) (hosting : SemanticId)
    (inserted : RuntimeScopeOccurrence) (owner : ScopeOccurrenceId)
    (parent : inserted.parent = some owner)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : AssociationFacts state hosting) :
    AssociationFacts
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
      hosting := by
  obtain ⟨hostingCount, records, roots, reach⟩ := valid
  refine ⟨?_, ?_, ?_, reach⟩
  · simpa [insertScopeOccurrence, length_filter_canonicalInsertBy, parent] using hostingCount
  · intro record member
    have fields := records record member
    obtain ⟨caller, callerMember, callerId⟩ := scope_present_of_id_count _ _ fields.2.2.2.1
    have callerDifferent : inserted.id ≠ record.caller := fun same =>
      fresh caller callerMember (callerId.trans same.symm)
    simpa [RecordFacts, insertScopeOccurrence, length_filter_canonicalInsertBy, parent, callerDifferent]
      using fields
  · intro occurrence member isRoot different
    rcases (mem_insertScopeOccurrence inserted occurrence state.scopeOccurrences).mp member with
      equal | old
    · subst occurrence; simp [parent] at isRoot
    · exact roots occurrence old isRoot different

private theorem call_filter_insert (records : List CalledProcessOccurrence)
    (record : CalledProcessOccurrence) (keep : CalledProcessOccurrence → Bool) :
    ((sortCallRecords (record :: records)).filter keep).length =
      (if keep record then 1 else 0) + (records.filter keep).length := by
  rw [((sortCallRecords_perm (record :: records)).filter keep).length_eq]
  split <;> simp_all [Nat.add_comm]

private theorem scope_present_of_count (scopes : List RuntimeScopeOccurrence)
    (owner : ScopeOccurrenceId)
    (count : (scopes.filter fun scope =>
      decide (scope.id = owner ∧ scope.parent.isNone)).length = 1) :
    ∃ scope ∈ scopes, scope.id = owner := by
  have nonempty : scopes.filter (fun scope =>
      decide (scope.id = owner ∧ scope.parent.isNone)) ≠ [] := by
    intro empty; rw [empty] at count; contradiction
  obtain ⟨scope, member⟩ := List.exists_mem_of_ne_nil _ nonempty
  exact ⟨scope, (List.mem_filter.mp member).1,
    ((of_decide_eq_true (List.mem_filter.mp member).2)).1⟩

private theorem call_insert_associations (state : RuntimeState) (hosting : SemanticId)
    (inserted : RuntimeScopeOccurrence) (record : CalledProcessOccurrence)
    (valid : AssociationFacts state hosting)
    (parent : inserted.parent = none) (rootId : inserted.id = record.calledRoot)
    (recordProcess : record.id.processInstanceId = record.caller.processInstanceId)
    (positive : record.id.activation > 0)
    (derived : record.calledRoot.processInstanceId = deriveCalledProcessInstanceId
      record.caller.processInstanceId ⟨record.id.elementId.value⟩ record.id.activation)
    (separated : record.calledRoot.definitionScopeId ≠ record.caller.definitionScopeId)
    (rootActivation : record.calledRoot.activation = 1)
    (callerCount : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.caller ∧ occurrence.parent.isNone)).length = 1)
    (callerIdCount : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.caller)).length = 1)
    (elementAbsent : (state.calledProcessOccurrences.filter fun candidate =>
      decide (candidate.id.elementId.value = record.id.elementId.value)).length = 0)
    (anchorAbsent : (state.calledProcessOccurrences.filter fun candidate =>
      decide (candidate.caller = record.caller ∧
        candidate.id.elementId.value = record.id.elementId.value)).length = 0)
    (instanceFresh : ∀ occurrence ∈ state.scopeOccurrences,
      occurrence.id.processInstanceId ≠ record.calledRoot.processInstanceId) :
    AssociationFacts
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences
                   calledProcessOccurrences := sortCallRecords (record :: state.calledProcessOccurrences) }
      hosting := by
  obtain ⟨hostingCount, records, roots, reach⟩ := valid
  have calledDifferent : record.calledRoot.processInstanceId ≠ hosting := by
    have present : ∃ root ∈ state.scopeOccurrences, root.id.processInstanceId = hosting := by
      have nonempty : 0 < (state.scopeOccurrences.filter (fun occurrence =>
          decide (occurrence.parent.isNone ∧ occurrence.id.processInstanceId = hosting))).length := by omega
      obtain ⟨root, member⟩ := List.exists_mem_of_length_pos nonempty
      obtain ⟨member, named⟩ := List.mem_filter.mp member
      exact ⟨root, member, (of_decide_eq_true named).2⟩
    obtain ⟨root, member, identity⟩ := present
    have fresh := instanceFresh root member
    rw [identity] at fresh
    exact Ne.symm fresh
  have newDifferent (scope : RuntimeScopeOccurrence) (member : scope ∈ state.scopeOccurrences) :
      record.calledRoot ≠ scope.id := by
    intro equal
    exact instanceFresh scope member (congrArg ScopeOccurrenceId.processInstanceId equal).symm
  have oldEndpoints (old : CalledProcessOccurrence) (member : old ∈ state.calledProcessOccurrences) :
      inserted.id ≠ old.caller ∧ inserted.id ≠ old.calledRoot := by
    have fields := records old member
    obtain ⟨caller, cm, ce⟩ := scope_present_of_id_count _ _ fields.2.2.2.1
    obtain ⟨called, rm, re⟩ := scope_present_of_count _ _ fields.2.2.2.2.2.2.2.2.2
    exact ⟨rootId ▸ ce ▸ newDifferent caller cm, rootId ▸ re ▸ newDifferent called rm⟩
  have oldAnchor (old : CalledProcessOccurrence) (member : old ∈ state.calledProcessOccurrences) :
      ¬ (record.caller = old.caller ∧ record.id.elementId.value = old.id.elementId.value) := by
    have absent := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp anchorAbsent) old member
    simp only [decide_eq_true_eq] at absent
    exact fun same => absent ⟨same.1.symm, same.2.symm⟩
  have oldElement (old : CalledProcessOccurrence) (member : old ∈ state.calledProcessOccurrences) :
      record.id.elementId.value ≠ old.id.elementId.value := by
    have absent := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp elementAbsent) old member
    simp only [decide_eq_true_eq] at absent
    exact fun same => absent same.symm
  have oldRootAbsent : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.calledRoot ∧ occurrence.parent.isNone)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro scope member
    simp only [decide_eq_true_eq]
    exact fun same => newDifferent scope member same.1.symm
  have oldRecordAbsent : (state.calledProcessOccurrences.filter fun old =>
      decide (old.calledRoot = record.calledRoot)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro old member
    simp only [decide_eq_true_eq]
    exact fun same => (oldEndpoints old member).2 (rootId.trans same.symm)
  -- The caller is a parentless root: the hosting one, or a called root whose own record is reachable.
  have callerReached : record.caller.processInstanceId ∈ processInstanceClosureWithin
      state.calledProcessOccurrences [hosting] (state.calledProcessOccurrences.length + 1) := by
    by_cases hosted : record.caller.processInstanceId = hosting
    · exact processInstanceClosureWithin_seed_subset _ _ _ (by simp [hosted])
    · have nonempty : 0 < (state.scopeOccurrences.filter (fun occurrence =>
          decide (occurrence.id = record.caller ∧ occurrence.parent.isNone))).length := by omega
      obtain ⟨caller, member⟩ := List.exists_mem_of_length_pos nonempty
      obtain ⟨member, named⟩ := List.mem_filter.mp member
      obtain ⟨identity, parentless⟩ := of_decide_eq_true named
      have single := roots caller member parentless (by rw [identity]; exact hosted)
      have recorded : 0 < (state.calledProcessOccurrences.filter (fun old =>
          decide (old.calledRoot = caller.id))).length := by omega
      obtain ⟨old, oldMember⟩ := List.exists_mem_of_length_pos recorded
      obtain ⟨oldMember, oldNamed⟩ := List.mem_filter.mp oldMember
      have called := of_decide_eq_true oldNamed
      rw [← identity, ← called]
      exact reach old oldMember
  have extension := processInstanceClosureWithin_sorted_extension state.calledProcessOccurrences
    [hosting] record (by simp) callerReached
  refine ⟨?_, ?_, ?_, ?_⟩
  · simpa [insertScopeOccurrence, length_filter_canonicalInsertBy, parent, rootId,
      calledDifferent] using hostingCount
  · intro old member
    have member' := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).subset member
    rcases List.mem_cons.mp member' with equal | existing
    · subst old
      have callerDifferent : inserted.id ≠ record.caller := by
        obtain ⟨caller, callerMember, identity⟩ := scope_present_of_count _ _ callerCount
        exact identity ▸ rootId ▸ newDifferent caller callerMember
      simp only [RecordFacts]
      refine ⟨?_, recordProcess, positive, ?_, derived, calledDifferent, separated, rootActivation,
        ?_, ?_⟩
      · simp only [call_filter_insert, decide_true, ↓reduceIte, elementAbsent, Nat.add_zero]
      · simpa [insertScopeOccurrence, length_filter_canonicalInsertBy, callerDifferent]
          using callerIdCount
      · simp only [call_filter_insert, and_self, decide_true, ↓reduceIte, anchorAbsent, Nat.add_zero]
      · simp only [insertScopeOccurrence, length_filter_canonicalInsertBy, rootId, parent,
          Option.isNone_none, and_self, decide_true, ↓reduceIte, oldRootAbsent, List.length_nil,
          Nat.add_zero]
    · have fields := records old existing
      have different := oldEndpoints old existing
      simpa only [RecordFacts, insertScopeOccurrence, length_filter_canonicalInsertBy,
        call_filter_insert, different.1, different.2, false_and, decide_false, Bool.false_eq_true, ↓reduceIte,
        oldAnchor old existing, oldElement old existing, and_false, Nat.zero_add, Nat.add_zero] using fields
  · intro scope member isRoot notHosting
    rcases (mem_insertScopeOccurrence inserted scope state.scopeOccurrences).mp member with
      equal | existing
    · subst scope
      simp only [call_filter_insert, rootId, decide_true, ↓reduceIte, oldRecordAbsent,
        List.length_nil, Nat.add_zero]
    · have different := newDifferent scope existing
      simpa only [call_filter_insert, different, decide_false, Bool.false_eq_true, ↓reduceIte, Nat.zero_add]
        using roots scope existing isRoot notHosting
  · intro old member
    have member' := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).subset member
    rcases List.mem_cons.mp member' with equal | existing
    · subst old; exact extension.2
    · exact extension.1 (reach old existing)

private theorem root_count_of_singleton (scopes : List RuntimeScopeOccurrence)
    (owner : ScopeOccurrenceId) (root : RuntimeScopeOccurrence)
    (selected : scopes.filter (fun occurrence => decide (occurrence.id = owner)) = [root])
    (parent : root.parent.isNone = true) :
    (scopes.filter fun occurrence =>
      decide (occurrence.id = owner ∧ occurrence.parent.isNone)).length = 1 := by
  have filtered : (scopes.filter fun occurrence =>
      decide (occurrence.id = owner ∧ occurrence.parent.isNone)) =
      (scopes.filter fun occurrence => decide (occurrence.id = owner)).filter
        (fun occurrence => occurrence.parent.isNone) := by
    rw [List.filter_filter]
    congr 1
    funext occurrence
    cases occurrence.parent <;> simp
  rw [filtered, selected]
  simp [parent]

/-- Successful creation preserves the complete association predicate. Call definition separation
comes from Program admission; the selector itself supplies every runtime census premise. -/
theorem selectInternalScopeCreation_preserves_callAssociations (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected)
    (valid : calledProcessAssociationsValid state = true)
    (separated : ∀ record, selected.kind = .called record →
      selected.created.id.definitionScopeId ≠ selected.owner.definitionScopeId) :
    calledProcessAssociationsValid (selected.apply state) = true := by
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation selected found
  have facts := (associations_iff state hosting running).mp valid
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  cases operation with
  | enterScope id origin input entry definition =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · cases found
        apply (associations_iff _ hosting (by exact running)).mpr
        refine child_insert_associations state hosting _ owner rfl ?_ facts
        intro occurrence member same
        have absent : ¬ (state.scopeOccurrences.any fun occurrence =>
            occurrence.id.definitionScopeId == definition) = true := by simp_all
        exact absent (List.any_eq_true.mpr ⟨occurrence, member, by simp [same]⟩)
  | invokeProcess id origin input process definition entry returnOperation data =>
      cases data with
      | scalar => simp at found
      | variableMappings => simp at found
      | empty =>
          obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
          repeat first | contradiction | split at found
          all_goals cases found
          all_goals
            apply (associations_iff _ hosting (by exact running)).mpr
            apply call_insert_associations state hosting
            · exact facts
            · rfl
            · rfl
            · rfl
            · exact Nat.zero_lt_succ _
            · rfl
            · exact separated _ rfl
            · rfl
            · apply root_count_of_singleton <;> first | assumption | (simp_all only [Bool.and_eq_true,
                decide_eq_true_eq])
            · obtain ⟨callerRoot, selected⟩ : ∃ callerRoot, (state.scopeOccurrences.filter fun occurrence =>
                  decide (occurrence.id = owner)) = [callerRoot] := ⟨_, by assumption⟩
              rw [selected]; rfl
            · have fresh : (state.calledProcessOccurrences.filter fun record =>
                  decide (record.id.elementId.value = origin.elementId.value)).length = 0 := by assumption
              exact fresh
            · have fresh : (state.calledProcessOccurrences.filter fun record =>
                  decide (record.id.elementId.value = origin.elementId.value)).length = 0 := by assumption
              simp only [List.length_eq_zero_iff, List.filter_eq_nil_iff, decide_eq_true_eq] at fresh ⊢
              intro record member
              simp [fresh record member]
            · intro occurrence member
              have absent : (state.scopeOccurrences.filter fun occurrence =>
                  decide (occurrence.id.processInstanceId = deriveCalledProcessInstanceId
                    owner.processInstanceId origin.elementId (callActivationCount state origin.elementId + 1))).length = 0 :=
                by assumption
              simpa only [decide_eq_true_eq] using
                List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp absent) occurrence member
  | _ => simp at found

/-- Freshness alone cannot justify a called root: omitting its record breaks the existing
parentless-root/Call-record bijection in `calledProcessAssociationsValid`. -/
theorem fresh_parentless_scope_without_call_record_invalid (state : RuntimeState)
    (hosting : SemanticId) (inserted : RuntimeScopeOccurrence)
    (running : state.control = .running hosting)
    (valid : calledProcessAssociationsValid state = true)
    (parent : inserted.parent = none)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences,
      occurrence.id.processInstanceId ≠ inserted.id.processInstanceId) :
    calledProcessAssociationsValid
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      false := by
  have before := (associations_iff state hosting running).mp valid
  have hostingPresent : ∃ occurrence ∈ state.scopeOccurrences,
      occurrence.id.processInstanceId = hosting := by
    have nonempty : (state.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.parent.isNone ∧ occurrence.id.processInstanceId = hosting)) ≠ [] := by
      intro empty
      have count := before.1
      rw [empty] at count
      contradiction
    obtain ⟨occurrence, member⟩ := List.exists_mem_of_ne_nil _ nonempty
    exact ⟨occurrence, (List.mem_filter.mp member).1,
      (of_decide_eq_true (List.mem_filter.mp member).2).2⟩
  obtain ⟨hostingRoot, hostingMember, hostingId⟩ := hostingPresent
  have different : inserted.id.processInstanceId ≠ hosting := by
    have excluded := fresh hostingRoot hostingMember
    rw [hostingId] at excluded
    exact Ne.symm excluded
  have recordsAbsent : (state.calledProcessOccurrences.filter fun record =>
      decide (record.calledRoot = inserted.id)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro record member
    simp only [decide_eq_true_eq]
    intro same
    obtain ⟨root, rootMember, rootId⟩ := scope_present_of_count _ _
      (before.2.1 record member).2.2.2.2.2.2.2.2.2
    exact fresh root rootMember (congrArg ScopeOccurrenceId.processInstanceId (rootId.trans same))
  cases result : calledProcessAssociationsValid
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } with
  | false => rfl
  | true =>
      have after := (associations_iff _ hosting (by exact running)).mp result
      have count := after.2.2.1 inserted
        ((mem_insertScopeOccurrence inserted inserted state.scopeOccurrences).mpr (.inl rfl))
        (by simp [parent]) different
      change (state.calledProcessOccurrences.filter fun record =>
        decide (record.calledRoot = inserted.id)).length = 1 at count
      rw [recordsAbsent] at count
      contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
