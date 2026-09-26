import BpmnSemantics.SemanticProcess.TransactionSourceAdmission

/-! # Roles derived from bounded Transaction admission

The successful production reader supplies the complete owned role graph used by the scheduling proof. Keeping this derivation outside admission avoids rebuilding interpreter consumers when a proof changes.
-/

namespace BpmnSemantics.SemanticProcess

/-- Roles retain the successful reader selections and its exact inventories; they introduce no additional admission test. -/
structure TransactionAdmittedRoles (p : Program) where
  root : DefinitionScope
  child : DefinitionScope
  first : ControlPlaceId
  childEntry : ControlPlaceId
  left : ControlPlaceId
  right : ControlPlaceId
  normalOutput : ControlPlaceId
  cancelOutput : ControlPlaceId
  ackOutput : ControlPlaceId
  start : SemanticOperation
  entry : SemanticOperation
  split : SemanticOperation
  cancel : SemanticOperation
  rootComplete : SemanticOperation
  childComplete : SemanticOperation
  normalEnd : SemanticOperation
  ack : SemanticOperation
  ackEnd : SemanticOperation
  leftOperations : List SemanticOperation
  rightOperations : List SemanticOperation
  ordinaryBranch : List SemanticOperation
  cancelBranch : List SemanticOperation
  leftPlaces : List ControlPlaceId
  rightPlaces : List ControlPlaceId
  retention : CompensationActivityRetentionDeclaration
  execution : CompensationExecutionDeclaration
  target : BoundaryCompensationTarget
  eligible : NodeId
  body : SingleEffectCompensationHandlerBody
  rootSelected : TransactionProgramRoles.unique?
    (p.definitionScopes.filter (·.parentScopeId.isNone)) = some root
  childSelected : TransactionProgramRoles.unique?
    (p.definitionScopes.filter (·.parentScopeId.isSome)) = some child
  rootProcessOrigin : root.originElementId.value = p.processId.value
  profileSelected : p.identity.semanticProfile = transactionCancellationCheckpointProfileId
  startSelected : TransactionProgramRoles.unique? (p.operations.filter fun
    | .initiate .. => true | _ => false) = some start
  startShape : ∃ id origin, start = .initiate id origin first
  entrySelected : TransactionProgramRoles.soleConsumer? p first = some entry
  entryShape : ∃ id origin input, entry = .enterScope id origin input childEntry child.id
  entryOrigin : ∀ id origin input, entry = .enterScope id origin input childEntry child.id →
    origin.elementId = child.originElementId
  splitSelected : TransactionProgramRoles.soleConsumer? p childEntry = some split
  splitShape : ∃ id origin input, split = .duplicate id origin input [left, right]
  cancelSelected : TransactionProgramRoles.unique? (p.operations.filter fun
    | .cancelTransaction .. => true | _ => false) = some cancel
  cancelShape : ∃ id origin input boundary,
    cancel = .cancelTransaction id origin child.id input cancelOutput boundary
  rootCompleteSelected : TransactionProgramRoles.unique? (p.operations.filter fun
    | .completeScope _ _ scope _ => scope == root.id | _ => false) = some rootComplete
  rootCompleteShape : ∃ id origin scope, rootComplete = .completeScope id origin scope none
  childCompleteSelected : TransactionProgramRoles.unique? (p.operations.filter fun
    | .completeScope _ _ scope _ => scope == child.id | _ => false) = some childComplete
  childCompleteShape : ∃ id origin scope,
    childComplete = .completeScope id origin scope (some normalOutput)
  normalEndSelected : TransactionProgramRoles.soleConsumer? p normalOutput = some normalEnd
  normalEndShape : ∃ id origin input, normalEnd = .reachNoneEnd id origin input
  ackSelected : TransactionProgramRoles.soleConsumer? p cancelOutput = some ack
  ackShape : ∃ id origin input task, ack = .awaitUserTask id origin input ackOutput task
  ackEndSelected : TransactionProgramRoles.soleConsumer? p ackOutput = some ackEnd
  ackEndShape : ∃ id origin input, ackEnd = .reachNoneEnd id origin input
  leftParsed : TransactionProgramRoles.taskChain? p child.id 3 left =
    some (leftOperations, leftPlaces)
  rightParsed : TransactionProgramRoles.taskChain? p child.id 3 right =
    some (rightOperations, rightPlaces)
  ordinarySelected : TransactionProgramRoles.unique?
    ([leftOperations, rightOperations].filter TransactionProgramRoles.endsNormally) =
      some ordinaryBranch
  cancelBranchSelected : TransactionProgramRoles.unique?
    ([leftOperations, rightOperations].filter (fun operations =>
      operations.getLast? == some cancel)) = some cancelBranch
  scopesExact : TransactionProgramRoles.exactInventory p.definitionScopes [root, child] = true
  operationsExact : TransactionProgramRoles.exactInventory p.operations
    ([start, entry, split, rootComplete, childComplete, normalEnd, ack, ackEnd] ++
      leftOperations ++ rightOperations) = true
  placesExact : TransactionProgramRoles.exactInventory (p.controlPlaces.map (·.id))
    ([first, childEntry, normalOutput, cancelOutput, ackOutput] ++ leftPlaces ++ rightPlaces) = true
  operationOwnersExact : TransactionProgramRoles.exactInventory
    (p.operationScopes.map (·.operationId)) (p.operations.map (·.id)) = true
  placeOwnersExact : TransactionProgramRoles.exactInventory
    (p.controlPlaceScopes.map (·.controlPlaceId))
    ([first, childEntry, normalOutput, cancelOutput, ackOutput] ++ leftPlaces ++ rightPlaces) = true
  rootOperationsOwned : [start, entry, rootComplete, normalEnd, ack, ackEnd].all
    (fun operation => TransactionProgramRoles.operationOwner? p operation.id == some root.id) = true
  splitOwned : TransactionProgramRoles.operationOwner? p split.id = some child.id
  childCompleteOwned : TransactionProgramRoles.operationOwner? p childComplete.id = some child.id
  rootPlacesOwned : [first, normalOutput, cancelOutput, ackOutput].all
    (fun place => TransactionProgramRoles.controlPlaceOwner? p place == some root.id) = true
  childEntryOwned : TransactionProgramRoles.controlPlaceOwner? p childEntry = some child.id
  childParent : child.parentScopeId = some root.id
  ordinaryLength : 2 ≤ ordinaryBranch.length ∧ ordinaryBranch.length ≤ 3
  cancelLength : 2 ≤ cancelBranch.length ∧ cancelBranch.length ≤ 3
  eligibleOrdinary : (TransactionProgramRoles.taskElementIds ordinaryBranch).contains eligible.value = true
  eligibleNotCancel : (TransactionProgramRoles.taskElementIds cancelBranch).contains eligible.value = false
  retentionPresent : p.compensationActivityRetention = some retention
  executionPresent : p.compensationExecution = some execution
  snapshotsAbsent : p.compensationEventSubProcessSnapshots = none
  retentionTargets : retention.targets = [target]
  executionSubjects : execution.subjects = [.boundaryActivity eligible body]
  retentionScope : retention.definitionScopeId = child.id
  executionScope : execution.definitionScopeId = child.id
  executionTrigger : execution.triggerOperationId = cancel.id
  targetEligible : target.activityElementId = eligible
  targetHandler : target.compensationActivityElementId = body.handlerElementId
  retentionLimits : retention.maxRecords = 1 ∧ retention.maxCanonicalBytes = 4096
  executionLimits : execution.limits = { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 20480 }
  executionDependencies : execution.dependencies = []
  bodyInput : body.input = .empty
  bodyEffect : body.handlerElementId = body.effectElementId
  canonicalOperations : p.operations.all TransactionProgramRoles.canonical = true
  canonicalPlaces : p.controlPlaces.all (fun place => place.id.value == "place:" ++ place.origin.elementId.value) = true
  canonicalRootScope : root.id.value = "scope:" ++ root.originElementId.value
  canonicalChildScope : child.id.value = "scope:" ++ child.originElementId.value
  scheduling : p.internalSchedulingMode = .rejectObservableChoice

/-- Every admitted graph supplies role witnesses directly from its successful reader path. -/
theorem transactionCancellationProgramGraph_roles (p : Program)
    (admitted : transactionCancellationProgramGraph p = true) :
    Nonempty (TransactionAdmittedRoles p) := by
  unfold transactionCancellationProgramGraph at admitted
  dsimp only at admitted
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i root rootSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i child childSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i startId startOrigin first startSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i entryId transaction entryInput childEntry childId entrySelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i splitId splitOrigin splitInput outputs splitSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i left right splitSelf splitOutputs
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i cancelId cancelOrigin cancelScope cancelInput cancelOutput cancelBoundary cancelSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i rootCompleteId rootOrigin rootScope rootCompleteSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i childCompleteId childOrigin childScope normalOutput childCompleteSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i normalEndId normalEndOrigin normalEndInput normalEndSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i ackId ackOrigin ackInput ackOutput ackTask ackSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i ackEndId ackEndOrigin ackEndInput ackEndSelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i leftOperations leftPlaces leftParsed
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i rightOperations rightPlaces rightParsed
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i retention retentionPresent
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i execution executionPresent
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i target retentionTargets
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i eligible body executionSubjects
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i ordinaryBranch ordinarySelected
  split at admitted <;> try { simp only [Id.run, pure, Bool.false_eq_true] at admitted }
  rename_i cancelBranch cancelBranchSelected
  simp only [Id.run, pure, Bool.and_eq_true, beq_iff_eq, SemanticOperation.id,
    Option.isNone_iff_eq_none, List.isEmpty_iff] at admitted
  have entryChild : childId = child.id := by grind only
  have cancelChild : cancelScope = child.id := by grind only
  subst childId cancelScope
  refine ⟨{
    root := root
    child := child
    first := first
    childEntry := childEntry
    left := left
    right := right
    normalOutput := normalOutput
    cancelOutput := cancelOutput
    ackOutput := ackOutput
    start := .initiate startId startOrigin first
    entry := .enterScope entryId transaction entryInput childEntry child.id
    split := .duplicate splitId splitOrigin splitInput [left, right]
    cancel := .cancelTransaction cancelId cancelOrigin child.id cancelInput cancelOutput cancelBoundary
    rootComplete := .completeScope rootCompleteId rootOrigin rootScope none
    childComplete := .completeScope childCompleteId childOrigin childScope (some normalOutput)
    normalEnd := .reachNoneEnd normalEndId normalEndOrigin normalEndInput
    ack := .awaitUserTask ackId ackOrigin ackInput ackOutput ackTask
    ackEnd := .reachNoneEnd ackEndId ackEndOrigin ackEndInput
    leftOperations := leftOperations
    rightOperations := rightOperations
    ordinaryBranch := ordinaryBranch
    cancelBranch := cancelBranch
    leftPlaces := leftPlaces
    rightPlaces := rightPlaces
    retention := retention
    execution := execution
    target := target
    eligible := eligible
    body := body
    rootSelected := ?_
    childSelected := ?_
    rootProcessOrigin := ?_
    profileSelected := ?_
    startSelected := ?_
    startShape := ?_
    entrySelected := ?_
    entryShape := ?_
    entryOrigin := by
      have checkedOrigin : child.originElementId = transaction.elementId := by
        have checked := admitted
        repeat' first | exact checked.2 | exact checked.1 | replace checked := checked.1
      intro id origin input same
      cases same
      exact checkedOrigin.symm
    splitSelected := ?_
    splitShape := ?_
    cancelSelected := ?_
    cancelShape := ?_
    rootCompleteSelected := ?_
    rootCompleteShape := ?_
    childCompleteSelected := ?_
    childCompleteShape := ?_
    normalEndSelected := ?_
    normalEndShape := ?_
    ackSelected := ?_
    ackShape := ?_
    ackEndSelected := ?_
    ackEndShape := ?_
    leftParsed := ?_
    rightParsed := ?_
    ordinarySelected := ?_
    cancelBranchSelected := ?_
    scopesExact := ?_
    operationsExact := ?_
    placesExact := ?_
    operationOwnersExact := ?_
    placeOwnersExact := ?_
    rootOperationsOwned := ?_
    splitOwned := ?_
    childCompleteOwned := ?_
    rootPlacesOwned := ?_
    childEntryOwned := ?_
    childParent := ?_
    ordinaryLength := ?_
    cancelLength := ?_
    eligibleOrdinary := ?_
    eligibleNotCancel := ?_
    retentionPresent := ?_
    executionPresent := ?_
    snapshotsAbsent := ?_
    retentionTargets := ?_
    executionSubjects := ?_
    retentionScope := ?_
    executionScope := ?_
    executionTrigger := ?_
    targetEligible := ?_
    targetHandler := ?_
    retentionLimits := ?_
    executionLimits := ?_
    executionDependencies := ?_
    bodyInput := ?_
    bodyEffect := ?_
    canonicalOperations := ?_
    canonicalPlaces := by
      have checked := admitted
      repeat' first | exact checked.2 | exact checked.1 | replace checked := checked.1
    canonicalRootScope := by
      have identity : root.id.value = "scope:" ++ p.processId.value := by
        have checked := admitted
        repeat' first | exact checked.2 | exact checked.1 | replace checked := checked.1
      have origin : root.originElementId.value = p.processId.value := by
        have checked := admitted
        repeat' first | exact checked.2 | exact checked.1 | replace checked := checked.1
      exact identity.trans (congrArg (fun value => "scope:" ++ value) origin.symm)
    canonicalChildScope := by
      have identity : child.id.value = "scope:" ++ transaction.elementId.value := by
        have checked := admitted
        repeat' first | exact checked.2 | exact checked.1 | replace checked := checked.1
      have origin : child.originElementId = transaction.elementId := by
        have checked := admitted
        repeat' first | exact checked.2 | exact checked.1 | replace checked := checked.1
      exact identity.trans (congrArg (fun element => "scope:" ++ element.value) origin.symm)
    scheduling := ?_ }⟩
  all_goals
    try dsimp only [TransactionProgramRoles.unique?, TransactionProgramRoles.exactInventory,
      TransactionProgramRoles.soleConsumer?, TransactionProgramRoles.taskChain?,
      TransactionProgramRoles.operationOwner?, TransactionProgramRoles.controlPlaceOwner?,
      TransactionProgramRoles.taskElementIds, TransactionProgramRoles.endsNormally,
      TransactionProgramRoles.canonical, SemanticOperation.id]
  all_goals
    first
    | assumption
    | exact ⟨_, _, rfl⟩
    | exact ⟨_, _, _, rfl⟩
    | exact ⟨_, _, _, _, rfl⟩
    | grind only

namespace TransactionAdmittedRoles

theorem operation_inventory_nodup {p : Program} (roles : TransactionAdmittedRoles p) :
    ([roles.start, roles.entry, roles.split, roles.rootComplete, roles.childComplete,
      roles.normalEnd, roles.ack, roles.ackEnd] ++ roles.leftOperations ++
        roles.rightOperations).Nodup := by
  have exactInventory := roles.operationsExact
  simp only [TransactionProgramRoles.exactInventory_eq, Bool.and_eq_true,
    decide_eq_true_eq] at exactInventory
  exact exactInventory.1.1.2

theorem place_inventory_nodup {p : Program} (roles : TransactionAdmittedRoles p) :
    ([roles.first, roles.childEntry, roles.normalOutput, roles.cancelOutput, roles.ackOutput] ++
      roles.leftPlaces ++ roles.rightPlaces).Nodup := by
  have exactInventory := roles.placesExact
  simp only [TransactionProgramRoles.exactInventory_eq, Bool.and_eq_true,
    decide_eq_true_eq] at exactInventory
  exact exactInventory.1.1.2

theorem branch_operations_disjoint {p : Program} (roles : TransactionAdmittedRoles p)
    (operation : SemanticOperation) (left : operation ∈ roles.leftOperations)
    (right : operation ∈ roles.rightOperations) : False := by
  have separate := (List.nodup_append.mp roles.operation_inventory_nodup).2.2
  exact separate operation (List.mem_append_right _ left) operation right rfl

theorem branch_places_disjoint {p : Program} (roles : TransactionAdmittedRoles p)
    (place : ControlPlaceId) (left : place ∈ roles.leftPlaces)
    (right : place ∈ roles.rightPlaces) : False := by
  have separate := (List.nodup_append.mp roles.place_inventory_nodup).2.2
  exact separate place (List.mem_append_right _ left) place right rfl

theorem operation_in_inventory {p : Program} (roles : TransactionAdmittedRoles p)
    (operation : SemanticOperation) (member : operation ∈ p.operations) :
    operation ∈ [roles.start, roles.entry, roles.split, roles.rootComplete, roles.childComplete,
      roles.normalEnd, roles.ack, roles.ackEnd] ++ roles.leftOperations ++
        roles.rightOperations := by
  have exactInventory := roles.operationsExact
  simp only [TransactionProgramRoles.exactInventory_eq, Bool.and_eq_true] at exactInventory
  simpa using List.all_eq_true.mp exactInventory.2 operation member

end TransactionAdmittedRoles

/-- Admission excludes other transition families independently of runtime reachability. -/
theorem transactionCancellationProgramGraph_operation_families
    (p : Program) (admitted : transactionCancellationProgramGraph p = true)
    (operation : SemanticOperation) (member : operation ∈ p.operations) :
    match operation with
    | .initiate .. | .enterScope .. | .duplicate .. | .awaitUserTask ..
    | .reachNoneEnd .. | .completeScope .. | .cancelTransaction .. => True
    | _ => False := by
  obtain ⟨roles⟩ := transactionCancellationProgramGraph_roles p admitted
  have selected := List.all_eq_true.mp roles.canonicalOperations operation member
  cases operation <;> try trivial
  all_goals
    change false = true at selected
    contradiction

end BpmnSemantics.SemanticProcess
