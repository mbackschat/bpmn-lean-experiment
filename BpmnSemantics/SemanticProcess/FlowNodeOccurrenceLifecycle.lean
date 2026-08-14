import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity

/-! # Flow-node occurrence lifecycle

This module derives revision-free flow-node starts and terminals at the evaluator boundary that owns the selected stimulus or operation and its immediate states. It also owns the private anchor fold and the independent projection of currently open occurrences. Public numbering, wall-clock time, wire publication, and Product 2 metrics are outside this module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive FlowNodeOccurrenceTerminalKind where
  | completed
  | cancelled
  deriving Repr, DecidableEq

/-- Semantic-only pairing identity. No constructor is part of the public wire contract. -/
inductive SemanticFlowNodeOccurrenceAnchor where
  | wait (id : OccurrenceId)
  | scope (id : ScopeOccurrenceId)
  | callActivity (id : OccurrenceId)
  | transition (commandId : SemanticId) (transitionIndex localIndex : Nat)
  deriving Repr, DecidableEq

structure UnnumberedFlowNodeOccurrenceStart where
  anchor : SemanticFlowNodeOccurrenceAnchor
  processId : ProcessId
  elementId : NodeId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

structure UnnumberedFlowNodeOccurrenceEnd where
  anchor : SemanticFlowNodeOccurrenceAnchor
  terminal : FlowNodeOccurrenceTerminalKind
  deriving Repr, DecidableEq

structure UnnumberedFlowNodeOccurrenceDelta where
  started : List UnnumberedFlowNodeOccurrenceStart
  ended : List UnnumberedFlowNodeOccurrenceEnd
  deriving Repr, DecidableEq

abbrev OpenSemanticFlowNodeOccurrence := UnnumberedFlowNodeOccurrenceStart

def stimulusCommandId : Stimulus → SemanticId
  | .startProcess commandId ..
  | .triggerMessageStart commandId ..
  | .triggerTimerStart commandId ..
  | .completeUserTaskInstance commandId ..
  | .deliverMessage commandId ..
  | .fireTimer commandId ..
  | .completeEffect commandId ..
  | .reportEffectFailure commandId ..
  | .retryIncident commandId ..
  | .cancelIncidentProcess commandId .. => commandId

private def scalarBefore (left right : String) : Bool := left < right

private def occurrenceBefore (left right : OccurrenceId) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then
    scalarBefore left.processInstanceId.value right.processInstanceId.value
  else if left.elementId ≠ right.elementId then
    scalarBefore left.elementId.value right.elementId.value
  else left.activation < right.activation

private def scopeBefore (left right : ScopeOccurrenceId) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then
    scalarBefore left.processInstanceId.value right.processInstanceId.value
  else if left.definitionScopeId ≠ right.definitionScopeId then
    scalarBefore left.definitionScopeId.value right.definitionScopeId.value
  else left.activation < right.activation

/-- Total anchor order: wait, scope, Call Activity, transition, then every scalar identity field. -/
def flowNodeOccurrenceAnchorBefore
    (left right : SemanticFlowNodeOccurrenceAnchor) : Bool :=
  match left, right with
  | .wait left, .wait right => occurrenceBefore left right
  | .wait _, _ => true
  | .scope left, .scope right => scopeBefore left right
  | .scope _, .wait _ => false
  | .scope _, _ => true
  | .callActivity left, .callActivity right => occurrenceBefore left right
  | .callActivity _, .transition .. => true
  | .callActivity _, _ => false
  | .transition leftCommand leftTransition leftLocal,
      .transition rightCommand rightTransition rightLocal =>
      if leftCommand ≠ rightCommand then
        scalarBefore leftCommand.value rightCommand.value
      else if leftTransition ≠ rightTransition then leftTransition < rightTransition
      else leftLocal < rightLocal
  | .transition .., _ => false

private def startBefore (left right : UnnumberedFlowNodeOccurrenceStart) : Bool :=
  if left.anchor ≠ right.anchor then flowNodeOccurrenceAnchorBefore left.anchor right.anchor
  else if left.processId ≠ right.processId then scalarBefore left.processId.value right.processId.value
  else if left.elementId ≠ right.elementId then scalarBefore left.elementId.value right.elementId.value
  else scopeBefore left.owner right.owner

private def insertBy (before : α → α → Bool) (value : α) : List α → List α
  | [] => [value]
  | head :: tail =>
      if before value head then value :: head :: tail
      else head :: insertBy before value tail

private def sortBy (before : α → α → Bool) : List α → List α
  | [] => []
  | head :: tail => insertBy before head (sortBy before tail)

def sortFlowNodeOccurrenceStarts :
    List UnnumberedFlowNodeOccurrenceStart → List UnnumberedFlowNodeOccurrenceStart :=
  sortBy startBefore

def sortFlowNodeOccurrenceEnds :
    List UnnumberedFlowNodeOccurrenceEnd → List UnnumberedFlowNodeOccurrenceEnd :=
  sortBy (fun left right => flowNodeOccurrenceAnchorBefore left.anchor right.anchor)

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

/-- Runtime owner selected by the same exhaustive operation match as `fire?`. -/
def flowNodeSelectedOperationOwner? (state : RuntimeState) :
    SemanticOperation → Option ScopeOccurrenceId
  | .initiate .. | .initiateMessage .. | .initiateTimer .. => rootScopeOccurrence? state
  | .enterScope _ _ input _ _
  | .enterBoundedScope _ _ input _ _ _
  | .invokeProcess _ _ input _ _ _ _
  | .awaitUserTask _ _ input _ _
  | .awaitTimer _ _ input _ _
  | .awaitMessage _ _ input _ _
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
  | .completeScope _ _ scopeId _ => uniqueCompletingScopeOwner? state scopeId

private def hostingInstanceId? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId | .completed instanceId | .cancelled instanceId => some instanceId
  | .notStarted => none

private def processIdForOwner? (program : Program) (state : RuntimeState)
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

private def waitStart? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (elementId : NodeId) (activation : Nat) :
    Option OpenSemanticFlowNodeOccurrence := do
  let processId ← processIdForOwner? program state owner
  pure
    { anchor := .wait (occurrenceId owner.processInstanceId elementId activation)
      processId
      elementId
      owner }

private def scopeStart? (program : Program) (state : RuntimeState)
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

private def callStart? (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) : Option OpenSemanticFlowNodeOccurrence := do
  let processId ← processIdForOwner? program state record.caller
  pure
    { anchor := .callActivity record.id
      processId
      elementId := ⟨record.id.elementId.value⟩
      owner := record.caller }

private def projectWaits? (program : Program) (state : RuntimeState) :
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

/-- Independent open-set projection. Boundary deadlines and root Process occurrences are absent. -/
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

private def removeEnded (available : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) : List OpenSemanticFlowNodeOccurrence :=
  available.filter fun occurrence => !(ended.map (·.anchor)).contains occurrence.anchor

/-- Starts are folded before terminals; freshness, exactly-once resolution, and transition locality fail closed. -/
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
    let result := removeEnded available delta.ended
    if result.any fun occurrence => transitionAnchor occurrence.anchor then none
    else some result

/-- Fold a contiguous lifecycle prefix from its exact retained open-anchor set. -/
def foldFlowNodeOccurrenceDeltas :
    List OpenSemanticFlowNodeOccurrence → List UnnumberedFlowNodeOccurrenceDelta →
      Option (List OpenSemanticFlowNodeOccurrence)
  | current, [] => some current
  | current, delta :: rest => do
      let successor ← applyFlowNodeOccurrenceDelta? current delta
      foldFlowNodeOccurrenceDeltas successor rest

private structure FlowNodeIdentity where
  processId : ProcessId
  elementId : NodeId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

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

private def instantaneousDelta (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity) : UnnumberedFlowNodeOccurrenceDelta :=
  let started := numberInstantaneous commandId transitionIndex 0
    (sortBy identityBefore identities)
  { started := sortFlowNodeOccurrenceStarts started
    ended := sortFlowNodeOccurrenceEnds (started.map fun start =>
      { anchor := start.anchor, terminal := .completed }) }

private def mkDelta (started : List UnnumberedFlowNodeOccurrenceStart)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) : UnnumberedFlowNodeOccurrenceDelta :=
  { started := sortFlowNodeOccurrenceStarts started
    ended := sortFlowNodeOccurrenceEnds ended }

private def completedEnd (anchor : SemanticFlowNodeOccurrenceAnchor) :
    UnnumberedFlowNodeOccurrenceEnd := { anchor, terminal := .completed }

private def cancelledEnd (anchor : SemanticFlowNodeOccurrenceAnchor) :
    UnnumberedFlowNodeOccurrenceEnd := { anchor, terminal := .cancelled }

private def activationForTask (state : RuntimeState) (id : TaskDefinitionId) : Nat :=
  (state.activations.find? fun activation => decide (activation.taskId = id)).map (·.count) |>.getD 0

private def activationForNode (values : List (NodeId × Nat)) (id : NodeId) : Nat :=
  (values.find? fun value => decide (value.1 = id)).map (·.2) |>.getD 0

private def processIdentity? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (elementId : NodeId) : Option FlowNodeIdentity := do
  let processId ← processIdForOwner? program state owner
  pure { processId, elementId, owner }

private def instantaneousWithEnds (commandId : SemanticId) (transitionIndex : Nat)
    (identities : List FlowNodeIdentity)
    (extraEnds : List UnnumberedFlowNodeOccurrenceEnd) : UnnumberedFlowNodeOccurrenceDelta :=
  let instant := instantaneousDelta commandId transitionIndex identities
  mkDelta instant.started (instant.ended ++ extraEnds)

def flowNodeOccurrenceOwnedBySubtree (state : RuntimeState) (root : ScopeOccurrenceId)
    (occurrence : OpenSemanticFlowNodeOccurrence) : Bool :=
  let called := calledInstanceClosure state root
  match occurrence.anchor with
  | .scope scopeId => occurrenceInSubtree state.scopeOccurrences root scopeId ||
      called.contains scopeId.processInstanceId
  | .wait _ | .callActivity _ => occurrenceInSubtree state.scopeOccurrences root occurrence.owner ||
      called.contains occurrence.owner.processInstanceId
  | .transition .. => false

private def ownedSubtreeEnds? (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) : Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let current ← projectOpenFlowNodeOccurrences? program state
  pure (current.filter (flowNodeOccurrenceOwnedBySubtree state root) |>.map fun occurrence =>
    cancelledEnd occurrence.anchor)

private def terminationSubtreeEnds? (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) : Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let cancelled ← ownedSubtreeEnds? program state root
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

private def externalLifecycleDelta? (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  match stimulus with
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. => some (mkDelta [] [])
  | .completeUserTaskInstance _ taskId _ =>
      if before.waits.any fun wait => decide (wait.processInstanceId = taskId.processInstanceId &&
          wait.task.id.value = taskId.elementId.value && wait.activation = taskId.activation) then
        some (mkDelta [] [waitEnd taskId .completed])
      else none
  | .deliverMessage _ subscriptionId _ =>
      if !(before.messageWaits.any fun wait => decide (wait.processInstanceId = subscriptionId.processInstanceId &&
          wait.elementId.value = subscriptionId.elementId.value && wait.activation = subscriptionId.activation)) then none
      else match lifecycleEventRaceForMessage? before subscriptionId with
        | some race => some (mkDelta []
            [waitEnd race.messageSubscriptionId .completed, waitEnd race.timerOccurrenceId .cancelled])
        | none => some (mkDelta [] [waitEnd subscriptionId .completed])
  | .fireTimer _ timerId _ => do
      let timer ← before.timerWaits.find? fun wait => decide
        (wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value && wait.activation = timerId.activation)
      match lifecycleEventRaceForTimer? before timerId with
      | some race => pure (mkDelta []
          [waitEnd race.timerOccurrenceId .completed, waitEnd race.messageSubscriptionId .cancelled])
      | none =>
          let identity ← processIdentity? program before timer.owner timer.elementId
          match taskForBoundaryTimer? (boundedTaskOperations program) before timer with
          | some task => pure (instantaneousWithEnds commandId transitionIndex [identity]
              [waitEnd (occurrenceId task.processInstanceId ⟨task.task.id.value⟩ task.activation) .cancelled])
          | none =>
              if isMonitoredBoundaryTimerDefinition program timer.elementId then
                pure (instantaneousDelta commandId transitionIndex [identity])
              else match boundedScopeDefinitionFor? program timer with
                | some definition => do
                    let child ← boundedScopeChildFor? before definition.1 timer
                    let cancelled ← ownedSubtreeEnds? program before child
                    pure (instantaneousWithEnds commandId transitionIndex [identity] cancelled)
                | none => pure (mkDelta [] [waitEnd timerId .completed])
  | .completeEffect _ effectId result => do
      let wait ← before.effectWaits.find? (effectOccurrenceMatches effectId)
      match result with
      | .success _ => pure (mkDelta [] [waitEnd effectId .completed])
      | .bpmnError code _ _ => do
          let route ← wait.bpmnErrorRoute
          if route.code ≠ code then none
          let identity ← processIdentity? program before wait.owner route.origin.boundaryEventId
          pure (instantaneousWithEnds commandId transitionIndex [identity]
            [waitEnd effectId .cancelled])
  | .reportEffectFailure .. | .retryIncident .. => some (mkDelta [] [])
  | .cancelIncidentProcess _ processInstanceId incidentId => do
      let root ← incidentProcessCancellationRoot? program before processInstanceId incidentId
      let cancelled ← ownedSubtreeEnds? program before root
      pure (mkDelta [] cancelled)

private def internalLifecycleDelta? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  let owner ← flowNodeSelectedOperationOwner? before operation
  let identityFor := processIdentity? program before owner
  match operation with
  | .initiate _ origin _ | .initiateMessage _ origin _ _ | .initiateTimer _ origin _ _ =>
      pure (instantaneousDelta commandId transitionIndex [← identityFor origin.elementId])
  | .enterScope _ _ _ _ childScopeId | .enterBoundedScope _ _ _ _ childScopeId _ =>
      let child ← match after.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id.definitionScopeId = childScopeId && occurrence.parent = some owner) with
        | [child] => some child
        | _ => none
      pure (mkDelta [← scopeStart? program after child] [])
  | .invokeProcess _ origin _ _ _ _ _ =>
      let activation := callActivationCount before origin.elementId + 1
      let id := occurrenceId owner.processInstanceId origin.elementId activation
      let record ← match after.calledProcessOccurrences.filter fun record => decide (record.id = id) with
        | [record] => some record
        | _ => none
      pure (mkDelta [← callStart? program after record] [])
  | .returnProcess id origin _ _ _ =>
      let record ← match before.calledProcessOccurrences.filter fun record =>
          decide (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value) with
        | [record] => some record
        | _ => none
      pure (mkDelta [] [completedEnd (.callActivity record.id)])
  | .awaitUserTask _ _ _ _ task =>
      let activation := activationForTask before task.id + 1
      pure (mkDelta [← waitStart? program after owner ⟨task.id.value⟩ activation] [])
  | .awaitTimer _ _ _ _ timer =>
      let activation := activationForNode (before.timerActivations.map fun value => (value.elementId, value.count)) timer.elementId + 1
      pure (mkDelta [← waitStart? program after owner timer.elementId activation] [])
  | .awaitMessage _ _ _ _ message =>
      let activation := activationForNode (before.messageActivations.map fun value => (value.elementId, value.count)) message.elementId + 1
      pure (mkDelta [← waitStart? program after owner message.elementId activation] [])
  | .awaitEventRace _ origin _ message timer =>
      let activation := activationForNode (before.eventRaceActivations.map fun value => (value.elementId, value.count)) origin.elementId + 1
      let gateway ← identityFor origin.elementId
      let messageStart ← waitStart? program after owner message.elementId activation
      let timerStart ← waitStart? program after owner timer.elementId activation
      let instant := instantaneousDelta commandId transitionIndex [gateway]
      pure (mkDelta (instant.started ++ [messageStart, timerStart]) instant.ended)
  | .awaitBoundedUserTask _ _ _ task _ | .awaitMonitoredUserTask _ _ _ task _ =>
      let activation := activationForTask before task.id + 1
      pure (mkDelta [← waitStart? program after owner ⟨task.id.value⟩ activation] [])
  | .awaitEffect _ _ _ _ effect _ =>
      let activation := activationForNode (before.effectActivations.map fun value => (value.elementId, value.count)) effect.elementId + 1
      pure (mkDelta [← waitStart? program after owner effect.elementId activation] [])
  | .duplicate _ origin _ _ | .synchronize _ origin _ _ | .mergeExclusive _ origin _ _
  | .choose _ origin _ _ _ _ | .selectMany _ origin _ _ _ _
  | .synchronizeSelected _ origin _ _ _ =>
      pure (instantaneousDelta commandId transitionIndex [← identityFor origin.elementId])
  | .throwError _ origin _ _ handler => do
      let parent ← match before.scopeOccurrences.filter fun occurrence => decide (occurrence.id = owner) with
        | [{ parent := some parent, .. }] => some parent
        | _ => none
      let errorIdentity ← identityFor origin.elementId
      let boundaryIdentity ← processIdentity? program before parent handler.origin.boundaryEventId
      let cancelled ← ownedSubtreeEnds? program before owner
      pure (instantaneousWithEnds commandId transitionIndex
        [errorIdentity, boundaryIdentity] cancelled)
  | .reachNoneEnd _ origin _ =>
      pure (instantaneousDelta commandId transitionIndex [← identityFor origin.elementId])
  | .terminateScope _ origin _ _ => do
      let ending ← identityFor origin.elementId
      let others ← terminationSubtreeEnds? program before owner
      pure (instantaneousWithEnds commandId transitionIndex [ending] others)
  | .completeScope _ _ scopeId _ =>
      match before.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id.definitionScopeId = scopeId) with
      | [{ id, parent := some _ }] => pure (mkDelta [] [completedEnd (.scope id)])
      | [{ parent := none, .. }] => pure (mkDelta [] [])
      | _ => none

private def checkedLifecycleDelta? (program : Program) (before after : RuntimeState)
    (candidate : Option UnnumberedFlowNodeOccurrenceDelta) :
    Option UnnumberedFlowNodeOccurrenceDelta := do
  let delta ← candidate
  let openBefore ← projectOpenFlowNodeOccurrences? program before
  let openAfter ← projectOpenFlowNodeOccurrences? program after
  let folded ← applyFlowNodeOccurrenceDelta? openBefore delta
  if folded = openAfter then some delta else none

/-- Exact external lifecycle derived from an already admitted stimulus and its immediate states.

The evaluator supplies the committed successor; lifecycle derivation never dispatches the stimulus again. -/
def flowNodeOccurrenceDeltaForStimulus? (program : Program) (before after : RuntimeState)
    (stimulus : Stimulus) (transitionIndex : Nat) : Option UnnumberedFlowNodeOccurrenceDelta :=
  checkedLifecycleDelta? program before after
    (externalLifecycleDelta? program before stimulus (stimulusCommandId stimulus) transitionIndex)

/-- Exact internal lifecycle derived from an already fired operation and its immediate states.

The evaluator supplies the selected successor; lifecycle derivation never fires the operation again. -/
def flowNodeOccurrenceDeltaForOperation? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) (transitionIndex : Nat) :
    Option UnnumberedFlowNodeOccurrenceDelta :=
  checkedLifecycleDelta? program before after
    (internalLifecycleDelta? program before after operation commandId transitionIndex)

/-- Any accepted operation delta folds to the independently projected immediate successor. -/
theorem accepted_operation_delta_equals_independent_open_projection
    (program : Program) (before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (transitionIndex : Nat)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : flowNodeOccurrenceDeltaForOperation? program before after operation
      commandId transitionIndex = some delta) :
    ∃ openBefore openAfter,
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold flowNodeOccurrenceDeltaForOperation? at accepted
  unfold checkedLifecycleDelta? at accepted
  simp only [Option.bind_eq_bind] at accepted
  obtain ⟨candidate, candidateEq, projected⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openBefore, beforeEq, projected⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨openAfter, afterEq, folded⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨foldResult, foldEq, selected⟩ := Option.bind_eq_some_iff.mp folded
  split at selected <;> simp_all

def OwnedSubtreeCancellationLaw (state : RuntimeState) (root : ScopeOccurrenceId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) : Prop :=
  ended = (current.filter (flowNodeOccurrenceOwnedBySubtree state root) |>.map fun occurrence =>
    { anchor := occurrence.anchor, terminal := .cancelled })

theorem exact_owned_subtree_cancellation_law (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (current : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : ownedSubtreeEnds? program state root = some ended) :
    OwnedSubtreeCancellationLaw state root current ended := by
  simp [ownedSubtreeEnds?, projected] at selected
  exact selected.symm

/-- Interrupting Boundary Events cancel exactly their owned open subtree. -/
theorem interruption_cancels_exact_owned_subtree (program) (state) (root) (current) (ended)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : ownedSubtreeEnds? program state root = some ended) :
    OwnedSubtreeCancellationLaw state root current ended :=
  exact_owned_subtree_cancellation_law program state root current ended projected selected

/-- Error propagation cancels exactly the throwing scope's owned open subtree. -/
theorem error_propagation_cancels_exact_owned_subtree (program) (state) (root) (current) (ended)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : ownedSubtreeEnds? program state root = some ended) :
    OwnedSubtreeCancellationLaw state root current ended :=
  exact_owned_subtree_cancellation_law program state root current ended projected selected

def TerminationSubtreeCancellationLaw (state : RuntimeState) (root : ScopeOccurrenceId)
    (current : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd) : Prop :=
  ended = (current.filter (flowNodeOccurrenceOwnedBySubtree state root) |>.map (fun occurrence =>
    { anchor := occurrence.anchor, terminal := .cancelled }) |>.filter fun terminal =>
      terminal.anchor ≠ .scope root)

/-- Termination cancels every other open occurrence while retaining its selected scope for completion. -/
theorem termination_cancels_exact_owned_subtree (program) (state) (root) (current) (ended)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : terminationSubtreeEnds? program state root = some ended) :
    TerminationSubtreeCancellationLaw state root current ended := by
  simp [terminationSubtreeEnds?, ownedSubtreeEnds?, cancelledEnd, projected] at selected
  simpa [TerminationSubtreeCancellationLaw] using selected.symm

theorem incident_root_cancellation_cancels_exact_owned_subtree
    (program) (state) (root) (current) (ended)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (selected : ownedSubtreeEnds? program state root = some ended) :
    OwnedSubtreeCancellationLaw state root current ended :=
  exact_owned_subtree_cancellation_law program state root current ended projected selected

end BpmnSemantics.SemanticProcess
