import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Interrupting Sub-Process boundary Timer

This module owns the atomic arming relation for one embedded Sub-Process occurrence that carries an interrupting boundary Timer. It owns no stimulus admission and no scenario projection.

The deadline is owned by the *parent* scope occurrence, and that is a correctness requirement rather than a modelling preference. `scopeQuiescent` counts an owned Timer wait as live work, so a child-owned deadline would make the child permanently non-quiescent and its normal completion unreachable, with no separating witness under this profile: the deadline arm would still behave correctly and only the quiescence arm would silently deadlock.

Like the bounded User Task family this keeps no stored ownership record. The child occurrence and its deadline are recovered by joining the committed operation to the live occurrence and Timer wait, which is sound only because the profile admits exactly one such Sub-Process with exactly one boundary Timer and because arming is atomic, so the two share one activation ordinal.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Adds the parent-owned deadline to a state that has already entered the child scope. Separate from the entry so the shared scope-entry mechanism stays one owner. -/
def armScopeDeadline (state : RuntimeState) (owner : ScopeOccurrenceId)
    (boundaryTimer : BoundaryTimerArm) : RuntimeState :=
  let activation := timerActivationCount state boundaryTimer.elementId + 1
  { state with
    timerWaits :=
      { processInstanceId := owner.processInstanceId
        owner
        elementId := boundaryTimer.elementId
        activation
        deadlineMs := state.logicalTimeMs + boundaryTimer.durationMs
        output := boundaryTimer.output } :: state.timerWaits
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
  pure (armScopeDeadline entered parent boundaryTimer)

/-- Atomic declarative arming relation with explicit parent ownership, the shared scope entry, and the exact resulting state. -/
inductive BoundedScopeArmingStep : RuntimeState → ControlPlaceId → ControlPlaceId →
    DefinitionScopeId → BoundaryTimerArm → RuntimeState → Prop where
  | arm (before : RuntimeState) (input childEntry : ControlPlaceId)
      (childScopeId : DefinitionScopeId) (boundaryTimer : BoundaryTimerArm)
      (parent : ScopeOccurrenceId) (entered : RuntimeState)
      (owned : onlyTokenOwner? before input = some parent)
      (entry : enterScopeState? before input childEntry childScopeId = some entered) :
      BoundedScopeArmingStep before input childEntry childScopeId boundaryTimer
        (armScopeDeadline entered parent boundaryTimer)

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
          simp [owned, entry] at success
          cases success
          exact .arm before input childEntry childScopeId boundaryTimer parent entered
            owned entry

/-- Arming never leaves the child scope without its deadline: the armed state always holds one more Timer wait than the entry it refines. -/
theorem armBoundedScope_adds_one_deadline (state : RuntimeState)
    (owner : ScopeOccurrenceId) (boundaryTimer : BoundaryTimerArm) :
    (armScopeDeadline state owner boundaryTimer).timerWaits.length =
      state.timerWaits.length + 1 := by
  simp [armScopeDeadline]

/-- Every committed bounded-scope operation, as the child scope it enters paired with its deadline. -/
def boundedScopeOperations (program : Program) :
    List (DefinitionScopeId × BoundaryTimerArm) :=
  program.operations.filterMap fun
    | .enterBoundedScope _ _ _ _ childScopeId boundaryTimer =>
        some (childScopeId, boundaryTimer)
    | _ => none

/-- True when the occurrence names the boundary Timer of a committed bounded-scope operation. This routes an arriving deadline into this family instead of to the ordinary Timer transition, which would emit a token and leave the child region live. -/
def isBoundedScopeDeadlineDefinition (program : Program) (elementId : NodeId) :
    Bool :=
  (boundedScopeOperations program).any fun operation =>
    decide (operation.2.elementId = elementId)

/-- The live deadline named by this full occurrence identity. -/
def boundedScopeDeadlineWait? (state : RuntimeState)
    (timerId : TimerOccurrenceId) : Option TimerWait :=
  state.timerWaits.find? fun candidate =>
    decide (
      candidate.processInstanceId = timerId.processInstanceId &&
        candidate.elementId.value = timerId.elementId.value &&
        candidate.activation = timerId.activation)

/-- The committed operation whose boundary Timer this deadline realizes. -/
def boundedScopeDefinitionFor? (program : Program) (deadline : TimerWait) :
    Option (DefinitionScopeId × BoundaryTimerArm) :=
  (boundedScopeOperations program).find? fun candidate =>
    decide (candidate.2.elementId = deadline.elementId)

/-- The child occurrence this deadline bounds.

Matched on the deadline's own activation ordinal, which atomic arming keeps equal to the child's, so a
deadline left from an earlier activation cannot claim a later child region. Each lookup is a named
definition rather than an inline `find?` inside a `do` block, so a proof can discharge one step at a
time; the `do` form left the elaborated lambdas unmatchable by a `cases` hypothesis. -/
def boundedScopeChildFor? (state : RuntimeState)
    (childScopeId : DefinitionScopeId) (deadline : TimerWait) :
    Option ScopeOccurrenceId :=
  (state.scopeOccurrences.find? fun occurrence =>
    decide (
      occurrence.id.definitionScopeId = childScopeId &&
        occurrence.id.activation = deadline.activation &&
        occurrence.parent = some deadline.owner)).map (·.id)

/-- Commits the deadline arm at its exact deadline, cancelling the live child region.

Clause 13.5.3's order — consume the Timer occurrence, cancel every non-final owner of the child
region, remove the child occurrence, then produce the boundary token in the parent scope — is one
atomic transition with no observable intermediate state. The deadline is owned by the *parent*
occurrence and therefore survives regional cancellation, so it is erased explicitly rather than by
the shared subtree removal. -/
def interruptBoundedScope? (program : Program) (state : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat) : Option RuntimeState :=
  match state.control, boundedScopeDeadlineWait? state timerId with
  | .running _, some deadline =>
      match boundedScopeDefinitionFor? program deadline with
      | none => none
      | some definition =>
          match boundedScopeChildFor? state definition.1 deadline with
          | none => none
          | some child =>
              if logicalTimeMs = deadline.deadlineMs then
                let cancelled :=
                  interruptScope state child deadline.owner definition.2.output
                some
                  { cancelled with
                    timerWaits := cancelled.timerWaits.erase deadline
                    logicalTimeMs := deadline.deadlineMs }
              else none
  | _, _ => none

/-- The deadline arm refuses every firing that is not exactly due, for any program, state, and timer. Quantified rather than fixture-shaped, because a pre-due firing must leave the armed triple able to win later at its exact instant. -/
theorem interruptBoundedScope_none_of_not_due (program : Program)
    (state : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (deadline : TimerWait)
    (found : boundedScopeDeadlineWait? state timerId = some deadline)
    (notDue : logicalTimeMs ≠ deadline.deadlineMs) :
    interruptBoundedScope? program state timerId logicalTimeMs = none := by
  unfold interruptBoundedScope?
  cases state.control <;> simp_all
  cases definitionFound : boundedScopeDefinitionFor? program deadline with
  | none => simp
  | some definition =>
      cases childFound : boundedScopeChildFor? state definition.1 deadline with
      | none => simp [childFound]
      | some child => simp [childFound]

end BpmnSemantics.SemanticProcess
