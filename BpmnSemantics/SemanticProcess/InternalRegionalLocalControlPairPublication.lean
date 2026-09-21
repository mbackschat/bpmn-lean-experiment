import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlPairPublication
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalRegionalReturnRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalRegionalChildCompletionRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalRegionalRootCompletionRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalRegionalPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalReturnOpenProjection
import BpmnSemantics.SemanticProcess.InternalRegionalChildOpenProjection

/-! Pair publication uses the same predecessor-selected templates and assigned transition
indices in either execution order. Acceptance is proved against each actual successor. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure RegionalExecutionPublication (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (instanceId commandId : SemanticId) (transitionIndex : Nat) : Prop where
  execution : fire? program operation before = some after
  wellFormed : runtimeStateWellFormed program instanceId after = true
  operationBound : prepared.publicationTemplate.operation = operation
  record : internalTransitionRecord? program before operation = some
    { operationId := prepared.publicationTemplate.operation.id
      operationKind := prepared.publicationTemplate.operation.kind
      origin := prepared.publicationTemplate.operation.origin
      owner := prepared.publicationTemplate.owner }
  lifecycle : flowNodeOccurrenceDeltaForOperation? program before after operation commandId
    transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex)
  position : controlPositionDelta? program instanceId before after =
    some prepared.publicationTemplate.positionDelta
  logicalTime : before.logicalTimeMs = prepared.publicationTemplate.logicalTimeMs

theorem preparedRegional_preserves_runtimeStateWellFormed (program : Program) (before : RuntimeState)
    (instanceId : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program instanceId before = true)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      runtimeStateWellFormed program instanceId after = true := by
  cases operation with
  | returnProcess id origin process definition output =>
      exact preparedReturn_preserves_runtimeStateWellFormed program before instanceId id origin process definition output prepared valid found
  | completeScope id origin definition output =>
      cases output with
      | none => exact preparedRootComplete_preserves_runtimeStateWellFormed program before instanceId id origin definition prepared valid found
      | some output => exact preparedChildComplete_preserves_runtimeStateWellFormed program before instanceId id origin definition output prepared valid found
  | throwError id origin input error handler =>
      exact preparedError_preserves_runtimeStateWellFormed program before instanceId id origin input error handler prepared valid found
  | terminateScope id origin input definition =>
      exact preparedTerminate_preserves_runtimeStateWellFormed program before instanceId id origin input definition prepared valid found
  | _ =>
      have selected := (ownershipClosedSelection_facts program before _ prepared.selection
        (prepareInternalRegional_facts program before _ prepared found).2.2.2.1).1
      simp [selectInternalRegional?] at selected

theorem preparedRegional_accepted_lifecycle (program : Program) (before : RuntimeState)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId before = true)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceDeltaForOperation? program before after operation commandId transitionIndex =
        some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  have components := beforeWF
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  have unique : attachedMessagesUnambiguous before = true := by simp_all only
  have owners : waitOwnersLive before = true := by simp_all only
  have identities : waitIdentitiesUnique before = true := by simp_all only
  cases operation with
  | returnProcess id origin process definition output =>
      exact preparedReturn_accepted_lifecycle program before instanceId commandId transitionIndex
        id origin process definition output prepared programWF beforeWF found
  | completeScope id origin definition output =>
      cases output with
      | none =>
          exact preparedRootComplete_accepted_lifecycle program before instanceId commandId transitionIndex
            id origin definition prepared beforeWF found
      | some output =>
          exact preparedChildComplete_accepted_lifecycle program before commandId transitionIndex
            id origin definition output prepared programWF identities found
  | throwError id origin input error handler =>
      exact preparedError_accepted_lifecycle program before commandId transitionIndex id origin input error handler prepared unique found
  | terminateScope id origin input definition =>
      exact preparedTerminate_accepted_lifecycle program before commandId transitionIndex id origin input definition prepared unique owners found
  | _ =>
      have selected := (ownershipClosedSelection_facts program before _ prepared.selection
        (prepareInternalRegional_facts program before _ prepared found).2.2.2.1).1
      simp [selectInternalRegional?] at selected

theorem prepareInternalRegional_execution_publication (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId before = true)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      RegionalExecutionPublication program before after operation prepared instanceId commandId transitionIndex := by
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before operation prepared found
  obtain ⟨validAfter, validApplied, valid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program before instanceId operation prepared beforeWF found
  have sameValid : validAfter = after := Option.some.inj (validApplied.symm.trans applied)
  subst validAfter
  obtain ⟨publishedAfter, publishedApplied, lifecycle⟩ := preparedRegional_accepted_lifecycle program before instanceId
    commandId transitionIndex operation prepared programWF beforeWF found
  have samePublished : publishedAfter = after := Option.some.inj (publishedApplied.symm.trans applied)
  subst publishedAfter
  obtain ⟨hosting, positionedAfter, running, positionedApplied, positioned⟩ :=
    preparedRegional_position_delta program before operation prepared found
  have samePosition : positionedAfter = after := Option.some.inj (positionedApplied.symm.trans applied)
  subst positionedAfter
  have positionBefore : runtimePositionValid program instanceId before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at beforeWF
    exact beforeWF.1
  have hostingEq := runtimePositionValid_running_instance program instanceId hosting before positionBefore running
  subst hosting
  have published := (prepareInternalRegional_facts program before operation prepared found).2.2.2.2.2.2
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  exact ⟨after, applied,
    { execution := fired
      wellFormed := valid
      operationBound := by rw [template]; exact prepareInternalRegional_operation program before operation prepared found
      record := preparedRegional_transition_record program before operation prepared found
      lifecycle := lifecycle
      position := positioned
      logicalTime := by rw [template] }⟩

/-- Both execution orders preserve full validity and accept the original operation-specific
record, lifecycle, position, and time. Each operation keeps its assigned publication index. -/
theorem prepared_regional_local_control_pair_execution_publication (program : Program) (before : RuntimeState)
    (regionalOperation localOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (control : PreparedInternalLocalControl)
    (commandId : SemanticId) (regionalIndex localIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program control.runtimeInstanceId before = true)
    (regionalFound : prepareInternalRegional? program before regionalOperation = some regional)
    (localFound : prepareInternalLocalControl? program before localOperation = some control)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint control.selection.owner control.footprint) = true) :
    prepareInternalRegional? program (control.selection.apply before) regionalOperation = some regional ∧
      ∃ afterRegional,
        applyPreparedInternalRegional? program before regional = some afterRegional ∧
        prepareInternalLocalControl? program afterRegional localOperation = some control ∧
        applyPreparedInternalRegional? program (control.selection.apply before) regional =
          some (control.selection.apply afterRegional) ∧
        RegionalExecutionPublication program before afterRegional regionalOperation regional
          control.runtimeInstanceId commandId regionalIndex ∧
        LocalControlExecutionPublication program before (control.selection.apply before) localOperation control
          control.runtimeInstanceId commandId localIndex ∧
        RegionalExecutionPublication program (control.selection.apply before) (control.selection.apply afterRegional)
          regionalOperation regional control.runtimeInstanceId commandId regionalIndex ∧
        LocalControlExecutionPublication program afterRegional (control.selection.apply afterRegional)
          localOperation control control.runtimeInstanceId commandId localIndex := by
  obtain ⟨regionalFrame, afterRegional, applied, localFrame, commute⟩ :=
    prepared_regional_local_control_pair_commutes program before regionalOperation localOperation regional control
      programWF beforeWF regionalFound localFound independent
  obtain ⟨publishedAfter, publishedApplied, regionalFirst⟩ := prepareInternalRegional_execution_publication program before
    regionalOperation regional control.runtimeInstanceId commandId regionalIndex programWF beforeWF regionalFound
  have same : publishedAfter = afterRegional := Option.some.inj (publishedApplied.symm.trans applied)
  subst publishedAfter
  have running (state : RuntimeState) (found : prepareInternalLocalControl? program state localOperation = some control) :
      state.control = .running control.runtimeInstanceId := by
    obtain ⟨_, _, _, _, _, _, _, running, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalLocalControl_facts program state localOperation control found
    exact running
  obtain ⟨openBefore, openAfter, openedBefore, openedAfter, _⟩ :=
    accepted_operation_delta_equals_independent_open_projection program before afterRegional regionalOperation
      commandId regionalIndex _ regionalFirst.lifecycle
  have snapshots := (prepareInternalRegional_facts program before regionalOperation regional regionalFound).1
  have localFirst := prepareInternalLocalControl_execution_publication program before localOperation control
    control.runtimeInstanceId commandId localIndex programWF beforeWF (running before localFound)
    (by simp [openedBefore]) snapshots localFound
  obtain ⟨final, finalApplied, regionalSecond⟩ := prepareInternalRegional_execution_publication program (control.selection.apply before)
    regionalOperation regional control.runtimeInstanceId commandId regionalIndex programWF localFirst.wellFormed regionalFrame
  have finalEq : final = control.selection.apply afterRegional := Option.some.inj (finalApplied.symm.trans commute)
  rw [finalEq] at regionalSecond
  have localSecond := prepareInternalLocalControl_execution_publication program afterRegional localOperation control
    control.runtimeInstanceId commandId localIndex programWF regionalFirst.wellFormed (running afterRegional localFrame)
    (by simp [openedAfter]) snapshots localFrame
  exact ⟨regionalFrame, afterRegional, applied, localFrame, commute, regionalFirst, localFirst, regionalSecond, localSecond⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
