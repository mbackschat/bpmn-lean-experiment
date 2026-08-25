import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws

/-! # Flow-node occurrence Process-identity proofs

Connects immutable definition-scope Process identity with the runtime owner identity already checked by flow-node occurrence projection. The production selectors remain in their owning modules.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem length_filter_strict_mono {values : List α} {left right : α → Bool}
    {witness : α} (included : ∀ value, left value → right value)
    (member : witness ∈ values) (leftRejects : ¬left witness)
    (rightAccepts : right witness) :
    (values.filter left).length < (values.filter right).length := by
  have sublist : List.Sublist (values.filter left) (values.filter right) := by
    apply List.Sublist.trans (l₂ := (values.filter right).filter left)
    · simp [Bool.and_eq_left_iff_imp.mpr (included _)]
    · exact List.filter_sublist
  apply Nat.lt_of_le_of_ne sublist.length_le
  intro equalLength
  apply leftRejects
  have equal := List.Sublist.eq_of_length sublist equalLength
  have accepted : witness ∈ values.filter right := List.mem_filter.mpr ⟨member, rightAccepts⟩
  rw [← equal, List.mem_filter] at accepted
  exact accepted.2

private noncomputable def graphReachesBool (edges : List (GraphEdge α))
    (source target : α) : Bool :=
  letI := Classical.propDecidable
  decide (GraphReaches edges source target)

private theorem graphReachesBool_eq_true_iff [DecidableEq α]
    (edges : List (GraphEdge α)) (source target : α) :
    graphReachesBool edges source target = true ↔ GraphReaches edges source target := by
  classical
  simp [graphReachesBool]

private noncomputable def definitionScopeAncestorRank (program : Program)
    (target : DefinitionScopeId) : Nat :=
  (program.definitionScopes.filter fun scope =>
    graphReachesBool (scopeEdges program) scope.id target).length

private theorem definitionScopes_sorted_of_programWellFormed (program : Program)
    (valid : programWellFormed program = true) :
    strictlySortedStrings (program.definitionScopes.map fun scope => scope.id.value) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

private theorem filter_eq_singleton_of_map_nodup [DecidableEq β]
    (values : List α) (key : α → β)
    (witness : α) (nodup : (values.map key).Nodup) (member : witness ∈ values) :
    values.filter (fun value => decide (key value = key witness)) = [witness] := by
  induction values with
  | nil => simp at member
  | cons current rest ih =>
      simp only [List.map_cons, List.nodup_cons] at nodup
      rcases List.mem_cons.mp member with rfl | member
      · have restRejected : rest.filter (fun value => decide (key value = key witness)) = [] :=
          List.filter_eq_nil_iff.mpr fun value valueMember accepted => by
            exact nodup.1 (of_decide_eq_true accepted ▸ List.mem_map.mpr
              ⟨value, valueMember, rfl⟩)
        simp [restRejected]
      · have currentRejected : decide (key current = key witness) = false := by
          apply Bool.eq_false_iff.mpr
          intro accepted
          exact nodup.1 (of_decide_eq_true accepted ▸ List.mem_map.mpr
            ⟨witness, member, rfl⟩)
        simp [currentRejected, ih nodup.2 member]

private theorem definitionScope_exact_of_member (program : Program)
    (valid : programWellFormed program = true) (scope : DefinitionScope)
    (member : scope ∈ program.definitionScopes) :
    definitionScope? program scope.id = some scope := by
  have idsNodup := strictlySortedStrings_nodup _
    (definitionScopes_sorted_of_programWellFormed program valid)
  unfold definitionScope?
  have singleton := filter_eq_singleton_of_map_nodup program.definitionScopes
    (fun candidate => candidate.id.value) scope idsNodup member
  have predicatesEqual : (fun candidate : DefinitionScope =>
      decide (candidate.id = scope.id)) =
      (fun candidate => decide (candidate.id.value = scope.id.value)) := by
    funext candidate
    apply decide_eq_decide.mpr
    constructor
    · exact fun equal => congrArg (fun id : DefinitionScopeId => id.value) equal
    · intro equal
      have candidateEta : candidate.id = ⟨candidate.id.value⟩ := by
        cases candidate.id
        rfl
      have scopeEta : scope.id = ⟨scope.id.value⟩ := by
        cases scope.id
        rfl
      exact candidateEta.trans ((congrArg DefinitionScopeId.mk equal).trans scopeEta.symm)
  rw [predicatesEqual, singleton]

private theorem scope_parent_edge (program : Program) (scope : DefinitionScope)
    (member : scope ∈ program.definitionScopes)
    (parentEq : scope.parentScopeId = some parent) :
    { source := parent, target := scope.id } ∈ scopeEdges program := by
  unfold scopeEdges
  exact List.mem_filterMap.mpr ⟨scope, member, by simp [parentEq]⟩

private theorem definitionScopeAncestorRank_parent_lt (program : Program)
    (forest : scopeForestWellFormed program = true) (scope : DefinitionScope)
    (scopeMember : scope ∈ program.definitionScopes)
    (parentEq : scope.parentScopeId = some parent) :
    definitionScopeAncestorRank program parent <
      definitionScopeAncestorRank program scope.id := by
  have edgeMember := scope_parent_edge program scope scopeMember parentEq
  have acyclic : acyclicClosed (scopeEdges program)
      (program.definitionScopes.map (·.id)).length = true := by
    simp only [scopeForestWellFormed, Bool.and_eq_true] at forest
    simpa using forest.2
  apply length_filter_strict_mono
  · intro candidate reachesParent
    apply (graphReachesBool_eq_true_iff _ _ _).mpr
    exact GraphReaches.step ((graphReachesBool_eq_true_iff _ _ _).mp reachesParent) edgeMember
  · exact scopeMember
  · intro reaches
    exact acyclicClosed_sound (scopeEdges program)
      (program.definitionScopes.map (·.id)).length acyclic _ edgeMember
      ((graphReachesBool_eq_true_iff _ _ _).mp reaches)
  · exact (graphReachesBool_eq_true_iff _ _ _).mpr (GraphReaches.refl scope.id)

private theorem processIdForDefinitionScopeWithFuel_mono (program : Program)
    (scopeId : DefinitionScopeId) :
    ∀ smaller larger processId,
      smaller ≤ larger →
      processIdForDefinitionScopeWithFuel? program smaller scopeId = some processId →
      processIdForDefinitionScopeWithFuel? program larger scopeId = some processId := by
  intro smaller
  induction smaller generalizing scopeId with
  | zero => simp [processIdForDefinitionScopeWithFuel?]
  | succ smaller ih =>
      intro larger processId le success
      cases larger with
      | zero => omega
      | succ larger =>
          simp only [processIdForDefinitionScopeWithFuel?] at success ⊢
          cases scopeEq : definitionScope? program scopeId with
          | none => simp [scopeEq] at success
          | some scope =>
              simp [scopeEq] at success ⊢
              cases parentEq : scope.parentScopeId with
              | none => simpa [parentEq] using success
              | some parent =>
                  simp only [parentEq] at success ⊢
                  exact ih parent larger processId (by omega) success

/-- Every admitted definition scope resolves to its immutable root Process identity. -/
theorem candidateProcessIdForDefinitionScope_total (program : Program)
    (valid : programWellFormed program = true) (scope : DefinitionScope)
    (scopeMember : scope ∈ program.definitionScopes) :
    ∃ processId,
      candidateProcessIdForDefinitionScope? program scope.id = some processId := by
  have forest := programWellFormed_scopeForest program valid
  have exactScope := definitionScope_exact_of_member program valid scope scopeMember
  have ranked : ∀ rank scope,
      definitionScopeAncestorRank program scope.id = rank →
      scope ∈ program.definitionScopes →
      ∃ processId,
        processIdForDefinitionScopeWithFuel? program (rank + 1) scope.id = some processId := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
        intro current rankEq currentMember
        have currentExact := definitionScope_exact_of_member program valid current currentMember
        cases parentEq : current.parentScopeId with
        | none =>
            refine ⟨⟨current.originElementId.value⟩, ?_⟩
            simp [processIdForDefinitionScopeWithFuel?, currentExact, parentEq]
        | some parent =>
            have parentMember : parent ∈ program.definitionScopes.map (·.id) := by
              simp only [scopeForestWellFormed, Bool.and_eq_true] at forest
              have currentValid := List.all_eq_true.mp forest.1.2 current currentMember
              simp [parentEq] at currentValid
              exact List.mem_map.mpr currentValid.2
            obtain ⟨parentScope, parentScopeMember, parentScopeId⟩ := List.mem_map.mp parentMember
            have rankLt := definitionScopeAncestorRank_parent_lt program forest current
              currentMember parentEq
            have parentRankLt : definitionScopeAncestorRank program parentScope.id < rank := by
              simpa [parentScopeId, rankEq] using rankLt
            have parentResult := ih (definitionScopeAncestorRank program parentScope.id)
              parentRankLt parentScope rfl parentScopeMember
            obtain ⟨processId, parentResult⟩ := parentResult
            refine ⟨processId, ?_⟩
            simp [processIdForDefinitionScopeWithFuel?, currentExact, parentEq]
            apply processIdForDefinitionScopeWithFuel_mono program parent
              (definitionScopeAncestorRank program parentScope.id + 1) rank processId
            · omega
            · simpa [parentScopeId] using parentResult
  obtain ⟨processId, rankedResult⟩ := ranked
    (definitionScopeAncestorRank program scope.id) scope rfl scopeMember
  refine ⟨processId, ?_⟩
  unfold candidateProcessIdForDefinitionScope?
  apply processIdForDefinitionScopeWithFuel_mono program scope.id
    (definitionScopeAncestorRank program scope.id + 1)
    (program.definitionScopes.length + 1) processId
  · unfold definitionScopeAncestorRank
    have := List.length_filter_le (fun candidate : DefinitionScope =>
      graphReachesBool (scopeEdges program) candidate.id scope.id)
      program.definitionScopes
    omega
  · exact rankedResult

private theorem processId_eq_of_value_eq (left right : ProcessId)
    (equal : left.value = right.value) : left = right := by
  have leftEta : left = ⟨left.value⟩ := by cases left; rfl
  have rightEta : right = ⟨right.value⟩ := by cases right; rfl
  exact leftEta.trans ((congrArg ProcessId.mk equal).trans rightEta.symm)

/-- The immutable definition-scope Process identity agrees with an exact live runtime owner. -/
theorem candidateProcessIdForDefinitionScope_eq_processIdForOwner (program : Program)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (processId : ProcessId)
    (instanceId : SemanticId) (programValid : programWellFormed program = true)
    (running : state.control = .running instanceId)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (live : exactLiveOccurrence state owner = true)
    (runtimeProcess : processIdForOwner? program state owner = some processId) :
    candidateProcessIdForDefinitionScope? program owner.definitionScopeId = some processId := by
  have forest := programWellFormed_scopeForest program programValid
  have ranked : ∀ rank current definition,
      definitionScopeAncestorRank program definition.id = rank →
      definition ∈ program.definitionScopes →
      definition.id = current.definitionScopeId →
      exactLiveOccurrence state current = true →
      processIdForOwner? program state current = some processId →
      processIdForDefinitionScopeWithFuel? program (rank + 1) definition.id = some processId := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
        intro current definition rankEq definitionMember definitionId currentLive currentProcess
        have currentExact := definitionScope_exact_of_member program programValid definition
          definitionMember
        have currentOwnerLive : flowNodeOccurrenceOwnerLiveUnique state current = true := by
          simpa [exactLiveOccurrence, flowNodeOccurrenceOwnerLiveUnique] using currentLive
        rcases flowNodeOccurrenceStructuralProgramValidity_live_owner_process_binding
            program state current instanceId structural running currentLive with
          nested | hosting | called
        · obtain ⟨_, parent, selectedDefinition, _, _, _, selectedMember, selectedId,
              selectedParent, sameInstance, parentLive⟩ := nested
          have selectedExact := definitionScope_exact_of_member program programValid
            selectedDefinition selectedMember
          have selectedDefinitionEq : selectedDefinition = definition := by
            rw [selectedId, ← definitionId, currentExact] at selectedExact
            exact Option.some.inj selectedExact.symm
          subst selectedDefinition
          have parentMember : parent.definitionScopeId ∈
              program.definitionScopes.map (·.id) := by
            have forestFacts := forest
            simp only [scopeForestWellFormed, Bool.and_eq_true] at forestFacts
            have definitionValid := List.all_eq_true.mp forestFacts.1.2 definition definitionMember
            simp [selectedParent] at definitionValid
            exact List.mem_map.mpr definitionValid.2
          obtain ⟨parentDefinition, parentDefinitionMember, parentDefinitionId⟩ :=
            List.mem_map.mp parentMember
          have parentRankLt := definitionScopeAncestorRank_parent_lt program forest definition
            definitionMember selectedParent
          have parentRankLt' : definitionScopeAncestorRank program parentDefinition.id < rank := by
            simpa [parentDefinitionId, rankEq] using parentRankLt
          have parentCurrentLive : exactLiveOccurrence state parent = true := by
            simpa [exactLiveOccurrence, flowNodeOccurrenceOwnerLiveUnique] using parentLive
          have parentProcess : processIdForOwner? program state parent = some processId := by
            simpa [processIdForOwner?, hostingInstanceId?, running, currentOwnerLive,
              parentLive, sameInstance] using currentProcess
          have parentResult := ih (definitionScopeAncestorRank program parentDefinition.id)
            parentRankLt' parent parentDefinition rfl parentDefinitionMember
            parentDefinitionId parentCurrentLive parentProcess
          simp [processIdForDefinitionScopeWithFuel?, currentExact, selectedParent]
          apply processIdForDefinitionScopeWithFuel_mono program parent.definitionScopeId
            (definitionScopeAncestorRank program parentDefinition.id + 1) rank processId
          · omega
          · simpa [parentDefinitionId] using parentResult
        · obtain ⟨hostingInstance, selectedDefinition, selectedMember, selectedId,
              rootParent, rootProcess⟩ := hosting
          have selectedExact := definitionScope_exact_of_member program programValid
            selectedDefinition selectedMember
          have selectedDefinitionEq : selectedDefinition = definition := by
            rw [selectedId, ← definitionId, currentExact] at selectedExact
            exact Option.some.inj selectedExact.symm
          subst selectedDefinition
          have runtimeEq : program.processId = processId := by
            simpa [processIdForOwner?, hostingInstanceId?, running, currentOwnerLive,
              hostingInstance] using currentProcess
          simp [processIdForDefinitionScopeWithFuel?, currentExact, rootParent]
          apply processId_eq_of_value_eq
          exact rootProcess.trans (congrArg ProcessId.value runtimeEq)
        · obtain ⟨record, selectedDefinition, recordMember, rootEq, notHosting,
              selectedMember, selectedId, rootParent, recordProcess⟩ := called
          have selectedExact := definitionScope_exact_of_member program programValid
            selectedDefinition selectedMember
          have selectedDefinitionEq : selectedDefinition = definition := by
            rw [selectedId, ← definitionId, currentExact] at selectedExact
            exact Option.some.inj selectedExact.symm
          subst selectedDefinition
          have recordFiltered : record ∈ state.calledProcessOccurrences.filter fun candidate =>
              decide (candidate.calledRoot.processInstanceId = current.processInstanceId) := by
            apply List.mem_filter.mpr
            exact ⟨recordMember, by simp [rootEq]⟩
          unfold processIdForOwner? at currentProcess
          simp only [hostingInstanceId?, running] at currentProcess
          simp [currentOwnerLive, notHosting] at currentProcess
          generalize recordsEq : (state.calledProcessOccurrences.filter fun candidate =>
            decide (candidate.calledRoot.processInstanceId = current.processInstanceId)) =
              records at currentProcess recordFiltered
          cases records with
          | nil => simp at currentProcess
          | cons selected rest =>
              cases rest with
              | cons other tail => simp at currentProcess
              | nil =>
                  simp at recordFiltered
                  subst selected
                  simp only at currentProcess
                  have selectedProcess := Option.some.inj currentProcess
                  simp [processIdForDefinitionScopeWithFuel?, currentExact, rootParent]
                  apply processId_eq_of_value_eq
                  exact recordProcess.symm.trans (congrArg ProcessId.value selectedProcess)
  have definitionMember : owner.definitionScopeId ∈ program.definitionScopes.map (·.id) := by
    have binding := flowNodeOccurrenceStructuralProgramValidity_live_owner_process_binding
      program state owner instanceId structural running live
    rcases binding with nested | hosting | called
    · obtain ⟨_, _, definition, _, _, _, member, id, _⟩ := nested
      exact List.mem_map.mpr ⟨definition, member, id⟩
    · obtain ⟨_, definition, member, id, _⟩ := hosting
      exact List.mem_map.mpr ⟨definition, member, id⟩
    · obtain ⟨_, definition, _, _, _, member, id, _⟩ := called
      exact List.mem_map.mpr ⟨definition, member, id⟩
  obtain ⟨definition, definitionMember, definitionId⟩ := List.mem_map.mp definitionMember
  have rankedResult := ranked (definitionScopeAncestorRank program definition.id) owner
    definition rfl definitionMember definitionId live runtimeProcess
  unfold candidateProcessIdForDefinitionScope?
  apply processIdForDefinitionScopeWithFuel_mono program owner.definitionScopeId
    (definitionScopeAncestorRank program definition.id + 1)
    (program.definitionScopes.length + 1) processId
  · unfold definitionScopeAncestorRank
    have lengthBound := List.length_filter_le (fun candidate : DefinitionScope =>
      graphReachesBool (scopeEdges program) candidate.id definition.id)
      program.definitionScopes
    omega
  · simpa [definitionId] using rankedResult

end BpmnSemantics.SemanticProcess
