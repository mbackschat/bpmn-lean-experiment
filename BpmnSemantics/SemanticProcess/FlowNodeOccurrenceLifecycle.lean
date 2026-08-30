import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceFlowNodeOccurrence

/-! # Flow-node occurrence lifecycle -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def stimulusCommandId : Stimulus → SemanticId
  | .startProcess commandId ..
  | .triggerMessageStart commandId ..
  | .triggerTimerStart commandId ..
  | .completeUserTaskInstance commandId ..
  | .deliverMessage commandId ..
  | .deliverPayloadMessage commandId ..
  | .fireTimer commandId ..
  | .completeEffect commandId ..
  | .reportEffectFailure commandId ..
  | .retryIncident commandId ..
  | .cancelIncidentProcess commandId .. => commandId

def scalarBefore (left right : String) : Bool := left < right

def occurrenceBefore (left right : OccurrenceId) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then
    scalarBefore left.processInstanceId.value right.processInstanceId.value
  else if left.elementId ≠ right.elementId then
    scalarBefore left.elementId.value right.elementId.value
  else left.activation < right.activation

def scopeBefore (left right : ScopeOccurrenceId) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then
    scalarBefore left.processInstanceId.value right.processInstanceId.value
  else if left.definitionScopeId ≠ right.definitionScopeId then
    scalarBefore left.definitionScopeId.value right.definitionScopeId.value
  else left.activation < right.activation

def flowNodeOccurrenceAnchorBefore (left right : SemanticFlowNodeOccurrenceAnchor) : Bool :=
  match left, right with
  | .wait left, .wait right => occurrenceBefore left right
  | .wait _, _ => true
  | .scope left, .scope right => scopeBefore left right
  | .scope _, .wait _ => false
  | .scope _, _ => true
  | .callActivity left, .callActivity right => occurrenceBefore left right
  | .callActivity _, .transition .. => true
  | .callActivity _, _ => false
  | .transition leftCommand leftTransition leftLocal, .transition rightCommand rightTransition rightLocal =>
      if leftCommand ≠ rightCommand then
        scalarBefore leftCommand.value rightCommand.value
      else if leftTransition ≠ rightTransition then leftTransition < rightTransition
      else leftLocal < rightLocal
  | .transition .., _ => false

def startBefore (left right : UnnumberedFlowNodeOccurrenceStart) : Bool :=
  if left.anchor ≠ right.anchor then flowNodeOccurrenceAnchorBefore left.anchor right.anchor
  else if left.processId ≠ right.processId then scalarBefore left.processId.value right.processId.value
  else if left.elementId ≠ right.elementId then scalarBefore left.elementId.value right.elementId.value
  else scopeBefore left.owner right.owner

def insertBy (before : α → α → Bool) (value : α) : List α → List α
  | [] => [value]
  | head :: tail =>
      if before value head then value :: head :: tail
      else head :: insertBy before value tail

def sortBy (before : α → α → Bool) : List α → List α
  | [] => []
  | head :: tail => insertBy before head (sortBy before tail)

private theorem mem_insertBy (before : α → α → Bool) (value inserted : α) (values : List α) : value ∈ insertBy before inserted values ↔ value = inserted ∨ value ∈ values := by
  induction values with
  | nil => simp [insertBy]
  | cons head tail ih =>
      simp only [insertBy]
      split <;> simp_all [or_left_comm]

private theorem mem_sortBy (before : α → α → Bool) (value : α) (values : List α) : value ∈ sortBy before values ↔ value ∈ values := by
  induction values with
  | nil => simp [sortBy]
  | cons head tail ih => simp [sortBy, mem_insertBy, ih]

private theorem insertBy_perm (before : α → α → Bool) (value : α) : ∀ values, (insertBy before value values).Perm (value :: values) := by
  intro values
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [insertBy]
      split
      · exact List.Perm.refl _
      · exact (List.Perm.cons head ih).trans (List.Perm.swap value head tail)

private theorem sortBy_perm (before : α → α → Bool) : ∀ values, (sortBy before values).Perm values := by
  intro values
  induction values with
  | nil => rfl
  | cons head tail ih => exact (insertBy_perm before head (sortBy before tail)).trans (List.Perm.cons head ih)

def sortFlowNodeOccurrenceStarts : List UnnumberedFlowNodeOccurrenceStart → List UnnumberedFlowNodeOccurrenceStart := sortBy startBefore

theorem mem_sortFlowNodeOccurrenceStarts (value : UnnumberedFlowNodeOccurrenceStart) (values : List UnnumberedFlowNodeOccurrenceStart) : value ∈ sortFlowNodeOccurrenceStarts values ↔ value ∈ values := by
  exact mem_sortBy startBefore value values

theorem sortFlowNodeOccurrenceStarts_perm (values : List UnnumberedFlowNodeOccurrenceStart) : (sortFlowNodeOccurrenceStarts values).Perm values := sortBy_perm startBefore values

def sortFlowNodeOccurrenceEnds : List UnnumberedFlowNodeOccurrenceEnd → List UnnumberedFlowNodeOccurrenceEnd := sortBy (fun left right => flowNodeOccurrenceAnchorBefore left.anchor right.anchor)

theorem mem_sortFlowNodeOccurrenceEnds (value : UnnumberedFlowNodeOccurrenceEnd) (values : List UnnumberedFlowNodeOccurrenceEnd) : value ∈ sortFlowNodeOccurrenceEnds values ↔ value ∈ values := by
  exact mem_sortBy (fun left right => flowNodeOccurrenceAnchorBefore left.anchor right.anchor) value values

private def uniqueReturnOwner? (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) : Option ScopeOccurrenceId :=
  match state.calledProcessOccurrences.filter fun record =>
      decide (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value) with
  | [record] => some record.calledRoot
  | _ => none

private def uniqueCompletingScopeOwner? (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Option ScopeOccurrenceId :=
  match state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id.definitionScopeId = scopeId) with
  | [occurrence] => some occurrence.id
  | _ => none

private def selectedJoinOwner? (state : RuntimeState)
    (selectionKey : String) : Option ScopeOccurrenceId :=
  match state.selectedBranchSets.filter (selectedBranchJoinReady state selectionKey) with
  | [record] => some record.owner
  | _ => none

def flowNodeSelectedOperationOwner? (state : RuntimeState) :
    SemanticOperation → Option ScopeOccurrenceId
  | .initiate .. | .initiateMessage .. | .initiateTimer .. => rootScopeOccurrence? state
  | .enterScope _ _ input _ _
  | .enterBoundedScope _ _ input _ _ _
  | .invokeProcess _ _ input _ _ _ _
  | .awaitUserTask _ _ input _ _
  | .awaitDataInputUserTask _ _ input _ _ _ _
  | .awaitDataOutputUserTask _ _ input _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ _ input _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ _ input _ _ _ _ _ _ _
  | .awaitTimer _ _ input _ _
  | .awaitMessage _ _ input _ _
  | .awaitPayloadMessage _ _ input _ _ _
  | .awaitEventRace _ _ input _ _
  | .awaitBoundedUserTask _ _ input _ _
  | .awaitMonitoredUserTask _ _ input _ _
  | .awaitEffect _ _ input _ _ _
  | .duplicate _ _ input _
  | .choose _ _ input _ _ _
  | .selectMany _ _ input _ _ _
  | .throwError _ _ input _ _
  | .reachNoneEnd _ _ input
  | .terminateScope _ _ input _ => onlyTokenOwner? state input
  | .synchronize _ _ inputs _ => commonTokenOwner? state inputs
  | .mergeExclusive _ _ inputs _ =>
      match exclusiveMergeInputTokens state inputs with
      | [token] => some token.owner
      | _ => none
  | .synchronizeSelected _ _ _ _ selectionKey => selectedJoinOwner? state selectionKey
  | .returnProcess id origin _ _ _ => uniqueReturnOwner? state id origin
  | .awaitMessageBoundedUserTask .. => none
  | .completeParallelMultiInstanceUserTask .. => none
  | .completeScope _ _ scopeId _ => uniqueCompletingScopeOwner? state scopeId

def hostingInstanceId? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId | .completed instanceId | .cancelled instanceId => some instanceId
  | .notStarted => none

def processIdForOwner? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Option ProcessId := do
  let hosting ← hostingInstanceId? state
  if !flowNodeOccurrenceOwnerLiveUnique state owner then none
  else if owner.processInstanceId = hosting then some program.processId
  else
    match state.calledProcessOccurrences.filter fun record =>
        decide (record.calledRoot.processInstanceId = owner.processInstanceId) with
    | [record] => some record.calledProcessId
    | _ => none

private def occurrenceId (processInstanceId : SemanticId) (elementId : NodeId)
    (activation : Nat) : OccurrenceId :=
  { processInstanceId, elementId := ⟨elementId.value⟩, activation }

def waitStart? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (elementId : NodeId) (activation : Nat) :
    Option OpenSemanticFlowNodeOccurrence := do
  let processId ← processIdForOwner? program state owner
  pure
    { anchor := .wait (occurrenceId owner.processInstanceId elementId activation)
      processId
      elementId
      owner }

def scopeStart? (program : Program) (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) : Option OpenSemanticFlowNodeOccurrence := do
  let owner ← occurrence.parent
  let processId ← processIdForOwner? program state owner
  let definition ← match program.definitionScopes.filter fun scope =>
      decide (scope.id = occurrence.id.definitionScopeId) with
    | [definition] => some definition
    | _ => none
  pure
    { anchor := .scope occurrence.id
      processId
      elementId := definition.originElementId
      owner }

def callStart? (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) : Option OpenSemanticFlowNodeOccurrence := do
  let processId ← processIdForOwner? program state record.caller
  pure
    { anchor := .callActivity record.id
      processId
      elementId := ⟨record.id.elementId.value⟩
      owner := record.caller }

def projectWaits? (program : Program) (state : RuntimeState) :
    Option (List OpenSemanticFlowNodeOccurrence) := do
  let tasks ← state.waits.mapM fun wait =>
    waitStart? program state wait.owner ⟨wait.task.id.value⟩ wait.activation
  let messages ← state.messageWaits.mapM fun wait =>
    waitStart? program state wait.owner wait.elementId wait.activation
  let timers ← (state.timerWaits.filter fun wait =>
    !flowNodeOccurrenceBoundaryTimerBound program state wait).mapM
    fun wait => waitStart? program state wait.owner wait.elementId wait.activation
  let effects ← state.effectWaits.mapM fun wait =>
    waitStart? program state wait.owner wait.elementId wait.activation
  let incidents ← state.effectIncidents.mapM fun incident =>
    waitStart? program state incident.wait.owner incident.wait.elementId incident.wait.activation
  pure (tasks ++ messages ++ timers ++ effects ++ incidents)

private def runtimeExecutionEmpty (state : RuntimeState) : Bool :=
  state.scopeOccurrences.isEmpty && state.tokens.isEmpty && state.waits.isEmpty &&
    state.messageWaits.isEmpty && state.timerWaits.isEmpty && state.effectWaits.isEmpty &&
    state.effectIncidents.isEmpty && state.selectedBranchSets.isEmpty &&
    state.eventRaces.isEmpty && state.calledProcessOccurrences.isEmpty &&
    state.variables.activities.isEmpty

def projectOpenFlowNodeOccurrences? (program : Program) (state : RuntimeState) :
    Option (List OpenSemanticFlowNodeOccurrence) :=
  match state.control with
  | .notStarted => if runtimeExecutionEmpty state then some [] else none
  | .completed _ | .cancelled _ => if runtimeExecutionEmpty state then some [] else none
  | .running _ => do
      if !programWellFormed program || !flowNodeOccurrenceProgramValidity program state ||
          !eventRaceAssociationsValid state || !calledProcessAssociationsValid state ||
          !effectIncidentAssociationsValid state then none
      let waits ← projectWaits? program state
      let scopes ← (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
        (scopeStart? program state)
      let calls ← state.calledProcessOccurrences.mapM (callStart? program state)
      let projected := sortFlowNodeOccurrenceStarts (waits ++ scopes ++ calls)
      if projected.map (·.anchor) |>.Nodup then some projected else none

def transitionAnchor : SemanticFlowNodeOccurrenceAnchor → Bool
  | .transition .. => true
  | .wait _ | .scope _ | .callActivity _ => false

def availableAfterStarts (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta) : List OpenSemanticFlowNodeOccurrence :=
  sortFlowNodeOccurrenceStarts (current ++ delta.started)

def removeEndedFlowNodeOccurrences (available : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) : List OpenSemanticFlowNodeOccurrence :=
  available.filter fun occurrence => !(ended.map (·.anchor)).contains occurrence.anchor

theorem mem_removeEndedFlowNodeOccurrences (occurrence : OpenSemanticFlowNodeOccurrence)
    (available : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) :
    occurrence ∈ removeEndedFlowNodeOccurrences available ended ↔
      occurrence ∈ available ∧ !(ended.map (·.anchor)).contains occurrence.anchor = true := by
  simp [removeEndedFlowNodeOccurrences]

def applyFlowNodeOccurrenceDelta? (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta) :
    Option (List OpenSemanticFlowNodeOccurrence) :=
  let available := availableAfterStarts current delta
  let freshAnchors := (current ++ delta.started).map (·.anchor)
  let availableAnchors := available.map (·.anchor)
  let endedAnchors := delta.ended.map (·.anchor)
  if !freshAnchors.Nodup || !endedAnchors.Nodup ||
      !endedAnchors.all availableAnchors.contains then none
  else if !(delta.started.filter fun start => transitionAnchor start.anchor).all fun start =>
      endedAnchors.contains start.anchor then none
  else if !(delta.ended.filter fun ending => transitionAnchor ending.anchor).all fun ending =>
      delta.started.map (·.anchor) |>.contains ending.anchor then none
  else
    let result := removeEndedFlowNodeOccurrences available delta.ended
    if result.any fun occurrence => transitionAnchor occurrence.anchor then none
    else some result

def foldFlowNodeOccurrenceDeltas :
    List OpenSemanticFlowNodeOccurrence → List UnnumberedFlowNodeOccurrenceDelta →
      Option (List OpenSemanticFlowNodeOccurrence)
  | current, [] => some current
  | current, delta :: rest => do
      let successor ← applyFlowNodeOccurrenceDelta? current delta
      foldFlowNodeOccurrenceDeltas successor rest

private def identityBefore (left right : FlowNodeIdentity) : Bool :=
  if left.processId ≠ right.processId then scalarBefore left.processId.value right.processId.value
  else if left.elementId ≠ right.elementId then scalarBefore left.elementId.value right.elementId.value
  else scopeBefore left.owner right.owner

private def numberInstantaneous (commandId : SemanticId) (transitionIndex : Nat) :
    Nat → List FlowNodeIdentity → List UnnumberedFlowNodeOccurrenceStart
  | _, [] => []
  | localIndex, identity :: rest =>
      { anchor := .transition commandId transitionIndex localIndex
        processId := identity.processId
        elementId := identity.elementId
        owner := identity.owner } ::
        numberInstantaneous commandId transitionIndex (localIndex + 1) rest

def instantaneousFlowNodeOccurrenceDelta (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity) : UnnumberedFlowNodeOccurrenceDelta :=
  let started := numberInstantaneous commandId transitionIndex 0
    (sortBy identityBefore identities)
  { started := sortFlowNodeOccurrenceStarts started
    ended := sortFlowNodeOccurrenceEnds (started.map fun start =>
      { anchor := start.anchor, terminal := .completed }) }

def canonicalFlowNodeOccurrenceDelta (started : List UnnumberedFlowNodeOccurrenceStart)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) : UnnumberedFlowNodeOccurrenceDelta :=
  { started := sortFlowNodeOccurrenceStarts started
    ended := sortFlowNodeOccurrenceEnds ended }

private def completedEnd (anchor : SemanticFlowNodeOccurrenceAnchor) :
    UnnumberedFlowNodeOccurrenceEnd := { anchor, terminal := .completed }

private def cancelledEnd (anchor : SemanticFlowNodeOccurrenceAnchor) :
    UnnumberedFlowNodeOccurrenceEnd := { anchor, terminal := .cancelled }

def activationForTask (state : RuntimeState) (id : TaskDefinitionId) : Nat :=
  (state.activations.find? fun activation => decide (activation.taskId = id)).map (·.count) |>.getD 0

def activationForNode (values : List (NodeId × Nat)) (id : NodeId) : Nat :=
  (values.find? fun value => decide (value.1 = id)).map (·.2) |>.getD 0

def instantaneousFlowNodeOccurrenceDeltaWithEnds (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity)
    (extraEnds : List UnnumberedFlowNodeOccurrenceEnd) : UnnumberedFlowNodeOccurrenceDelta :=
  let instant := instantaneousFlowNodeOccurrenceDelta commandId transitionIndex identities
  canonicalFlowNodeOccurrenceDelta instant.started (instant.ended ++ extraEnds)

def flowNodeOccurrenceOwnedBySubtree (state : RuntimeState) (root : ScopeOccurrenceId)
    (occurrence : OpenSemanticFlowNodeOccurrence) : Bool :=
  let called := calledInstanceClosure state root
  match occurrence.anchor with
  | .scope scopeId => occurrenceInSubtree state.scopeOccurrences root scopeId ||
      called.contains scopeId.processInstanceId
  | .wait _ | .callActivity _ => occurrenceInSubtree state.scopeOccurrences root occurrence.owner ||
      called.contains occurrence.owner.processInstanceId
  | .transition .. => false

def ownedSubtreeCancellationEnds? (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) : Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let current ← projectOpenFlowNodeOccurrences? program state
  pure (current.filter (flowNodeOccurrenceOwnedBySubtree state root) |>.map fun occurrence =>
    cancelledEnd occurrence.anchor)

def terminationSubtreeCancellationEnds? (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) : Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let cancelled ← ownedSubtreeCancellationEnds? program state root
  pure (cancelled.filter fun terminal => terminal.anchor ≠ .scope root)

private def lifecycleEventRaceForMessage? (state : RuntimeState)
    (id : MessageSubscriptionId) : Option EventRace :=
  match state.eventRaces.filter fun race => decide (race.messageSubscriptionId = id) with
  | [race] => some race
  | _ => none

private def lifecycleEventRaceForTimer? (state : RuntimeState)
    (id : TimerOccurrenceId) : Option EventRace :=
  match state.eventRaces.filter fun race => decide (race.timerOccurrenceId = id) with
  | [race] => some race
  | _ => none

private def taskForBoundaryTimer? (operations : List (ControlPlaceId × BoundedTaskArm × BoundaryTimerArm))
    (state : RuntimeState) (timer : TimerWait) : Option UserTaskWait := do
  let operation ← operations.find? fun candidate => decide (candidate.2.2.elementId = timer.elementId)
  state.waits.find? fun wait => decide (wait.task.id = operation.2.1.id &&
    wait.activation = timer.activation && wait.owner = timer.owner)

private def waitEnd (id : OccurrenceId) (terminal : FlowNodeOccurrenceTerminalKind) :
    UnnumberedFlowNodeOccurrenceEnd := { anchor := .wait id, terminal }

private def sequentialMultiInstanceCompletionDelta? (program : Program) (before : RuntimeState) (taskId : OccurrenceId) : Option UnnumberedFlowNodeOccurrenceDelta := do
  let operation ← sequentialMultiInstanceOperationForTask? program ⟨taskId.elementId.value⟩
  let arm ← SequentialMultiInstanceArm.ofOperation? operation
  let record ← activityOccurrenceForTask? before.activityOccurrences taskId
  let controller ← sequentialMultiInstanceControllerFor? before.sequentialMultiInstanceControllers record
  let current ← before.waits.find? (taskIdNamesWait taskId)
  let started ← if completedInstanceCount controller + 1 < controller.snapshot.length then do
      let identity ← candidateOperationFlowNodeIdentity? program operation current.owner current.owner ⟨arm.taskId.value⟩
      pure [{ anchor := .wait (occurrenceId current.processInstanceId ⟨arm.taskId.value⟩
        (current.activation + 1)), processId := identity.processId, elementId := identity.elementId, owner := identity.owner }]
    else pure []
  pure (canonicalFlowNodeOccurrenceDelta started [waitEnd taskId .completed])

def interruptingBoundaryCancellationDelta? (program : Program) (before : RuntimeState)
    (commandId : SemanticId) (transitionIndex : Nat) (timer : TimerWait)
    (definition : DefinitionScopeId × BoundaryTimerArm) :
    Option (ScopeOccurrenceId × UnnumberedFlowNodeOccurrenceDelta) := do
  let root ← boundedScopeChildFor? before definition.1 timer
  let identity ← candidateFlowNodeIdentity? program timer.owner timer.elementId
  let cancelled ← ownedSubtreeCancellationEnds? program before root
  pure (root, instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
    [identity] cancelled)

def flowNodeOccurrenceThrowingScopeParent? (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  match state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = owner) with
  | [{ parent := some parent, .. }] => some parent
  | _ => none

def errorPropagationCancellationDelta? (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat)
    (owner : ScopeOccurrenceId)
    (origin : BpmnElementOrigin) (handler : InterruptingErrorHandler) :
    Option (ScopeOccurrenceId × UnnumberedFlowNodeOccurrenceDelta) := do
  let parent ← flowNodeOccurrenceThrowingScopeParent? before owner
  let errorIdentity ← candidateOperationFlowNodeIdentity? program operation owner owner
    origin.elementId
  let boundaryIdentity ← candidateOperationFlowNodeIdentity? program operation owner parent
    handler.origin.boundaryEventId
  let cancelled ← ownedSubtreeCancellationEnds? program before owner
  pure (owner, instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
    [errorIdentity, boundaryIdentity] cancelled)

def terminateScopeCancellationDelta? (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat)
    (owner : ScopeOccurrenceId)
    (origin : BpmnElementOrigin) :
    Option (ScopeOccurrenceId × UnnumberedFlowNodeOccurrenceDelta) := do
  let ending ← candidateOperationFlowNodeIdentity? program operation owner owner origin.elementId
  let cancelled ← terminationSubtreeCancellationEnds? program before owner
  pure (owner, instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
    [ending] cancelled)

def incidentRootCancellationDelta? (program : Program) (before : RuntimeState)
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId) :
    Option (ScopeOccurrenceId × UnnumberedFlowNodeOccurrenceDelta) := do
  let root ← incidentProcessCancellationRoot? program before processInstanceId incidentId
  let cancelled ← ownedSubtreeCancellationEnds? program before root
  pure (root, canonicalFlowNodeOccurrenceDelta [] cancelled)

def candidateFlowNodeOccurrenceDeltaForStimulus? (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  match stimulus with
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. => some (canonicalFlowNodeOccurrenceDelta [] [])
  | .completeUserTaskInstance _ taskId submitted =>
      match parallelMultiInstanceEntryForTask? program ⟨taskId.elementId.value⟩ with
      | some _ => do
          let ends ← parallelCompletionFlowNodeEnds? program before taskId submitted
          pure (canonicalFlowNodeOccurrenceDelta [] ends)
      | none =>
          match sequentialMultiInstanceOperationForTask? program ⟨taskId.elementId.value⟩ with
          | some _ => sequentialMultiInstanceCompletionDelta? program before taskId
          | none =>
              if before.waits.any fun wait => decide
                  (wait.processInstanceId = taskId.processInstanceId &&
                    wait.task.id.value = taskId.elementId.value &&
                    wait.activation = taskId.activation) then
                some (canonicalFlowNodeOccurrenceDelta [] [waitEnd taskId .completed])
              else none
  | .deliverMessage _ subscriptionId _ =>
      if !(before.messageWaits.any fun wait => decide (wait.processInstanceId = subscriptionId.processInstanceId &&
          wait.elementId.value = subscriptionId.elementId.value && wait.activation = subscriptionId.activation)) then none
      else match lifecycleEventRaceForMessage? before subscriptionId with
        | some race => some (canonicalFlowNodeOccurrenceDelta []
            [waitEnd race.messageSubscriptionId .completed, waitEnd race.timerOccurrenceId .cancelled])
        | none => some (canonicalFlowNodeOccurrenceDelta [] [waitEnd subscriptionId .completed])
  | .deliverPayloadMessage _ subscriptionId _ _ =>
      if before.messageWaits.any fun wait => decide
          (wait.processInstanceId = subscriptionId.processInstanceId &&
            wait.elementId.value = subscriptionId.elementId.value &&
            wait.activation = subscriptionId.activation) then
        some (canonicalFlowNodeOccurrenceDelta [] [waitEnd subscriptionId .completed])
      else none
  | .fireTimer _ timerId _ => do
      let timer ← before.timerWaits.find? fun wait => decide
        (wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value && wait.activation = timerId.activation)
      match lifecycleEventRaceForTimer? before timerId with
      | some race => pure (canonicalFlowNodeOccurrenceDelta []
          [waitEnd race.timerOccurrenceId .completed, waitEnd race.messageSubscriptionId .cancelled])
      | none =>
          let identity ← candidateFlowNodeIdentity? program timer.owner timer.elementId
          match parallelMultiInstanceEntryForTimer? program timer.elementId with
          | some _ => do
              let cancelled ← parallelTimerFlowNodeEnds? program before timerId
              pure (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
                [identity] cancelled)
          | none =>
              match sequentialMultiInstanceOperationForTimer? program timer.elementId with
              | some _ => do
                  let record ← activityOccurrenceForTimer? before.activityOccurrences timerId
                  let body ← activityBodyTask? record
                  let _ ← before.waits.find? (taskIdNamesWait body)
                  pure (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex
                    [identity] [waitEnd body .cancelled])
              | none =>
                  match taskForBoundaryTimer? (boundedTaskOperations program) before timer with
                  | some task => pure (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId
                      transitionIndex [identity]
                      [waitEnd (occurrenceId task.processInstanceId
                        ⟨task.task.id.value⟩ task.activation) .cancelled])
                  | none =>
                      if isMonitoredBoundaryTimerDefinition program timer.elementId then
                        pure (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity])
                      else match boundedScopeDefinitionFor? program timer with
                        | some definition => do
                            let branch ← interruptingBoundaryCancellationDelta? program before
                              commandId transitionIndex timer definition
                            pure branch.2
                        | none => pure (canonicalFlowNodeOccurrenceDelta []
                            [waitEnd timerId .completed])
  | .completeEffect _ effectId result => do
      let wait ← before.effectWaits.find? (effectOccurrenceMatches effectId)
      match result with
      | .success _ => pure (canonicalFlowNodeOccurrenceDelta [] [waitEnd effectId .completed])
      | .bpmnError code _ _ => do
          let route ← wait.bpmnErrorRoute
          if route.code ≠ code then none
          let identity ← candidateFlowNodeIdentity? program wait.owner route.origin.boundaryEventId
          pure (instantaneousFlowNodeOccurrenceDeltaWithEnds commandId transitionIndex [identity]
            [waitEnd effectId .cancelled])
  | .reportEffectFailure .. | .retryIncident .. => some (canonicalFlowNodeOccurrenceDelta [] [])
  | .cancelIncidentProcess _ processInstanceId incidentId => do
      let branch ← incidentRootCancellationDelta? program before processInstanceId incidentId
      pure branch.2

def candidateFlowNodeOccurrenceDeltaForOperation? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  let owner ← flowNodeSelectedOperationOwner? before operation
  let identityFor := candidateOperationFlowNodeIdentity? program operation owner owner
  match operation with
  | .initiate _ origin _ | .initiateMessage _ origin _ _ | .initiateTimer _ origin _ _ =>
      pure (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [← identityFor origin.elementId])
  | .enterScope _ _ _ _ childScopeId | .enterBoundedScope _ _ _ _ childScopeId _ =>
      let child ← match after.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id.definitionScopeId = childScopeId && occurrence.parent = some owner) with
        | [child] => some child
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateScopeStart? program operation owner child] [])
  | .invokeProcess _ origin _ _ _ _ _ =>
      let activation := callActivationCount before origin.elementId + 1
      let id := occurrenceId owner.processInstanceId origin.elementId activation
      let record ← match after.calledProcessOccurrences.filter fun record => decide (record.id = id) with
        | [record] => some record
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateCallStart? program operation owner record] [])
  | .returnProcess id origin _ _ _ =>
      let record ← match before.calledProcessOccurrences.filter fun record =>
          decide (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value) with
        | [record] => some record
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [] [completedEnd (.callActivity record.id)])
  | .awaitUserTask _ _ _ _ task =>
      let activation := activationForTask before task.id + 1
      let wait ← match after.waits.filter fun wait => decide
          (wait.owner = owner && wait.task.id = task.id && wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateUserTaskStart? program operation owner wait] [])
  | .awaitDataInputUserTask _ _ _ _ taskId _ _
  | .awaitDataOutputUserTask _ _ _ _ taskId _ _ =>
      let activation := activationForTask before taskId + 1
      let wait ← match after.waits.filter fun wait => decide
          (wait.owner = owner && wait.task.id = taskId && wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateUserTaskStart? program operation owner wait] [])
  | .awaitTimer _ _ _ _ timer =>
      let activation := activationForNode (before.timerActivations.map fun value => (value.elementId, value.count)) timer.elementId + 1
      let wait ← match after.timerWaits.filter fun wait => decide
          (wait.owner = owner && wait.elementId = timer.elementId && wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateTimerStart? program operation owner wait] [])
  | .awaitMessage _ _ _ _ message =>
      let activation := activationForNode (before.messageActivations.map fun value => (value.elementId, value.count)) message.elementId + 1
      let wait ← match after.messageWaits.filter fun wait => decide
          (wait.owner = owner && wait.elementId = message.elementId && wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateMessageStart? program operation owner wait] [])
  | .awaitPayloadMessage _ _ _ _ message _ =>
      let activation := activationForNode
        (before.messageActivations.map fun value => (value.elementId, value.count))
        message.elementId + 1
      let wait ← match after.messageWaits.filter fun wait => decide
          (wait.owner = owner && wait.elementId = message.elementId &&
            wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta
        [← candidateMessageStart? program operation owner wait] [])
  | .awaitEventRace _ origin _ _ _ =>
      let activation := activationForNode (before.eventRaceActivations.map fun value => (value.elementId, value.count)) origin.elementId + 1
      let gateway ← identityFor origin.elementId
      let race ← match after.eventRaces.filter fun race => decide
          (race.owner = owner && race.id.elementId.value = origin.elementId.value &&
            race.id.activation = activation) with
        | [race] => some race
        | _ => none
      let messageWait ← match after.messageWaits.filter fun wait => decide
          (wait.processInstanceId = race.messageSubscriptionId.processInstanceId &&
            wait.elementId.value = race.messageSubscriptionId.elementId.value &&
            wait.activation = race.messageSubscriptionId.activation) with
        | [wait] => some wait
        | _ => none
      let timerWait ← match after.timerWaits.filter fun wait => decide
          (wait.processInstanceId = race.timerOccurrenceId.processInstanceId &&
            wait.elementId.value = race.timerOccurrenceId.elementId.value &&
            wait.activation = race.timerOccurrenceId.activation) with
        | [wait] => some wait
        | _ => none
      let starts ← candidateEventRaceStarts? program operation owner race messageWait timerWait
      let instant := instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [gateway]
      pure (canonicalFlowNodeOccurrenceDelta (instant.started ++ [starts.1, starts.2]) instant.ended)
  | .awaitBoundedUserTask _ _ _ task _ | .awaitMonitoredUserTask _ _ _ task _ =>
      let activation := activationForTask before task.id + 1
      let wait ← match after.waits.filter fun wait => decide
          (wait.owner = owner && wait.task.id = task.id && wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateUserTaskStart? program operation owner wait] [])
  | .awaitMessageBoundedUserTask .. => none
  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
      let activation := activationForTask before task.id + 1
      match after.waits.filter fun wait => decide (wait.owner = owner && wait.task.id = task.id &&
          wait.activation = activation) with
      | [wait] => pure (canonicalFlowNodeOccurrenceDelta
          [← candidateUserTaskStart? program operation owner wait] [])
      | [] => pure (canonicalFlowNodeOccurrenceDelta [] [])
      | _ => none
  | .awaitParallelMultiInstanceUserTask .. => do
      let starts ← parallelEntryFlowNodeStarts? program operation owner before after
      pure (canonicalFlowNodeOccurrenceDelta starts [])
  | .completeParallelMultiInstanceUserTask .. => none
  | .awaitEffect _ _ _ _ effect _ =>
      let activation := activationForNode (before.effectActivations.map fun value => (value.elementId, value.count)) effect.elementId + 1
      let wait ← match after.effectWaits.filter fun wait => decide
          (wait.owner = owner && wait.elementId = effect.elementId && wait.activation = activation) with
        | [wait] => some wait
        | _ => none
      pure (canonicalFlowNodeOccurrenceDelta [← candidateEffectStart? program operation owner wait] [])
  | .duplicate _ origin _ _ | .synchronize _ origin _ _ | .mergeExclusive _ origin _ _
  | .choose _ origin _ _ _ _ | .selectMany _ origin _ _ _ _
  | .synchronizeSelected _ origin _ _ _ =>
      pure (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [← identityFor origin.elementId])
  | .throwError _ origin _ _ handler => do
      let branch ← errorPropagationCancellationDelta? program before operation commandId
        transitionIndex owner origin handler
      pure branch.2
  | .reachNoneEnd _ origin _ =>
      pure (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [← identityFor origin.elementId])
  | .terminateScope _ origin _ _ => do
      let branch ← terminateScopeCancellationDelta? program before operation commandId
        transitionIndex owner origin
      pure branch.2
  | .completeScope _ _ scopeId _ =>
      match before.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id.definitionScopeId = scopeId) with
      | [{ id, parent := some _ }] => pure (canonicalFlowNodeOccurrenceDelta [] [completedEnd (.scope id)])
      | [{ parent := none, .. }] => pure (canonicalFlowNodeOccurrenceDelta [] [])
      | _ => none

def acceptFlowNodeOccurrenceCandidate? (program : Program) (before after : RuntimeState)
    (candidate : UnnumberedFlowNodeOccurrenceDelta) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  let openBefore ← projectOpenFlowNodeOccurrences? program before
  let openAfter ← projectOpenFlowNodeOccurrences? program after
  let folded ← applyFlowNodeOccurrenceDelta? openBefore candidate
  if folded = openAfter then some candidate else none

/-- External lifecycle from one admitted stimulus and its supplied committed successor. -/
def flowNodeOccurrenceDeltaForStimulus? (program : Program) (before after : RuntimeState)
    (stimulus : Stimulus) (transitionIndex : Nat) : Option UnnumberedFlowNodeOccurrenceDelta :=
  candidateFlowNodeOccurrenceDeltaForStimulus? program before stimulus
      (stimulusCommandId stimulus) transitionIndex >>= fun candidate =>
    acceptFlowNodeOccurrenceCandidate? program before after candidate

/-- Internal lifecycle from one fired operation and its supplied committed successor. -/
def flowNodeOccurrenceDeltaForOperation? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  candidateFlowNodeOccurrenceDeltaForOperation? program before after operation commandId
      transitionIndex >>= fun candidate =>
    acceptFlowNodeOccurrenceCandidate? program before after candidate

end BpmnSemantics.SemanticProcess
