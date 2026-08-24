import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.ScopeCompletion
import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Interrupting Sub-Process boundary Timer: arming

This module owns the atomic arming relation for one embedded Sub-Process occurrence that carries an
interrupting boundary Timer, and its cardinality laws. Resolving the race between the child's
completion and its deadline belongs to `BoundedScope`, which this module does not depend on.

The split is by semantic responsibility rather than size: entering a bounded scope and deciding which
arm wins are different questions, they share no definition in either direction, and only the arming
half writes the ownership record.

The deadline is owned by the *parent* scope occurrence, and that is a correctness requirement rather
than a modelling preference. `scopeQuiescent` counts an owned Timer wait as live work, so a
child-owned deadline would make the child permanently non-quiescent and its normal completion
unreachable, with no separating witness under this profile: the deadline arm would still behave
correctly and only the quiescence arm would silently deadlock.

Arming writes the `ActivityOccurrence` record, so the deadline is no longer stranded when its child
region goes. The remaining ordinal joins in this family live in `BoundedScope` and are a recorded gap
in the Lean lane rather than a design choice.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Adds the parent-owned deadline to a state that has already entered the child scope. Separate from the entry so the shared scope-entry mechanism stays one owner. -/
def armScopeDeadline (state : RuntimeState) (owner : ScopeOccurrenceId)
    (childScopeId : DefinitionScopeId) (child : ScopeOccurrenceId)
    (boundaryTimer : BoundaryTimerArm) : RuntimeState :=
  let activation := timerActivationCount state boundaryTimer.elementId + 1
  let deadlineId : OccurrenceId :=
    { processInstanceId := owner.processInstanceId
      elementId := { value := boundaryTimer.elementId.value }
      activation }
  -- The Activity here is the Sub-Process node, and it is keyed by the definition scope it owns. The
  -- two are in bijection: `WellFormedProgram` gives every non-root scope exactly one owning
  -- `embeddedSubProcess`/`enterScope` pair, so the scope identifies the Activity as precisely as the
  -- node would, without threading an origin through this relation and every theorem naming it.
  --
  -- The activation is minted from the Activity's own counter, not from the child's. Reusing the child
  -- ordinal would make the record unable to express a divergence between an Activity's activations and
  -- the occurrences its body produced, which is the one thing the record exists for, and a second
  -- arming would re-mint the same identity.
  let activityActivation := activityActivationCount state { value := childScopeId.value } + 1
  { state with
    timerWaits :=
      { processInstanceId := owner.processInstanceId
        owner
        elementId := boundaryTimer.elementId
        activation
        deadlineMs := state.logicalTimeMs + boundaryTimer.durationMs
        output := boundaryTimer.output } :: state.timerWaits
    activityOccurrences := insertActivityOccurrence
      { processInstanceId := owner.processInstanceId
        activityElementId := { value := childScopeId.value }
        activation := activityActivation
        owner
        body := .childScope child
        attachedTimers := [deadlineId] } state.activityOccurrences
    activityActivations :=
      { taskId := { value := childScopeId.value }, count := activityActivation } ::
        state.activityActivations.filter fun value =>
          decide (value.taskId ≠ { value := childScopeId.value })
    timerActivations :=
      { elementId := boundaryTimer.elementId, count := activation } ::
        state.timerActivations.filter fun value =>
          decide (value.elementId ≠ boundaryTimer.elementId) }

/-- Atomically creates the child scope occurrence, its entry token, and the deadline. None of the three exists without the others, so this refuses rather than producing a partial arm. -/
def armBoundedScopeState? (state : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) (boundaryTimer : BoundaryTimerArm) :
    Option RuntimeState := do
  let parent ← onlyTokenOwner? state input
  let entered ← enterScopeState? state input childEntry childScopeId
  let child ← (entered.scopeOccurrences.find? fun occurrence =>
    decide (occurrence.id.definitionScopeId = childScopeId) &&
      decide (occurrence.parent = some parent)).map (·.id)
  pure (armScopeDeadline entered parent childScopeId child boundaryTimer)

/-- Atomic declarative arming relation with explicit parent ownership, the shared scope entry, and the exact resulting state. -/
inductive BoundedScopeArmingStep : RuntimeState → ControlPlaceId → ControlPlaceId →
    DefinitionScopeId → BoundaryTimerArm → RuntimeState → Prop where
  | arm (before : RuntimeState) (input childEntry : ControlPlaceId)
      (childScopeId : DefinitionScopeId) (boundaryTimer : BoundaryTimerArm)
      (parent : ScopeOccurrenceId) (entered : RuntimeState) (child : ScopeOccurrenceId)
      (owned : onlyTokenOwner? before input = some parent)
      (entry : enterScopeState? before input childEntry childScopeId = some entered)
      (entered_child :
        (entered.scopeOccurrences.find? fun occurrence =>
          decide (occurrence.id.definitionScopeId = childScopeId) &&
            decide (occurrence.parent = some parent)).map (·.id) = some child) :
      BoundedScopeArmingStep before input childEntry childScopeId boundaryTimer
        (armScopeDeadline entered parent childScopeId child boundaryTimer)

theorem armBoundedScopeState_sound (before after : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (boundaryTimer : BoundaryTimerArm)
    (success : armBoundedScopeState? before input childEntry childScopeId
      boundaryTimer = some after) :
    BoundedScopeArmingStep before input childEntry childScopeId boundaryTimer after := by
  unfold armBoundedScopeState? at success
  cases owned : onlyTokenOwner? before input with
  | none => simp [owned] at success
  | some parent =>
      cases entry : enterScopeState? before input childEntry childScopeId with
      | none => simp [owned, entry] at success
      | some entered =>
          cases child :
              (entered.scopeOccurrences.find? fun occurrence =>
                decide (occurrence.id.definitionScopeId = childScopeId) &&
                  decide (occurrence.parent = some parent)).map (·.id) with
          | none => simp [owned, entry, child] at success
          | some childId =>
              simp [owned, entry, child] at success
              cases success
              exact .arm before input childEntry childScopeId boundaryTimer parent entered
                childId owned entry child

/-- Arming never leaves the child scope without its deadline: the armed state always holds one more Timer wait than the entry it refines. -/
theorem armBoundedScope_adds_one_deadline (state : RuntimeState)
    (owner : ScopeOccurrenceId) (childScopeId : DefinitionScopeId)
    (child : ScopeOccurrenceId) (boundaryTimer : BoundaryTimerArm) :
    (armScopeDeadline state owner childScopeId child boundaryTimer).timerWaits.length =
      state.timerWaits.length + 1 := by
  simp [armScopeDeadline]

/-- Arming records exactly one Activity occurrence beside that deadline, so neither exists alone. -/
theorem armBoundedScope_records_one_occurrence (state : RuntimeState)
    (owner : ScopeOccurrenceId) (childScopeId : DefinitionScopeId)
    (child : ScopeOccurrenceId) (boundaryTimer : BoundaryTimerArm) :
    (armScopeDeadline state owner childScopeId child boundaryTimer).activityOccurrences.length =
      state.activityOccurrences.length + 1 := by
  simp [armScopeDeadline, insertActivityOccurrence_length]

/-- The bounded Sub-Process arming root issues its Activity occurrence strictly above the
predecessor Activity-element high-water mark. -/
theorem armScopeDeadline_issues_fresh_activity (state : RuntimeState)
    (owner : ScopeOccurrenceId) (childScopeId : DefinitionScopeId)
    (child : ScopeOccurrenceId) (boundaryTimer : BoundaryTimerArm) :
    activityIdentityIssuingDiscipline state
      (armScopeDeadline state owner childScopeId child boundaryTimer) = true := by
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence
  simp

end BpmnSemantics.SemanticProcess
