import BpmnSemantics.SemanticProcess.BoundedScopeArming
import BpmnSemantics.SemanticProcess.RecurringBoundaryTimerLaws

/-! ESL-OWN/CLOSE and the monitored-child account retain the child on firing and retire its exact
Activity/deadline on normal completion. Declaration selection is independent of the interrupting
family; the shared arming and primitive completion owners remain unchanged. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure MonitoredScopeDefinition where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  childEntry : ControlPlaceId
  childScopeId : DefinitionScopeId
  timer : BoundaryTimerArm
  deriving DecidableEq

def monitoredScopeDefinitions (program : Program) : List MonitoredScopeDefinition :=
  program.operations.filterMap fun
    | .enterMonitoredScope id origin input childEntry childScopeId timer =>
        some { id, origin, input, childEntry, childScopeId, timer }
    | _ => none

def isMonitoredScopeDeadlineDefinition (program : Program) (elementId : NodeId) : Bool :=
  (monitoredScopeDefinitions program).any fun definition => decide (definition.timer.elementId = elementId)

def isMonitoredScopeDefinition (program : Program) (scopeId : DefinitionScopeId) : Bool :=
  (monitoredScopeDefinitions program).any fun definition => decide (definition.childScopeId = scopeId)

abbrev armMonitoredScopeState? := armBoundedScopeState?
abbrev MonitoredScopeArmingStep := BoundedScopeArmingStep

theorem armMonitoredScopeState_sound (before after : RuntimeState) (origin : BpmnElementOrigin)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId) (timer : BoundaryTimerArm)
    (success : armMonitoredScopeState? before origin input childEntry childScopeId timer = some after) :
    MonitoredScopeArmingStep before origin input childEntry childScopeId timer after :=
  armBoundedScopeState_sound before after origin input childEntry childScopeId timer success

structure MonitoredScopePair where
  definition : MonitoredScopeDefinition
  child : RuntimeScopeOccurrence
  parent : RuntimeScopeOccurrence
  record : ActivityOccurrence
  timer : Option TimerWait
  completionId : OperationId
  output : ControlPlaceId

def monitoredScopeCompletionOperations (program : Program) (scopeId : DefinitionScopeId) : List SemanticOperation :=
  program.operations.filter fun
    | .completeScope _ _ scope _ => decide (scope = scopeId)
    | _ => false

/-- Entry, origin, child scope and normal continuation have independent immutable bindings. -/
def MonitoredScopeDefinitionBinding (program : Program) (pair : MonitoredScopePair) : Prop :=
  (monitoredScopeDefinitions program).filter (fun definition => decide (definition.childScopeId = pair.definition.childScopeId)) =
    [pair.definition] ∧
  (monitoredScopeDefinitions program).filter (fun definition => decide (definition.origin.elementId = pair.record.activityElementId)) =
    [pair.definition] ∧
  operationOwningScope? program pair.definition.id = some pair.parent.id.definitionScopeId ∧
  pair.record.activityElementId = pair.definition.origin.elementId ∧
  program.definitionScopes.filter (fun scope => decide (scope.id = pair.definition.childScopeId)) =
    [{ id := pair.definition.childScopeId, parentScopeId := some pair.parent.id.definitionScopeId,
       originElementId := pair.definition.origin.elementId }] ∧
  monitoredScopeCompletionOperations program pair.definition.childScopeId =
    [.completeScope pair.completionId pair.definition.origin pair.definition.childScopeId (some pair.output)] ∧
  operationOwningScope? program pair.completionId = some pair.definition.childScopeId

/-- Live child and parent identities and both Activity censuses are checked before mutation. -/
def MonitoredScopeOwnership (state : RuntimeState) (pair : MonitoredScopePair) : Prop :=
  state.scopeOccurrences.filter (fun child => decide (child.id.definitionScopeId = pair.definition.childScopeId)) = [pair.child] ∧
  pair.child.id.definitionScopeId = pair.definition.childScopeId ∧
  pair.child.parent = some pair.parent.id ∧
  state.scopeOccurrences.filter (fun parent => decide (parent.id = pair.parent.id)) = [pair.parent] ∧
  state.activityOccurrences.filter (fun record => decide (record.body = .childScope pair.child.id)) = [pair.record] ∧
  state.activityOccurrences.filter (sameActivityOccurrence pair.record) = [pair.record] ∧
  pair.record.body = .childScope pair.child.id ∧ pair.record.owner = pair.parent.id ∧
  pair.record.processInstanceId = pair.parent.id.processInstanceId ∧
  pair.child.id.processInstanceId = pair.parent.id.processInstanceId ∧
  state.control = .running pair.parent.id.processInstanceId

def monitoredScopeTimerNames (pair : MonitoredScopePair) (timer : TimerWait) : Bool :=
  decide (timer.elementId = pair.definition.timer.elementId ∧ timer.owner = pair.parent.id)

/-- Empty attachments denote a consumed one-shot deadline only. Recurrence requires the exact
live tagged wait; an orphan wait cannot be hidden by dropping its attachment. -/
def MonitoredScopeTimerBinding (state : RuntimeState) (pair : MonitoredScopePair) : Prop :=
  match pair.timer with
  | none => pair.definition.timer.recurrence = none ∧ pair.record.attachedHandlers = [] ∧
      state.timerWaits.filter (monitoredScopeTimerNames pair) = []
  | some timer => pair.record.attachedHandlers = [.timer (boundaryTimerWaitIdentity timer)] ∧
      state.timerWaits.filter (monitoredScopeTimerNames pair) = [timer] ∧
      NonInterruptingBoundaryTimerBinding state pair.record timer pair.definition.timer

def MonitoredScopeBinding (program : Program) (state : RuntimeState) (pair : MonitoredScopePair) : Prop :=
  MonitoredScopeDefinitionBinding program pair ∧ MonitoredScopeOwnership state pair ∧ MonitoredScopeTimerBinding state pair

instance (program : Program) (state : RuntimeState) (pair : MonitoredScopePair) :
    Decidable (MonitoredScopeBinding program state pair) := by
  unfold MonitoredScopeBinding MonitoredScopeDefinitionBinding MonitoredScopeOwnership MonitoredScopeTimerBinding
  cases pair.timer with
  | none => infer_instance
  | some timer =>
      simp only
      unfold NonInterruptingBoundaryTimerBinding
      cases pair.record.body <;> infer_instance

private def monitoredScopeOnly? (values : List α) : Option α :=
  match values with | [value] => some value | _ => none

private def monitoredScopeCandidate? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Option MonitoredScopePair := do
  let definition ← monitoredScopeOnly? ((monitoredScopeDefinitions program).filter fun definition =>
    decide (definition.childScopeId = scopeId))
  let child ← monitoredScopeOnly? (state.scopeOccurrences.filter fun child => decide (child.id.definitionScopeId = scopeId))
  let parentId ← child.parent
  let parent ← monitoredScopeOnly? (state.scopeOccurrences.filter fun parent => decide (parent.id = parentId))
  let record ← monitoredScopeOnly? (state.activityOccurrences.filter fun record => decide (record.body = .childScope child.id))
  let .completeScope completionId _ _ (some output) ← monitoredScopeOnly? (monitoredScopeCompletionOperations program scopeId) | none
  let timer ← match record.attachedHandlers with
    | [] => some none
    | [.timer identity] => (monitoredScopeOnly? (state.timerWaits.filter (timerIdNamesWait identity))).map some
    | _ => none
  pure { definition, child, parent, record, timer, completionId, output }

def monitoredScopePairForChild? (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option { pair : MonitoredScopePair // MonitoredScopeBinding program state pair } := do
  let pair ← monitoredScopeCandidate? program state scopeId
  if bound : MonitoredScopeBinding program state pair then some ⟨pair, bound⟩ else none

/-- The independently stated exact binding is sufficient for child selection, including consumed
one-shot deadlines. The selector does not require a future validity or completion premise. -/
theorem monitoredScopePairForChild_complete (program : Program) (state : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair) :
    monitoredScopePairForChild? program state pair.definition.childScopeId = some ⟨pair, bound⟩ := by
  obtain ⟨definitions, _, _, _, _, completion, _⟩ := bound.1
  obtain ⟨children, _, parent, parents, records, _, _, _, _, _, _⟩ := bound.2.1
  have timerBinding := bound.2.2
  cases deadline : pair.timer with
  | none =>
      simp only [MonitoredScopeTimerBinding, deadline] at timerBinding
      simp [monitoredScopePairForChild?, monitoredScopeCandidate?, definitions, children, parent,
        parents, records, completion, timerBinding.2.1, monitoredScopeOnly?, ← deadline, bound]
  | some timer =>
      simp only [MonitoredScopeTimerBinding, deadline] at timerBinding
      have rebuilt : (MonitoredScopePair.mk pair.definition pair.child pair.parent pair.record
          (some timer) pair.completionId pair.output) = pair := by
        cases pair
        simp_all
      simp [monitoredScopePairForChild?, monitoredScopeCandidate?, definitions, children, parent,
        parents, records, completion, timerBinding.1, timerBinding.2.2.1, monitoredScopeOnly?, rebuilt, bound]

def monitoredScopePairForDeadline? (program : Program) (state : RuntimeState) (identity : TimerOccurrenceId) :
    Option { pair : MonitoredScopePair // MonitoredScopeBinding program state pair } := do
  let definition ← monitoredScopeOnly? ((monitoredScopeDefinitions program).filter fun definition =>
    decide (definition.timer.elementId.value = identity.elementId.value))
  monitoredScopePairForChild? program state definition.childScopeId

def removeMonitoredScopeTimer (waits : List TimerWait) (timer : Option TimerWait) : List TimerWait :=
  match timer with | none => waits | some deadline => waits.erase deadline

/-- The primitive child-completion rewrite plus exact monitored ownership retirement. -/
def completeMonitoredScopePair (state : RuntimeState) (pair : MonitoredScopePair) : RuntimeState :=
  { state with
    tokens := addToken state.tokens pair.output pair.parent.id
    scopeOccurrences := state.scopeOccurrences.filter fun child => decide (child.id ≠ pair.child.id)
    timerWaits := removeMonitoredScopeTimer state.timerWaits pair.timer
    activityOccurrences := state.activityOccurrences.erase pair.record }

/-- This is derived from primitive completion, so no assumed successor frame is needed below. -/
theorem monitoredScope_primitive_completion (program : Program) (state completed : RuntimeState)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program state pair)
    (completion : completeScopeState? state pair.definition.childScopeId (some pair.output) = some completed) :
    scopeQuiescent state pair.child.id = true ∧
    completed = { state with
      tokens := addToken state.tokens pair.output pair.parent.id
      scopeOccurrences := state.scopeOccurrences.filter fun child => decide (child.id ≠ pair.child.id) } := by
  obtain ⟨unique, _, parent, parentCensus, _, _, _, _, _, _, running⟩ := bound.2.1
  have parentMember : pair.parent ∈ state.scopeOccurrences :=
    (List.mem_filter.mp (show pair.parent ∈ state.scopeOccurrences.filter (fun value => decide (value.id = pair.parent.id)) by
      rw [parentCensus]; simp)).1
  have parentPresent : (state.scopeOccurrences.any fun value => value.id == pair.parent.id) = true :=
    List.any_eq_true.mpr ⟨pair.parent, parentMember, by simp⟩
  obtain ⟨quiet, update⟩ := completeScopeState_selected_update state completed _ _ pair.child unique completion
  simp only [parent, running, parentPresent, ↓reduceIte, Option.some.injEq] at update
  exact ⟨quiet, by simpa only [running] using update.symm⟩

inductive MonitoredScopeCompletionStep (program : Program) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) : RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (pair : MonitoredScopePair)
      (bound : MonitoredScopeBinding program before pair)
      (scope : pair.definition.childScopeId = scopeId)
      (output : parentOutput = some pair.output)
      (quiescent : scopeQuiescent before pair.child.id = true) :
      MonitoredScopeCompletionStep program scopeId parentOutput before (completeMonitoredScopePair before pair)

inductive MonitoredScopeSpawnStep (program : Program) (identity : TimerOccurrenceId) (time : Nat) :
    RuntimeState → RuntimeState → Prop where
  | spawn (before after : RuntimeState) (pair : MonitoredScopePair) (timer : TimerWait)
      (bound : MonitoredScopeBinding program before pair)
      (live : pair.timer = some timer)
      (addressed : boundaryTimerWaitIdentity timer = identity)
      (due : time = timer.deadlineMs)
      (fired : NonInterruptingBoundaryTimerStep before pair.record timer pair.definition.timer after) :
      MonitoredScopeSpawnStep program identity time before after

def completeMonitoredScope? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) : Option RuntimeState := do
  let pair ← monitoredScopePairForChild? program state scopeId
  if pair.val.definition.childScopeId = scopeId ∧ parentOutput = some pair.val.output then
    let completed ← completeScopeState? state scopeId parentOutput
    some { completed with
      timerWaits := removeMonitoredScopeTimer completed.timerWaits pair.val.timer
      activityOccurrences := completed.activityOccurrences.erase pair.val.record }
  else none

def spawnFromMonitoredScope? (program : Program) (state : RuntimeState)
    (identity : TimerOccurrenceId) (time : Nat) : Except RecurringBoundaryTimerRefusal (Option RuntimeState) :=
  match monitoredScopePairForDeadline? program state identity with
  | none => .ok none
  | some pair => match pair.val.timer with
    | none => .ok none
    | some timer =>
        if boundaryTimerWaitIdentity timer = identity ∧ time = timer.deadlineMs then
          match fireNonInterruptingBoundaryTimer state pair.val.record timer pair.val.definition.timer with
          | .error refusal => .error refusal
          | .ok after => .ok (some after)
        else .ok none

theorem completeMonitoredScope_sound (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (success : completeMonitoredScope? program before scopeId parentOutput = some after) :
    MonitoredScopeCompletionStep program scopeId parentOutput before after := by
  unfold completeMonitoredScope? at success
  obtain ⟨pair, _, success⟩ := Option.bind_eq_some_iff.mp success
  split at success
  · next selected =>
      obtain ⟨completed, completion, committed⟩ := Option.bind_eq_some_iff.mp success
      rw [← selected.1, selected.2] at completion
      obtain ⟨quiet, update⟩ := monitoredScope_primitive_completion program before completed pair.val pair.property completion
      rw [update] at committed
      cases committed
      exact .complete before pair.val pair.property selected.1 selected.2 quiet
  · contradiction

theorem spawnFromMonitoredScope_sound (program : Program) (before after : RuntimeState)
    (identity : TimerOccurrenceId) (time : Nat)
    (success : spawnFromMonitoredScope? program before identity time = .ok (some after)) :
    MonitoredScopeSpawnStep program identity time before after := by
  unfold spawnFromMonitoredScope? at success
  cases selected : monitoredScopePairForDeadline? program before identity with
  | none => simp [selected] at success
  | some pair =>
      cases live : pair.val.timer with
      | none => simp [selected, live] at success
      | some timer =>
          simp only [selected, live] at success
          split at success
          · next due =>
              cases fired : fireNonInterruptingBoundaryTimer before pair.val.record timer pair.val.definition.timer with
              | error refusal => simp [fired] at success
              | ok result =>
                  simp only [fired, Except.ok.injEq, Option.some.injEq] at success
                  subst result
                  have timerBinding := pair.property.2.2
                  simp only [MonitoredScopeTimerBinding, live] at timerBinding
                  exact .spawn before after pair.val timer pair.property live due.1 due.2
                    (fireNonInterruptingBoundaryTimer_sound before after pair.val.record timer pair.val.definition.timer timerBinding.2.2 fired)
          · simp at success

end BpmnSemantics.SemanticProcess
