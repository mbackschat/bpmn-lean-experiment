module

import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalPreparationFrame
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.ControlPosition
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws
import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalCommutationStateFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalDependencies
import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval
import BpmnSemantics.SemanticProcess.InternalRegionalControlFields
import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalRemovalAgreement
import BpmnSemantics.SemanticProcess.InternalRegionalReturnPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalReturnQuiescence
import BpmnSemantics.SemanticProcess.InternalRegionalTerminationPositionPublication

/-! Regional/arming frames reuse the owner-aware footprint and exact regional observation
filters. The consumed token's complete place census protects preparation across cancellation. -/

@[expose] public section

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

/-- A scope dependency protects the entire interface-owner census, including duplicates.
CDATA-OWNER-01 reads immutable inputs; regional steps only remove interfaces with their scope. -/
theorem preparedRegional_interface_census (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (owner : ScopeOccurrenceId) (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (live : exactLiveOccurrence before owner = true)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (outside : prepared.region.contains owner = false) :
    after.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) =
      before.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) := by
  have position : runtimePositionValid program hosting before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  obtain ⟨occurrence, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
  have included : occurrence ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) := by
    rw [census]; simp
  have ownerLive : owner ∈ before.scopeOccurrences.map (·.id) := List.mem_map.mpr
    ⟨occurrence, (List.mem_filter.mp included).1, of_decide_eq_true (List.mem_filter.mp included).2⟩
  obtain ⟨snapshots, _, _, closed, derived, _, _⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection closed).1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have cancellationFrame (disposition : SelectedScopeDisposition) :
      (cancelScopeSubtree before prepared.selection.root.id disposition).variables.processInterfaces.filter
          (fun scope => decide (scope.owner = owner)) =
        before.variables.processInterfaces.filter (fun scope => decide (scope.owner = owner)) := by
    have mask := regional_cancellation_mask program before hosting hosting position running
      prepared.selection.root.id prepared.region derived owner ownerLive
    change (before.variables.processInterfaces.filter _).filter _ = _
    apply regional_filter_retained
    intro scope _ seen
    have identity : scope.owner = owner := of_decide_eq_true seen
    cases disposition <;> simp only [identity, ← mask, outside, Bool.not_false, Bool.or_true]
  cases operation with
  | returnProcess id origin process definition output data =>
      have empty := prepareInternalRegional_return_data_empty program before id origin process definition output data prepared found
      subst data
      obtain ⟨returned, record, root, returnedApply, kind, rootEq, rootLive, parentless, _, update, _⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output prepared valid found
      have resultEq := Option.some.inj (returnedApply.symm.trans applied)
      rw [resultEq] at update
      obtain ⟨chosen, chosenKind, chosenRoot, _⟩ :=
        regionalSelection_return_record program before id origin process definition output prepared.selection selected
      have recordEq : chosen = record := by simpa [kind] using chosenKind.symm
      subst chosen
      have mask := regional_called_tree_mask program before hosting hosting position running root prepared.region
        (by simpa only [rootEq] using derived) rootLive parentless owner ownerLive
      rw [update]
      change (before.variables.processInterfaces.filter _).filter _ = _
      apply regional_filter_retained
      intro scope _ seen
      have identity : scope.owner = owner := of_decide_eq_true seen
      simp only [identity, ← rootEq.trans chosenRoot, mask, outside, Bool.not_false]
  | completeScope id origin definition output =>
      have raw : completeSelectedScope? program before definition output = some after := by
        exact selectInternalRegional?_completeScope_fired program before before after id origin definition output _ selected
          snapshots fired
      have interfaces := congrArg ScopedVariables.processInterfaces
        (regionalLocalData_selected_completion_variables program before after definition output raw)
      change after.variables.processInterfaces = before.variables.processInterfaces at interfaces
      rw [interfaces]
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨_, _, _, update⟩ := regionalSelection_error_execution program before after
        id origin input error handler prepared.selection selected raw
      rw [update]
      exact cancellationFrame .remove
  | terminateScope id origin input definition =>
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨chosen, _⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selected
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      exact cancellationFrame .retain
  | _ => simp [selectInternalRegional?] at selected

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

private theorem selectedCompletion_arming_retirement (program : Program)
    (before after : RuntimeState) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (result : completeSelectedScope? program before definition output = some after) :
    RegionalArmingRetirement before after := by
  unfold completeSelectedScope? at result
  split at result
  · unfold completeMonitoredScope? at result
    obtain ⟨pair, _, result⟩ := Option.bind_eq_some_iff.mp result
    split at result
    · obtain ⟨ordinary, completed, result⟩ := Option.bind_eq_some_iff.mp result
      cases result
      have frame := ordinaryCompletion_arming_retirement before ordinary definition output completed
      refine ⟨frame.tasks, frame.messages, frame.timers, frame.effects, frame.activities,
        frame.taskWaits, frame.messageWaits, ?_, frame.effectWaits, frame.incidents,
        List.Subset.trans List.erase_subset frame.records, frame.locals⟩
      cases pair.val.timer <;>
        first | exact frame.timerWaits | exact List.Subset.trans List.erase_subset frame.timerWaits
    · contradiction
  · exact boundedCompletion_arming_retirement program before after definition output result

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
  | returnProcess id origin process definition output data =>
      have empty := prepareInternalRegional_return_data_empty program before id origin process definition output data prepared found
      subst data
      have raw : returnProcessState? before id origin process definition output = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      cases returnProcessState_sound before after id origin process definition output raw
      constructor <;> first | rfl | exact fun _ member => (List.mem_filter.mp member).1
  | completeScope id origin definition output =>
      apply selectedCompletion_arming_retirement program before after definition output
      exact selectInternalRegional?_completeScope_fired program before before after id origin definition output _
        selected snapshots fired
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
    (process : after.variables.process = before.variables.process)
    (effectInputs : match operation with
      | .awaitEffect .. => ∀ mappings, evaluateEffectInputs? program after patch.owner mappings =
          evaluateEffectInputs? program before patch.owner mappings
      | _ => True)
    (inputReads : scopedEffectInputReads? program after patch.owner operation =
      scopedEffectInputReads? program before patch.owner operation) :
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
    rw [ite_eq_right selected]
    obtain ⟨inputOrigin, originFound, found⟩ := Option.bind_eq_some_iff.mp found
    rw [originFound]
    dsimp only [Option.bind_some]
    rw [control]
    cases running : before.control <;> simp only [running] at found ⊢
    all_goals try contradiction
    all_goals
      simp only [activationCount, messageActivationCount, timerActivationCount,
        effectActivationCount, retirement.tasks, retirement.messages, retirement.timers,
        retirement.effects, time, process, inputReads] at found ⊢
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
    (process : after.variables.process = before.variables.process)
    (interfaces : after.variables.processInterfaces.filter (fun scope => decide (scope.owner = patch.arm.owner)) =
      before.variables.processInterfaces.filter (fun scope => decide (scope.owner = patch.arm.owner))) :
    prepareInternalDataArmingContract? program after contract = some patch := by
  obtain ⟨selectedOwner, inputOrigin, source, owned, running, selected, beforeLive,
    originFound, sourceFound, unique, anchorAbsent, scopeAbsent, recordAbsent, patchEq⟩ :=
    prepareInternalDataArmingContract_facts program before contract patch found
  have patchFrame : makeInternalDataArmingPatch program after contract selectedOwner inputOrigin source = patch := by
    rw [patchEq]
    simp only [makeInternalDataArmingPatch, activationCount, activityActivationCount,
      dataInputOutputActivityRecord, retirement.tasks, retirement.activities, time,
      dataInputOutputRunningInstance?, control]
  have selectedOwnerEq : patch.arm.owner = selectedOwner := by rw [patchEq]; rfl
  have sourceFrame : dataArmingBindings? (programPropertyPathValuePolicy program) after selectedOwner contract.data = some source := by
    rw [dataArmingBindings_process_frame (programPropertyPathValuePolicy program) before after selectedOwner contract.data control process
      (by simpa only [selectedOwnerEq] using interfaces)]
    exact sourceFound
  have scopeFrame : after.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false :=
    List.any_eq_false.mpr fun value member =>
      (List.any_eq_false.mp scopeAbsent) value (retirement.locals member)
  have recordFrame : after.activityOccurrences.any (fun record =>
      sameActivityOccurrence record patch.record || !activityBodyClaimsDisjoint record patch.record) = false :=
    List.any_eq_false.mpr fun record member =>
      (List.any_eq_false.mp recordAbsent) record (retirement.records member)
  have inputEq : patch.arm.input = contract.input := by rw [patchEq]; rfl
  rw [selectedOwnerEq, inputEq] at owner
  rw [selectedOwnerEq] at live
  simp only [prepareInternalDataArmingContract?, owner, dataArmingHostValid_frame before after selectedOwner contract.data control, running, selected, live,
    originFound, sourceFrame, patchFrame, unique, retirement.anchor_absent _ anchorAbsent,
    scopeFrame, recordFrame, bind, Option.bind, Bool.not_true, Bool.false_or,
    Bool.or_false, Bool.false_eq_true, ite_false]

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
    have host := prepareInternalDataArmingContract_host_control program state contract patch found
    obtain ⟨owner, inputOrigin, source, owned, _, _, live, _, _, _, _, _, _, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
    subst patch
    exact ⟨owned, live, host⟩

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
  have interfaceFrame := preparedRegional_interface_census program before after
    arm.scopeFramePatch.runtimeInstanceId regionalOperation regional arm.scopeFramePatch.owner
    valid facts.2.2 facts.2.1 regionalFound applied
    (arming_regional_scope_outside before regional.selection regional.region regional.footprint arm
      (prepareInternalRegional_facts program before regionalOperation regional regionalFound).2.2.2.2.2.1 independent)
  have retirement := preparedRegional_arming_retirement program before after regionalOperation regional regionalFound applied
  have owned : onlyTokenOwner? after arm.scopeFramePatch.input = some arm.scopeFramePatch.owner := by
    simpa only [onlyTokenOwner?, tokenOwners, frame.2.2.2.2] using facts.1
  have live : exactLiveOccurrence after arm.scopeFramePatch.owner = true := by
    simpa only [exactLiveOccurrence, frame.2.2.2.1] using facts.2.1
  cases arm with
  | ordinary operation patch =>
    have noPopulation : .activityPopulation ∉ (footprintOfPatch patch).reads := by
      intro member
      have conflict := arming_regional_read_separation regional.footprint
        (.ordinary operation patch) independent _ _
        (regionalStateFootprint_region_write before regional.selection regional.region regional.footprint
          (prepareInternalRegional_facts program before regionalOperation regional regionalFound).2.2.2.2.2.1) member
      simp [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom,
        regionalOwnsOrdinaryAtom] at conflict
    have inputs := prepared_arm_process_input_frames program before after operation patch armFound
      noPopulation frame.2.2.1
    exact prepareInternalArm_retirement_frame program before after operation patch armFound
      retirement owned live frame.1 frame.2.1 frame.2.2.1
      (by cases operation <;> exact inputs.1) inputs.2
  | data contract patch =>
    exact prepareInternalDataArm_retirement_frame program before after contract patch armFound
      retirement owned live frame.1 frame.2.1 frame.2.2.1 interfaceFrame

end BpmnSemantics.SemanticProcess.InternalCommutation
