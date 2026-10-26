module

public import BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
public import BpmnSemantics.SemanticProcess.GraphReachability
public import BpmnSemantics.SemanticProcess.CallActivityAdmission
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
public import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.OperationControlPlaces
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission

/-! # Fuel-bounded graph validation

This module owns small executable graph predicates shared by checked-source proof experiments and standalone Semantic Process validation. Production validators derive fuel from the finite admitted vertex set; discriminating witnesses may deliberately underfuel a search. Graph search never participates in a semantic transition.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def producers (operations : List SemanticOperation)
    (place : ControlPlaceId) : List OperationId :=
  operations.filterMap fun operation =>
    let outputs := match operation with
      | .completeSequentialMultiInstanceScope _ _ entryId => (sequentialScopeContinuation? operations entryId).toList
      | .completeParallelMultiInstanceScope _ _ entryId => (parallelScopeContinuation? operations entryId).toList
      | _ => operationOutputs operation
    if outputs.contains place then
      some operation.id
    else
      none

def consumers (operations : List SemanticOperation)
    (place : ControlPlaceId) : List OperationId :=
  operations.filterMap fun operation =>
    if (operationInputPlaces operation).contains place then
      some operation.id
    else
      none

def placeEdges (program : Program) : List (GraphEdge OperationId) :=
  program.controlPlaces.flatMap fun place =>
    (producers program.operations place.id).flatMap fun producer =>
      (consumers program.operations place.id).map fun consumer =>
        { source := producer, target := consumer }

def firstDefinitionScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  program.definitionScopes.find? fun scope => decide (scope.id = scopeId)

def placesOwnedBy (program : Program) (places : List ControlPlaceId)
    (scopeId : DefinitionScopeId) : Bool :=
  places.all fun place => placeScope? program place == some scopeId

def operationRespectsScopes (program : Program)
    (entryRootId : DefinitionScopeId)
    (operation : SemanticOperation) : Bool :=
  match operationScope? program operation.id with
  | none => false
  | some owner =>
      match operation with
      | .initiate _ _ output =>
          (firstDefinitionScope? program owner).any (·.parentScopeId.isNone) &&
            placesOwnedBy program [output] owner
      | .initiateMessage _ _ _ outputs =>
          (firstDefinitionScope? program owner).any (·.parentScopeId.isNone) &&
            placesOwnedBy program outputs owner
      | .enterParallelMultiInstanceScope _ origin input childEntry childScopeId output _ _ _ _
      | .enterSequentialMultiInstanceScope _ origin input childEntry childScopeId output _ _ _ _ =>
          placesOwnedBy program [input, output] owner && placesOwnedBy program [childEntry] childScopeId &&
            (firstDefinitionScope? program childScopeId).any fun scope =>
              scope.parentScopeId == some owner && scope.originElementId == origin.elementId
      | .completeSequentialMultiInstanceScope _ _ entryId =>
          program.operations.any fun
            | .enterSequentialMultiInstanceScope id _ _ _ childScopeId _ _ _ _ _ =>
                id == entryId && childScopeId == owner
            | _ => false
      | .completeParallelMultiInstanceScope _ _ entryId =>
          program.operations.any fun
            | .enterParallelMultiInstanceScope id _ _ _ childScopeId _ _ _ _ _ =>
                id == entryId && childScopeId == owner
            | _ => false
      | .enterScope _ _ input childEntry childScopeId =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] childScopeId &&
            (firstDefinitionScope? program childScopeId).any fun scope =>
              scope.parentScopeId == some owner
      -- Same scope contract as the ordinary entry, plus the boundary route: the deadline's output is
      -- token-carrying and lands in the *parent*, so it is owner-scoped while the child entry is not.
      -- Without this arm the operation falls to the catch-all below, which demands that every output
      -- be owner-scoped and therefore rejects the child entry it is required to produce.
      | .enterBoundedScope _ _ input childEntry childScopeId boundaryTimer
      | .enterMonitoredScope _ _ input childEntry childScopeId boundaryTimer =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] childScopeId &&
            placesOwnedBy program [boundaryTimer.output] owner &&
            (firstDefinitionScope? program childScopeId).any fun scope =>
              scope.parentScopeId == some owner
      | .invokeProcess _ _ input _ calledRoot childEntry _ _ =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] calledRoot
      | .returnProcess id _ _ calledRoot callerOutput _ =>
          -- CALLN-ADMIT-01: the caller output lies in the scope that holds the paired invocation, a
          -- Process root or, under Stage B, an embedded scope; pairing places that scope outside the
          -- called root's tree.
          calledRoot = owner &&
            (firstDefinitionScope? program owner).any (·.parentScopeId.isNone) &&
            match program.operations.filter (fun candidate => match candidate with
                | .invokeProcess _ _ _ _ _ _ returned _ => decide (returned = id)
                | _ => false) with
            | [invoke] =>
                match operationScope? program invoke.id with
                | some caller => placesOwnedBy program [callerOutput] caller
                | none => false
            | _ => false
      | .completeScope _ _ scopeId parentOutput =>
          scopeId = owner &&
            match firstDefinitionScope? program scopeId with
            | none => false
            | some scope =>
                match scope.parentScopeId, parentOutput with
                | none, none => true
                | some parent, some output =>
                    placesOwnedBy program [output] parent
                | _, _ => false
      | .completeEventSubProcess id origin scopeId =>
          scopeId == owner && owner != entryRootId &&
            completeEventSubProcessOperationWellFormed program id origin scopeId
      | .terminateScope _ _ input scopeId =>
          scopeId = owner && placesOwnedBy program [input] owner
      | .cancelTransaction _ _ scopeId input output _ =>
          scopeId = owner && placesOwnedBy program [input] owner &&
            match (firstDefinitionScope? program owner).bind (·.parentScopeId) with
            | some parent =>
                (firstDefinitionScope? program parent).any (·.parentScopeId.isNone) &&
                  placesOwnedBy program [output] parent
            | none => false
      | .throwError _ _ input _ handler =>
          handler.attachedScopeId = owner &&
            placesOwnedBy program [input] owner &&
            match firstDefinitionScope? program owner with
            | some scope =>
                match scope.parentScopeId with
                | some parent => placesOwnedBy program [handler.output] parent
                | none => false
            | none => false
      | _ =>
          placesOwnedBy program
            (operationInputPlaces operation ++ operationOutputs operation) owner

def scopeEdges (program : Program) :
    List (GraphEdge DefinitionScopeId) :=
  program.definitionScopes.filterMap fun scope =>
    scope.parentScopeId.map fun parent =>
      { source := parent, target := scope.id }

def scopeForestWellFormed (program : Program) : Bool :=
  let ids := program.definitionScopes.map (·.id)
  let edges := scopeEdges program
  !(program.definitionScopes.filter (·.parentScopeId.isNone)).isEmpty &&
    (program.definitionScopes.all fun scope =>
      match scope.parentScopeId with
      | none => true
      | some parent => scope.id ≠ parent && ids.contains parent) &&
    acyclicClosed edges ids.length

def scopedOwnershipComplete (program : Program)
    (entryRootId : DefinitionScopeId) : Bool :=
  program.operationScopes.map (·.operationId) = program.operations.map (·.id) &&
    program.controlPlaceScopes.map (·.controlPlaceId) =
      program.controlPlaces.map (·.id) &&
    program.operations.all (operationRespectsScopes program entryRootId)

def completionId? (program : Program) (scopeId : DefinitionScopeId) :
    Option OperationId :=
  program.operations.findSome? fun
    | .completeParallelMultiInstanceScope id _ _
    | .completeSequentialMultiInstanceScope id _ _ =>
        if operationScope? program id == some scopeId then some id else none
    | .completeScope id _ candidate _
    | .completeEventSubProcess id _ candidate =>
        if candidate = scopeId then some id else none
    | _ => none

def completionEdges (program : Program) : List (GraphEdge OperationId) :=
  program.operations.filterMap fun
    | .reachNoneEnd id _ _ => do
        let scopeId ← operationScope? program id
        let completionId ← completionId? program scopeId
        pure { source := id, target := completionId }
    | .terminateScope id _ _ scopeId => do
        let owner ← operationScope? program id
        if owner = scopeId then
          let completionId ← completionId? program scopeId
          pure { source := id, target := completionId }
        else none
    | _ => none

def parallelMultiInstanceCompletionEdges (program : Program) :
    List (GraphEdge OperationId) :=
  program.operations.filterMap fun
    | .completeParallelMultiInstanceUserTask id _ entryOperationId _ _ =>
        some { source := entryOperationId, target := id }
    | _ => none

/-- IMES-ARM-01 and IMES-CLOSE-01 contribute reachability dependencies, never token-producing ports. -/
def messageHandlerEdges (program : Program) : List (GraphEdge OperationId) :=
  program.interruptingMessageEventSubProcesses.flatMap fun declaration =>
    match program.operations.findSome? (fun | .initiate id _ _ => some id | _ => none),
        consumers program.operations declaration.childEntry,
        completionId? program declaration.handlerScopeId,
        completionId? program declaration.parentScopeId with
    | some start, [entry], some handlerCompletion, some parentCompletion =>
        [{ source := start, target := entry }, { source := handlerCompletion, target := parentCompletion }]
    | _, _, _, _ => []

def programEdges (program : Program) : List (GraphEdge OperationId) :=
  messageHandlerEdges program ++ placeEdges program ++ completionEdges program ++ parallelMultiInstanceCompletionEdges program ++
    (callCompletionPairs program).map fun pair =>
      { source := pair.1, target := pair.2 }

def isInvocation (program : Program) (operationId : OperationId) : Bool :=
  program.operations.any fun
    | .invokeProcess id .. => id == operationId
    | _ => false

/-- The control order the graph policy judges: each call stands as an edge from its invocation to its
paired return, because a body called from two sites joins both sites' paths through it; reachability
keeps `programEdges` through the body (CALLN-ADMIT-01). -/
def programOrderEdges (program : Program) : List (GraphEdge OperationId) :=
  messageHandlerEdges program ++ (placeEdges program).filter (fun edge => !isInvocation program edge.source) ++
    completionEdges program ++ parallelMultiInstanceCompletionEdges program ++
    program.operations.filterMap fun
      | .invokeProcess id _ _ _ _ _ returned _ => some { source := id, target := returned }
      | _ => none

def operationIsInvocation : SemanticOperation → Bool
  | .invokeProcess .. => true
  | _ => false

/-- Closed Semantic Process resumption family, decided independently from the checked-source cut. -/
def semanticOperationIsResumptionCut : SemanticOperation → Bool
  | .awaitUserTask .. => true
  | .awaitDataInputUserTask .. => true
  | .awaitDataInputOutputUserTask .. => true
  | .awaitDataOutputUserTask .. => true
  | .awaitSequentialMultiInstanceUserTask .. => true
  | .awaitParallelMultiInstanceUserTask .. => true
  | .awaitMessageBoundedUserTask .. | .awaitMessageMonitoredUserTask .. => true
  | .enterSequentialMultiInstanceScope .. | .completeSequentialMultiInstanceScope ..
  | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope ..
  | .initiate .. | .initiateMessage .. | .initiateTimer .. | .enterScope .. | .enterBoundedScope ..
  | .enterMonitoredScope ..
  | .invokeProcess .. | .returnProcess .. | .completeParallelMultiInstanceUserTask .. | .awaitTimer ..
  | .awaitMessage .. | .awaitPayloadMessage .. | .awaitCorrelatedPayloadMessage ..
  | .awaitEventRace .. | .awaitBoundedUserTask ..
  | .awaitMonitoredUserTask .. | .awaitEffect .. | .duplicate ..
  | .synchronize .. | .mergeExclusive .. | .choose .. | .selectMany ..
  | .synchronizeSelected .. | .throwError .. | .reachNoneEnd ..
  | .terminateScope ..
  | .completeScope ..
  | .completeEventSubProcess ..
  | .triggerCompensation .. | .cancelTransaction .. => false

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

def programGraphPolicyValid (program : Program)
    (edges : List (GraphEdge OperationId)) (fuel : Nat) : Bool :=
  match profileGraphPolicy? program.identity.semanticProfile.value with
  | some .acyclic => acyclicClosed edges fuel
  | some .resumptionBounded =>
      acyclicClosed (programResumptionCutEdges program edges) fuel
  | some .mixedTaskResumptionBounded =>
      acyclicClosed (edges.filter fun edge => !program.operations.any (fun operation =>
        operation.id == edge.source && match operation with
          | .awaitUserTask .. | .awaitEffect .. => true
          | _ => false)) fuel
  | none => false

def initiateIds (operations : List SemanticOperation) :
    List OperationId :=
  operations.filterMap fun
    | .initiate id _ _ => some id
    | .initiateMessage id _ _ _ => some id
    | .initiateTimer id _ _ _ => some id
    | _ => none

def rootCompletionIds (program : Program) : List OperationId :=
  match programEntryRootScopeId? program with
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
def boundedScopeEntryOriginsOwnTheirScopes (program : Program) : Bool :=
  program.operations.all fun operation =>
    match operation with
    | .enterBoundedScope _ origin _ _ childScopeId _
    | .enterMonitoredScope _ origin _ _ childScopeId _ =>
        match program.definitionScopes.find? fun scope =>
            decide (scope.id = childScopeId) with
        | some scope => decide (scope.originElementId = origin.elementId)
        | none => false
    | _ => true

def parallelMultiInstancePairsShareScope (program : Program) : Bool :=
  program.operations.all fun entry =>
    match ParallelMultiInstanceArm.ofOperation? entry with
    | none => true
    | some _ =>
        match parallelMultiInstanceCompletionForEntry? program.operations entry with
        | some completion => operationScope? program completion.id = operationScope? program entry.id
        | none => false

def programGraphWellFormedWithScopeLifecycle (program : Program)
    (scopeLifecycle : Program → DefinitionScopeId → Bool) : Bool :=
  let operationIds := program.operations.map (·.id)
  let starts := initiateIds program.operations
  let ends := rootCompletionIds program
  match starts with
  | [start] =>
      match programEntryRootScopeId? program with
      | some entryRoot =>
          let edges := programEdges program
          let fuel := operationIds.length
          operationScope? program start = some entryRoot &&
            scopeForestWellFormed program &&
            scopedOwnershipComplete program entryRoot &&
            parallelMultiInstancePairsShareScope program &&
            sequentialScopeOperationsPaired program && parallelScopeOperationsPaired program &&
            boundedScopeEntryOriginsOwnTheirScopes program &&
            scopeLifecycle program entryRoot &&
            program.controlPlaces.all (fun place =>
            ((producers program.operations place.id).length +
              (program.interruptingMessageEventSubProcesses.filter (fun declaration => declaration.childEntry == place.id)).length = 1 ||
              -- A called root's entry place is produced by every invocation of that root (CALLN-ADMIT-01).
              1 < (producers program.operations place.id).length &&
                program.operations.all fun operation =>
                  operationIsInvocation operation || !(producers program.operations place.id).contains operation.id) &&
              (consumers program.operations place.id).length = 1) &&
            allReachableWithin operationIds edges fuel start &&
            allCoreachableWithin operationIds edges fuel ends &&
            programGraphPolicyValid program (programOrderEdges program) fuel
      | none => false
  | _ => false

/-- Without invocations, the producer census is the single-producer rule: a shared producer must be an
invocation (CALLN-ADMIT-01). -/
theorem producerCensus_without_invocations (program : Program) (place : ControlPlaceId)
    (noInvocation : ∀ operation ∈ program.operations, operationIsInvocation operation = false)
    (census : ((producers program.operations place).length +
        (program.interruptingMessageEventSubProcesses.filter (fun declaration => declaration.childEntry == place)).length = 1 ||
      1 < (producers program.operations place).length &&
        program.operations.all fun operation =>
          operationIsInvocation operation || !(producers program.operations place).contains operation.id) = true) :
    (producers program.operations place).length +
      (program.interruptingMessageEventSubProcesses.filter (fun declaration => declaration.childEntry == place)).length = 1 := by
  simp only [Bool.or_eq_true, Bool.and_eq_true, decide_eq_true_eq] at census
  rcases census with single | ⟨many, shared⟩
  · exact single
  · exfalso
    obtain ⟨producer, present⟩ := List.exists_mem_of_length_pos (by omega : 0 < (producers program.operations place).length)
    obtain ⟨operation, member, produced⟩ := List.mem_filterMap.mp present
    have idEq : operation.id = producer := by
      dsimp only at produced
      repeat' split at produced
      all_goals first | exact Option.some.inj produced | contradiction
    have allowed := List.all_eq_true.mp shared operation member
    simp [noInvocation operation member] at allowed
    exact allowed (idEq ▸ present)

/-- Standalone raw-graph backstop for decoded programs, independent of hidden Program declarations. -/
def programGraphWellFormed (program : Program) : Bool :=
  programGraphWellFormedWithScopeLifecycle program ordinaryScopeLifecycleWellFormed

/-- Complete Program graph admission may derive the narrow dormant-handler lifecycle from a valid hidden declaration. -/
def programGraphWellFormedForProgram (program : Program) : Bool :=
  programGraphWellFormedWithScopeLifecycle program
    compensationEventSubProcessSnapshotScopeLifecycleWellFormed

theorem filter_key_eq_singleton_of_nodup [DecidableEq β]
    (values : List α) (key : α → β) (value : α)
    (nodup : (values.map key).Nodup) (member : value ∈ values) :
    values.filter (fun candidate => decide (key candidate = key value)) = [value] := by
  induction values with
  | nil => simp at member
  | cons head tail ih =>
      obtain ⟨headFresh, tailNodup⟩ := List.nodup_cons.mp nodup
      rcases List.mem_cons.mp member with rfl | member
      · have rejected : tail.filter (fun candidate => decide (key candidate = key value)) = [] :=
          List.filter_eq_nil_iff.mpr fun candidate candidateMember same => by
            apply headFresh
            simp only [decide_eq_true_eq] at same
            exact List.mem_map.mpr ⟨candidate, candidateMember, same⟩
        simp [rejected]
      · have different : key head ≠ key value := by
          intro same
          apply headFresh
          exact List.mem_map.mpr ⟨value, member, same.symm⟩
        simp [different, ih tailNodup member]

private theorem find?_eq_some_of_filter_eq_singleton (values : List α) (predicate : α → Bool)
    (value : α) (singleton : values.filter predicate = [value]) :
    values.find? predicate = some value := by
  induction values with
  | nil => simp at singleton
  | cons head tail ih =>
      simp only [List.filter_cons] at singleton
      cases accepted : predicate head
      · simp [accepted] at singleton ⊢
        exact ih singleton
      · simp [accepted] at singleton ⊢
        exact singleton.1

/-- A graph-admitted same-scope operation binds each of its token ports to the same unique static
scope as the operation itself. Key uniqueness is supplied by the structural validator, while this
theorem owns the graph-to-scope consequence. -/
theorem programGraphWellFormed_operationControlPlaceScope (program : Program)
    (operation : SemanticOperation) (place : ControlPlaceId)
    (graphValid : programGraphWellFormedForProgram program = true)
    (operationIdsUnique : (program.operations.map (fun candidate => candidate.id)).Nodup)
    (placeIdsUnique : (program.controlPlaces.map (fun candidate => candidate.id)).Nodup)
    (operationMember : operation ∈ program.operations)
    (sameScope : operationControlPlacesShareOwner operation = true)
    (placeMember : place ∈ operationControlPlaces operation) :
    ∃ owner declared,
      program.operationScopes.filter (fun ownership =>
        decide (ownership.operationId = operation.id)) =
          [{ operationId := operation.id, scopeId := owner }] ∧
      program.controlPlaceScopes.filter (fun ownership =>
        decide (ownership.controlPlaceId = place)) =
          [{ controlPlaceId := place, scopeId := owner }] ∧
      program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) =
        [declared] := by
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at graphValid
  generalize startsEq : initiateIds program.operations = starts at graphValid
  cases starts with
  | nil => simp at graphValid
  | cons start rest =>
      cases rest with
      | cons next tail => simp at graphValid
      | nil =>
          generalize rootEq : programEntryRootScopeId? program = root at graphValid
          cases root with
          | none => simp at graphValid
          | some root =>
              simp only [Bool.and_eq_true] at graphValid
              have ownershipComplete : scopedOwnershipComplete program root = true := by grind
              simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownershipComplete
              have operationScopesMap := ownershipComplete.1.1
              have placeScopesMap := ownershipComplete.1.2
              simp only [decide_eq_true_eq] at operationScopesMap placeScopesMap
              have respects := List.all_eq_true.mp ownershipComplete.2 operation operationMember
              unfold operationRespectsScopes at respects
              generalize operationOwnerEq : operationScope? program operation.id = operationOwner
                at respects
              cases operationOwner with
              | none => simp at respects
              | some owner =>
                  have portOwned : placeScope? program place = some owner := by
                    cases operation <;>
                      simp_all [operationControlPlacesShareOwner, operationControlPlaces,
                        operationInputPlaces, operationOutputs, placesOwnedBy] <;> grind
                  unfold operationScope? at operationOwnerEq
                  generalize operationFoundEq : program.operationScopes.find? (fun ownership =>
                    decide (ownership.operationId = operation.id)) = operationFound
                      at operationOwnerEq
                  cases operationFound with
                  | none => simp at operationOwnerEq
                  | some operationBinding =>
                      simp only [Option.map_some, Option.some.injEq] at operationOwnerEq
                      subst owner
                      have operationBindingMember := List.mem_of_find?_eq_some operationFoundEq
                      have operationBindingKey : operationBinding.operationId = operation.id := by
                        simpa only [decide_eq_true_eq] using List.find?_some operationFoundEq
                      unfold placeScope? at portOwned
                      generalize placeFoundEq : program.controlPlaceScopes.find? (fun ownership =>
                        decide (ownership.controlPlaceId = place)) = placeFound at portOwned
                      cases placeFound with
                      | none => simp at portOwned
                      | some placeBinding =>
                          simp only [Option.map_some, Option.some.injEq] at portOwned
                          have placeBindingMember := List.mem_of_find?_eq_some placeFoundEq
                          have placeBindingKey : placeBinding.controlPlaceId = place := by
                            simpa only [decide_eq_true_eq] using List.find?_some placeFoundEq
                          have operationScopeKeys :
                              (program.operationScopes.map (fun binding => binding.operationId)).Nodup := by
                            rw [operationScopesMap]
                            exact operationIdsUnique
                          have placeScopeKeys :
                              (program.controlPlaceScopes.map (fun binding => binding.controlPlaceId)).Nodup := by
                            rw [placeScopesMap]
                            exact placeIdsUnique
                          have placeIdMember : place ∈ program.controlPlaces.map (fun value => value.id) := by
                            rw [← placeScopesMap]
                            exact List.mem_map.mpr ⟨placeBinding, placeBindingMember,
                              placeBindingKey⟩
                          obtain ⟨declared, declaredMember, declaredId⟩ :=
                            List.mem_map.mp placeIdMember
                          rcases operationBinding with ⟨operationId, operationScope⟩
                          simp only at operationBindingKey portOwned ⊢
                          subst operationId
                          rcases placeBinding with ⟨placeId, placeScope⟩
                          simp only at placeBindingKey portOwned ⊢
                          subst placeId
                          subst placeScope
                          refine ⟨operationScope, declared, ?_, ?_, ?_⟩
                          · simpa using
                              filter_key_eq_singleton_of_nodup program.operationScopes
                                (fun binding => binding.operationId)
                                { operationId := operation.id, scopeId := operationScope }
                                operationScopeKeys operationBindingMember
                          · simpa using
                              filter_key_eq_singleton_of_nodup program.controlPlaceScopes
                                (fun binding => binding.controlPlaceId)
                                { controlPlaceId := place, scopeId := operationScope }
                                placeScopeKeys placeBindingMember
                          · simpa [declaredId] using
                              filter_key_eq_singleton_of_nodup program.controlPlaces
                                (fun value => value.id) declared placeIdsUnique declaredMember

/-- A graph-admitted parallel entry and its selected completion share one operation scope; their
same-scope token ports therefore share that exact singleton static owner. -/
theorem programGraphWellFormed_pairedOperationControlPlaceScopes (program : Program)
    (entry completion : SemanticOperation) (arm : ParallelMultiInstanceArm)
    (graphValid : programGraphWellFormedForProgram program = true)
    (operationIdsUnique : (program.operations.map (fun candidate => candidate.id)).Nodup)
    (placeIdsUnique : (program.controlPlaces.map (fun candidate => candidate.id)).Nodup)
    (entryMember : entry ∈ program.operations) (completionMember : completion ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entry = some arm)
    (pairValid : parallelMultiInstanceOperationsPair entry completion = true)
    (paired : parallelMultiInstanceCompletionForEntry? program.operations entry = some completion) :
    ∃ owner inputDeclared timerDeclared normalDeclared,
      program.operationScopes.filter (fun ownership =>
        decide (ownership.operationId = entry.id)) =
          [{ operationId := entry.id, scopeId := owner }] ∧
      program.operationScopes.filter (fun ownership =>
        decide (ownership.operationId = completion.id)) =
          [{ operationId := completion.id, scopeId := owner }] ∧
      program.controlPlaceScopes.filter (fun ownership =>
        decide (ownership.controlPlaceId = arm.input)) =
          [{ controlPlaceId := arm.input, scopeId := owner }] ∧
      program.controlPlaceScopes.filter (fun ownership =>
        decide (ownership.controlPlaceId = arm.boundaryTimer.output)) =
          [{ controlPlaceId := arm.boundaryTimer.output, scopeId := owner }] ∧
      program.controlPlaceScopes.filter (fun ownership =>
        decide (ownership.controlPlaceId = arm.normalOutput)) =
          [{ controlPlaceId := arm.normalOutput, scopeId := owner }] ∧
      program.controlPlaces.filter (fun candidate =>
        decide (candidate.id = arm.input)) = [inputDeclared] ∧
      program.controlPlaces.filter (fun candidate =>
        decide (candidate.id = arm.boundaryTimer.output)) =
        [timerDeclared] ∧
      program.controlPlaces.filter (fun candidate => decide (candidate.id = arm.normalOutput)) =
        [normalDeclared] := by
  have entrySameScope : operationControlPlacesShareOwner entry = true := by
    cases entry <;> simp_all [ParallelMultiInstanceArm.ofOperation?,
      operationControlPlacesShareOwner]
  have entryPlaceMember : arm.boundaryTimer.output ∈ operationControlPlaces entry := by
    cases entry <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
    rw [← projects]
    simp [operationControlPlaces, operationInputPlaces, operationOutputs]
  have inputPlaceMember : arm.input ∈ operationControlPlaces entry := by
    cases entry <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
    rw [← projects]
    simp [operationControlPlaces, operationInputPlaces, operationOutputs]
  have completionSameScope : operationControlPlacesShareOwner completion = true := by
    cases entry <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
    cases completion <;> simp_all [ParallelMultiInstanceArm.ofOperation?,
      ParallelMultiInstanceCompletionArm.ofOperation?, parallelMultiInstanceOperationsPair,
      operationControlPlacesShareOwner]
  have completionPlaceMember : arm.normalOutput ∈ operationControlPlaces completion := by
    cases entry <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
    cases completion <;> simp_all [ParallelMultiInstanceArm.ofOperation?,
      ParallelMultiInstanceCompletionArm.ofOperation?, parallelMultiInstanceOperationsPair,
      operationControlPlaces, operationInputPlaces, operationOutputs]
  obtain ⟨inputOwner, inputDeclared, inputEntryScope, inputPlaceScope, inputPlaceDeclaration⟩ :=
    programGraphWellFormed_operationControlPlaceScope program entry arm.input graphValid
      operationIdsUnique placeIdsUnique entryMember entrySameScope inputPlaceMember
  obtain ⟨entryOwner, timerDeclared, entryScope, entryPlaceScope, entryPlaceDeclaration⟩ :=
    programGraphWellFormed_operationControlPlaceScope program entry arm.boundaryTimer.output graphValid
      operationIdsUnique placeIdsUnique entryMember entrySameScope entryPlaceMember
  obtain ⟨completionOwner, normalDeclared, completionScope, completionPlaceScope,
      completionPlaceDeclaration⟩ :=
    programGraphWellFormed_operationControlPlaceScope program completion arm.normalOutput graphValid
      operationIdsUnique placeIdsUnique completionMember completionSameScope completionPlaceMember
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at graphValid
  generalize startsEq : initiateIds program.operations = starts at graphValid
  cases starts with
  | nil => simp at graphValid
  | cons start rest =>
      cases rest with
      | cons next tail => simp at graphValid
      | nil =>
          generalize rootEq : programEntryRootScopeId? program = root at graphValid
          cases root with
          | none => simp at graphValid
          | some root =>
              simp only [Bool.and_eq_true] at graphValid
              have pairScopes : parallelMultiInstancePairsShareScope program = true := by grind
              simp only [parallelMultiInstancePairsShareScope, List.all_eq_true] at pairScopes
              have sameOwner := pairScopes entry entryMember
              simp [projects, paired] at sameOwner
              unfold operationScope? at sameOwner
              rw [find?_eq_some_of_filter_eq_singleton _ _ _ entryScope,
                find?_eq_some_of_filter_eq_singleton _ _ _ completionScope] at sameOwner
              simp only [Option.map_some, Option.some.injEq] at sameOwner
              have ownerEq : completionOwner = entryOwner := by simpa [projects] using sameOwner
              subst completionOwner
              have inputOwnerEq : inputOwner = entryOwner := by
                rw [inputEntryScope] at entryScope
                simpa using entryScope
              subst inputOwner
              exact ⟨entryOwner, inputDeclared, timerDeclared, normalDeclared, entryScope,
                completionScope, inputPlaceScope, entryPlaceScope, completionPlaceScope,
                inputPlaceDeclaration, entryPlaceDeclaration, completionPlaceDeclaration⟩

/-- Whole-Program graph admission includes the definition-scope forest check. -/
theorem programGraphWellFormed_scopeForest (program : Program)
    (valid : programGraphWellFormedForProgram program = true) :
    scopeForestWellFormed program = true := by
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at valid
  generalize startsEq : initiateIds program.operations = starts at valid
  cases starts with
  | nil => simp at valid
  | cons start rest =>
      cases rest with
      | cons other tail => simp at valid
      | nil =>
          generalize rootEq : programEntryRootScopeId? program = root at valid
          cases root with
          | none => simp at valid
          | some root =>
              simp only [Bool.and_eq_true] at valid
              grind

/-- The admitted graph exposes one common scope contract for regional continuation proofs;
each operation family then interprets its existing ownership and lifecycle clauses. -/
theorem programGraphWellFormed_scopeContract (program : Program)
    (valid : programGraphWellFormedForProgram program = true) :
    ∃ entryRoot, programEntryRootScopeId? program = some entryRoot ∧
      compensationEventSubProcessSnapshotScopeLifecycleWellFormed program entryRoot = true ∧
      scopedOwnershipComplete program entryRoot = true := by
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at valid
  dsimp only at valid
  split at valid
  · split at valid
    · rename_i entryRoot rootFound
      simp only [Bool.and_eq_true] at valid
      exact ⟨entryRoot, rootFound, by grind, by grind⟩
    · contradiction
  · contradiction

/-- Complete ownership maps turn a successful place lookup into exact declaration and binding
censuses. Regional continuations need this independently of their operation's own scope. -/
theorem programGraphWellFormed_exactPlaceBinding (program : Program)
    (place : ControlPlaceId) (scope : DefinitionScopeId)
    (valid : programGraphWellFormedForProgram program = true)
    (unique : (program.controlPlaces.map (·.id)).Nodup)
    (found : placeScope? program place = some scope) :
    (∃ declared, program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) = [declared]) ∧
      program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := scope }] := by
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program valid
  simp only [scopedOwnershipComplete, Bool.and_eq_true, decide_eq_true_eq] at ownership
  have keys := ownership.1.2
  have bindingsUnique : (program.controlPlaceScopes.map (·.controlPlaceId)).Nodup := by
    rw [keys]; exact unique
  unfold placeScope? at found
  cases lookup : program.controlPlaceScopes.find? (fun binding => decide (binding.controlPlaceId = place)) with
  | none => simp [lookup] at found
  | some binding =>
      simp only [lookup, Option.map_some, Option.some.injEq] at found
      have member := List.mem_of_find?_eq_some lookup
      have key : binding.controlPlaceId = place := by
        simpa only [decide_eq_true_eq] using List.find?_some lookup
      have placeMember : place ∈ program.controlPlaces.map (·.id) := by
        rw [← keys]
        exact List.mem_map.mpr ⟨binding, member, key⟩
      obtain ⟨declared, declaredMember, declaredId⟩ := List.mem_map.mp placeMember
      have declaration := filter_key_eq_singleton_of_nodup program.controlPlaces (·.id) declared unique declaredMember
      have bindingCensus := filter_key_eq_singleton_of_nodup program.controlPlaceScopes (·.controlPlaceId)
        binding bindingsUnique member
      have bindingEq : binding = { controlPlaceId := place, scopeId := scope } := by
        cases binding
        simp_all
      exact ⟨⟨declared, by simpa only [declaredId] using declaration⟩,
        by simpa only [key, bindingEq] using bindingCensus⟩

/-- Completion admission selects a declared scope and respects its root or parent continuation;
the complete lifecycle account remains available to distinguish hosting roots from called roots. -/
theorem programGraphWellFormed_completion_binding (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (valid : programGraphWellFormedForProgram program = true)
    (member : .completeScope id origin scopeId output ∈ program.operations) :
    ∃ entryRoot definition, programEntryRootScopeId? program = some entryRoot ∧
      compensationEventSubProcessSnapshotScopeLifecycleWellFormed program entryRoot = true ∧
      (program.definitionScopes.find? fun scope => decide (scope.id = scopeId)) = some definition ∧
      (match (generalizing := false) definition.parentScopeId, output with
      | none, none => True
      | some parent, some place => placeScope? program place = some parent
      | _, _ => False) := by
  obtain ⟨entryRoot, rootFound, lifecycle, ownership⟩ := programGraphWellFormed_scopeContract program valid
  simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownership
  have respects := List.all_eq_true.mp ownership.2 _ member
  unfold operationRespectsScopes at respects
  dsimp only at respects
  split at respects
  · contradiction
  · simp only [Bool.and_eq_true] at respects
    have completion := respects.2
    unfold firstDefinitionScope? at completion
    split at completion
    · contradiction
    · rename_i definition found
      refine ⟨entryRoot, definition, rootFound, lifecycle, found, ?_⟩
      cases parent : definition.parentScopeId <;> cases output <;>
        simp_all [placesOwnedBy, beq_iff_eq]

end BpmnSemantics.SemanticProcess
