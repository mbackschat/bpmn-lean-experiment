import BpmnSemantics.SemanticProcess.InternalScopeCreationSelection

/-! Bounded Sub-Process preparation reuses child-entry selection and retains its parent-owned
deadline and Activity as one patch for interrupting and ESL-OWN noninterrupting boundaries under the [complete-family account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#complete-operation-family-census).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalBoundedScopeDisposition where
  | interrupting
  | nonInterrupting
  deriving Repr, DecidableEq

structure InternalBoundedScopeContract where
  operationId : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  entry : ControlPlaceId
  definition : DefinitionScopeId
  timer : BoundaryTimerArm
  disposition : InternalBoundedScopeDisposition := .interrupting
  deriving Repr, DecidableEq

def InternalBoundedScopeContract.operation (contract : InternalBoundedScopeContract) : SemanticOperation :=
  match contract.disposition with
  | .interrupting => .enterBoundedScope contract.operationId contract.origin contract.input contract.entry
      contract.definition contract.timer
  | .nonInterrupting => .enterMonitoredScope contract.operationId contract.origin contract.input contract.entry
      contract.definition contract.timer

/-- This is the existing child-entry selector's input, not an extra Program operation or admission. -/
def InternalBoundedScopeContract.entryOperation (contract : InternalBoundedScopeContract) : SemanticOperation :=
  .enterScope contract.operationId contract.origin contract.input contract.entry contract.definition

def boundedScopeContract? : SemanticOperation → Option InternalBoundedScopeContract
  | .enterBoundedScope operationId origin input entry definition timer =>
      some { operationId, origin, input, entry, definition, timer }
  | .enterMonitoredScope operationId origin input entry definition timer =>
      some { operationId, origin, input, entry, definition, timer, disposition := .nonInterrupting }
  | _ => none

theorem boundedScopeContract_operation (operation : SemanticOperation)
    (contract : InternalBoundedScopeContract) (found : boundedScopeContract? operation = some contract) :
    contract.operation = operation := by
  cases operation <;> simp [boundedScopeContract?] at found
  all_goals cases found; rfl

/-- ESL-OWN shares arming while preserving the exact immutable boundary disposition. -/
theorem boundedScopeContract_roundtrip (contract : InternalBoundedScopeContract) :
    boundedScopeContract? contract.operation = some contract := by
  cases contract with
  | mk operationId origin input entry definition timer disposition =>
      cases disposition <;> rfl

structure InternalBoundedScopeSelection where
  creation : InternalScopeCreationSelection
  timer : TimerWait
  record : ActivityOccurrence
  deriving Repr, DecidableEq

def makeInternalBoundedScopeSelection (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (entry : InternalScopeCreationSelection) :
    InternalBoundedScopeSelection :=
  let activation := timerActivationCount state contract.timer.elementId + 1
  let deadlineId : OccurrenceId :=
    { processInstanceId := entry.owner.processInstanceId
      elementId := ⟨contract.timer.elementId.value⟩
      activation }
  { creation := { entry with operation := contract.operation }
    timer :=
      { processInstanceId := entry.owner.processInstanceId
        owner := entry.owner
        elementId := contract.timer.elementId
        activation
        deadlineMs := state.logicalTimeMs + contract.timer.durationMs
        output := contract.timer.output }
    record :=
      { processInstanceId := entry.owner.processInstanceId
        activityElementId := ⟨contract.origin.elementId.value⟩
        activation := activityActivationCount state ⟨contract.origin.elementId.value⟩ + 1
        owner := entry.owner
        body := .childScope entry.created.id
        attachedHandlers := [.timer deadlineId] } }

def InternalBoundedScopeSelection.apply (state : RuntimeState)
    (selected : InternalBoundedScopeSelection) : RuntimeState :=
  { selected.creation.apply state with
    timerWaits := insertTimerWait selected.timer state.timerWaits
    timerActivations := setTimerActivationCount state.timerActivations
      selected.timer.elementId selected.timer.activation
    activityOccurrences := insertActivityOccurrence selected.record state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations
      ⟨selected.record.activityElementId.value⟩ selected.record.activation }

def selectInternalBoundedScope? (state : RuntimeState)
    (contract : InternalBoundedScopeContract) : Option InternalBoundedScopeSelection := do
  let entry ← selectInternalScopeCreation? state contract.entryOperation
  pure (makeInternalBoundedScopeSelection state contract entry)

/-- The joint deadline activation follows child insertion and keys the Activity by the BPMN
element, as required by the bounded Sub-Process identity correction of 2026-09-22. -/
theorem makeInternalBoundedScopeSelection_refines_deadline (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (entry : InternalScopeCreationSelection) :
    (makeInternalBoundedScopeSelection state contract entry).apply state =
      armScopeDeadline (entry.apply state) entry.owner contract.origin entry.created.id contract.timer := by
  cases entry with
  | mk operation owner input place created kind =>
      cases kind <;> rfl

theorem selectInternalBoundedScope_facts (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (selected : InternalBoundedScopeSelection)
    (found : selectInternalBoundedScope? state contract = some selected) :
    ∃ entry, selectInternalScopeCreation? state contract.entryOperation = some entry ∧
      selected = makeInternalBoundedScopeSelection state contract entry := by
  unfold selectInternalBoundedScope? at found
  obtain ⟨entry, entryFound, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  exact ⟨entry, entryFound, rfl⟩

theorem boundedScope_entry_selection_input (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (entry : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state contract.entryOperation = some entry) :
    entry.input = contract.input ∧ entry.entry = contract.entry ∧ entry.kind = .child := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · cases found; exact ⟨rfl, rfl, rfl⟩

private theorem inserted_child_selected (values : List RuntimeScopeOccurrence)
    (child parent : ScopeOccurrenceId)
    (fresh : values.any (fun occurrence =>
      occurrence.id.definitionScopeId == child.definitionScopeId) = false) :
    ((insertScopeOccurrence { id := child, parent := some parent } values).find?
      (fun occurrence => decide (occurrence.id.definitionScopeId = child.definitionScopeId) &&
        decide (occurrence.parent = some parent))).map (·.id) = some child := by
  induction values with
  | nil => simp [insertScopeOccurrence, canonicalInsertBy]
  | cons head tail ih =>
      simp only [List.any_cons, Bool.or_eq_false_iff] at fresh
      have different : head.id.definitionScopeId ≠ child.definitionScopeId := by simpa using fresh.1
      simp only [insertScopeOccurrence, canonicalInsertBy]
      split
      · simp
      · simpa [List.find?_cons, different, insertScopeOccurrence] using ih fresh.2

/-- The complete retained insertion executes the existing bounded entry, including its actual child
lookup. No intermediate validity, result equality, or extra Program operation is assumed. -/
theorem selectInternalBoundedScope_refines (program : Program) (state : RuntimeState)
    (contract : InternalBoundedScopeContract) (selected : InternalBoundedScopeSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (found : selectInternalBoundedScope? state contract = some selected) :
    fire? program contract.operation state = some (selected.apply state) := by
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected found
  rw [makeInternalBoundedScopeSelection_refines_deadline]
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state contract.entryOperation entry entryFound
  unfold selectInternalScopeCreation? at entryFound
  simp only [running, bind, Option.bind, InternalBoundedScopeContract.entryOperation] at entryFound
  obtain ⟨owner, owned, entryFound⟩ := Option.bind_eq_some_iff.mp entryFound
  split at entryFound
  · contradiction
  · next available =>
      have fresh : state.scopeOccurrences.any (fun occurrence =>
          occurrence.id.definitionScopeId == contract.definition) = false := by
        simp_all
      cases entryFound
      have childFound := inserted_child_selected state.scopeOccurrences
        { processInstanceId := hosting, definitionScopeId := contract.definition
          activation := scopeActivationCount state contract.definition + 1 } owner fresh
      cases disposition : contract.disposition <;>
        simp only [InternalBoundedScopeContract.operation, disposition]
      all_goals
        unfold fire?
        rw [snapshotAbsent]
        change armBoundedScopeState? state contract.origin contract.input contract.entry contract.definition contract.timer = _
        simp only [armBoundedScopeState?, enterScopeState?, owned, running, bind, Option.bind,
          available, Bool.false_eq_true, ↓reduceIte, InternalScopeCreationSelection.apply, pure, Pure.pure]
        rw [childFound]

end BpmnSemantics.SemanticProcess.InternalCommutation
