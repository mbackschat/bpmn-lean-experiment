import BpmnSemantics.SemanticProcess.TransactionInitialValidity
import BpmnSemantics.SemanticProcess.InternalSnapshotArmingExecution

/-! # Transaction initial Task batch

The admitted branch heads and exact split state derive actual preparation and footprint independence
in both Task orders. `TransactionInitialValidity` supplies the predecessor contract needed to apply
the existing snapshot batch laws for complete state and canonical paired-publication equality.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles InternalCommutation

private theorem initial_operation_ids (p : Program) (valid : programWellFormed p = true) :
    (p.operations.map (·.id)).Nodup := by
  apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
    (fun _ _ different same => different (congrArg OperationId.value same))
  rw [List.map_map]
  exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted p valid)

private theorem initial_operation_filter (p : Program) (valid : programWellFormed p = true)
    (operation : SemanticOperation) (member : operation ∈ p.operations) :
    p.operations.filter (fun candidate => decide (candidate.id = operation.id)) = [operation] :=
  filter_eq_singleton_of_key_nodup _ (·.id) _ operation
    (initial_operation_ids p valid) member (by simp)
    (fun _ _ selected => of_decide_eq_true selected)

private theorem initial_head_selected (p : Program) (scope : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p scope place operations places) (head : TransactionInitialTask)
    (selected : operations.head? = some head.operation) :
    head.operation ∈ p.operations ∧ operationOwner? p head.id = some scope := by
  cases chain with
  | task place id origin input output task rest remaining _ owned consumer _ _ =>
    have same : .awaitUserTask id origin input output task = head.operation := Option.some.inj selected
    have sameId := congrArg SemanticOperation.id same
    change id = head.id at sameId
    exact ⟨same ▸ (soleConsumer_facts p place _ consumer).1, by simpa only [sameId] using owned⟩
  | noneEnd => cases head; simp [TransactionInitialTask.operation] at selected
  | cancelEnd => cases head; simp [TransactionInitialTask.operation] at selected

private theorem initial_head_canonical (p : Program) (roles : TransactionAdmittedRoles p)
    (head : TransactionInitialTask) (member : head.operation ∈ p.operations) :
    head.id.value = "operation:" ++ head.origin.elementId.value ∧
      head.task.id.value = head.origin.elementId.value := by
  have canonical := List.all_eq_true.mp roles.canonicalOperations head.operation member
  change ((head.id.value == "operation:" ++ head.origin.elementId.value) &&
    nonempty head.origin.elementId.value && (head.task.id.value == head.origin.elementId.value) &&
    head.task.metadata.isNone) = true at canonical
  simp only [Bool.and_eq_true, beq_iff_eq] at canonical
  exact ⟨canonical.1.1.1, canonical.1.2⟩

private theorem initial_task_declarers (p : Program) (roles : TransactionAdmittedRoles p)
    (valid : programWellFormed p = true) (head : TransactionInitialTask)
    (member : head.operation ∈ p.operations) : userTaskWaitDeclarers p head.task.id = [head.operation] := by
  obtain ⟨headId, headTask⟩ := initial_head_canonical p roles head member
  unfold userTaskWaitDeclarers
  apply filter_eq_singleton_of_key_nodup _ (·.id) _ head.operation
    (initial_operation_ids p valid) member (by simp [TransactionInitialTask.operation])
  intro candidate present accepted
  have canonical := List.all_eq_true.mp roles.canonicalOperations candidate present
  cases candidate <;> try { change false = true at accepted; contradiction }
  all_goals try { change false = true at canonical; contradiction }
  rename_i id origin input output task
  have taskEq : task.id = head.task.id := of_decide_eq_true accepted
  change ((id.value == "operation:" ++ origin.elementId.value) && nonempty origin.elementId.value &&
    (task.id.value == origin.elementId.value) && task.metadata.isNone) = true at canonical
  simp only [Bool.and_eq_true, beq_iff_eq] at canonical
  apply congrArg OperationId.mk
  change id.value = head.id.value
  rw [canonical.1.1.1, headId, ← canonical.1.2, ← headTask, taskEq]

private def initialTaskPatch (p : Program) (roles : TransactionAdmittedRoles p)
    (head : TransactionInitialTask) (instanceId : SemanticId) (inputOrigin : BpmnSequenceFlowOrigin) :
    InternalArmingPatch :=
  { operation := head.operation
    definition := p.identity
    processId := p.processId
    origin := head.origin
    runtimeInstanceId := instanceId
    logicalTimeMs := 0
    input := head.input
    inputOrigin
    owner := transactionChildOwner roles instanceId
    write := .userTask
      { processInstanceId := instanceId
        owner := transactionChildOwner roles instanceId
        task := head.task
        activation := 1
        output := head.output
        metadata := head.task.metadata } }

private theorem initial_task_prepares (p : Program) (roles : TransactionAdmittedRoles p)
    (valid : programWellFormed p = true) (head : TransactionInitialTask) (instanceId : SemanticId)
    (member : head.operation ∈ p.operations) (owned : operationOwner? p head.id = some roles.child.id)
    (input : head.input = roles.left ∨ head.input = roles.right) :
    ∃ origin, prepareInternalArm? p (transactionSplitState roles instanceId []) head.operation =
      some (initialTaskPatch p roles head instanceId origin) := by
  let state := transactionSplitState roles instanceId []
  let owner := transactionChildOwner roles instanceId
  have placeIds : (p.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted p valid)
  obtain ⟨scope, declared, opBinding, placeBinding, placeDeclared⟩ :=
    programGraphWellFormed_operationControlPlaceScope p head.operation head.input
      (programWellFormed_graph p valid) (initial_operation_ids p valid) placeIds member
      (by rfl) (by change head.input ∈ [head.input] ++ [head.output]; simp)
  have scopeEq : scope = roles.child.id := by
    change (unique? (p.operationScopes.filter (fun binding => binding.operationId == head.id))).map
      (·.scopeId) = some roles.child.id at owned
    have census : p.operationScopes.filter (fun binding => binding.operationId == head.id) =
        [{ operationId := head.id, scopeId := scope }] := by
      change p.operationScopes.filter (fun binding => decide (binding.operationId = head.id)) =
        [{ operationId := head.id, scopeId := scope }] at opBinding
      calc
        _ = p.operationScopes.filter (fun binding => decide (binding.operationId = head.id)) := by
          apply List.filter_congr
          intro binding _
          apply Bool.eq_iff_iff.mpr
          simp only [beq_iff_eq, decide_eq_true_eq]
        _ = _ := opBinding
    rw [census] at owned
    exact Option.some.inj owned
  have selected : exactProgramSelection p head.operation owner = true := by
    have census : p.operations.filter (fun candidate => decide (candidate = head.operation)) =
        [head.operation] := filter_eq_singleton_of_key_nodup _ (·.id) _ head.operation
      (initial_operation_ids p valid) member (by simp)
      (fun _ _ accepted => congrArg SemanticOperation.id (of_decide_eq_true accepted))
    simp [exactProgramSelection, census, opBinding, owner, transactionChildOwner, scopeEq]
  have inputOrigin : selectedInputOrigin? p head.input owner = some declared.origin := by
    simp [selectedInputOrigin?, placeDeclared, placeBinding, owner, transactionChildOwner, scopeEq]
  have different := transaction_admitted_split_places_distinct p roles
  have token : onlyTokenOwner? state head.input = some owner := by
    by_cases ordered : controlTokenBefore
      { placeId := roles.left, owner } { placeId := roles.right, owner } = true
    all_goals rcases input with input | input <;>
      simp [state, transactionSplitState, onlyTokenOwner?, tokenOwners, input, owner,
        addTokens, addToken, canonicalInsertBy, ordered, different, Ne.symm different]
  have scopeDifferent := roles.child_scope_ne_root valid
  have live : exactLiveOccurrence state owner = true := by
    change decide (((insertScopeOccurrence
      { id := owner, parent := some ⟨instanceId, roles.root.id, 1⟩ }
      [{ id := ⟨instanceId, roles.root.id, 1⟩, parent := none }]).filter
        (fun occurrence => decide (occurrence.id = owner))).length = 1) = true
    simp only [insertScopeOccurrence, canonicalInsertBy]
    split <;> simp [owner, transactionChildOwner, Ne.symm scopeDifferent]
  have declarers := initial_task_declarers p roles valid head member
  refine ⟨declared.origin, ?_⟩
  change prepareInternalArm? p state head.operation = _
  simp only [TransactionInitialTask.operation] at selected
  simp only [prepareInternalArm?, internalArmInput?, internalArmOrigin?, TransactionInitialTask.operation,
    token, selected, inputOrigin, live, show state.control = .running instanceId from rfl,
    show activationCount state head.task.id = 0 from rfl,
    bind, Option.bind, Bool.not_true, Bool.or_false, Bool.false_eq_true, ↓reduceIte]
  simp [initialTaskPatch, TransactionInitialTask.operation, InternalArmingWrite.kind,
    InternalArmingWrite.elementId, InternalArmingWrite.occurrence, InternalArmingWrite.available,
    uniqueFamilyDeclarer?, declarers, openWaitAnchorAbsent, openWaitAnchors, userTaskWaitOccurrence,
    state, owner, transactionChildOwner, transactionSplitState, transactionEnteredState,
    transactionInitiatedState, transactionRootStartState, runningStartState, initialState]

private theorem initial_heads_distinct (p : Program) (roles : TransactionAdmittedRoles p)
    (valid : programWellFormed p = true) (heads : TransactionInitialTasks roles) :
    heads.left.id ≠ heads.right.id ∧ heads.left.task.id.value ≠ heads.right.task.id.value := by
  have left := initial_head_selected p _ _ _ _ roles.left_chain heads.left heads.leftHead
  have right := initial_head_selected p _ _ _ _ roles.right_chain heads.right heads.rightHead
  have leftMember : heads.left.operation ∈ roles.leftOperations := by
    have selectedHead := heads.leftHead
    cases selected : roles.leftOperations <;> simp_all
  have rightMember : heads.right.operation ∈ roles.rightOperations := by
    have selectedHead := heads.rightHead
    cases selected : roles.rightOperations <;> simp_all
  have different : heads.left.id ≠ heads.right.id := by
    intro same
    have selected := initial_operation_filter p valid heads.left.operation left.1
    have present : heads.right.operation ∈ p.operations.filter
        (fun operation => decide (operation.id = heads.left.operation.id)) := by
      exact List.mem_filter.mpr ⟨right.1, by simpa [TransactionInitialTask.operation, SemanticOperation.id] using same.symm⟩
    rw [selected] at present
    have sameOperation : heads.right.operation = heads.left.operation := by simpa using present
    exact roles.branch_operations_disjoint heads.left.operation leftMember (sameOperation ▸ rightMember)
  refine ⟨different, ?_⟩
  intro sameTask
  obtain ⟨leftId, leftTask⟩ := initial_head_canonical p roles heads.left left.1
  obtain ⟨rightId, rightTask⟩ := initial_head_canonical p roles heads.right right.1
  apply different
  apply congrArg OperationId.mk
  rw [leftId, rightId, ← leftTask, ← rightTask, sameTask]

private theorem initial_patches_independent (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (valid : programWellFormed p = true)
    (instanceId : SemanticId) (leftOrigin rightOrigin : BpmnSequenceFlowOrigin) :
    (PreparedInternalArming.ordinary heads.left.operation
      (initialTaskPatch p roles heads.left instanceId leftOrigin)).Independent
    (.ordinary heads.right.operation (initialTaskPatch p roles heads.right instanceId rightOrigin)) := by
  obtain ⟨ids, tasks⟩ := initial_heads_distinct p roles valid heads
  have inputs : heads.left.input ≠ heads.right.input := by
    rw [heads.leftInput, heads.rightInput]
    exact transaction_admitted_split_places_distinct p roles
  simp only [PreparedInternalArming.Independent, PreparedInternalArming.footprint,
    footprintsNonInterfering, Bool.and_eq_true]
  repeat' constructor
  all_goals
    simp only [listsDisjoint, List.all_eq_true, Bool.not_eq_true', List.contains_eq_mem,
      decide_eq_false_iff_not]
    intro atom member collision
    simp [footprintOfPatch, initialTaskPatch, InternalArmingWrite.kind,
      InternalArmingWrite.elementId, InternalArmingWrite.occurrence, InternalWaitKind.activationKind,
      userTaskWaitOccurrence, TransactionInitialTask.operation, SemanticOperation.id,
      canonicalStateAtomSet, canonicalPublicationAtomSet, mem_sortBy] at member collision
    first
      | (rcases member with rfl | rfl | rfl | rfl | rfl)
      | (rcases member with rfl | rfl | rfl)
    all_goals simp_all [Ne.symm ids, Ne.symm tasks, Ne.symm inputs]

private theorem initial_compensation_projection (p : Program) (roles : TransactionAdmittedRoles p)
    (valid : programWellFormed p = true) (instanceId : SemanticId) :
    projectOpenCompensationFlowNodeOccurrences? p (transactionSplitState roles instanceId []) = some [] := by
  let state := transactionSplitState roles instanceId []
  have declared : compensationExecutionDeclarationValid p = true := by
    simp only [programWellFormed, Bool.and_eq_true] at valid
    exact valid.2
  have execution := compensationExecutionStateValid_empty p state declared rfl rfl
    (.inr ⟨instanceId, rfl⟩)
  have cancel := initial_operation_filter p valid roles.cancel
    (unique_filter_facts _ _ _ roles.cancelSelected).1
  unfold projectOpenCompensationFlowNodeOccurrences?
  rw [execution]
  change (match p.compensationExecution with
    | none => some []
    | some _ => (do
        let declaration ← p.compensationExecution
        match p.operations.filter (fun (operation : SemanticOperation) =>
            decide (operation.id = declaration.triggerOperationId)) with
        | [operation@(.triggerCompensation ..)] | [operation@(.cancelTransaction ..)] => some operation
        | _ => none).bind (fun _ => some ([] : List OpenSemanticFlowNodeOccurrence))) = some []
  rw [roles.executionPresent]
  dsimp only [bind, Option.bind]
  rw [roles.executionTrigger, cancel]
  obtain ⟨id, origin, input, boundary, shape⟩ := roles.cancelShape
  rw [shape]

private theorem initial_focused_projection (p : Program) (roles : TransactionAdmittedRoles p)
    (valid : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    (projectOpenFlowNodeOccurrencesWithCompensation? p
      (transactionSplitState roles instanceId [])).isSome = true := by
  rw [focused_open_projection_eq p _ valid,
    transaction_split_open_projection p roles valid instanceId nonemptyInstance]
  simp [initial_compensation_projection p roles valid instanceId,
    sortFlowNodeOccurrenceStarts, SemanticProcess.sortBy, insertBy]

/-- Both reader-selected Tasks prepare from the exact valid split, including its retained child register. -/
theorem transaction_initial_batch_prepared (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (valid : programWellFormed p = true)
    (instanceId : SemanticId) (nonemptyInstance : nonempty instanceId.value = true) :
    ∃ left right : InternalArmingPatch,
      prepareInternalArm? p (transactionSplitState roles instanceId []) heads.left.operation = some left ∧
      prepareInternalArm? p (transactionSplitState roles instanceId []) heads.right.operation = some right ∧
      (PreparedInternalArming.ordinary heads.left.operation left).Independent
        (.ordinary heads.right.operation right) ∧
      prepareSnapshotArmingBatch? p (transactionSplitState roles instanceId [])
          [heads.left.operation, heads.right.operation] =
        some [.ordinary heads.left.operation left, .ordinary heads.right.operation right] ∧
      prepareSnapshotArmingBatch? p (transactionSplitState roles instanceId [])
          [heads.right.operation, heads.left.operation] =
        some [.ordinary heads.right.operation right, .ordinary heads.left.operation left] := by
  let state := transactionSplitState roles instanceId []
  have leftFacts := initial_head_selected p _ _ _ _ roles.left_chain heads.left heads.leftHead
  have rightFacts := initial_head_selected p _ _ _ _ roles.right_chain heads.right heads.rightHead
  obtain ⟨leftOrigin, leftSelected⟩ := initial_task_prepares p roles valid heads.left instanceId
    leftFacts.1 leftFacts.2 (.inl heads.leftInput)
  obtain ⟨rightOrigin, rightSelected⟩ := initial_task_prepares p roles valid heads.right instanceId
    rightFacts.1 rightFacts.2 (.inr heads.rightInput)
  let left := initialTaskPatch p roles heads.left instanceId leftOrigin
  let right := initialTaskPatch p roles heads.right instanceId rightOrigin
  have independent := initial_patches_independent p roles heads valid instanceId leftOrigin rightOrigin
  change (PreparedInternalArming.ordinary heads.left.operation left).Independent
    (.ordinary heads.right.operation right) at independent
  have fresh (patch : InternalArmingPatch) : snapshotArmingAnchorFresh p state patch = true := by
    simp [snapshotArmingAnchorFresh, state, initial_compensation_projection p roles valid instanceId]
  have leftSnapshot : prepareSnapshotArming? p state heads.left.operation =
      some (.ordinary heads.left.operation left) := by
    exact snapshot_prepared_selection p state (.ordinary heads.left.operation left)
      ⟨leftSelected, fresh left⟩
  have rightSnapshot : prepareSnapshotArming? p state heads.right.operation =
      some (.ordinary heads.right.operation right) := by
    exact snapshot_prepared_selection p state (.ordinary heads.right.operation right)
      ⟨rightSelected, fresh right⟩
  have opened : (projectOpenFlowNodeOccurrencesWithCompensation? p state).isSome = true :=
    initial_focused_projection p roles valid instanceId nonemptyInstance
  refine ⟨left, right, leftSelected, rightSelected, independent, ?_, ?_⟩
  · change prepareSnapshotArmingBatch? p state _ = _
    simp [prepareSnapshotArmingBatch?, opened, leftSnapshot, rightSnapshot, independent]
  · change prepareSnapshotArmingBatch? p state _ = _
    simp [prepareSnapshotArmingBatch?, opened, leftSnapshot, rightSnapshot,
      PreparedInternalArming.independent_symm independent]

/-- Admission supplies the two heads; preparation and complete predecessor validity are derived. -/
theorem transaction_admitted_initial_batch (p : Program) (roles : TransactionAdmittedRoles p)
    (valid : programWellFormed p = true) (instanceId : SemanticId)
    (nonemptyInstance : nonempty instanceId.value = true) :
    ∃ heads : TransactionInitialTasks roles, ∃ prepared,
      runtimeStateWellFormed p instanceId (transactionSplitState roles instanceId []) = true ∧
      prepareSnapshotArmingBatch? p (transactionSplitState roles instanceId [])
        [heads.left.operation, heads.right.operation] = some prepared ∧
      prepareSnapshotArmingBatch? p (transactionSplitState roles instanceId [])
        [heads.right.operation, heads.left.operation] = some prepared.reverse := by
  obtain ⟨heads⟩ := transaction_admitted_initial_tasks p roles
  obtain ⟨left, right, _, _, _, forward, backward⟩ :=
    transaction_initial_batch_prepared p roles heads valid instanceId nonemptyInstance
  exact ⟨heads, [.ordinary heads.left.operation left, .ordinary heads.right.operation right],
    transaction_split_wellFormed p roles valid instanceId nonemptyInstance,
    forward, by simpa using backward⟩

/-- The existing snapshot batch law supplies equal complete state and canonical paired publication. -/
theorem transaction_initial_batch_publication (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (valid : programWellFormed p = true)
    (instanceId commandId : SemanticId) (nonemptyInstance : nonempty instanceId.value = true) :
    ∃ left right : InternalArmingPatch, ∃ final leftPublications rightPublications,
      prepareSnapshotArmingBatch? p (transactionSplitState roles instanceId [])
          [heads.left.operation, heads.right.operation] =
        some [.ordinary heads.left.operation left, .ordinary heads.right.operation right] ∧
      prepareSnapshotArmingBatch? p (transactionSplitState roles instanceId [])
          [heads.right.operation, heads.left.operation] =
        some [.ordinary heads.right.operation right, .ordinary heads.left.operation left] ∧
      runtimeStateWellFormed p instanceId final = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? p final).isSome = true ∧
      runPreparedSnapshotArmingBatch? p instanceId commandId (transactionSplitState roles instanceId [])
        [.ordinary heads.left.operation left, .ordinary heads.right.operation right] =
          some (final, leftPublications) ∧
      runPreparedSnapshotArmingBatch? p instanceId commandId (transactionSplitState roles instanceId [])
        [.ordinary heads.right.operation right, .ordinary heads.left.operation left] =
          some (final, rightPublications) ∧
      canonicalAcceptedInternalPublicationPairs leftPublications =
        canonicalAcceptedInternalPublicationPairs rightPublications := by
  obtain ⟨left, right, _, _, _, forward, backward⟩ :=
    transaction_initial_batch_prepared p roles heads valid instanceId nonemptyInstance
  have selected := prepareSnapshotArmingBatch_sound p (transactionSplitState roles instanceId [])
    _ _ forward
  obtain ⟨final, leftPublications, rightPublications, stateValid, opened, leftRun, rightRun, publications⟩ :=
    snapshot_prepared_batch_publication_perm p instanceId commandId (transactionSplitState roles instanceId [])
      [.ordinary heads.left.operation left, .ordinary heads.right.operation right]
      [.ordinary heads.right.operation right, .ordinary heads.left.operation left]
      valid (transaction_split_wellFormed p roles valid instanceId nonemptyInstance)
      selected.2.1 selected.2.2.1 selected.2.2.2.1 (List.Perm.swap ..)
  exact ⟨left, right, final, leftPublications, rightPublications, forward, backward,
    stateValid, opened, leftRun, rightRun, publications⟩

end BpmnSemantics.SemanticProcess
