import BpmnSemantics.SemanticProcessContract
import BpmnSemantics.SemanticProcess.CallActivityAdmission
import BpmnSemantics.SemanticProcess.ProfileAdmission

/-! # Fuel-bounded graph validation

This module owns small executable graph predicates shared by checked-source proof experiments and standalone Semantic Process validation. Production validators derive fuel from the finite admitted vertex set; discriminating witnesses may deliberately underfuel a search. Graph search never participates in a semantic transition.
-/

namespace BpmnSemantics.SemanticProcess

structure GraphEdge (α : Type) where
  source : α
  target : α
  deriving Repr, DecidableEq

/-- Consecutive directed edges materialized by a vertex path. -/
def directedPathEdges : List α → List (GraphEdge α)
  | source :: target :: rest =>
      { source, target } :: directedPathEdges (target :: rest)
  | _ => []

/-- A material vertex path whose every consecutive edge belongs to the selected graph. -/
def DirectedPath [DecidableEq α] (edges : List (GraphEdge α))
    (vertices : List α) : Prop :=
  ∀ edge ∈ directedPathEdges vertices, edge ∈ edges

/-- A nonempty material directed cycle, represented by a path returning to its first vertex. -/
def DirectedCycle [DecidableEq α] (edges : List (GraphEdge α))
    (vertices : List α) : Prop :=
  ∃ start middle,
    vertices = start :: middle ++ [start] ∧ DirectedPath edges vertices

/-- Distinct direct successors of the current frontier. -/
def successors [DecidableEq α] (edges : List (GraphEdge α))
    (frontier : List α) : List α :=
  (edges.filterMap fun edge =>
    if frontier.contains edge.source then some edge.target else none).eraseDups

def reachableNodesWithin [DecidableEq α] (edges : List (GraphEdge α)) :
    Nat → List α → List α → List α
  | 0, _, visited => visited
  | fuel + 1, frontier, visited =>
      let next :=
        (successors edges frontier).filter fun node =>
          !visited.contains node
      reachableNodesWithin edges fuel next (visited ++ next)

def reachedSet [DecidableEq α] (edges : List (GraphEdge α)) (fuel : Nat)
    (source : α) : List α :=
  reachableNodesWithin edges fuel [source] [source]

def reachableWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) (source target : α) : Bool :=
  (reachedSet edges fuel source).contains target

def allReachableWithin [DecidableEq α] (nodes : List α)
    (edges : List (GraphEdge α)) (fuel : Nat) (source : α) : Bool :=
  nodes.all (reachableWithin edges fuel source)

def allCoreachableWithin [DecidableEq α] (nodes : List α)
    (edges : List (GraphEdge α)) (fuel : Nat) (targets : List α) : Bool :=
  !targets.isEmpty &&
    nodes.all fun node =>
      targets.any (reachableWithin edges fuel node)

/-- Negative bounded-search witness account. Without a saturation certificate, failure to find a return path does not prove its absence. -/
def acyclicWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Bool :=
  edges.all fun edge =>
    !reachableWithin edges fuel edge.target edge.source

/-- Post-search certificate that every edge from a reached node stays in the reached set. -/
def reachedClosed [DecidableEq α] (edges : List (GraphEdge α)) (fuel : Nat)
    (source : α) : Bool :=
  let reached := reachedSet edges fuel source
  edges.all fun edge =>
    !reached.contains edge.source || reached.contains edge.target

/-- Cycle rejection backed by a checked saturation certificate for every return search. -/
def acyclicClosed [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Bool :=
  edges.all fun edge =>
    reachedClosed edges fuel edge.target &&
      !reachableWithin edges fuel edge.target edge.source

/-- A finite directed-cycle witness: one retained edge plus a saturated return search through the same retained graph. -/
def CycleWitnessWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Prop :=
  ∃ edge ∈ edges,
    reachableWithin edges fuel edge.target edge.source = true

/-- Saturation-certified acyclicity rules out every cycle that survives a profile-selected edge cut. Therefore any full-graph cycle must contain at least one removed edge. -/
theorem saturation_certified_cut_excludes_uncut_cycle
    [DecidableEq α] (retainedEdges : List (GraphEdge α)) (fuel : Nat)
    (acyclic : acyclicClosed retainedEdges fuel = true) :
    ¬ CycleWitnessWithin retainedEdges fuel := by
  intro witness
  obtain ⟨edge, member, returns⟩ := witness
  simp [acyclicClosed] at acyclic
  have checked := acyclic edge member
  simp [returns] at checked

private def operationInputs : SemanticOperation → List ControlPlaceId
  | .initiate ..
  | .initiateMessage ..
  | .initiateTimer ..
  | .returnProcess ..
  | .completeScope .. => []
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
  | .reachNoneEnd _ _ input => [input]
  | .synchronize _ _ inputs _
  | .mergeExclusive _ _ inputs _
  | .synchronizeSelected _ _ inputs _ _ => inputs

private def operationOutputs : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output
  | .invokeProcess _ _ _ _ _ output _
  | .returnProcess _ _ _ _ output
  | .awaitUserTask _ _ _ output _
  | .awaitTimer _ _ _ output _
  | .awaitMessage _ _ _ output _
  | .synchronize _ _ _ output
  | .mergeExclusive _ _ _ output => [output]
  | .awaitEventRace _ _ _ message timer => [message.output, timer.output]
  -- The monitored family declares the same two outputs, though it can produce both within one run
  -- rather than one of them.
  | .awaitBoundedUserTask _ _ _ task boundaryTimer
  | .awaitMonitoredUserTask _ _ _ task boundaryTimer =>
      [task.output, boundaryTimer.output]
  | .synchronizeSelected _ _ _ output _ => [output]
  | .enterScope _ _ _ childEntry _ => [childEntry]
  -- The boundary route is token-carrying and lands in the parent scope, unlike the child entry.
  | .enterBoundedScope _ _ _ childEntry _ boundaryTimer =>
      [childEntry, boundaryTimer.output]
  | .awaitEffect _ _ _ output _ route =>
      output :: route.toList.map (·.output)
  | .duplicate _ _ _ outputs => outputs
  | .choose _ _ _ candidates defaultOutput _ =>
      candidates.map (·.output) ++ [defaultOutput]
  | .selectMany _ _ _ candidates defaultBranch _ =>
      candidates.map (·.output) ++ [defaultBranch.output]
  | .throwError _ _ _ _ handler => [handler.output]
  | .reachNoneEnd .. => []
  | .completeScope _ _ _ parentOutput => parentOutput.toList
  | .initiateMessage _ _ _ outputs => outputs
  | .initiateTimer _ _ _ outputs => outputs

private def producers (operations : List SemanticOperation)
    (place : ControlPlaceId) : List OperationId :=
  operations.filterMap fun operation =>
    if (operationOutputs operation).contains place then
      some operation.id
    else
      none

private def consumers (operations : List SemanticOperation)
    (place : ControlPlaceId) : List OperationId :=
  operations.filterMap fun operation =>
    if (operationInputs operation).contains place then
      some operation.id
    else
      none

private def placeEdges (program : Program) : List (GraphEdge OperationId) :=
  program.controlPlaces.flatMap fun place =>
    (producers program.operations place.id).flatMap fun producer =>
      (consumers program.operations place.id).map fun consumer =>
        { source := producer, target := consumer }

private def operationScope? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun ownership =>
    decide (ownership.operationId = operationId)).map (·.scopeId)

private def placeScope? (program : Program) (placeId : ControlPlaceId) :
    Option DefinitionScopeId :=
  (program.controlPlaceScopes.find? fun ownership =>
    decide (ownership.controlPlaceId = placeId)).map (·.scopeId)

private def definitionScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  program.definitionScopes.find? fun scope => decide (scope.id = scopeId)

private def placesOwnedBy (program : Program) (places : List ControlPlaceId)
    (scopeId : DefinitionScopeId) : Bool :=
  places.all fun place => placeScope? program place == some scopeId

private def operationRespectsScopes (program : Program)
    (entryRootId : DefinitionScopeId)
    (operation : SemanticOperation) : Bool :=
  match operationScope? program operation.id with
  | none => false
  | some owner =>
      match operation with
      | .initiate _ _ output =>
          (definitionScope? program owner).any (·.parentScopeId.isNone) &&
            placesOwnedBy program [output] owner
      | .initiateMessage _ _ _ outputs =>
          (definitionScope? program owner).any (·.parentScopeId.isNone) &&
            placesOwnedBy program outputs owner
      | .enterScope _ _ input childEntry childScopeId =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] childScopeId &&
            (definitionScope? program childScopeId).any fun scope =>
              scope.parentScopeId == some owner
      -- Same scope contract as the ordinary entry, plus the boundary route: the deadline's output is
      -- token-carrying and lands in the *parent*, so it is owner-scoped while the child entry is not.
      -- Without this arm the operation falls to the catch-all below, which demands that every output
      -- be owner-scoped and therefore rejects the child entry it is required to produce.
      | .enterBoundedScope _ _ input childEntry childScopeId boundaryTimer =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] childScopeId &&
            placesOwnedBy program [boundaryTimer.output] owner &&
            (definitionScope? program childScopeId).any fun scope =>
              scope.parentScopeId == some owner
      | .invokeProcess _ _ input _ calledRoot childEntry _ =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] calledRoot
      | .returnProcess _ _ _ calledRoot callerOutput =>
          calledRoot = owner &&
            (definitionScope? program owner).any (·.parentScopeId.isNone) &&
            placesOwnedBy program [callerOutput] entryRootId
      | .completeScope _ _ scopeId parentOutput =>
          scopeId = owner &&
            match definitionScope? program scopeId with
            | none => false
            | some scope =>
                match scope.parentScopeId, parentOutput with
                | none, none => true
                | some parent, some output =>
                    placesOwnedBy program [output] parent
                | _, _ => false
      | .throwError _ _ input _ handler =>
          handler.attachedScopeId = owner &&
            placesOwnedBy program [input] owner &&
            match definitionScope? program owner with
            | some scope =>
                match scope.parentScopeId with
                | some parent => placesOwnedBy program [handler.output] parent
                | none => false
            | none => false
      | _ =>
          placesOwnedBy program
            (operationInputs operation ++ operationOutputs operation) owner

private def scopeEdges (program : Program) :
    List (GraphEdge DefinitionScopeId) :=
  program.definitionScopes.filterMap fun scope =>
    scope.parentScopeId.map fun parent =>
      { source := parent, target := scope.id }

private def scopeForestWellFormed (program : Program) : Bool :=
  let ids := program.definitionScopes.map (·.id)
  let edges := scopeEdges program
  !(program.definitionScopes.filter (·.parentScopeId.isNone)).isEmpty &&
    (program.definitionScopes.all fun scope =>
      match scope.parentScopeId with
      | none => true
      | some parent => scope.id ≠ parent && ids.contains parent) &&
    acyclicClosed edges ids.length

private def scopedOwnershipComplete (program : Program)
    (entryRootId : DefinitionScopeId) : Bool :=
  program.operationScopes.map (·.operationId) = program.operations.map (·.id) &&
    program.controlPlaceScopes.map (·.controlPlaceId) =
      program.controlPlaces.map (·.id) &&
    program.operations.all (operationRespectsScopes program entryRootId)

/-- The child definition scope this operation enters, for every family that enters one.

Listed exhaustively rather than behind a wildcard. A scope-entering family omitted from a wildcard
match contributes nothing instead of failing to compile, and the rules below read that silence as a
child scope nobody enters — which is a *validation pass* for the sibling arm and a rejection for the
entering one, so the omission surfaces as an unexplained well-formedness failure rather than as a
missing case. -/
private def enteredChildScopeId? : SemanticOperation → Option DefinitionScopeId
  | .enterScope _ _ _ _ childScopeId
  | .enterBoundedScope _ _ _ _ childScopeId _ => some childScopeId
  | .initiate .. | .initiateMessage .. | .initiateTimer .. | .invokeProcess .. | .returnProcess .. | .awaitUserTask ..
  | .awaitTimer .. | .awaitMessage .. | .awaitEventRace ..
  | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
  | .awaitEffect .. | .duplicate ..
  | .synchronize .. | .mergeExclusive .. | .choose .. | .selectMany ..
  | .synchronizeSelected ..
  | .throwError .. | .reachNoneEnd .. | .completeScope .. => none

private def oneCompletionStrategyPerScope (program : Program)
    (entryRootId : DefinitionScopeId) : Bool :=
  program.definitionScopes.all fun scope =>
    (match scope.parentScopeId with
    | none =>
        if scope.id = entryRootId then
          (program.operations.filter fun
            | .completeScope _ _ scopeId _ => scopeId = scope.id
            | _ => false).length = 1 &&
          (program.operations.filter fun operation =>
            match operation with
            | .returnProcess id _ _ _ _ =>
                operationScope? program id = some scope.id
            | _ => false).isEmpty
        else
          (program.operations.filter fun
            | .completeScope _ _ scopeId _ => scopeId = scope.id
            | _ => false).isEmpty &&
          (program.operations.filter fun operation =>
            match operation with
            | .returnProcess id _ _ _ _ =>
                operationScope? program id = some scope.id
            | _ => false).length = 1
    | some _ =>
        (program.operations.filter fun
          | .completeScope _ _ scopeId _ => scopeId = scope.id
          | _ => false).length = 1) &&
    match scope.parentScopeId with
    | none =>
        program.operations.all fun operation =>
          enteredChildScopeId? operation ≠ some scope.id
    | some _ =>
        (program.operations.filter fun operation =>
          enteredChildScopeId? operation = some scope.id).length = 1

private def completionId? (program : Program) (scopeId : DefinitionScopeId) :
    Option OperationId :=
  program.operations.findSome? fun
    | .completeScope id _ candidate _ =>
        if candidate = scopeId then some id else none
    | _ => none

private def completionEdges (program : Program) : List (GraphEdge OperationId) :=
  program.operations.filterMap fun
    | .reachNoneEnd id _ _ => do
        let scopeId ← operationScope? program id
        let completionId ← completionId? program scopeId
        pure { source := id, target := completionId }
    | _ => none

private def programEdges (program : Program) : List (GraphEdge OperationId) :=
  placeEdges program ++ completionEdges program ++
    (callCompletionPairs program).map fun pair =>
      { source := pair.1, target := pair.2 }

/-- Closed Semantic Process resumption family, decided independently from the checked-source cut. -/
def semanticOperationIsResumptionCut : SemanticOperation → Bool
  | .awaitUserTask .. => true
  | .initiate .. | .initiateMessage .. | .initiateTimer .. | .enterScope .. | .enterBoundedScope ..
  | .invokeProcess .. | .returnProcess .. | .awaitTimer ..
  | .awaitMessage .. | .awaitEventRace .. | .awaitBoundedUserTask ..
  | .awaitMonitoredUserTask .. | .awaitEffect .. | .duplicate ..
  | .synchronize .. | .mergeExclusive .. | .choose .. | .selectMany ..
  | .synchronizeSelected .. | .throwError .. | .reachNoneEnd ..
  | .completeScope .. => false

/-- Independently classify Semantic Process graph edges removed after an `awaitUserTask` producer. -/
def programEdgeIsResumptionContinuation (program : Program)
    (edge : GraphEdge OperationId) : Bool :=
  program.operations.any fun operation =>
    decide (operation.id = edge.source) &&
      semanticOperationIsResumptionCut operation

def programResumptionCutEdges (program : Program)
    (edges : List (GraphEdge OperationId)) : List (GraphEdge OperationId) :=
  edges.filter fun edge => !programEdgeIsResumptionContinuation program edge

theorem directed_path_survives_program_resumption_cut
    (program : Program) (fullEdges : List (GraphEdge OperationId))
    (vertices : List OperationId)
    (path : DirectedPath fullEdges vertices)
    (avoids : ∀ edge ∈ directedPathEdges vertices,
      programEdgeIsResumptionContinuation program edge = false) :
    DirectedPath (programResumptionCutEdges program fullEdges) vertices := by
  intro edge edgeOnPath
  have fullMember := path edge edgeOnPath
  have retained := avoids edge edgeOnPath
  simp [programResumptionCutEdges, fullMember, retained]

theorem directed_cycle_survives_program_resumption_cut
    (program : Program) (fullEdges : List (GraphEdge OperationId))
    (vertices : List OperationId)
    (cycle : DirectedCycle fullEdges vertices)
    (avoids : ∀ edge ∈ directedPathEdges vertices,
      programEdgeIsResumptionContinuation program edge = false) :
    DirectedCycle (programResumptionCutEdges program fullEdges) vertices := by
  obtain ⟨start, middle, shape, path⟩ := cycle
  exact ⟨start, middle, shape,
    directed_path_survives_program_resumption_cut program fullEdges vertices
      path avoids⟩

private def programGraphPolicyValid (program : Program)
    (edges : List (GraphEdge OperationId)) (fuel : Nat) : Bool :=
  match profileGraphPolicy? program.identity.semanticProfile.value with
  | some .acyclic => acyclicClosed edges fuel
  | some .resumptionBounded =>
      acyclicClosed (programResumptionCutEdges program edges) fuel
  | none => false

private def initiateIds (operations : List SemanticOperation) :
    List OperationId :=
  operations.filterMap fun
    | .initiate id _ _ => some id
    | .initiateMessage id _ _ _ => some id
    | .initiateTimer id _ _ _ => some id
    | _ => none

private def rootScope? (program : Program) : Option DefinitionScopeId :=
  match program.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone &&
        scope.originElementId.value = program.processId.value with
  | [scope] => some scope.id
  | _ => none

private def rootCompletionIds (program : Program) : List OperationId :=
  match rootScope? program with
  | none => []
  | some root => program.operations.filterMap fun
      | .completeScope id _ scopeId none =>
          if scopeId = root then some id else none
      | _ => none

/-- A bounded scope-entry operation's origin must be the element that owns the child scope it enters.

Mirrors `isWellFormedEnterBoundedScopeOperation` in the semantic core, which binds origin to host
identity positively exactly as its bounded-task sibling does. Without it an operation may name any
other element as its host, misattributing every occurrence the transition creates to an element that
does not enter the scope. The unbounded `enterScope` family is deliberately left as it was: neither
target binds its origin today, so widening that here would make the two encodings disagree in the
opposite direction. -/
private def boundedScopeEntryOriginsOwnTheirScopes (program : Program) : Bool :=
  program.operations.all fun operation =>
    match operation with
    | .enterBoundedScope _ origin _ _ childScopeId _ =>
        match program.definitionScopes.find? fun scope =>
            decide (scope.id = childScopeId) with
        | some scope => decide (scope.originElementId = origin.elementId)
        | none => false
    | _ => true

/-- Standalone graph backstop for decoded programs, independent of lowering equality. -/
def programGraphWellFormed (program : Program) : Bool :=
  let operationIds := program.operations.map (·.id)
  let starts := initiateIds program.operations
  let ends := rootCompletionIds program
  match starts with
  | [start] =>
      match rootScope? program with
      | some entryRoot =>
          let edges := programEdges program
          let fuel := operationIds.length
          operationScope? program start = some entryRoot &&
            scopeForestWellFormed program &&
            scopedOwnershipComplete program entryRoot &&
            boundedScopeEntryOriginsOwnTheirScopes program &&
            oneCompletionStrategyPerScope program entryRoot &&
            program.controlPlaces.all (fun place =>
            (producers program.operations place.id).length = 1 &&
              (consumers program.operations place.id).length = 1) &&
            allReachableWithin operationIds edges fuel start &&
            allCoreachableWithin operationIds edges fuel ends &&
            programGraphPolicyValid program edges fuel
      | none => false
  | _ => false

end BpmnSemantics.SemanticProcess
