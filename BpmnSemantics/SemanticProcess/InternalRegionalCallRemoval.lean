import BpmnSemantics.SemanticProcess.InternalRegionalRemovalAgreement
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Prepared regions and actual Call cleanup

Call return removes a directed Process-instance tree. The Internal Commutation account instead
records exact scope-occurrence regions; predecessor ownership connects these two deletion masks.
Quiescence separately constrains the region selected by a normal completion or Return.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- A quiescent root has no outgoing parent or Call ownership edge, so its successful prepared
region contains only that root. This follows from the actual selector's predicate, not a footprint
assumption supplied by a commutation theorem. -/
theorem quiescent_prepared_region_singleton (state : RuntimeState) (root : ScopeOccurrenceId)
    (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (quiet : scopeQuiescent state root = true) : region.members = [root] := by
  obtain ⟨_, seed, unique, _, _, least⟩ :=
    deriveInternalOccurrenceRegion_spec state root region prepared
  have noEdge : ∀ target, ¬OccurrenceRegionEdge state root target := by
    intro target edge
    simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true', and_assoc] at quiet
    rcases edge with ⟨occurrence, member, parent, _⟩ | ⟨record, member, caller, _⟩
    · have present : (state.scopeOccurrences.any fun occurrence =>
          occurrence.parent == some root) = true :=
        List.any_eq_true.mpr ⟨occurrence, member, by simp [parent]⟩
      rw [present] at quiet
      simp at quiet
    · have present : (state.calledProcessOccurrences.any fun record => record.caller == root) =
          true := List.any_eq_true.mpr ⟨record, member, by simp [caller]⟩
      rw [present] at quiet
      simp at quiet
  have onlyRoot : ∀ value ∈ region.members, value = root := by
    apply least (fun value => value = root) rfl
    intro source target same edge
    exact False.elim (noEdge target (same ▸ edge))
  cases members : region.members with
  | nil => simp [members] at seed
  | cons first rest =>
      have firstRoot := onlyRoot first (by simp [members])
      have fresh := (List.nodup_cons.mp (members ▸ unique)).1
      have empty : rest = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro value member
        have same := onlyRoot value (by simp [members, member])
        exact fresh (same.trans firstRoot.symm ▸ member)
      simp [firstRoot, empty]

/-- Every live occurrence has exactly the same membership in the prepared root region and in
the actual forward Call-instance traversal, with each evaluator's own population fuel. -/
theorem regional_called_tree_mask (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region)
    (rootLive : root ∈ state.scopeOccurrences) (rootParent : root.parent = none)
    (candidate : ScopeOccurrenceId) (live : candidate ∈ state.scopeOccurrences.map (·.id)) :
    (processInstanceClosureWithin state.calledProcessOccurrences [root.id.processInstanceId]
      (state.calledProcessOccurrences.length + 1)).contains candidate.processInstanceId =
      region.contains candidate := by
  apply Bool.eq_iff_iff.mpr
  simpa only [InternalOccurrenceRegion.contains, List.contains_iff_mem] using
    (regional_called_tree_membership program state expectedInstanceId instanceId valid running
      root region prepared rootLive rootParent candidate live).symm

private theorem live_scope_member (state : RuntimeState) (owner : ScopeOccurrenceId)
    (live : exactLiveOccurrence state owner = true) : owner ∈ state.scopeOccurrences.map (·.id) := by
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
  have selected : occurrence ∈ state.scopeOccurrences.filter
      (fun value => decide (value.id = owner)) := by rw [singleton]; simp
  obtain ⟨member, identity⟩ := List.mem_filter.mp selected
  exact List.mem_map.mpr ⟨occurrence, member, of_decide_eq_true identity⟩

private theorem called_owned_filter {α : Type} (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region)
    (rootLive : root ∈ state.scopeOccurrences) (rootParent : root.parent = none)
    (values : List α) (owner : α → ScopeOccurrenceId)
    (live : values.all (fun value => exactLiveOccurrence state (owner value)) = true) :
    values.filter (fun value =>
      !(processInstanceClosureWithin state.calledProcessOccurrences [root.id.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains (owner value).processInstanceId) =
      values.filter (fun value => !region.contains (owner value)) := by
  apply List.filter_congr
  intro value member
  exact congrArg Bool.not (regional_called_tree_mask program state expectedInstanceId instanceId
    valid running root region prepared rootLive rootParent (owner value)
    (live_scope_member state (owner value) (List.all_eq_true.mp live value member)))

/-- Actual Call cleanup uses the prepared region for every directly scope-owned work collection;
no successor state or computed-filter equality is an input to these laws. -/
theorem removeCalledProcessTree_owned_fields_eq_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (record : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (rootId : root.id = record.calledRoot) (rootLive : root ∈ state.scopeOccurrences)
    (rootParent : root.parent = none) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region) :
    (removeCalledProcessTree state record).scopeOccurrences =
        state.scopeOccurrences.filter (fun occurrence => !region.contains occurrence.id) ∧
      (removeCalledProcessTree state record).tokens =
        state.tokens.filter (fun token => !region.contains token.owner) ∧
      (removeCalledProcessTree state record).waits =
        state.waits.filter (fun wait => !region.contains wait.owner) ∧
      (removeCalledProcessTree state record).messageWaits =
        state.messageWaits.filter (fun wait => !region.contains wait.owner) ∧
      (removeCalledProcessTree state record).timerWaits =
        state.timerWaits.filter (fun wait => !region.contains wait.owner) ∧
      (removeCalledProcessTree state record).effectWaits =
        state.effectWaits.filter (fun wait => !region.contains wait.owner) ∧
      (removeCalledProcessTree state record).effectIncidents =
        state.effectIncidents.filter (fun incident => !region.contains incident.wait.owner) ∧
      (removeCalledProcessTree state record).activityOccurrences =
        state.activityOccurrences.filter (fun activity => !region.contains activity.owner) ∧
      (removeCalledProcessTree state record).selectedBranchSets =
        state.selectedBranchSets.filter (fun selection => !region.contains selection.owner) ∧
      (removeCalledProcessTree state record).eventRaces =
        state.eventRaces.filter (fun race => !region.contains race.owner) := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
  have owners := valid.2.2.2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  have scopesLive : state.scopeOccurrences.all (fun occurrence =>
      exactLiveOccurrence state occurrence.id) = true := by
    exact List.all_eq_true.mpr fun occurrence member =>
      (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId state
        valid.1 running occurrence member).1
  have tokensLive : state.tokens.all (fun token => exactLiveOccurrence state token.owner) = true :=
    List.all_eq_true.mpr fun token member => runtimePositionValid_token_owner_live program
      expectedInstanceId instanceId state token valid.1 running member
  simp only [removeCalledProcessTree, ← rootId]
  exact ⟨called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.scopeOccurrences (·.id) scopesLive,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.tokens (·.owner) tokensLive,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.waits (·.owner) owners.1,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.messageWaits (·.owner) owners.2.1,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.timerWaits (·.owner) owners.2.2.1,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.effectWaits (·.owner) owners.2.2.2.1,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.effectIncidents (·.wait.owner) owners.2.2.2.2.1,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.activityOccurrences (·.owner) owners.2.2.2.2.2.2.2.2,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.selectedBranchSets (·.owner) owners.2.2.2.2.2.1,
    called_owned_filter program state expectedInstanceId instanceId valid.1 running root region
      prepared rootLive rootParent state.eventRaces (·.owner) owners.2.2.2.2.2.2.1⟩

/-- Call associations retain the evaluator's selected-identity exclusion and remove associations
whose caller or called root lies in the prepared region. Both endpoints are live by the existing
predecessor checks; incoming and outgoing edges are not conflated. -/
theorem removeCalledProcessTree_calls_eq_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (record : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (rootId : root.id = record.calledRoot) (rootLive : root ∈ state.scopeOccurrences)
    (rootParent : root.parent = none) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region) :
    (removeCalledProcessTree state record).calledProcessOccurrences =
      state.calledProcessOccurrences.filter fun candidate => decide (candidate.id ≠ record.id) &&
        !region.contains candidate.caller && !region.contains candidate.calledRoot := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
  have owners := valid.2.2.2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  have graph := (deriveInternalOccurrenceRegion_success state root.id region prepared).1
  apply List.filter_congr
  intro candidate member
  have callerLive := live_scope_member state candidate.caller
    (List.all_eq_true.mp owners.2.2.2.2.2.2.2.1 candidate member)
  have calledLive := scopeOwnershipGraphExact_target_live state graph candidate.caller
    candidate.calledRoot (.inr ⟨candidate, member, rfl, rfl⟩)
  have callerMask := regional_called_tree_mask program state expectedInstanceId instanceId valid.1
    running root region prepared rootLive rootParent candidate.caller callerLive
  have calledMask := regional_called_tree_mask program state expectedInstanceId instanceId valid.1
    running root region prepared rootLive rootParent candidate.calledRoot calledLive
  dsimp only
  rw [← rootId, callerMask, calledMask]

/-- A parentless root's region represents complete Process instances. Its instance projection
therefore also classifies data and historical records that need not name a currently live scope. -/
theorem regional_called_instance_membership (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (rootLive : root ∈ state.scopeOccurrences)
    (rootParent : root.parent = none) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region)
    (candidate : SemanticId) :
    candidate ∈ region.members.map (·.processInstanceId) ↔
      candidate ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [root.id.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
  have owners := valid.2.2.2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  obtain ⟨_, seed, _, regionLive, edgeClosed, _⟩ :=
    deriveInternalOccurrenceRegion_spec state root.id region prepared
  have scopeMembership := regional_called_tree_membership program state expectedInstanceId instanceId
    valid.1 running root region prepared rootLive rootParent
  have forward : ∀ queried, queried ∈ region.members.map (·.processInstanceId) →
      queried ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [root.id.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
    intro queried member
    obtain ⟨scope, scopeMember, same⟩ := List.mem_map.mp member
    exact same ▸ (scopeMembership scope (regionLive scopeMember)).mp scopeMember
  refine ⟨forward candidate, ?_⟩
  apply processInstanceClosureWithin_least state.calledProcessOccurrences
    [root.id.processInstanceId] (state.calledProcessOccurrences.length + 1)
    (fun queried => queried ∈ region.members.map (·.processInstanceId))
  · intro queried member
    have same := List.mem_singleton.mp member
    exact same ▸ List.mem_map.mpr ⟨root.id, seed, rfl⟩
  · intro record member callerReached
    have callerLive := live_scope_member state record.caller
      (List.all_eq_true.mp owners.2.2.2.2.2.2.2.1 record member)
    have callerInRegion := (scopeMembership record.caller callerLive).mpr
      (forward record.caller.processInstanceId callerReached)
    exact List.mem_map.mpr ⟨record.calledRoot,
      edgeClosed record.caller callerInRegion record.calledRoot
        (.inr ⟨record, member, rfl, rfl⟩), rfl⟩

/-- Instance-owned Call cleanup includes historical Compensation owners and Activity data.
The region's complete-instance projection, rather than a live-scope assumption, determines those
fields; parent-context records still check both the parent and its containing root. -/
theorem removeCalledProcessTree_instance_fields_eq_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (record : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (rootId : root.id = record.calledRoot) (rootLive : root ∈ state.scopeOccurrences)
    (rootParent : root.parent = none) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region) :
    let instances := region.members.map (·.processInstanceId)
    (removeCalledProcessTree state record).sequentialMultiInstanceControllers =
        state.sequentialMultiInstanceControllers.filter
          (fun controller => !instances.contains controller.processInstanceId) ∧
      (removeCalledProcessTree state record).parallelMultiInstanceControllers =
        state.parallelMultiInstanceControllers.filter
          (fun controller => !instances.contains controller.id.processInstanceId) ∧
      (removeCalledProcessTree state record).variables.activities =
        state.variables.activities.filter
          (fun activity => !instances.contains activity.owner.processInstanceId) ∧
      (removeCalledProcessTree state record).compensationActivityRetentions =
        state.compensationActivityRetentions.filter
          (fun retention => !instances.contains retention.owner.processInstanceId) ∧
      (removeCalledProcessTree state record).compensationParentContextRetentions =
        state.compensationParentContextRetentions.filter (fun retention =>
          let parent := match retention with
            | .provisional parent _ | .promoted parent _ _ => parent
          !instances.contains parent.id.processInstanceId &&
            parent.parent.all (fun owner => !instances.contains owner.processInstanceId)) ∧
      (removeCalledProcessTree state record).compensationTriggers =
        state.compensationTriggers.filter
          (fun trigger => !instances.contains trigger.owner.processInstanceId) ∧
      (removeCalledProcessTree state record).compensationHandlerEffectWaits =
        state.compensationHandlerEffectWaits.filter (fun wait =>
          !instances.contains wait.id.processInstanceId &&
            !instances.contains wait.triggerId.processInstanceId &&
            !instances.contains wait.handlerId.processInstanceId) := by
  have instanceMask : ∀ candidate,
      (processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains candidate =
        (region.members.map (·.processInstanceId)).contains candidate := by
    intro candidate
    apply Bool.eq_iff_iff.mpr
    simpa only [List.contains_iff_mem, rootId] using
      (regional_called_instance_membership program state expectedInstanceId instanceId valid running
        root rootLive rootParent region prepared candidate).symm
  simp only [removeCalledProcessTree, instanceMask, and_self, true_and, and_true]
  rfl

/-- Call cleanup leaves the hosting lifecycle unchanged; Return emits its continuation separately. -/
theorem removeCalledProcessTree_preserves_control (state : RuntimeState)
    (record : CalledProcessOccurrence) :
    (removeCalledProcessTree state record).control = state.control ∧
      (removeCalledProcessTree state record).initiationPending = state.initiationPending := ⟨rfl, rfl⟩

/-- Removing called work retains issuance history even when no corresponding live record remains. -/
theorem removeCalledProcessTree_preserves_issuance (state : RuntimeState)
    (record : CalledProcessOccurrence) :
    (removeCalledProcessTree state record).activations = state.activations ∧
      (removeCalledProcessTree state record).messageActivations = state.messageActivations ∧
      (removeCalledProcessTree state record).timerActivations = state.timerActivations ∧
      (removeCalledProcessTree state record).effectActivations = state.effectActivations ∧
      (removeCalledProcessTree state record).scopeActivations = state.scopeActivations ∧
      (removeCalledProcessTree state record).eventRaceActivations = state.eventRaceActivations ∧
      (removeCalledProcessTree state record).callActivations = state.callActivations ∧
      (removeCalledProcessTree state record).activityActivations = state.activityActivations ∧
      (removeCalledProcessTree state record).variables.process = state.variables.process ∧
      (removeCalledProcessTree state record).logicalTimeMs = state.logicalTimeMs ∧
      (removeCalledProcessTree state record).endOccurrences = state.endOccurrences := by
  simp [removeCalledProcessTree]

end BpmnSemantics.SemanticProcess
