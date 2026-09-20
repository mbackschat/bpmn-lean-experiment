import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProcessIdentityProofs
import BpmnSemantics.SemanticProcess.ScopeAncestryLaws

/-! # Process-instance scope ancestry

Predecessor position validity supplies live parent edges and the static forest rank. Call-association
reachability transfers the hosting singleton to every called instance before roots are identified.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem live_member (state : RuntimeState) (owner : ScopeOccurrenceId)
    (live : exactLiveOccurrence state owner = true) :
    ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = owner := by
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
  have member : occurrence ∈ state.scopeOccurrences.filter fun current =>
      decide (current.id = owner) := by rw [singleton]; simp
  exact ⟨occurrence, (List.mem_filter.mp member).1,
    of_decide_eq_true (List.mem_filter.mp member).2⟩

/-- Position validity excludes duplicate complete scope identities, independent of storage order. -/
theorem runtimePositionValid_scope_ids_nodup (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) :
    (state.scopeOccurrences.map (·.id)).Nodup := by
  apply List.nodup_iff_count.mpr
  intro owner
  by_cases member : owner ∈ state.scopeOccurrences.map (·.id)
  · obtain ⟨occurrence, present, rfl⟩ := List.mem_map.mp member
    have live := (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
      state valid running occurrence present).1
    have count := of_decide_eq_true live
    simpa only [List.count_eq_length_filter, List.filter_map, List.length_map,
      Function.comp_def, Bool.beq_eq_decide_eq] using Nat.le_of_eq count
  · simp [List.count_eq_zero_of_not_mem member]

/-- Every runtime parent is live because the predecessor validates the exact parent identity. -/
theorem runtimePositionValid_scope_parents_live (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) : ScopeParentsLive state.scopeOccurrences := by
  intro occurrence member parent edge
  obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
    program expectedInstanceId instanceId state valid running occurrence member
  rcases binding with ⟨_, root⟩ | ⟨selected, selectedParent, _, _, live⟩
  · simp [root] at edge
  · have equal : selected = parent := Option.some.inj (selectedParent.symm.trans edge)
    obtain ⟨parentOccurrence, present, same⟩ := live_member state selected live
    exact List.mem_map.mpr ⟨parentOccurrence, present, same.trans equal⟩

/-- Directed parent ancestry preserves the complete semantic Process-instance identity. -/
theorem runtimePositionValid_scope_ancestry_instance (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) (root candidate : ScopeOccurrenceId)
    (ancestry : ScopeAncestry state.scopeOccurrences root candidate) :
    root.processInstanceId = candidate.processInstanceId := by
  induction ancestry with
  | seed => rfl
  | child previous edge ih =>
      obtain ⟨occurrence, member, parentEq, same⟩ := edge
      obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
        program expectedInstanceId instanceId state valid running occurrence member
      rcases binding with ⟨_, root⟩ | ⟨parent, edge, _, sameInstance, _⟩
      · simp [root] at parentEq
      · have equal := Option.some.inj (edge.symm.trans parentEq)
        exact ih.trans (by simpa [equal, same] using sameInstance)

/-- The exact parent edge is a same-instance edge under predecessor position validity. -/
theorem runtimePositionValid_scope_parent_instance (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) (parent child : ScopeOccurrenceId)
    (edge : ScopeParentEdge state.scopeOccurrences parent child) :
    parent.processInstanceId = child.processInstanceId :=
  runtimePositionValid_scope_ancestry_instance program expectedInstanceId instanceId state
    valid running parent child (.child .seed edge)

/-- Static ancestor rank forces each live scope to reach a live parentless root of its own instance. -/
theorem runtimePositionValid_live_instance_root (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) (candidate : ScopeOccurrenceId)
    (live : exactLiveOccurrence state candidate = true) :
    ∃ root ∈ state.scopeOccurrences, root.parent = none ∧
      root.id.processInstanceId = candidate.processInstanceId ∧
      ScopeAncestry state.scopeOccurrences root.id candidate := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid
    exact valid.1.1
  have forest := programWellFormed_scopeForest program programValid
  have ranked : ∀ rank owner, definitionScopeAncestorRank program owner.definitionScopeId = rank →
      exactLiveOccurrence state owner = true →
      ∃ root ∈ state.scopeOccurrences, root.parent = none ∧
        root.id.processInstanceId = owner.processInstanceId ∧
        ScopeAncestry state.scopeOccurrences root.id owner := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
        intro owner rankEq live
        obtain ⟨occurrence, member, identity⟩ := live_member state owner live
        obtain ⟨_, definition, definitionMember, definitionId, binding⟩ :=
          runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
            state valid running occurrence member
        rcases binding with ⟨_, parentless⟩ | ⟨parent, parentEq, staticParent, same, parentLive⟩
        · exact ⟨occurrence, member, parentless, congrArg ScopeOccurrenceId.processInstanceId identity,
            identity ▸ ScopeAncestry.seed⟩
        · have smaller := definitionScopeAncestorRank_parent_lt program forest definition
            definitionMember staticParent
          have smaller' : definitionScopeAncestorRank program parent.definitionScopeId < rank := by
            simpa [definitionId, identity, rankEq] using smaller
          obtain ⟨root, rootMember, rootParent, rootInstance, reaches⟩ :=
            ih _ smaller' parent rfl parentLive
          exact ⟨root, rootMember, rootParent, rootInstance.trans (by simpa [identity] using same),
            .child reaches ⟨occurrence, member, parentEq, identity⟩⟩
  exact ranked _ candidate rfl live

private theorem filter_singleton_members_equal (values : List α) (keep : α → Bool)
    (count : (values.filter keep).length = 1) (left right : α)
    (leftMember : left ∈ values) (rightMember : right ∈ values)
    (leftKept : keep left = true) (rightKept : keep right = true) : left = right := by
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp count
  have leftIn := List.mem_filter.mpr ⟨leftMember, leftKept⟩
  have rightIn := List.mem_filter.mpr ⟨rightMember, rightKept⟩
  rw [singleton] at leftIn rightIn
  exact (List.mem_singleton.mp leftIn).trans (List.mem_singleton.mp rightIn).symm

/-- Association reachability propagates the hosting singleton to every called instance root. -/
theorem calledProcessAssociationsValid_parentless_root_unique (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (left right : RuntimeScopeOccurrence)
    (leftMember : left ∈ state.scopeOccurrences) (rightMember : right ∈ state.scopeOccurrences)
    (leftParent : left.parent = none) (rightParent : right.parent = none)
    (sameInstance : left.id.processInstanceId = right.id.processInstanceId) :
    left.id = right.id := by
  have association := valid
  unfold calledProcessAssociationsValid at association
  split at association
  · contradiction
  · rename_i hosting hostingEq
    split at association
    · rename_i hostingRoot hostingRoots
      simp only [Bool.and_eq_true, List.all_eq_true] at association
      have rootRecord (root : RuntimeScopeOccurrence) (member : root ∈ state.scopeOccurrences)
          (parentless : root.parent = none) (notHosting : root.id.processInstanceId ≠ hosting) :
          ∃ record ∈ state.calledProcessOccurrences, record.calledRoot = root.id := by
        have count := association.1.2 root member
        simp [parentless, notHosting] at count
        obtain ⟨record, singleton⟩ := List.length_eq_one_iff.mp count
        have member : record ∈ state.calledProcessOccurrences.filter fun record =>
            decide (record.calledRoot = root.id) := by rw [singleton]; simp
        exact ⟨record, (List.mem_filter.mp member).1,
          of_decide_eq_true (List.mem_filter.mp member).2⟩
      let unique : SemanticId → Prop := fun process =>
        ∀ first ∈ state.scopeOccurrences, ∀ second ∈ state.scopeOccurrences,
          first.parent = none → second.parent = none →
          first.id.processInstanceId = process → second.id.processInstanceId = process →
          first.id = second.id
      have seedUnique : unique hosting := by
        intro first firstMember second secondMember firstParent secondParent firstId secondId
        have firstIn : first ∈ [hostingRoot] := by
          rw [← hostingRoots]
          apply List.mem_filter.mpr
          exact ⟨firstMember, by simp [firstParent, firstId]⟩
        have secondIn : second ∈ [hostingRoot] := by
          rw [← hostingRoots]
          apply List.mem_filter.mpr
          exact ⟨secondMember, by simp [secondParent, secondId]⟩
        exact congrArg RuntimeScopeOccurrence.id
          ((List.mem_singleton.mp firstIn).trans (List.mem_singleton.mp secondIn).symm)
      have hostingIdentity : hostingRoot.id.processInstanceId = hosting := by
        have member : hostingRoot ∈ state.scopeOccurrences.filter fun occurrence =>
            decide (occurrence.parent.isNone && occurrence.id.processInstanceId = hosting) := by
          rw [hostingRoots]; simp
        have accepted := (List.mem_filter.mp member).2
        simp only [decide_eq_true_eq, Bool.and_eq_true] at accepted
        exact accepted.2
      have stepUnique : ∀ record ∈ state.calledProcessOccurrences,
          unique record.caller.processInstanceId → unique record.calledRoot.processInstanceId := by
        intro record recordMember callerUnique
        have fields := association.1.1 record recordMember
        have recordId : record.id.processInstanceId = record.caller.processInstanceId :=
          of_decide_eq_true fields.1.1.1.1.1.1.1.1
        have notHosting : record.calledRoot.processInstanceId ≠ hosting :=
          of_decide_eq_true fields.1.1.1.1.2
        have callerCount := of_decide_eq_true fields.1.1.1.1.1.1.2
        simp only [decide_eq_true_eq] at callerCount
        obtain ⟨caller, callerSingleton⟩ := List.length_eq_one_iff.mp callerCount
        have callerFiltered : caller ∈ state.scopeOccurrences.filter fun occurrence =>
            decide (occurrence.id = record.caller ∧ occurrence.parent.isNone = true) := by
          rw [callerSingleton]; simp
        obtain ⟨callerMember, callerFacts⟩ := List.mem_filter.mp callerFiltered
        simp only [decide_eq_true_eq, Option.isNone_iff_eq_none] at callerFacts
        have rootIdentity (root : RuntimeScopeOccurrence) (member : root ∈ state.scopeOccurrences)
            (parentless : root.parent = none)
            (same : root.id.processInstanceId = record.calledRoot.processInstanceId) :
            root.id = record.calledRoot := by
          obtain ⟨other, otherMember, otherRoot⟩ := rootRecord root member parentless
            (same ▸ notHosting)
          have otherFields := association.1.1 other otherMember
          have sameCall := calledProcessAssociationsValid_called_instance_injective state record other
            running valid recordMember otherMember (by rw [otherRoot, same])
          have otherId : other.id.processInstanceId = other.caller.processInstanceId :=
            of_decide_eq_true otherFields.1.1.1.1.1.1.1.1
          have sameCallerInstance : other.caller.processInstanceId = record.caller.processInstanceId :=
            otherId.symm.trans ((congrArg (fun id => id.processInstanceId) sameCall.symm).trans recordId)
          have otherCallerCount := of_decide_eq_true otherFields.1.1.1.1.1.1.2
          simp only [decide_eq_true_eq] at otherCallerCount
          obtain ⟨otherCaller, otherCallerSingleton⟩ := List.length_eq_one_iff.mp otherCallerCount
          have otherCallerFiltered : otherCaller ∈ state.scopeOccurrences.filter fun occurrence =>
              decide (occurrence.id = other.caller ∧ occurrence.parent.isNone = true) := by
            rw [otherCallerSingleton]; simp
          obtain ⟨otherCallerMember, otherCallerFacts⟩ := List.mem_filter.mp otherCallerFiltered
          simp only [decide_eq_true_eq, Option.isNone_iff_eq_none] at otherCallerFacts
          have sameCaller : other.caller = record.caller := by
            rw [← otherCallerFacts.1, ← callerFacts.1]
            apply callerUnique otherCaller otherCallerMember caller callerMember
              otherCallerFacts.2 callerFacts.2
            · simpa [otherCallerFacts.1] using sameCallerInstance
            · simp [callerFacts.1]
          have anchorCount := of_decide_eq_true fields.1.2
          change (state.calledProcessOccurrences.filter fun candidate =>
            decide (candidate.caller = record.caller) &&
              decide (candidate.id.elementId.value = record.id.elementId.value)).length = 1 at anchorCount
          have sameRecord : other = record := filter_singleton_members_equal _ _ anchorCount
            other record otherMember recordMember (by simp [sameCaller, ← sameCall]) (by simp)
          exact otherRoot.symm.trans (congrArg CalledProcessOccurrence.calledRoot sameRecord)
        intro first firstMember second secondMember firstParent secondParent firstId secondId
        exact (rootIdentity first firstMember firstParent firstId).trans
          (rootIdentity second secondMember secondParent secondId).symm
      have reachableUnique := processInstanceClosureWithin_least state.calledProcessOccurrences
        [hostingRoot.id.processInstanceId] (state.calledProcessOccurrences.length + 1) unique
        (by intro process member; simpa [List.mem_singleton.mp member, hostingIdentity] using seedUnique)
        stepUnique
      have leftUnique : unique left.id.processInstanceId := by
        by_cases hostingInstance : left.id.processInstanceId = hosting
        · exact hostingInstance ▸ seedUnique
        · obtain ⟨record, member, rootEq⟩ := rootRecord left leftMember leftParent hostingInstance
          apply reachableUnique
          have reachable := association.2 record member
          simpa only [rootEq, List.contains_iff_mem] using reachable
      exact leftUnique left leftMember right rightMember leftParent rightParent rfl sameInstance.symm
    · contradiction

private theorem call_caller_root (state : RuntimeState)
    (valid : calledProcessAssociationsValid state = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) :
    record.id.processInstanceId = record.caller.processInstanceId ∧
      (∃ caller ∈ state.scopeOccurrences, caller.id = record.caller ∧ caller.parent = none) ∧
      (state.calledProcessOccurrences.filter fun candidate =>
        decide (candidate.caller = record.caller) &&
          decide (candidate.id.elementId.value = record.id.elementId.value)).length = 1 := by
  unfold calledProcessAssociationsValid at valid
  split at valid
  · contradiction
  · split at valid
    · simp only [Bool.and_eq_true, List.all_eq_true] at valid
      have fields := valid.1.1 record member
      refine ⟨of_decide_eq_true fields.1.1.1.1.1.1.1.1, ?_, of_decide_eq_true fields.1.2⟩
      have count := of_decide_eq_true fields.1.1.1.1.1.1.2
      simp only [decide_eq_true_eq] at count
      obtain ⟨caller, singleton⟩ := List.length_eq_one_iff.mp count
      have member : caller ∈ state.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id = record.caller ∧ occurrence.parent.isNone = true) := by
        rw [singleton]; simp
      obtain ⟨present, facts⟩ := List.mem_filter.mp member
      simp only [decide_eq_true_eq, Option.isNone_iff_eq_none] at facts
      exact ⟨caller, present, facts⟩
    · contradiction

private theorem same_called_instance_anchor (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (left right : CalledProcessOccurrence)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (rightMember : right ∈ state.calledProcessOccurrences)
    (same : left.calledRoot.processInstanceId = right.calledRoot.processInstanceId) :
    left.caller = right.caller ∧ left.id.elementId.value = right.id.elementId.value := by
  have sameCall := calledProcessAssociationsValid_called_instance_injective state left right
    running valid leftMember rightMember same
  obtain ⟨leftId, ⟨leftCaller, leftPresent, leftEq, leftParent⟩, _⟩ :=
    call_caller_root state valid left leftMember
  obtain ⟨rightId, ⟨rightCaller, rightPresent, rightEq, rightParent⟩, _⟩ :=
    call_caller_root state valid right rightMember
  refine ⟨?_, congrArg (fun id => id.elementId.value) sameCall⟩
  rw [← leftEq, ← rightEq]
  apply calledProcessAssociationsValid_parentless_root_unique state instanceId running valid
    leftCaller rightCaller leftPresent rightPresent leftParent rightParent
  rw [leftEq, rightEq, ← leftId, ← rightId, sameCall]

/-- Called-instance seeds are duplicate-free by the actual caller/element census and root uniqueness. -/
theorem calledProcessAssociationsValid_called_instances_nodup (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true) :
    (state.calledProcessOccurrences.map (fun record => record.calledRoot.processInstanceId)).Nodup := by
  apply List.nodup_iff_count.mpr
  intro process
  by_cases member : process ∈ state.calledProcessOccurrences.map (fun record => record.calledRoot.processInstanceId)
  · obtain ⟨record, recordMember, rfl⟩ := List.mem_map.mp member
    have anchorCount := (call_caller_root state valid record recordMember).2.2
    have included : (state.calledProcessOccurrences.filter fun candidate =>
        decide (candidate.calledRoot.processInstanceId = record.calledRoot.processInstanceId)).Sublist
        (state.calledProcessOccurrences.filter fun candidate =>
          decide (candidate.caller = record.caller) &&
            decide (candidate.id.elementId.value = record.id.elementId.value)) := by
      apply List.Sublist.trans (l₂ := (state.calledProcessOccurrences.filter fun candidate =>
        decide (candidate.caller = record.caller) &&
          decide (candidate.id.elementId.value = record.id.elementId.value)).filter fun candidate =>
            decide (candidate.calledRoot.processInstanceId = record.calledRoot.processInstanceId))
      · have equal : (state.calledProcessOccurrences.filter fun candidate =>
            decide (candidate.calledRoot.processInstanceId = record.calledRoot.processInstanceId)) =
            (state.calledProcessOccurrences.filter fun candidate =>
              decide (candidate.caller = record.caller) &&
                decide (candidate.id.elementId.value = record.id.elementId.value)).filter fun candidate =>
                  decide (candidate.calledRoot.processInstanceId = record.calledRoot.processInstanceId) := by
          rw [List.filter_filter]
          apply List.filter_congr
          intro candidate candidateMember
          by_cases same : candidate.calledRoot.processInstanceId = record.calledRoot.processInstanceId
          · obtain ⟨caller, element⟩ := same_called_instance_anchor state instanceId running valid
              candidate record candidateMember recordMember same
            simp [same, caller, element]
          · simp [same]
        rw [equal]
        exact List.Sublist.refl _
      · exact List.filter_sublist
    have bounded := included.length_le
    rw [anchorCount] at bounded
    simpa only [List.count_eq_length_filter, List.filter_map, List.length_map,
      Function.comp_def, Bool.beq_eq_decide_eq] using bounded
  · simp [List.count_eq_zero_of_not_mem member]

/-- A selected parentless root contains every live scope of its exact Process instance. -/
theorem runtimePositionValid_same_instance_root_subtree (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) (root candidate : RuntimeScopeOccurrence)
    (rootMember : root ∈ state.scopeOccurrences) (candidateMember : candidate ∈ state.scopeOccurrences)
    (rootParent : root.parent = none)
    (sameInstance : root.id.processInstanceId = candidate.id.processInstanceId) :
    occurrenceInSubtree state.scopeOccurrences root.id candidate.id = true := by
  have live := (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
    state valid running candidate candidateMember).1
  obtain ⟨actualRoot, actualMember, actualParent, actualInstance, reaches⟩ :=
    runtimePositionValid_live_instance_root program expectedInstanceId instanceId state valid running
      candidate.id live
  have associations := runtimePositionValid_called_associations program expectedInstanceId instanceId
    state valid running
  have rootEq := calledProcessAssociationsValid_parentless_root_unique state instanceId running
    associations root actualRoot rootMember actualMember rootParent actualParent
    (sameInstance.trans actualInstance.symm)
  apply (occurrenceInSubtree_iff_ancestry state.scopeOccurrences
    (runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId state valid running)
    (runtimePositionValid_scope_parents_live program expectedInstanceId instanceId state valid running)
    root.id candidate.id).mpr
  exact rootEq ▸ reaches

/-- Different Process instances cannot substitute for a selected root, even with one definition scope. -/
theorem runtimePositionValid_different_instance_not_subtree (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId) (root candidate : ScopeOccurrenceId)
    (different : root.processInstanceId ≠ candidate.processInstanceId) :
    occurrenceInSubtree state.scopeOccurrences root candidate = false := by
  apply Bool.eq_false_iff.mpr
  intro success
  exact different (runtimePositionValid_scope_ancestry_instance program expectedInstanceId instanceId
    state valid running root candidate (occurrenceInSubtreeWithin_ancestry _ _ _ _ success))

/-- A disconnected parentless impostor with a different activation cannot reuse a valid instance. -/
theorem calledProcessAssociationsValid_parentless_activation_separates_instances (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (left right : RuntimeScopeOccurrence)
    (leftMember : left ∈ state.scopeOccurrences) (rightMember : right ∈ state.scopeOccurrences)
    (leftParent : left.parent = none) (rightParent : right.parent = none)
    (different : left.id.activation ≠ right.id.activation) :
    left.id.processInstanceId ≠ right.id.processInstanceId := by
  intro same
  exact different (congrArg ScopeOccurrenceId.activation
    (calledProcessAssociationsValid_parentless_root_unique state instanceId running valid
      left right leftMember rightMember leftParent rightParent same))

end BpmnSemantics.SemanticProcess
