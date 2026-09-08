import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlLifecyclePublication
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDeltaProofs

/-! Actual execution and accepted publication for independent local-control pairs under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). Each operation keeps
its assigned transition index in either execution order; finite sorting is a separate obligation.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Proof evidence ties actual execution and every accepted publication component to one complete
predecessor preparation, without extending the public wire or the state footprint. -/
structure LocalControlExecutionPublication (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (instanceId commandId : SemanticId) (transitionIndex : Nat) : Prop where
  execution : fire? program operation before = some after
  wellFormed : runtimeStateWellFormed program instanceId after = true
  running : after.control = .running instanceId
  openFrame : projectOpenFlowNodeOccurrences? program after = projectOpenFlowNodeOccurrences? program before
  operationBound : prepared.publicationTemplate.operation = operation
  record : internalTransitionRecord? program before operation = some
    { operationId := prepared.publicationTemplate.operation.id
      operationKind := prepared.publicationTemplate.operation.kind
      origin := prepared.publicationTemplate.operation.origin
      owner := prepared.selection.owner }
  lifecycle : flowNodeOccurrenceDeltaForOperation? program before after operation commandId
    transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex)
  position : controlPositionDelta? program instanceId before after =
    some prepared.publicationTemplate.positionDelta
  logicalTime : before.logicalTimeMs = prepared.publicationTemplate.logicalTimeMs

theorem prepareInternalLocalControl_template_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    prepared.publicationTemplate.operation = operation ∧
      state.logicalTimeMs = prepared.publicationTemplate.logicalTimeMs := by
  obtain ⟨selected, origin, selectedInstance, identity, delta, selection, _, _, _, _, _, _,
    _, _, _, rfl⟩ := prepareInternalLocalControl_facts program state operation prepared found
  exact ⟨selectInternalLocalControl_operation state operation selected selection, rfl⟩

theorem prepareInternalLocalControl_execution_publication (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    LocalControlExecutionPublication program state (prepared.selection.apply state) operation
      prepared instanceId commandId transitionIndex := by
  have template := prepareInternalLocalControl_template_facts program state operation prepared found
  refine
    { execution := prepareInternalLocalControl_refines program state operation prepared snapshots found
      wellFormed := prepareInternalLocalControl_preserves_runtimeStateWellFormed program state
        operation prepared instanceId programWF beforeWF running found
      running := running
      openFrame := prepareInternalLocalControl_open_occurrences_frame program state operation
        prepared instanceId beforeWF running found
      operationBound := template.1
      record := ?_
      lifecycle := prepareInternalLocalControl_accepted_lifecycle program state operation prepared
        instanceId commandId transitionIndex beforeWF running projectable found
      position := internalLocalControlPositionDelta?_corresponds program state operation prepared
        instanceId programWF beforeWF running found
      logicalTime := template.2 }
  rw [template.1]
  exact prepareInternalLocalControl_record program state operation prepared found

/-- Original complete preparations and state-footprint separation derive both intermediate
preparations, all four actual steps, valid successors, and exact per-operation publication.
The same assigned index follows each operation across the two execution orders. -/
theorem prepared_local_control_pair_execution_publication (program : Program) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalLocalControl)
    (instanceId commandId : SemanticId) (leftIndex rightIndex : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (leftFound : prepareInternalLocalControl? program state leftOperation = some left)
    (rightFound : prepareInternalLocalControl? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalLocalControl? program (right.selection.apply state) leftOperation = some left ∧
      prepareInternalLocalControl? program (left.selection.apply state) rightOperation = some right ∧
      ∃ final,
        right.selection.apply (left.selection.apply state) = final ∧
        left.selection.apply (right.selection.apply state) = final ∧
        LocalControlExecutionPublication program state (left.selection.apply state) leftOperation
          left instanceId commandId leftIndex ∧
        LocalControlExecutionPublication program state (right.selection.apply state) rightOperation
          right instanceId commandId rightIndex ∧
        LocalControlExecutionPublication program (left.selection.apply state) final rightOperation
          right instanceId commandId rightIndex ∧
        LocalControlExecutionPublication program (right.selection.apply state) final leftOperation
          left instanceId commandId leftIndex := by
  obtain ⟨leftPreserved, rightPreserved, commute⟩ := prepared_local_control_pair_commutes program state
    leftOperation rightOperation left right leftFound rightFound
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state beforeWF) separated
  have leftFirst := prepareInternalLocalControl_execution_publication program state leftOperation
    left instanceId commandId leftIndex programWF beforeWF running projectable snapshots leftFound
  have rightFirst := prepareInternalLocalControl_execution_publication program state rightOperation
    right instanceId commandId rightIndex programWF beforeWF running projectable snapshots rightFound
  have leftOpen : (projectOpenFlowNodeOccurrences? program (left.selection.apply state)).isSome = true := by
    rw [leftFirst.openFrame]
    exact projectable
  have rightOpen : (projectOpenFlowNodeOccurrences? program (right.selection.apply state)).isSome = true := by
    rw [rightFirst.openFrame]
    exact projectable
  have rightSecond := prepareInternalLocalControl_execution_publication program (left.selection.apply state)
    rightOperation right instanceId commandId rightIndex programWF leftFirst.wellFormed
    leftFirst.running leftOpen snapshots rightPreserved
  have leftSecond := prepareInternalLocalControl_execution_publication program (right.selection.apply state)
    leftOperation left instanceId commandId leftIndex programWF rightFirst.wellFormed
    rightFirst.running rightOpen snapshots leftPreserved
  refine ⟨leftPreserved, rightPreserved, right.selection.apply (left.selection.apply state),
    rfl, commute.symm, leftFirst, rightFirst, rightSecond, ?_⟩
  rw [commute]
  exact leftSecond

/-- Instantaneous publication exposes its assigned transition index. Raw-state commutation cannot
justify assigning indices by execution order under the selected publication contract. -/
theorem localControl_lifecycle_started_anchor_index_discriminator
    (template : InternalLocalControlPublicationTemplate) (commandId : SemanticId)
    (leftIndex rightIndex : Nat) (different : leftIndex ≠ rightIndex) :
    ((template.lifecycle commandId leftIndex).started.map (·.anchor)) ≠
      ((template.lifecycle commandId rightIndex).started.map (·.anchor)) := by
  simpa [InternalLocalControlPublicationTemplate.lifecycle] using different

end BpmnSemantics.SemanticProcess.InternalCommutation
