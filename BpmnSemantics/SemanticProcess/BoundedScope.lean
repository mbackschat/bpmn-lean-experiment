import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Interrupting Sub-Process boundary Timer

This module owns the atomic arming relation for one embedded Sub-Process occurrence that carries an interrupting boundary Timer. It owns no stimulus admission and no scenario projection.

The deadline is owned by the *parent* scope occurrence, and that is a correctness requirement rather than a modelling preference. `scopeQuiescent` counts an owned Timer wait as live work, so a child-owned deadline would make the child permanently non-quiescent and its normal completion unreachable, with no separating witness under this profile: the deadline arm would still behave correctly and only the quiescence arm would silently deadlock.

Like the bounded User Task family this keeps no stored ownership record. The child occurrence and its deadline are recovered by joining the committed operation to the live occurrence and Timer wait, which is sound only because the profile admits exactly one such Sub-Process with exactly one boundary Timer and because arming is atomic, so the two share one activation ordinal.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Adds the parent-owned deadline to a state that has already entered the child scope. Separate from the entry so the shared scope-entry mechanism stays one owner. -/
def armScopeDeadline (state : RuntimeState) (owner : ScopeOccurrenceId)
    (childScopeId : DefinitionScopeId) (boundaryTimer : BoundaryTimerArm) : RuntimeState :=
  let activation := timerActivationCount state boundaryTimer.elementId + 1
  let deadlineId : OccurrenceId :=
    { processInstanceId := owner.processInstanceId
      elementId := { value := boundaryTimer.elementId.value }
      activation }
  -- The Activity here is the Sub-Process node, and it is keyed by the definition scope it owns. The
  -- two are in bijection: `WellFormedProgram` gives every non-root scope exactly one owning
  -- `embeddedSubProcess`/`enterScope` pair, so the scope identifies the Activity as precisely as the
  -- node would, without threading an origin through this relation and every theorem naming it.
  let childOccurrence := state.scopeOccurrences.find? fun occurrence =>
    decide (occurrence.id.definitionScopeId = childScopeId) &&
      decide (occurrence.parent = some owner)
  { state with
    timerWaits :=
      { processInstanceId := owner.processInstanceId
        owner
        elementId := boundaryTimer.elementId
        activation
        deadlineMs := state.logicalTimeMs + boundaryTimer.durationMs
        output := boundaryTimer.output } :: state.timerWaits
    activityOccurrences :=
      match childOccurrence with
      | none => state.activityOccurrences
      | some child =>
          { processInstanceId := owner.processInstanceId
            activityElementId := { value := childScopeId.value }
            activation := child.id.activation
            owner
            body := .childScope child.id
            attachedTimers := [deadlineId] } :: state.activityOccurrences
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
  pure (armScopeDeadline entered parent childScopeId boundaryTimer)

/-- Atomic declarative arming relation with explicit parent ownership, the shared scope entry, and the exact resulting state. -/
inductive BoundedScopeArmingStep : RuntimeState → ControlPlaceId → ControlPlaceId →
    DefinitionScopeId → BoundaryTimerArm → RuntimeState → Prop where
  | arm (before : RuntimeState) (input childEntry : ControlPlaceId)
      (childScopeId : DefinitionScopeId) (boundaryTimer : BoundaryTimerArm)
      (parent : ScopeOccurrenceId) (entered : RuntimeState)
      (owned : onlyTokenOwner? before input = some parent)
      (entry : enterScopeState? before input childEntry childScopeId = some entered) :
      BoundedScopeArmingStep before input childEntry childScopeId boundaryTimer
        (armScopeDeadline entered parent childScopeId boundaryTimer)

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
    (owner : ScopeOccurrenceId) (childScopeId : DefinitionScopeId)
    (boundaryTimer : BoundaryTimerArm) :
    (armScopeDeadline state owner childScopeId boundaryTimer).timerWaits.length =
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
                -- No explicit erase: regional cancellation withdraws the deadline with the Activity
                -- occurrence record that lists it. The erase used to be necessary because the deadline
                -- is parent-owned and therefore outside the cancelled subtree.
                some
                  { interruptScope state child deadline.owner definition.2.output with
                    logicalTimeMs := deadline.deadlineMs }
              else none
  | _, _ => none

/-- The committed bounded-scope operation this completing child scope belongs to. -/
def boundedScopeDefinitionForChild? (program : Program)
    (childScopeId : DefinitionScopeId) :
    Option (DefinitionScopeId × BoundaryTimerArm) :=
  (boundedScopeOperations program).find? fun candidate =>
    decide (candidate.1 = childScopeId)

/-- The live child occurrence for this definition scope, paired with the parent that owns its deadline. Read before completion, because completion removes the occurrence that names the parent. -/
def boundedScopeChildOccurrence? (state : RuntimeState)
    (childScopeId : DefinitionScopeId) :
    Option (ScopeOccurrenceId × ScopeOccurrenceId) :=
  (state.scopeOccurrences.find? fun occurrence =>
    decide (occurrence.id.definitionScopeId = childScopeId)).bind
      fun occurrence => occurrence.parent.map fun parent => (occurrence.id, parent)

/-- The live deadline armed for exactly this child occurrence.

Matched on the child's activation ordinal as well as the owner and element, which atomic arming keeps
equal, so a deadline left from an earlier activation of the same Sub-Process cannot be withdrawn by a
later child's completion. -/
def parentOwnedDeadline? (state : RuntimeState) (child parent : ScopeOccurrenceId)
    (boundaryTimer : BoundaryTimerArm) : Option TimerWait :=
  state.timerWaits.find? fun candidate =>
    decide (
      candidate.elementId = boundaryTimer.elementId &&
        candidate.owner = parent &&
        candidate.activation = child.activation)

/-- Commits the quiescence arm: the child scope completes and its deadline is withdrawn in the same transition.

Withdrawal is a consequence of the child's completion rather than a transition of its own, so this
composes the shared scope completion instead of reimplementing quiescence. It is also mandatory. The
deadline is owned by the *parent*, so a surviving Timer wait would keep that parent permanently
non-quiescent, and no later firing could consume it either, because `boundedScopeChildFor?` no longer
finds the child region it bounds.

An unbounded scope passes straight through. A bounded scope whose deadline is absent refuses rather
than completing, because atomic arming made that state unreachable and silently accepting it would
publish a completion that no arming could have produced. -/
def completeBoundedScope? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) :
    Option RuntimeState :=
  match completeScopeState? state scopeId parentOutput with
  | none => none
  | some completed =>
      match boundedScopeDefinitionForChild? program scopeId with
      | none => some completed
      | some definition =>
          match boundedScopeChildOccurrence? state scopeId with
          | none => none
          | some occurrence =>
              match parentOwnedDeadline? completed occurrence.1 occurrence.2
                  definition.2 with
              | none => none
              | some deadline =>
                  some { completed with
                          timerWaits := completed.timerWaits.erase deadline
                          activityOccurrences :=
                            completed.activityOccurrences.filter fun record =>
                              !decide (record.body = .childScope occurrence.1) }

/-- Completing a scope that no bounded-scope operation entered is exactly the shared completion, so this family adds no behavior to an ordinary Sub-Process. -/
theorem completeBoundedScope_eq_completeScope_of_unbounded (program : Program)
    (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId)
    (unbounded : boundedScopeDefinitionForChild? program scopeId = none) :
    completeBoundedScope? program state scopeId parentOutput =
      completeScopeState? state scopeId parentOutput := by
  unfold completeBoundedScope?
  cases completeScopeState? state scopeId parentOutput <;> simp [unbounded]

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

/-- A committed bounded-scope operation joins this exact child occurrence and deadline.

Stated over the program's committed operations rather than over either evaluator's lookup, so the
relation below constrains what a legal victory *is* instead of restating how one is computed. The
activation equality is what atomic arming establishes and what keeps a stale deadline from claiming a
later child region. -/
def BoundedScopePairing (program : Program) (child : ScopeOccurrenceId)
    (deadline : TimerWait) : Prop :=
  ∃ operation ∈ boundedScopeOperations program,
    operation.1 = child.definitionScopeId ∧
    operation.2.elementId = deadline.elementId ∧
    deadline.activation = child.activation

/-- Declarative victory relation with exactly two constructors, one per arm.

Both arms require the live child occurrence *and* the live deadline, and both retire both, which is what
makes the victories mutually exclusive without an ownership record. They differ in what happens to the
child region and in logical time: quiescence completes a region that already holds no work and leaves
logical time untouched, while the deadline arm cancels a region that may still be live and advances
logical time to exactly the deadline. Neither arm permits a state in which one member of the pair is
gone and the other is live. -/
inductive BoundedScopeVictoryStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | quiescence (before completed : RuntimeState) (instanceId : SemanticId)
      (child : ScopeOccurrenceId) (deadline : TimerWait)
      (parentOutput : Option ControlPlaceId)
      (running : before.control = .running instanceId)
      (deadlineLive : deadline ∈ before.timerWaits)
      (paired : BoundedScopePairing program child deadline)
      (completion :
        completeScopeState? before child.definitionScopeId parentOutput =
          some completed)
      (deadlineSurvives : deadline ∈ completed.timerWaits) :
      BoundedScopeVictoryStep program before
        { completed with
          timerWaits := completed.timerWaits.erase deadline
          activityOccurrences :=
            completed.activityOccurrences.filter fun record =>
              !decide (record.body = .childScope child) }
  | deadline (before : RuntimeState) (instanceId : SemanticId)
      (child : ScopeOccurrenceId) (deadline : TimerWait)
      (output : ControlPlaceId)
      (running : before.control = .running instanceId)
      (deadlineLive : deadline ∈ before.timerWaits)
      (paired : BoundedScopePairing program child deadline) :
      BoundedScopeVictoryStep program before
        { interruptScope before child deadline.owner output with
          logicalTimeMs := deadline.deadlineMs }

private theorem boundedScopeChildFor_matches (state : RuntimeState)
    (childScopeId : DefinitionScopeId) (deadline : TimerWait)
    (child : ScopeOccurrenceId)
    (found : boundedScopeChildFor? state childScopeId deadline = some child) :
    child.definitionScopeId = childScopeId ∧
      deadline.activation = child.activation := by
  unfold boundedScopeChildFor? at found
  obtain ⟨occurrence, occurrenceFound, occurrenceId⟩ := Option.map_eq_some_iff.mp found
  have property := List.find?_some occurrenceFound
  simp only [Bool.and_eq_true, decide_eq_true_eq] at property
  exact ⟨occurrenceId ▸ property.1.1, occurrenceId ▸ property.1.2.symm⟩

private theorem boundedScopeDefinitionFor_pairs (program : Program)
    (deadline : TimerWait) (definition : DefinitionScopeId × BoundaryTimerArm)
    (found : boundedScopeDefinitionFor? program deadline = some definition) :
    definition ∈ boundedScopeOperations program ∧
      definition.2.elementId = deadline.elementId := by
  unfold boundedScopeDefinitionFor? at found
  exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

/-- Every deadline victory the evaluator produces is permitted by the declarative relation.

This bridge previously took a `parentOwned` hypothesis: that regional cancellation left the deadline in
`timerWaits`, so the evaluator's subsequent erase had something to erase. The hypothesis existed only
because a parent-owned deadline was outside the cancelled subtree by construction, and it was assumed
rather than derived. The Activity occurrence record discharges it by removing the reason it existed:
cancellation now withdraws the deadline with the record that lists it, the evaluator erases nothing, and
the premise is gone rather than weakened.

`deadline_arm_bridge_premise_is_satisfiable` went with it. That theorem existed to keep the premise
non-vacuous, and a satisfiability witness for a premise that no longer appears would assert nothing. Its
disappearance is the intended outcome of the fix and not a lost check. -/
theorem interruptBoundedScope_sound (program : Program) (before after : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : interruptBoundedScope? program before timerId logicalTimeMs = some after) :
    BoundedScopeVictoryStep program before after := by
  unfold interruptBoundedScope? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed => simp [running] at success
  | cancelled => simp [running] at success
  | running instanceId =>
      cases deadlineFound : boundedScopeDeadlineWait? before timerId with
      | none => simp [running, deadlineFound] at success
      | some deadline =>
          cases definitionFound : boundedScopeDefinitionFor? program deadline with
          | none => simp [running, deadlineFound, definitionFound] at success
          | some definition =>
              cases childFound :
                  boundedScopeChildFor? before definition.1 deadline with
              | none =>
                  simp [running, deadlineFound, definitionFound, childFound] at success
              | some child =>
                  simp only [running, deadlineFound, definitionFound, childFound] at success
                  split at success
                  · injection success with success
                    subst success
                    obtain ⟨definitionLive, elementMatches⟩ :=
                      boundedScopeDefinitionFor_pairs program deadline definition
                        definitionFound
                    obtain ⟨childScope, childActivation⟩ :=
                      boundedScopeChildFor_matches before definition.1 deadline child
                        childFound
                    exact .deadline before instanceId child deadline definition.2.output
                      running
                      (List.mem_of_find?_eq_some
                        (by simpa [boundedScopeDeadlineWait?] using deadlineFound))
                      ⟨definition, definitionLive, childScope.symm, elementMatches,
                        childActivation⟩
                  · simp at success

private theorem boundedScopeDefinitionForChild_pairs (program : Program)
    (childScopeId : DefinitionScopeId)
    (definition : DefinitionScopeId × BoundaryTimerArm)
    (found : boundedScopeDefinitionForChild? program childScopeId = some definition) :
    definition ∈ boundedScopeOperations program ∧ definition.1 = childScopeId := by
  unfold boundedScopeDefinitionForChild? at found
  exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

private theorem parentOwnedDeadline_matches (state : RuntimeState)
    (child parent : ScopeOccurrenceId) (boundaryTimer : BoundaryTimerArm)
    (deadline : TimerWait)
    (found : parentOwnedDeadline? state child parent boundaryTimer = some deadline) :
    deadline ∈ state.timerWaits ∧
      deadline.elementId = boundaryTimer.elementId ∧
      deadline.activation = child.activation := by
  unfold parentOwnedDeadline? at found
  have property := List.find?_some found
  simp only [Bool.and_eq_true, decide_eq_true_eq] at property
  exact ⟨List.mem_of_find?_eq_some found, property.1.1, property.2⟩

private theorem boundedScopeChildOccurrence_scope (state : RuntimeState)
    (childScopeId : DefinitionScopeId)
    (occurrence : ScopeOccurrenceId × ScopeOccurrenceId)
    (found : boundedScopeChildOccurrence? state childScopeId = some occurrence) :
    occurrence.1.definitionScopeId = childScopeId := by
  unfold boundedScopeChildOccurrence? at found
  obtain ⟨candidate, candidateFound, mapped⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨parent, _, parentMapped⟩ := Option.map_eq_some_iff.mp mapped
  have property := List.find?_some candidateFound
  simp only [decide_eq_true_eq] at property
  exact parentMapped ▸ property

/-- Every quiescence victory the evaluator produces is permitted by the declarative relation.

`running` is an explicit hypothesis because the shared scope completion decides it and does not export
it; the dispatcher that reaches this transition has already established it. The deadline's liveness in
`before` is *derived* rather than assumed, through the shared completion's component preservation: the
evaluator finds the deadline in the completed state, and completion leaves `timerWaits` untouched. -/
theorem completeBoundedScope_sound (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (bounded : (boundedScopeDefinitionForChild? program scopeId).isSome)
    (success : completeBoundedScope? program before scopeId parentOutput = some after) :
    BoundedScopeVictoryStep program before after := by
  unfold completeBoundedScope? at success
  cases completion : completeScopeState? before scopeId parentOutput with
  | none => simp [completion] at success
  | some completed =>
      cases definitionFound : boundedScopeDefinitionForChild? program scopeId with
      | none => simp [definitionFound] at bounded
      | some definition =>
          cases occurrenceFound : boundedScopeChildOccurrence? before scopeId with
          | none =>
              simp [completion, definitionFound, occurrenceFound] at success
          | some occurrence =>
              cases deadlineFound :
                  parentOwnedDeadline? completed occurrence.1 occurrence.2
                    definition.2 with
              | none =>
                  simp [completion, definitionFound, occurrenceFound,
                    deadlineFound] at success
              | some deadline =>
                  simp only [completion, definitionFound, occurrenceFound,
                    deadlineFound, Option.some.injEq] at success
                  subst success
                  obtain ⟨definitionLive, childScope⟩ :=
                    boundedScopeDefinitionForChild_pairs program scopeId definition
                      definitionFound
                  obtain ⟨deadlineInCompleted, elementMatches, activationMatches⟩ :=
                    parentOwnedDeadline_matches completed occurrence.1 occurrence.2
                      definition.2 deadline deadlineFound
                  obtain ⟨timersPreserved, _⟩ :=
                    completeScopeState_preserves_unrelated_components before completed
                      scopeId parentOutput completion
                  have occurrenceScope :=
                    boundedScopeChildOccurrence_scope before scopeId occurrence
                      occurrenceFound
                  exact .quiescence before completed instanceId occurrence.1 deadline
                    parentOutput running (timersPreserved ▸ deadlineInCompleted)
                    ⟨definition, definitionLive,
                      childScope.trans occurrenceScope.symm, elementMatches.symm,
                      activationMatches⟩
                    (by rw [occurrenceScope]; exact completion) deadlineInCompleted

/-- Neither arm rewinds an activation counter and neither invents End history, so a withdrawn occurrence can never be reissued and no victory is mistaken for a completion event.

Both counters are load-bearing: the scope counter keeps a cancelled child from being re-entered under
its old ordinal, and the timer counter keeps a withdrawn deadline from being re-armed under its own. -/
theorem bounded_scope_victory_preserves_counters_and_history (program : Program)
    (before after : RuntimeState)
    (step : BoundedScopeVictoryStep program before after) :
    after.scopeActivations = before.scopeActivations ∧
      after.timerActivations = before.timerActivations ∧
      after.endOccurrences = before.endOccurrences := by
  cases step with
  | quiescence completed _ _ _ parentOutput _ _ _ completion _ =>
      obtain ⟨_, _, scopes, timers, ends, _⟩ :=
        completeScopeState_preserves_unrelated_components _ completed _ parentOutput
          completion
      exact ⟨scopes, timers, ends⟩
  | deadline => exact ⟨rfl, rfl, rfl⟩

/-- Logical time after any victory is either unchanged or exactly some live deadline.

This is a joint bound over both arms and deliberately **not** a separation law: it carries no arm
hypothesis, so a victory step alone does not say which disjunct its arm produced. The two laws below
own the separation, each quantified over its own evaluator. -/
theorem bounded_scope_victory_logical_time (program : Program)
    (before after : RuntimeState)
    (step : BoundedScopeVictoryStep program before after) :
    after.logicalTimeMs = before.logicalTimeMs ∨
      ∃ deadline ∈ before.timerWaits, after.logicalTimeMs = deadline.deadlineMs := by
  cases step with
  | quiescence completed _ _ _ parentOutput _ _ _ completion _ =>
      exact .inl
        (completeScopeState_preserves_unrelated_components _ completed _ parentOutput
          completion).2.2.2.2.2
  | deadline _ _ deadline _ _ deadlineLive _ =>
      exact .inr ⟨deadline, deadlineLive, rfl⟩

/-- The quiescence arm leaves logical time untouched, for every program, scope, and parent output.

Half of the arms' separation. Quantified over the evaluator rather than over the victory relation,
because the relation's two constructors are indistinguishable from a step alone, so a law stated there
cannot attribute a disjunct to an arm. -/
theorem completeBoundedScope_logical_time (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (success : completeBoundedScope? program before scopeId parentOutput = some after) :
    after.logicalTimeMs = before.logicalTimeMs := by
  unfold completeBoundedScope? at success
  cases completed : completeScopeState? before scopeId parentOutput with
  | none => simp [completed] at success
  | some state =>
      simp only [completed] at success
      -- Every surviving branch returns the completed state, optionally with one timer erased, so the
      -- shared completion's own logical-time preservation is what all of them inherit.
      have preserved :=
        (completeScopeState_preserves_unrelated_components before state scopeId parentOutput
          completed).2.2.2.2.2
      cases definitionFound : boundedScopeDefinitionForChild? program scopeId with
      | none =>
          simp only [definitionFound] at success
          injection success with success
          subst success
          exact preserved
      | some definition =>
          cases occurrenceFound : boundedScopeChildOccurrence? before scopeId with
          | none => simp [definitionFound, occurrenceFound] at success
          | some occurrence =>
              cases deadlineFound :
                  parentOwnedDeadline? state occurrence.1 occurrence.2 definition.2 with
              | none =>
                  simp [definitionFound, occurrenceFound, deadlineFound] at success
              | some deadline =>
                  simp only [definitionFound, occurrenceFound, deadlineFound] at success
                  injection success with success
                  subst success
                  exact preserved

/-- The deadline arm advances logical time to exactly the instant it fired at.

The other half of the separation, and it is exact rather than bounded: combined with
`interruptBoundedScope_none_of_not_due`, which refuses every instant that is not the committed
deadline, the published time is that deadline and no other. -/
theorem interruptBoundedScope_logical_time (program : Program) (before after : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : interruptBoundedScope? program before timerId logicalTimeMs = some after) :
    after.logicalTimeMs = logicalTimeMs := by
  unfold interruptBoundedScope? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed => simp [running] at success
  | cancelled => simp [running] at success
  | running instanceId =>
      cases deadlineFound : boundedScopeDeadlineWait? before timerId with
      | none => simp [running, deadlineFound] at success
      | some deadline =>
          cases definitionFound : boundedScopeDefinitionFor? program deadline with
          | none => simp [running, deadlineFound, definitionFound] at success
          | some definition =>
              cases childFound :
                  boundedScopeChildFor? before definition.1 deadline with
              | none =>
                  simp [running, deadlineFound, definitionFound, childFound] at success
              | some child =>
                  simp only [running, deadlineFound, definitionFound, childFound] at success
                  split at success
                  · rename_i due
                    injection success with success
                    subst success
                    exact due.symm
                  · simp at success

/-- No victory half-withdraws the triple: both arms retire exactly the deadline they were armed with, and that deadline is paired to the child occurrence by a committed operation rather than by proximity.

Stated over the arm's own pending timer list rather than as a non-membership claim, because
The two arms withdraw the deadline by different mechanisms and the statement is unchanged, because the
existential over the pending list absorbs the difference. Quiescence erases from the completed state's
own `timerWaits`; the deadline arm withdraws through regional cancellation of the Activity occurrence
record that lists it, and witnesses the same shape with `deadline :: after.timerWaits` as its pending
list. Stating absence instead would have been an over-reach in exactly the direction the paragraph below
warns about.

`RuntimeState` carries no uniqueness invariant over `timerWaits`: nothing in the type rules out two
identical occurrences, so `erase` removing one does not by itself establish that no copy remains. The
stronger claim — that no later lookup *by key* can rediscover a withdrawn deadline — needs uniqueness of
the (instance, element, activation) key. The type still does not enforce it; `waitIdentitiesUnique`
now names it, and no theorem establishes it of a reachable state. Neither fact is assumed here: the
whole-value fact is why this theorem is stated over a pending list, and the key-uniqueness fact is named
as a claim it does not make. -/
theorem bounded_scope_victory_withdraws_its_own_deadline (program : Program)
    (before after : RuntimeState)
    (step : BoundedScopeVictoryStep program before after) :
    ∃ child deadline, ∃ pending : List TimerWait,
      deadline ∈ before.timerWaits ∧
      BoundedScopePairing program child deadline ∧
      deadline ∈ pending ∧ after.timerWaits = pending.erase deadline := by
  cases step with
  | quiescence completed _ child deadline _ _ deadlineLive paired _ deadlineSurvives =>
      exact ⟨child, deadline, completed.timerWaits, deadlineLive, paired,
        deadlineSurvives, rfl⟩
  | deadline _ child deadline output _ deadlineLive paired =>
      exact ⟨child, deadline,
        deadline :: (interruptScope before child deadline.owner output).timerWaits,
        deadlineLive, paired, by simp, by simp⟩

end BpmnSemantics.SemanticProcess
