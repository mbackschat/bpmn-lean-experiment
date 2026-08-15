import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # BpmnSemantics.SubProcessBoundaryTimerConformance — interrupting Sub-Process boundary Timer locks

These checks own the direct Lean account for the admitted interrupting Sub-Process boundary Timer capsule: the armed triple of child scope occurrence, child entry token, and parent-owned deadline; the two mutually exclusive victories over that triple; and the refusals that keep each arm exact.

The family differs from the Activity boundary Timer in the fact that gives it its own capsule: the cancelled Activity is a *scope*, so interruption arrives from outside a region that may hold its own live work, and the deadline must be withdrawn by quiescent completion rather than left for a later firing. The deadline is owned by the parent occurrence, so regional cancellation does not reach it and both arms must consume it explicitly.
-/

namespace BpmnSemantics.SubProcessBoundaryTimerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-subprocess-boundary-timer-draft"⟩

def processId : ProcessId :=
  ⟨"Process_SubProcessBoundaryTimer"⟩

def rootScopeId : DefinitionScopeId :=
  ⟨"scope:Process_SubProcessBoundaryTimer"⟩

def childScopeId : DefinitionScopeId :=
  ⟨"scope:Scope"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"subprocess-boundary-timer"⟩
        sourceSha256 :=
          "dc2875fb0c24deeab9d8f180fa4adf44652a504778f3dda187ac19839e60016e" }
    processId
    definitionScopes :=
      [ { id := rootScopeId
          parentScopeId := none
          originElementId := ⟨processId.value⟩ }
      , { id := childScopeId
          parentScopeId := some rootScopeId
          originElementId := ⟨"Scope"⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"AfterScope"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"BoundaryEnd"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"ChildEnd"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"ChildStart"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"ChildTask"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"Deadline"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"EscalationTask"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"NormalEnd"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"Scope"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"Start"⟩, scopeId := rootScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"Flow_Boundary"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Boundary_End"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Child"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_Child_End"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_Normal"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Normal_End"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Start"⟩, scopeId := rootScopeId } ]
    nodes :=
      [ .userTask ⟨"AfterScope"⟩ (some "Scope completed in time")
      , .noneEndEvent ⟨"BoundaryEnd"⟩
      , .noneEndEvent ⟨"ChildEnd"⟩
      , .noneStartEvent ⟨"ChildStart"⟩
      , .userTask ⟨"ChildTask"⟩ (some "Work inside the scope")
      , .timerBoundaryEvent ⟨"Deadline"⟩ ⟨"Scope"⟩ .interrupting "PT1S"
          ⟨"Flow_Boundary"⟩
      , .userTask ⟨"EscalationTask"⟩ (some "Deadline reached")
      , .noneEndEvent ⟨"NormalEnd"⟩
      , .embeddedSubProcess ⟨"Scope"⟩ childScopeId
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩
          sourceId := ⟨"Deadline"⟩
          targetId := ⟨"EscalationTask"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩
          sourceId := ⟨"EscalationTask"⟩
          targetId := ⟨"BoundaryEnd"⟩ }
      , { id := ⟨"Flow_Child"⟩
          sourceId := ⟨"ChildStart"⟩
          targetId := ⟨"ChildTask"⟩ }
      , { id := ⟨"Flow_Child_End"⟩
          sourceId := ⟨"ChildTask"⟩
          targetId := ⟨"ChildEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩
          sourceId := ⟨"Scope"⟩
          targetId := ⟨"AfterScope"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩
          sourceId := ⟨"AfterScope"⟩
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"Scope"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel

/-- The scope-entry origin binding rejects an operation claiming an element it does not own.

Without this conjunct the operation could name any element as its host, and every runtime occurrence
the transition creates would be attributed to an element that does not enter the scope. `AfterScope`
is chosen because it is a real node of this program in the parent scope, so only the binding itself
can reject it. -/
theorem misattributed_scope_entry_origin_is_rejected :
    programWellFormed
      { program with
        operations := program.operations.map fun operation =>
          match operation with
          | .enterBoundedScope id _ input childEntry childScopeId boundaryTimer =>
              .enterBoundedScope id ⟨⟨"AfterScope"⟩⟩ input childEntry childScopeId
                boundaryTimer
          | other => other } = false := by
  decide +kernel


/-- The deadline never becomes an independent `awaitTimer`; it exists only as the scope-entry operation's own arm. Without this the program would hold a standalone Timer that no scope owns. -/
theorem boundary_timer_is_not_lowered_as_a_standalone_timer :
    (program.operations.filter fun
      | .awaitTimer .. => true
      | _ => false) = [] := by decide +kernel

theorem exactly_one_scope_owns_a_boundary_deadline :
    (boundedScopeOperations program).length = 1 := by decide +kernel

def instanceId : SemanticId := ⟨"Instance_1"⟩

def childTaskId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"ChildTask"⟩
    activation := 1 }

def deadlineId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"Deadline"⟩
    activation := 1 }

def startCommandId : SemanticId := ⟨"start-process"⟩

def armedState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program initialState
    (.startProcess startCommandId ⟨processId.value⟩ instanceId [])).state

/-- Arming is atomic: entering the Sub-Process creates the child occurrence, its entry token, and the parent-owned deadline together, and the deadline takes activation ordinal one from its own element counter. That shared ordinal is what later recovers the triple without a stored ownership record. -/
theorem scope_and_deadline_arm_atomically :
    (armedState.scopeOccurrences.map fun occurrence =>
        (occurrence.id.definitionScopeId.value, occurrence.id.activation)) =
        [("scope:Scope", 1), ("scope:Process_SubProcessBoundaryTimer", 1)] ∧
      (armedState.timerWaits.map fun wait =>
        (wait.elementId.value, wait.activation, wait.deadlineMs)) =
        [("Deadline", 1, 1000)] ∧
      (armedState.waits.map fun wait => wait.task.id.value) = ["ChildTask"] := by
  decide +kernel

/-- The deadline is owned by the *parent* occurrence, not the child it bounds.

This is a correctness requirement rather than a modelling preference: `scopeQuiescent` counts an owned
Timer wait as live work, so a child-owned deadline would make the child permanently non-quiescent and
its normal completion unreachable. The deadline arm would still behave correctly, so no separating
witness at the public boundary would expose the mistake. -/
theorem deadline_is_owned_by_the_parent_occurrence :
    (armedState.timerWaits.map fun wait =>
      (wait.owner.definitionScopeId.value, wait.owner.activation)) =
      [("scope:Process_SubProcessBoundaryTimer", 1)] := by decide +kernel

/-- `interruptBoundedScope_sound`'s `parentOwned` premise is satisfiable, and this is what keeps that
bridge from being a theorem about nothing.

The premise is an implication guarded by the evaluator's own three lookups, so a state where any lookup
fails satisfies it vacuously and witnesses nothing. This chains all three against the armed state — the
exact state a deadline victory starts from — and requires each to succeed *and* the parent-owned
deadline to survive regional cancellation of the child region. Stating the premise over every
`TimerWait` instead would be unsatisfiable, because `interruptScope` only filters `timerWaits`; a
future weakening in that direction fails here rather than silently deleting the bridge. -/
theorem deadline_arm_bridge_premise_is_satisfiable :
    (do
      let deadline ← boundedScopeDeadlineWait? armedState deadlineId
      let definition ← boundedScopeDefinitionFor? program deadline
      let child ← boundedScopeChildFor? armedState definition.1 deadline
      pure (decide (deadline ∈
        (interruptScope armedState child deadline.owner
          definition.2.output).timerWaits))) = some true := by
  decide +kernel

def quiescentVictoryState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program armedState
    (.completeUserTaskInstance ⟨"complete-child-task"⟩ childTaskId [])).state

/-- `SPTIMER-QUIESCE-01`: child quiescence withdraws the deadline in the same transition.

The child scope's completion is the only instant that may retire the deadline, and it must, because the
deadline is owned by the parent: a surviving Timer wait would keep the *parent* occurrence permanently
non-quiescent and could never be consumed afterwards, since its child region no longer exists. The
published follow-on is the After Scope task on the Sub-Process's normal outgoing Flow. -/
theorem quiescent_completion_withdraws_the_deadline :
    quiescentVictoryState.timerWaits = [] ∧
      (quiescentVictoryState.scopeOccurrences.map fun occurrence =>
        occurrence.id.definitionScopeId.value) =
        ["scope:Process_SubProcessBoundaryTimer"] ∧
      (quiescentVictoryState.waits.map fun wait => wait.task.id.value) =
        ["AfterScope"] := by decide +kernel

/-- The quiescence arm leaves logical time untouched, which is half of the arms' separating law. -/
theorem quiescent_completion_preserves_logical_time :
    quiescentVictoryState.logicalTimeMs = armedState.logicalTimeMs := by
  decide +kernel

def deadlineVictoryState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program armedState
    (.fireTimer ⟨"fire-deadline"⟩ deadlineId 1000)).state

/-- `SPTIMER-INTERRUPT-01`: the deadline arm cancels the child region and follows the boundary route.

The child scope occurrence, its live child task, and the deadline itself are all gone, and the published
follow-on is the Escalation Task rather than After Scope. The deadline is erased explicitly because it
is owned by the parent and therefore survives the regional cancellation that removes everything else. -/
theorem deadline_victory_cancels_the_child_region :
    deadlineVictoryState.timerWaits = [] ∧
      (deadlineVictoryState.scopeOccurrences.map fun occurrence =>
        occurrence.id.definitionScopeId.value) =
        ["scope:Process_SubProcessBoundaryTimer"] ∧
      (deadlineVictoryState.waits.map fun wait => wait.task.id.value) =
        ["EscalationTask"] := by decide +kernel

/-- The other half of the arms' separating law: the deadline arm advances logical time to exactly the deadline, while the quiescence arm above leaves it unchanged. -/
theorem deadline_victory_advances_logical_time_to_the_deadline :
    deadlineVictoryState.logicalTimeMs = 1000 ∧
      armedState.logicalTimeMs = 0 := by decide +kernel

/-- The follow-on User Task identity is the capsule's separating witness, and the two arms differ on it at the approved public boundary rather than through a hidden microstep or storage order. -/
theorem the_two_arms_differ_at_the_public_boundary :
    (quiescentVictoryState.waits.map fun wait => wait.task.id.value) ≠
      (deadlineVictoryState.waits.map fun wait => wait.task.id.value) := by
  decide +kernel

/-- The normal Sub-Process output is unreachable on the deadline arm, the analogue of `SUBERR-NORMAL-01`.

Cancelling the region is not enough on its own: an implementation that cancelled the child and *also*
emitted the normal outgoing token would satisfy every count above while running both routes. -/
theorem normal_output_is_unreachable_on_the_deadline_arm :
    (deadlineVictoryState.tokens.map fun token => token.placeId.value) = [] ∧
      deadlineVictoryState.waits.all (fun wait =>
        wait.task.id.value ≠ "AfterScope") = true := by decide +kernel

/-- A firing one millisecond early leaves the armed triple exactly intact, deadline included, and still able to win at its exact instant.

The interesting half is the *second* conjunct: a refusal that consumed the Timer occurrence while
rejecting the transition would also leave the triple looking untouched at every other observation. -/
theorem an_early_firing_preserves_the_armed_triple :
    (applyStimulus scenarioClosureLimit program armedState
        (.fireTimer ⟨"fire-early"⟩ deadlineId 999)).state = armedState ∧
      (applyStimulus scenarioClosureLimit program armedState
        (.fireTimer ⟨"fire-early"⟩ deadlineId 999)).outcome = .rejected := by
  decide +kernel

/-- Interruption does **not** preserve child-scope-owned runtime state, which is the exact converse of the Error capsule's regional-cancellation preservation claim.

This checked non-law exists to stop the two families from being restated as one over-general
preservation theorem: the Error capsule preserves runtime history across an interrupting handler, while
this arm must destroy the child region's own waits. A single law covering both would be false here. -/
theorem interruption_does_not_preserve_child_scope_state :
    armedState.waits ≠ deadlineVictoryState.waits ∧
      armedState.scopeOccurrences ≠ deadlineVictoryState.scopeOccurrences := by
  decide +kernel

/-- Neither victory rewinds an activation counter or invents End history.

The scope counter is what keeps a cancelled child from being re-entered under its old ordinal, and the
timer counter is what keeps a withdrawn deadline from being re-armed under its own. Both victories are
checked, because a counter reset would be invisible in the follow-on identity that separates them. -/
theorem neither_victory_rewinds_a_counter :
    quiescentVictoryState.scopeActivations = armedState.scopeActivations ∧
      quiescentVictoryState.timerActivations = armedState.timerActivations ∧
      deadlineVictoryState.scopeActivations = armedState.scopeActivations ∧
      deadlineVictoryState.timerActivations = armedState.timerActivations := by
  decide +kernel

/-- Firing the deadline after the child already completed in time. -/
def lateDeadlineResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program quiescentVictoryState
    (.fireTimer ⟨"late-deadline"⟩ deadlineId 1000)

/-- Completing the child task after the deadline already cancelled its region. -/
def lateChildTaskResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program deadlineVictoryState
    (.completeUserTaskInstance ⟨"late-child-task"⟩ childTaskId [])

/-- After either victory the sibling stimulus is ineligible and is rejected with exact state preservation, so no pair can win twice. -/
theorem each_victory_makes_its_sibling_ineligible :
    lateDeadlineResult.outcome = .rejected ∧
      lateDeadlineResult.state = quiescentVictoryState ∧
      lateChildTaskResult.outcome = .rejected ∧
      lateChildTaskResult.state = deadlineVictoryState := by decide +kernel

/-- The same graph with only the deadline's disposition flipped. -/
private def nonInterruptingDeadline : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun
      | .timerBoundaryEvent id attachedToRef _ durationLiteral outputFlowId =>
          .timerBoundaryEvent id attachedToRef .nonInterrupting durationLiteral
            outputFlowId
      | node => node }

/-- A non-interrupting deadline on a Sub-Process host is refused by the attachment rule itself, not merely by the profile's cardinality table.

`enterBoundedScope` is interrupting by construction and discards the disposition it is handed, so a
graph that reached lowering would silently acquire interrupting semantics. Asserting the structural
predicate rather than `checkedWellFormed` is what makes this a fail-closed attachment rule: the
weaker statement would still hold if the only thing refusing the graph were a profile that happens
to pin no such pair. -/
theorem a_non_interrupting_deadline_on_a_scope_host_is_refused_structurally :
    checkedBoundaryTimerAttachmentValid nonInterruptingDeadline = false := by
  decide +kernel

/-- The interrupting original passes that same predicate, so the theorem above discriminates the disposition rather than some other defect the flip introduced. -/
theorem the_interrupting_scope_host_passes_the_same_attachment_rule :
    checkedBoundaryTimerAttachmentValid checkedProcess = true := by decide +kernel

end BpmnSemantics.SubProcessBoundaryTimerConformance
