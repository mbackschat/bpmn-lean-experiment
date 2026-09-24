import BpmnSemantics.SemanticProcess.InternalLocalControlArmingCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationLocalControlCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationAcceptedPublication
import BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies
import BpmnSemantics.SemanticProcess.InternalEndPreparation
import BpmnSemantics.SemanticProcess.InternalMergePreparation
import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparation
import BpmnSemantics.SemanticProcess.InternalMessageTaskPreparation
import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparation

/-! Complete finite mixed preparations follow the predecessor-only
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive PreparedInternalTransition where
  | arming (prepared : PreparedInternalArming)
  | timerTask (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
  | messageTask (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
  | boundedScope (contract : InternalBoundedScopeContract) (prepared : PreparedInternalBoundedScope)
  | localControl (prepared : PreparedInternalLocalControl)
  | scopeCreation (prepared : PreparedInternalScopeCreation)
  | regional (prepared : PreparedInternalRegional)
  | ordinaryEnd (prepared : PreparedInternalEnd)
  | mergeInput (prepared : PreparedInternalMerge)
  deriving Repr, DecidableEq

def PreparedInternalTransition.operation : PreparedInternalTransition → SemanticOperation
  | .arming prepared => prepared.operation
  | .timerTask contract _ => contract.operation
  | .messageTask contract _ => contract.operation
  | .boundedScope contract _ => contract.operation
  | .localControl prepared => prepared.operation
  | .scopeCreation prepared => prepared.selection.operation
  | .regional prepared => prepared.selection.operation
  | .ordinaryEnd prepared => prepared.operation
  | .mergeInput prepared => prepared.selection.operation

def PreparedInternalTransition.alternative : PreparedInternalTransition → InternalAlternative
  | .mergeInput prepared => prepared.selection.alternative
  | prepared => .operation prepared.operation.id

def PreparedInternalTransition.apply (program : Program) (state : RuntimeState) :
    PreparedInternalTransition → RuntimeState
  | .arming prepared => prepared.apply state
  | .timerTask _ patch => applyInternalTimerTaskPatch state patch
  | .messageTask _ patch => applyInternalMessageTaskPatch state patch
  | .boundedScope _ prepared => prepared.selection.apply state
  | .localControl prepared => prepared.selection.apply state
  | .scopeCreation prepared => prepared.selection.apply state
  | .regional prepared => (applyPreparedInternalRegional? program state prepared).getD state
  | .ordinaryEnd prepared => prepared.selection.apply state
  | .mergeInput prepared => prepared.selection.apply state

def PreparedInternalTransition.stateFootprint :
    PreparedInternalTransition → InternalRegionalStateFootprint
  | .arming prepared => liftRegionalStateFootprint prepared.scopeFramePatch.owner prepared.stateFootprint
  | .timerTask _ patch => timerTaskStateFootprint patch
  | .messageTask _ patch => messageTaskStateFootprint patch
  | .boundedScope _ prepared => prepared.footprint
  | .localControl prepared => liftRegionalStateFootprint prepared.selection.owner prepared.footprint
  | .scopeCreation prepared => liftRegionalStateFootprint prepared.selection.owner prepared.footprint
  | .regional prepared => prepared.footprint
  | .ordinaryEnd prepared => prepared.footprint
  | .mergeInput prepared => liftRegionalStateFootprint prepared.selection.owner prepared.footprint

/-- The subscription proof-domain amendment certifies immutable admission, not source reachability. -/
def subscriptionPreparationAdmitted (program : Program) : Prop :=
  program.identity.semanticProfile = repeatableSubscriptionCheckpointProfileId ∧
    programWellFormed program = true ∧ repeatableSubscriptionProgramGraph program = true

instance (program : Program) : Decidable (subscriptionPreparationAdmitted program) := by
  unfold subscriptionPreparationAdmitted
  infer_instance

def PreparedInternalTransition.Prepared (program : Program) (state : RuntimeState) :
    PreparedInternalTransition → Prop
  | .arming prepared => prepared.Prepared program state
  | .timerTask contract patch => prepareInternalTimerTaskContract? program state contract = some patch
  | .messageTask contract patch => subscriptionPreparationAdmitted program ∧
      prepareInternalMessageTaskContract? program state contract = some patch
  | .boundedScope contract prepared => subscriptionPreparationAdmitted program ∧
      prepareInternalBoundedScope? program state contract = some prepared
  | .localControl prepared =>
      prepareInternalLocalControl? program state prepared.operation = some prepared
  | .scopeCreation prepared =>
      prepareInternalScopeCreation? program state prepared.selection.operation = some prepared
  | .regional prepared =>
      prepareInternalRegional? program state prepared.selection.operation = some prepared
  | .ordinaryEnd prepared =>
      prepareInternalEnd? program state prepared.operation = some prepared
  | .mergeInput prepared =>
      prepareInternalMerge? program state prepared.selection.operation prepared.selection.alternative = some prepared

instance (program : Program) (state : RuntimeState) (prepared : PreparedInternalTransition) :
    Decidable (prepared.Prepared program state) := by
  cases prepared <;> unfold PreparedInternalTransition.Prepared <;> infer_instance

theorem messageTask_prepared_subscription_admission (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (prepared : (PreparedInternalTransition.messageTask contract patch).Prepared program state) :
    subscriptionPreparationAdmitted program := by
  exact prepared.1

theorem boundedScope_prepared_subscription_admission (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (patch : PreparedInternalBoundedScope)
    (prepared : (PreparedInternalTransition.boundedScope contract patch).Prepared program state) :
    subscriptionPreparationAdmitted program := by
  exact prepared.1

theorem subscriptionPreparationAdmitted_operation (program : Program)
    (admitted : subscriptionPreparationAdmitted program)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    repeatableSubscriptionOperationAllowed operation = true :=
  repeatableSubscriptionProgramGraph_operation program admitted.2.2 operation member

/-- Existing arming publication conflicts remain checked. Local instantaneous anchors receive
their distinct indices only after the selected account's unique-alternative batch sort. -/
def PreparedInternalTransition.Independent (left right : PreparedInternalTransition) : Prop :=
  match left, right with
  | .arming first, .arming second => first.Independent second
  | .arming first, .localControl second => localControlStateFootprintsNonInterfering first.stateFootprint second.footprint = true
  | .arming first, .scopeCreation second => localControlStateFootprintsNonInterfering first.stateFootprint second.footprint = true
  | .localControl first, .arming second => localControlStateFootprintsNonInterfering first.footprint second.stateFootprint = true
  | .scopeCreation first, .arming second => localControlStateFootprintsNonInterfering first.footprint second.stateFootprint = true
  | .localControl first, .localControl second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .localControl first, .scopeCreation second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .scopeCreation first, .localControl second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .scopeCreation first, .scopeCreation second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .arming first, .mergeInput second => localControlStateFootprintsNonInterfering first.stateFootprint second.footprint = true
  | .mergeInput first, .arming second => localControlStateFootprintsNonInterfering first.footprint second.stateFootprint = true
  | .localControl first, .mergeInput second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .mergeInput first, .localControl second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .scopeCreation first, .mergeInput second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .mergeInput first, .scopeCreation second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .mergeInput first, .mergeInput second => localControlStateFootprintsNonInterfering first.footprint second.footprint = true
  | .messageTask .., _ | _, .messageTask .. | .boundedScope .., _ | _, .boundedScope ..
  | .timerTask .., _ | _, .timerTask .. | .regional _, _ | _, .regional _ | .ordinaryEnd _, _ | _, .ordinaryEnd _ =>
      regionalStateFootprintsIndependent left.stateFootprint right.stateFootprint = true

instance (left right : PreparedInternalTransition) : Decidable (left.Independent right) := by
  cases left <;> cases right <;> unfold PreparedInternalTransition.Independent <;> infer_instance

private theorem messageTask_independent_iff (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (other : PreparedInternalTransition) :
    (PreparedInternalTransition.messageTask contract patch).Independent other ↔
      other.Independent (.messageTask contract patch) := by
  cases other <;> constructor <;> intro separated <;>
    exact regionalStateFootprintsIndependent_symmetric _ _ separated

private theorem boundedScope_independent_iff (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (other : PreparedInternalTransition) :
    (PreparedInternalTransition.boundedScope contract prepared).Independent other ↔
      other.Independent (.boundedScope contract prepared) := by
  cases other <;> constructor <;> intro separated <;>
    exact regionalStateFootprintsIndependent_symmetric _ _ separated

theorem PreparedInternalTransition.independent_symm {left right : PreparedInternalTransition}
    (separated : left.Independent right) : right.Independent left := by
  cases left with
  | messageTask contract patch => exact (messageTask_independent_iff contract patch right).mp separated
  | boundedScope contract prepared => exact (boundedScope_independent_iff contract prepared right).mp separated
  | _ =>
      cases right with
      | messageTask contract patch => exact (messageTask_independent_iff contract patch _).mpr separated
      | boundedScope contract prepared => exact (boundedScope_independent_iff contract prepared _).mpr separated
      | _ =>
          first
          | exact PreparedInternalArming.independent_symm separated
          | exact localControlStateFootprintsNonInterfering_symm _ _ separated
          | exact regionalStateFootprintsIndependent_symmetric _ _ separated

private def prepareOrdinaryInternalTransition? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalTransition :=
  match internalLocalControlOrigin? operation with
  | some _ =>
      if program.compensationEventSubProcessSnapshots.isSome then none
      else (prepareInternalLocalControl? program state operation).map .localControl
  | none =>
      match internalScopeCreationOrigin? operation with
      | some _ => (prepareInternalScopeCreation? program state operation).map .scopeCreation
      | none => (prepareInternalArming? program state operation).map .arming

private def prepareTimerTaskInternalTransition? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalTransition := do
  let contract ← timerTaskContract? operation
  let patch ← prepareInternalTimerTaskContract? program state contract
  some (.timerTask contract patch)

private def prepareMessageTaskInternalTransition? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalTransition :=
  if subscriptionPreparationAdmitted program then do
    let contract ← messageTaskContract? operation
    let patch ← prepareInternalMessageTaskContract? program state contract
    some (.messageTask contract patch)
  else none

private def prepareBoundedScopeInternalTransition? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalTransition :=
  if subscriptionPreparationAdmitted program then do
    let contract ← boundedScopeContract? operation
    let prepared ← prepareInternalBoundedScope? program state contract
    some (.boundedScope contract prepared)
  else none

def prepareInternalTransition? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalTransition :=
  match operation with
  | .awaitMessageBoundedUserTask .. | .awaitMessageMonitoredUserTask .. =>
      prepareMessageTaskInternalTransition? program state operation
  | .enterBoundedScope .. | .enterMonitoredScope .. =>
      prepareBoundedScopeInternalTransition? program state operation
  | .awaitBoundedUserTask .. | .awaitMonitoredUserTask .. =>
      prepareTimerTaskInternalTransition? program state operation
  | .returnProcess .. | .completeScope .. | .throwError .. | .terminateScope .. =>
      (prepareInternalRegional? program state operation).map .regional
  | .reachNoneEnd .. => (prepareInternalEnd? program state operation).map .ordinaryEnd
  | _ => prepareOrdinaryInternalTransition? program state operation

def applyPreparedInternalTransition? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalTransition) : Option RuntimeState :=
  if program.compensationEventSubProcessSnapshots.isSome then none
  else if prepared.Prepared program state then some (prepared.apply program state) else none

theorem prepareInternalTransition_subscription_refused (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (refused : ¬subscriptionPreparationAdmitted program)
    (selected : (messageTaskContract? operation).isSome = true ∨
      (boundedScopeContract? operation).isSome = true) :
    prepareInternalTransition? program state operation = none := by
  cases operation <;>
    simp_all [messageTaskContract?, boundedScopeContract?, prepareInternalTransition?,
      prepareMessageTaskInternalTransition?, prepareBoundedScopeInternalTransition?]

theorem messageTask_application_subscription_refused (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (refused : ¬subscriptionPreparationAdmitted program) :
    applyPreparedInternalTransition? program state (.messageTask contract patch) = none := by
  simp [applyPreparedInternalTransition?, PreparedInternalTransition.Prepared, refused]

theorem boundedScope_application_subscription_refused (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (patch : PreparedInternalBoundedScope)
    (refused : ¬subscriptionPreparationAdmitted program) :
    applyPreparedInternalTransition? program state (.boundedScope contract patch) = none := by
  simp [applyPreparedInternalTransition?, PreparedInternalTransition.Prepared, refused]

def prepareInternalTransitionBatch? (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) : Option (List PreparedInternalTransition) := do
  if operations.length < 2 then none else pure ()
  let prepared ← operations.mapM (prepareInternalTransition? program state)
  if prepared.Pairwise (fun left right => left.operation.id ≠ right.operation.id) ∧
      prepared.Pairwise PreparedInternalTransition.Independent then some prepared else none

def applyInternalTransitionBatch (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) : RuntimeState :=
  prepared.foldl (PreparedInternalTransition.apply program) state

private theorem prepareOrdinaryInternalTransition_sound (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalTransition)
    (found : prepareOrdinaryInternalTransition? program state operation = some prepared) :
    prepared.Prepared program state ∧ prepared.operation = operation ∧
      program.compensationEventSubProcessSnapshots = none := by
  cases originFound : internalLocalControlOrigin? operation with
  | none =>
      cases scopeOrigin : internalScopeCreationOrigin? operation with
      | none =>
          simp only [prepareOrdinaryInternalTransition?, originFound, scopeOrigin] at found
          obtain ⟨arm, selected, rfl⟩ := Option.map_eq_some_iff.mp found
          exact prepareInternalArming_sound program state operation arm selected
      | some origin =>
          simp only [prepareOrdinaryInternalTransition?, originFound, scopeOrigin] at found
          obtain ⟨scope, selected, rfl⟩ := Option.map_eq_some_iff.mp found
          have operationEq := (prepareInternalScopeCreation_operation program state operation
            scope selected).1
          have snapshots : program.compensationEventSubProcessSnapshots = none := by
            obtain ⟨_, _, _, _, _, _, _, _, _, excluded, _⟩ :=
              prepareInternalScopeCreation_facts program state operation scope selected
            exact excluded
          refine ⟨?_, operationEq, snapshots⟩
          change prepareInternalScopeCreation? program state scope.selection.operation = some scope
          rw [operationEq]
          exact selected
  | some origin =>
      cases snapshots : program.compensationEventSubProcessSnapshots with
      | some _ => simp [prepareOrdinaryInternalTransition?, originFound, snapshots] at found
      | none =>
          simp only [prepareOrdinaryInternalTransition?, originFound, snapshots, Option.isSome_none,
            Bool.false_eq_true, ↓reduceIte] at found
          obtain ⟨localPrepared, selected, rfl⟩ := Option.map_eq_some_iff.mp found
          have operationEq : localPrepared.operation = operation := by
            obtain ⟨selection, _, _, _, _, selectedOperation, _, _, _, _, _, _, _, _, _, rfl⟩ :=
              prepareInternalLocalControl_facts program state operation localPrepared selected
            exact selectInternalLocalControl_operation state operation selection selectedOperation
          refine ⟨?_, operationEq, rfl⟩
          change prepareInternalLocalControl? program state localPrepared.operation = some localPrepared
          rw [operationEq]
          exact selected

theorem prepareInternalTransition_sound (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalTransition)
    (found : prepareInternalTransition? program state operation = some prepared) :
    prepared.Prepared program state ∧ prepared.operation = operation ∧
      program.compensationEventSubProcessSnapshots = none := by
  have regional (operation : SemanticOperation)
      (selected : (prepareInternalRegional? program state operation).map PreparedInternalTransition.regional = some prepared) :
      prepared.Prepared program state ∧ prepared.operation = operation ∧
        program.compensationEventSubProcessSnapshots = none := by
    obtain ⟨member, memberFound, rfl⟩ := Option.map_eq_some_iff.mp selected
    have operationEq := prepareInternalRegional_operation program state operation member memberFound
    refine ⟨?_, operationEq, (prepareInternalRegional_facts program state operation member memberFound).1⟩
    change prepareInternalRegional? program state member.selection.operation = some member
    rwa [operationEq]
  have ordinaryEnd (operation : SemanticOperation)
      (selected : (prepareInternalEnd? program state operation).map PreparedInternalTransition.ordinaryEnd = some prepared) :
      prepared.Prepared program state ∧ prepared.operation = operation ∧
        program.compensationEventSubProcessSnapshots = none := by
    obtain ⟨member, memberFound, rfl⟩ := Option.map_eq_some_iff.mp selected
    have operationEq := prepareInternalEnd_operation program state operation member memberFound
    refine ⟨?_, operationEq, (prepareInternalEnd_facts program state operation member memberFound).1⟩
    change prepareInternalEnd? program state member.operation = some member
    rwa [operationEq]
  have timerTask (operation : SemanticOperation)
      (selected : prepareTimerTaskInternalTransition? program state operation = some prepared) :
      prepared.Prepared program state ∧ prepared.operation = operation ∧
        program.compensationEventSubProcessSnapshots = none := by
    obtain ⟨contract, classified, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨patch, patchFound, selected⟩ := Option.bind_eq_some_iff.mp selected
    cases selected
    exact ⟨patchFound, timerTaskContract_operation operation contract classified,
      (prepareInternalTimerTaskContract_facts program state contract patch patchFound).1⟩
  have messageTask (operation : SemanticOperation)
      (selected : prepareMessageTaskInternalTransition? program state operation = some prepared) :
      prepared.Prepared program state ∧ prepared.operation = operation ∧
        program.compensationEventSubProcessSnapshots = none := by
    have admitted : subscriptionPreparationAdmitted program := by
      by_cases certified : subscriptionPreparationAdmitted program
      · exact certified
      · simp [prepareMessageTaskInternalTransition?, certified] at selected
    simp only [prepareMessageTaskInternalTransition?, admitted, ↓reduceIte] at selected
    obtain ⟨contract, classified, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨patch, patchFound, selected⟩ := Option.bind_eq_some_iff.mp selected
    cases selected
    exact ⟨⟨admitted, patchFound⟩, messageTaskContract_operation operation contract classified,
      (prepareInternalMessageTaskContract_facts program state contract patch patchFound).1⟩
  have boundedScope (operation : SemanticOperation)
      (selected : prepareBoundedScopeInternalTransition? program state operation = some prepared) :
      prepared.Prepared program state ∧ prepared.operation = operation ∧
        program.compensationEventSubProcessSnapshots = none := by
    have admitted : subscriptionPreparationAdmitted program := by
      by_cases certified : subscriptionPreparationAdmitted program
      · exact certified
      · simp [prepareBoundedScopeInternalTransition?, certified] at selected
    simp only [prepareBoundedScopeInternalTransition?, admitted, ↓reduceIte] at selected
    obtain ⟨contract, classified, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨patch, patchFound, selected⟩ := Option.bind_eq_some_iff.mp selected
    cases selected
    obtain ⟨_, _, _, _, _, _, _, _, snapshots, _⟩ :=
      prepareInternalBoundedScope_facts program state contract patch patchFound
    exact ⟨⟨admitted, patchFound⟩, boundedScopeContract_operation operation contract classified, snapshots⟩
  cases operation <;> first
    | exact regional _ found
    | exact ordinaryEnd _ found
    | exact timerTask _ found
    | exact messageTask _ found
    | exact boundedScope _ found
    | exact prepareOrdinaryInternalTransition_sound program state _ prepared found

private theorem prepareInternalTransitionList_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalTransition)
    (found : operations.mapM (prepareInternalTransition? program state) = some prepared) :
    (∀ member ∈ prepared, member.Prepared program state) ∧
      prepared.map PreparedInternalTransition.operation = operations := by
  induction operations generalizing prepared with
  | nil =>
      simp at found
      cases found
      simp
  | cons operation rest ih =>
      simp only [List.mapM_cons] at found
      obtain ⟨head, headFound, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨tail, tailFound, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      obtain ⟨headPrepared, headOperation, _⟩ := prepareInternalTransition_sound program state
        operation head headFound
      obtain ⟨tailPrepared, tailOperations⟩ := ih tail tailFound
      exact ⟨by simpa using And.intro headPrepared tailPrepared,
        by simp [headOperation, tailOperations]⟩

/-- Classification retains every member and its exact operation in caller order, with complete
predecessor preparation, distinct alternatives, and all-pairs separation. -/
theorem prepareInternalTransitionBatch_sound (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) (prepared : List PreparedInternalTransition)
    (found : prepareInternalTransitionBatch? program state operations = some prepared) :
    2 ≤ prepared.length ∧
      (∀ member ∈ prepared, member.Prepared program state) ∧
      prepared.Pairwise (fun left right => left.operation.id ≠ right.operation.id) ∧
      prepared.Pairwise PreparedInternalTransition.Independent ∧
      prepared.map PreparedInternalTransition.operation = operations := by
  unfold prepareInternalTransitionBatch? at found
  split at found
  · simp at found
  · next sufficient =>
      dsimp only [Pure.pure, Bind.bind, Option.bind] at found
      obtain ⟨members, allFound, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · next classified =>
          cases found
          obtain ⟨allPrepared, sameOperations⟩ :=
            prepareInternalTransitionList_sound program state operations prepared allFound
          have sameLength := congrArg List.length sameOperations
          simp only [List.length_map] at sameLength
          exact ⟨by omega, allPrepared, classified.1, classified.2, sameOperations⟩
      · simp at found

private theorem prepareOrdinaryInternalTransition_snapshots_refused (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (snapshots : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some snapshots) :
    prepareOrdinaryInternalTransition? program state operation = none := by
  have scopeRefused := prepareInternalScopeCreation_snapshots_refused program state operation
    (by simp [declared])
  cases origin : internalLocalControlOrigin? operation <;>
    cases scopeOrigin : internalScopeCreationOrigin? operation <;>
    simp [prepareOrdinaryInternalTransition?, origin, scopeOrigin, scopeRefused,
      prepareInternalArming?, declared]

theorem prepareInternalTransition_snapshots_refused (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (snapshots : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some snapshots) :
    prepareInternalTransition? program state operation = none := by
  have messageRefused (contract : InternalMessageTaskContract) :
      prepareInternalMessageTaskContract? program state contract = none := by
    simp [prepareInternalMessageTaskContract?, declared]
  have boundedRefused (contract : InternalBoundedScopeContract) :
      prepareInternalBoundedScope? program state contract = none := by
    cases found : prepareInternalBoundedScope? program state contract with
    | none => rfl
    | some prepared =>
        obtain ⟨_, _, _, _, _, _, _, _, absent, _⟩ :=
          prepareInternalBoundedScope_facts program state contract prepared found
        simp [declared] at absent
  cases operation <;> simp only [prepareInternalTransition?]
  all_goals first
    | exact prepareOrdinaryInternalTransition_snapshots_refused program state _ snapshots declared
    | simp [prepareInternalRegional?, prepareInternalEnd?, prepareTimerTaskInternalTransition?,
        timerTaskContract?, prepareInternalTimerTaskContract?,
        prepareMessageTaskInternalTransition?, messageTaskContract?, messageRefused,
        prepareBoundedScopeInternalTransition?, boundedScopeContract?, boundedRefused, declared]

end BpmnSemantics.SemanticProcess.InternalCommutation
