import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalPreparationFrame
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames

/-! Regional/arming frames reuse the owner-aware footprint and exact regional observation
filters. The consumed token's complete place census protects preparation across cancellation. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem arming_ordinary_read_subset (arm : PreparedInternalArming) :
    (footprintOfPatch arm.scopeFramePatch).reads ⊆ arm.stateFootprint.reads := by
  cases arm with
  | ordinary operation patch => exact fun _ member => member
  | data contract patch => exact ordinary_reads_subset_data_reads contract patch

theorem arming_regional_read_separation (footprint : InternalRegionalStateFootprint)
    (arm : PreparedInternalArming)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (written : InternalRegionalStateAtom) (read : InternalStateAtom)
    (writes : written ∈ footprint.writes) (reads : read ∈ arm.stateFootprint.reads) :
    regionalStateAtomsConflict written (liftRegionalStateAtom arm.scopeFramePatch.owner read) = false :=
  regional_independent_read_write _ _ independent _ _ writes
    (List.mem_map.mpr ⟨_, reads, rfl⟩)

theorem arming_regional_scope_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (arm : PreparedInternalArming)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    region.contains arm.scopeFramePatch.owner = false := by
  have read : .scopeOccurrence arm.scopeFramePatch.owner ∈ arm.stateFootprint.reads := by
    apply arming_ordinary_read_subset arm
    simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
  have conflict := arming_regional_read_separation footprint arm independent _ _
    (regionalStateFootprint_region_write state selected region footprint found) read
  simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom,
    regionalOwnsOrdinaryAtom] using conflict

theorem arming_regional_control_not_written (footprint : InternalRegionalStateFootprint)
    (arm : PreparedInternalArming)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    .ordinary (.runtimeControl arm.scopeFramePatch.runtimeInstanceId) ∉ footprint.writes := by
  intro written
  have read : .runtimeControl arm.scopeFramePatch.runtimeInstanceId ∈ arm.stateFootprint.reads := by
    apply arming_ordinary_read_subset arm
    simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
  have conflict := arming_regional_read_separation footprint arm independent _ _ written read
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

theorem arming_regional_input_not_written (footprint : InternalRegionalStateFootprint)
    (arm : PreparedInternalArming)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    .ordinary (.tokenOwners arm.scopeFramePatch.input) ∉ footprint.writes := by
  intro written
  have conflict := arming_regional_read_separation footprint arm independent _ _ written
    (scopeArming_input_read arm)
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

theorem arming_regional_control_frame (program : Program) (before after : RuntimeState)
    (regionalOperation : SemanticOperation) (regional : PreparedInternalRegional)
    (arm : PreparedInternalArming)
    (valid : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (running : before.control = .running arm.scopeFramePatch.runtimeInstanceId)
    (found : prepareInternalRegional? program before regionalOperation = some regional)
    (applied : applyPreparedInternalRegional? program before regional = some after)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true) :
    after.control = before.control ∧ after.logicalTimeMs = before.logicalTimeMs ∧
      after.variables.process = before.variables.process ∧
      after.scopeOccurrences.filter (fun scope => decide (scope.id = arm.scopeFramePatch.owner)) =
        before.scopeOccurrences.filter (fun scope => decide (scope.id = arm.scopeFramePatch.owner)) ∧
      after.tokens.filter (fun token => decide (token.placeId = arm.scopeFramePatch.input)) =
        before.tokens.filter (fun token => decide (token.placeId = arm.scopeFramePatch.input)) := by
  have footprint := (prepareInternalRegional_facts program before regionalOperation regional found).2.2.2.2.2.1
  have outside := arming_regional_scope_outside before regional.selection regional.region
    regional.footprint arm footprint independent
  have untouched := arming_regional_input_not_written regional.footprint arm independent
  have removed := (preparedRegional_removed_censuses program before regionalOperation regional found).1
  have frame := preparedRegional_control_filters program before after
    arm.scopeFramePatch.runtimeInstanceId regionalOperation regional valid running found applied
    (fun scope => decide (scope.id = arm.scopeFramePatch.owner))
    (fun token => decide (token.placeId = arm.scopeFramePatch.input)) (fun _ => false)
    (by
      intro scope _ seen
      have same : scope.id = arm.scopeFramePatch.owner := by simpa using seen
      simpa [same] using outside)
    (by
      intro token member seen
      have same : token.placeId = arm.scopeFramePatch.input := by simpa using seen
      apply Bool.eq_false_iff.mpr
      intro inside
      exact untouched (same ▸ removed token member inside))
    (by simp)
    (by
      intro owner output _ written
      apply Bool.eq_false_iff.mpr
      intro seen
      have same : output = arm.scopeFramePatch.input := by simpa using seen
      exact untouched (same ▸ written))
    (arming_regional_control_not_written regional.footprint arm independent)
  exact ⟨frame.1, frame.2.1, frame.2.2.1, frame.2.2.2.1, frame.2.2.2.2.1⟩

/-- Regional retirement can delete live resources but cannot issue an arming identity or
introduce a collision. This is the shared freshness fact for ordinary and data preparations. -/
structure RegionalArmingRetirement (before after : RuntimeState) : Prop where
  tasks : after.activations = before.activations
  messages : after.messageActivations = before.messageActivations
  timers : after.timerActivations = before.timerActivations
  effects : after.effectActivations = before.effectActivations
  activities : after.activityActivations = before.activityActivations
  taskWaits : after.waits ⊆ before.waits
  messageWaits : after.messageWaits ⊆ before.messageWaits
  timerWaits : after.timerWaits ⊆ before.timerWaits
  effectWaits : after.effectWaits ⊆ before.effectWaits
  incidents : after.effectIncidents ⊆ before.effectIncidents
  records : after.activityOccurrences ⊆ before.activityOccurrences
  locals : after.variables.activities ⊆ before.variables.activities

private theorem ordinaryCompletion_arming_retirement (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (result : completeScopeState? before definition output = some after) :
    RegionalArmingRetirement before after := by
  unfold completeScopeState? at result
  split at result
  · split at result
    · simp at result
    · unfold completeQuiescentScope? at result
      repeat' split at result
      all_goals first
        | (simp at result; done)
        | (simp only [Option.some.injEq] at result; subst after
           constructor <;> first | rfl | exact List.Subset.refl _)
  · simp at result

private theorem boundedCompletion_arming_retirement (program : Program)
    (before after : RuntimeState) (definition : DefinitionScopeId)
    (output : Option ControlPlaceId)
    (result : completeBoundedScope? program before definition output = some after) :
    RegionalArmingRetirement before after := by
  unfold completeBoundedScope? at result
  cases completed : completeScopeState? before definition output with
  | none => simp [completed] at result
  | some ordinary =>
    have frame := ordinaryCompletion_arming_retirement before ordinary definition output completed
    simp only [completed] at result
    repeat' split at result
    all_goals first
      | (simp at result; done)
      | (simp only [Option.some.injEq] at result; subst after
         first
         | exact frame
         | exact ⟨frame.tasks, frame.messages, frame.timers, frame.effects, frame.activities,
             frame.taskWaits, frame.messageWaits, List.Subset.trans List.erase_subset frame.timerWaits,
             frame.effectWaits, frame.incidents,
             (fun _ member => frame.records (List.mem_filter.mp member).1), frame.locals⟩)

theorem preparedRegional_arming_retirement (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after) :
    RegionalArmingRetirement before after := by
  obtain ⟨snapshots, _, _, closed, _, _, _⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  cases operation with
  | returnProcess id origin process definition output =>
      have raw : returnProcessState? before id origin process definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      cases returnProcessState_sound before after id origin process definition output raw
      constructor <;> first | rfl | exact fun _ member => (List.mem_filter.mp member).1
  | completeScope id origin definition output =>
      apply boundedCompletion_arming_retirement program before after definition output
      simp only [fire?, snapshots] at fired
      exact fired
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨_, _, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler prepared.selection selected raw
      rw [update]
      constructor <;> first | rfl | exact fun _ member => (List.mem_filter.mp member).1
  | terminateScope id origin input definition =>
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨chosen, _⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selected
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      constructor <;> first | rfl | exact fun _ member => (List.mem_filter.mp member).1
  | _ => simp [selectInternalRegional?] at selected

theorem RegionalArmingRetirement.anchor_subset {before after : RuntimeState}
    (frame : RegionalArmingRetirement before after) :
    openWaitAnchors after ⊆ openWaitAnchors before := by
  have append {α : Type} {a b c d : List α} (left : a ⊆ b) (right : c ⊆ d) :
      a ++ c ⊆ b ++ d := by
    intro value member
    exact (List.mem_append.mp member).elim
      (fun found => List.mem_append_left _ (left found))
      (fun found => List.mem_append_right _ (right found))
  exact append (append (append (append (List.map_subset _ frame.taskWaits)
    (List.map_subset _ frame.messageWaits)) (List.map_subset _ frame.timerWaits))
    (List.map_subset _ frame.effectWaits)) (List.map_subset _ frame.incidents)

theorem RegionalArmingRetirement.anchor_absent {before after : RuntimeState}
    (frame : RegionalArmingRetirement before after) (occurrence : OccurrenceId)
    (absent : openWaitAnchorAbsent before occurrence = true) :
    openWaitAnchorAbsent after occurrence = true := by
  simp only [openWaitAnchorAbsent, Bool.not_eq_true'] at absent ⊢
  apply Bool.eq_false_iff.mpr
  intro present
  have previous := List.contains_iff_mem.mpr (frame.anchor_subset (List.contains_iff_mem.mp present))
  rw [absent] at previous
  contradiction

theorem RegionalArmingRetirement.available {before after : RuntimeState}
    (frame : RegionalArmingRetirement before after) (write : InternalArmingWrite)
    (available : write.available before = true) : write.available after = true := by
  cases write with
  | effect wait bindings =>
    simp only [InternalArmingWrite.available, Bool.not_eq_true'] at available ⊢
    exact List.any_eq_false.mpr fun value member =>
      (List.any_eq_false.mp available) value (frame.locals member)
  | _ => rfl

theorem prepareInternalArm_retirement_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (found : prepareInternalArm? program before operation = some patch)
    (retirement : RegionalArmingRetirement before after)
    (owner : onlyTokenOwner? after patch.input = some patch.owner)
    (live : exactLiveOccurrence after patch.owner = true)
    (control : after.control = before.control)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (process : after.variables.process = before.variables.process) :
    prepareInternalArm? program after operation = some patch := by
  have input := prepareInternalArm_input program before operation patch found
  have previousOwner := prepared_owner_lookup program before operation patch found
  have previousLive := (prepared_arm_live_running program before operation patch found).1
  unfold prepareInternalArm? at found ⊢
  simp only [input, bind, Option.bind] at found ⊢
  obtain ⟨origin, originFound, found⟩ := Option.bind_eq_some_iff.mp found
  rw [originFound]
  dsimp only [Option.bind_some]
  simp only [previousOwner, owner, previousLive, live,
    Bool.not_true, Bool.or_false] at found ⊢
  split at found
  · simp at found
  · rename_i selected
    rw [if_neg selected]
    dsimp only [Pure.pure, Bind.bind, Option.bind] at found ⊢
    obtain ⟨inputOrigin, originFound, found⟩ := Option.bind_eq_some_iff.mp found
    rw [originFound]
    dsimp only [Option.bind_some]
    rw [control]
    cases running : before.control <;> simp only [running] at found ⊢
    all_goals try contradiction
    all_goals
      simp only [activationCount, messageActivationCount, timerActivationCount,
        effectActivationCount, retirement.tasks, retirement.messages, retirement.timers,
        retirement.effects, time, process] at found ⊢
      repeat' first | (solve | simp_all) | split at found
      all_goals simp_all [retirement.anchor_absent, retirement.available]

theorem prepareInternalDataArm_retirement_frame (program : Program) (before after : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (found : prepareInternalDataArmingContract? program before contract = some patch)
    (retirement : RegionalArmingRetirement before after)
    (owner : onlyTokenOwner? after patch.arm.input = some patch.arm.owner)
    (live : exactLiveOccurrence after patch.arm.owner = true)
    (control : after.control = before.control)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (process : after.variables.process = before.variables.process) :
    prepareInternalDataArmingContract? program after contract = some patch := by
  obtain ⟨selectedOwner, inputOrigin, source, owned, running, selected, beforeLive,
    originFound, sourceFound, unique, anchorAbsent, scopeAbsent, recordAbsent, patchEq⟩ :=
    prepareInternalDataArmingContract_facts program before contract patch found
  have patchFrame : makeInternalDataArmingPatch program after contract selectedOwner inputOrigin source = patch := by
    rw [patchEq]
    simp only [makeInternalDataArmingPatch, activationCount, activityActivationCount,
      dataInputOutputActivityRecord, retirement.tasks, retirement.activities, time]
  have sourceFrame : dataInputOutputSourceBinding? after contract.directInput = some source := by
    simpa only [dataInputOutputSourceBinding?, dataInputSourceBinding?, process] using sourceFound
  have scopeFrame : after.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false :=
    List.any_eq_false.mpr fun value member =>
      (List.any_eq_false.mp scopeAbsent) value (retirement.locals member)
  have recordFrame : after.activityOccurrences.any (fun record =>
      sameActivityOccurrence record patch.record || !activityBodyClaimsDisjoint record patch.record) = false :=
    List.any_eq_false.mpr fun record member =>
      (List.any_eq_false.mp recordAbsent) record (retirement.records member)
  have selectedOwnerEq : patch.arm.owner = selectedOwner := by rw [patchEq]; rfl
  have inputEq : patch.arm.input = contract.input := by rw [patchEq]; rfl
  rw [selectedOwnerEq, inputEq] at owner
  rw [selectedOwnerEq] at live
  simp only [prepareInternalDataArmingContract?, owner, control, running, selected, live,
    originFound, sourceFrame, patchFrame, unique, retirement.anchor_absent _ anchorAbsent,
    scopeFrame, recordFrame, bind, Option.bind, Bool.not_true, Bool.false_or,
    Bool.or_false, ne_eq, not_true_eq_false, decide_false, Bool.false_eq_true, if_false]
  rfl

theorem prepareInternalArm_running_binding (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (found : prepareInternalArm? program state operation = some patch) :
    state.control = .running patch.runtimeInstanceId := by
  unfold prepareInternalArm? at found
  obtain ⟨input, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨origin, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
  by_cases blocked : (!exactProgramSelection program operation owner || !exactLiveOccurrence state owner) = true
  · simp [blocked] at found
  · simp only [blocked, bind, Option.bind] at found
    obtain ⟨inputOrigin, _, found⟩ := Option.bind_eq_some_iff.mp found
    cases control : state.control <;> simp_all
    all_goals try contradiction
    all_goals
      repeat' first
        | (replace found := found.2)
        | (split at found <;> try simp_all)
      all_goals cases found; rfl

theorem preparedArming_owner_facts (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (found : arm.Prepared program state) :
    onlyTokenOwner? state arm.scopeFramePatch.input = some arm.scopeFramePatch.owner ∧
      exactLiveOccurrence state arm.scopeFramePatch.owner = true ∧
      state.control = .running arm.scopeFramePatch.runtimeInstanceId := by
  cases arm with
  | ordinary operation patch =>
    exact ⟨prepared_owner_lookup program state operation patch found,
      (prepared_arm_live_running program state operation patch found).1,
      prepareInternalArm_running_binding program state operation patch found⟩
  | data contract patch =>
    obtain ⟨owner, inputOrigin, source, owned, running, _, live, _, _, _, _, _, _, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    subst patch
    exact ⟨owned, live, running⟩

/-- A selected regional execution preserves the complete ordinary or composed-data arm.
The full input-owner census and removal-only resource law derive all successor reads. -/
theorem prepareInternalArming_after_independent_regional (program : Program)
    (before after : RuntimeState) (regionalOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (arm : PreparedInternalArming)
    (valid : runtimeStateWellFormed program arm.scopeFramePatch.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (armFound : arm.Prepared program before)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint arm.scopeFramePatch.owner arm.stateFootprint) = true)
    (applied : applyPreparedInternalRegional? program before regional = some after) :
    arm.Prepared program after := by
  have facts := preparedArming_owner_facts program before arm armFound
  have frame := arming_regional_control_frame program before after regionalOperation regional arm
    valid facts.2.2 regionalFound applied independent
  have retirement := preparedRegional_arming_retirement program before after regionalOperation regional regionalFound applied
  have owned : onlyTokenOwner? after arm.scopeFramePatch.input = some arm.scopeFramePatch.owner := by
    simpa only [onlyTokenOwner?, tokenOwners, frame.2.2.2.2] using facts.1
  have live : exactLiveOccurrence after arm.scopeFramePatch.owner = true := by
    simpa only [exactLiveOccurrence, frame.2.2.2.1] using facts.2.1
  cases arm with
  | ordinary operation patch =>
    exact prepareInternalArm_retirement_frame program before after operation patch armFound
      retirement owned live frame.1 frame.2.1 frame.2.2.1
  | data contract patch =>
    exact prepareInternalDataArm_retirement_frame program before after contract patch armFound
      retirement owned live frame.1 frame.2.1 frame.2.2.1

end BpmnSemantics.SemanticProcess.InternalCommutation
