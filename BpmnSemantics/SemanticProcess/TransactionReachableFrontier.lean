import BpmnSemantics.SemanticProcess.TransactionProgramRoles
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.TransactionFrontierPhases
import BpmnSemantics.SemanticProcess.TransactionFrontierCardinality

/-! # Transaction branch structure and operational reachability

Branch facts are derived from the existing admission reader. Command boundaries and internal prefixes use the compensation-aware evaluators, so their definitions require neither successor validity nor a desired frontier classification. Chain soundness and rollback preservation do not establish phase preservation or classify reachable frontiers.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open TransactionProgramRoles

/-- A reader-selected branch has owned, sole continuations and ends in None or Cancel. -/
inductive TransactionTaskChain (program : Program) (child : DefinitionScopeId) :
    ControlPlaceId → List SemanticOperation → List ControlPlaceId → Prop where
  | task (place : ControlPlaceId) (id : OperationId) (origin : BpmnElementOrigin)
      (input output : ControlPlaceId) (task : UserTaskDefinition)
      (operations : List SemanticOperation) (places : List ControlPlaceId)
      (placeOwned : controlPlaceOwner? program place = some child)
      (operationOwned : operationOwner? program id = some child)
      (consumer : soleConsumer? program place =
        some (.awaitUserTask id origin input output task))
      (metadataAbsent : task.metadata = none)
      (rest : TransactionTaskChain program child output operations places) :
      TransactionTaskChain program child place
        (.awaitUserTask id origin input output task :: operations) (place :: places)
  | noneEnd (place : ControlPlaceId) (id : OperationId) (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (placeOwned : controlPlaceOwner? program place = some child)
      (operationOwned : operationOwner? program id = some child)
      (consumer : soleConsumer? program place = some (.reachNoneEnd id origin input)) :
      TransactionTaskChain program child place [.reachNoneEnd id origin input] [place]
  | cancelEnd (place : ControlPlaceId) (id : OperationId) (origin : BpmnElementOrigin)
      (scope : DefinitionScopeId) (input output : ControlPlaceId) (boundary : NodeId)
      (placeOwned : controlPlaceOwner? program place = some child)
      (operationOwned : operationOwner? program id = some child)
      (consumer : soleConsumer? program place =
        some (.cancelTransaction id origin scope input output boundary)) :
      TransactionTaskChain program child place
        [.cancelTransaction id origin scope input output boundary] [place]

/-- Soundness follows the actual bounded reader, including its owner and metadata checks. -/
theorem transaction_taskChain_sound_and_length (program : Program) (child : DefinitionScopeId)
    (fuel : Nat) (place : ControlPlaceId) (operations : List SemanticOperation)
    (places : List ControlPlaceId)
    (selected : taskChain? program child fuel place = some (operations, places)) :
    TransactionTaskChain program child place operations places ∧ operations.length ≤ fuel := by
  induction fuel generalizing place operations places with
  | zero => simp [taskChain_zero] at selected
  | succ fuel ih =>
      rw [taskChain_succ] at selected
      by_cases placeOwned : controlPlaceOwner? program place = some child
      · rw [if_neg (by simp [placeOwned])] at selected
        obtain ⟨operation, consumer, selected⟩ := Option.bind_eq_some_iff.mp selected
        by_cases operationOwned : operationOwner? program operation.id = some child
        · rw [if_neg (by simp [operationOwned])] at selected
          cases operation <;> try contradiction
          case awaitUserTask id origin input output task =>
            dsimp only at selected
            by_cases metadataAbsent : task.metadata = none
            · rw [if_neg (by simp [metadataAbsent])] at selected
              obtain ⟨⟨tailOperations, tailPlaces⟩, tailSelected, result⟩ :=
                Option.bind_eq_some_iff.mp selected
              have equal :
                  (.awaitUserTask id origin input output task :: tailOperations,
                    place :: tailPlaces) = (operations, places) := Option.some.inj result
              cases equal
              have tail := ih output tailOperations tailPlaces tailSelected
              exact ⟨.task place id origin input output task tailOperations tailPlaces
                placeOwned operationOwned consumer metadataAbsent tail.1,
                Nat.succ_le_succ tail.2⟩
            · have present : task.metadata.isSome = true := by
                cases metadata : task.metadata <;> simp_all
              simp [present] at selected
          case reachNoneEnd id origin input =>
            have equal : ([SemanticOperation.reachNoneEnd id origin input], [place]) =
                (operations, places) := Option.some.inj selected
            cases equal
            exact ⟨.noneEnd place id origin input placeOwned operationOwned consumer,
              Nat.succ_le_succ (Nat.zero_le fuel)⟩
          case cancelTransaction id origin scope input output boundary =>
            have equal :
                ([SemanticOperation.cancelTransaction id origin scope input output boundary],
                  [place]) = (operations, places) := Option.some.inj selected
            cases equal
            exact ⟨.cancelEnd place id origin scope input output boundary
              placeOwned operationOwned consumer, Nat.succ_le_succ (Nat.zero_le fuel)⟩
        · simp [operationOwned] at selected
      · simp [placeOwned] at selected

theorem transaction_taskChain_nonempty (program : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation)
    (places : List ControlPlaceId)
    (chain : TransactionTaskChain program child place operations places) :
    operations ≠ [] ∧ places ≠ [] ∧ operations.length = places.length := by
  induction chain <;> simp_all

theorem transaction_taskChain_one_or_two_tasks (program : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation)
    (places : List ControlPlaceId)
    (selected : taskChain? program child 3 place = some (operations, places))
    (nontrivial : 2 ≤ operations.length) :
    operations.length = 2 ∨ operations.length = 3 := by
  have bounded := (transaction_taskChain_sound_and_length
    program child 3 place operations places selected).2
  omega

/-- Every selected input has exactly one consumer in the complete Program. -/
theorem transaction_taskChain_head_consumer (program : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operation : SemanticOperation) (rest : List SemanticOperation)
    (places : List ControlPlaceId)
    (chain : TransactionTaskChain program child place (operation :: rest) places) :
    program.operations.filter (fun candidate => operationInput? candidate == some place) =
      [operation] := by
  cases chain <;> apply soleConsumer_exact <;> assumption

namespace TransactionAdmittedRoles

theorem root_definition_selected {p : Program} (roles : TransactionAdmittedRoles p) :
    rootDefinitionScope? p = some roles.root := by
  have roots := unique_exact _ _ roles.rootSelected
  have filtered : p.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && decide (scope.originElementId.value = p.processId.value)) =
        [roles.root] := by
    calc
      _ = (p.definitionScopes.filter (·.parentScopeId.isNone)).filter
          (fun scope => decide (scope.originElementId.value = p.processId.value)) := by
            simp only [List.filter_filter, Bool.and_comm]
      _ = [roles.root] := by rw [roots]; simp [roles.rootProcessOrigin]
  simp only [rootDefinitionScope?, filtered]

theorem child_scope_ne_root {p : Program} (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) : roles.child.id ≠ roles.root.id := by
  have forest := programGraphWellFormed_scopeForest p (programWellFormed_graph p wellFormed)
  have member := (unique_filter_facts _ _ _ roles.childSelected).1
  simp only [scopeForestWellFormed, Bool.and_eq_true] at forest
  have parent := List.all_eq_true.mp forest.1.2 roles.child member
  simp only [roles.childParent, Bool.and_eq_true, decide_eq_true_eq] at parent
  exact parent.1

theorem left_chain {p : Program} (roles : TransactionAdmittedRoles p) :
    TransactionTaskChain p roles.child.id roles.left roles.leftOperations roles.leftPlaces :=
  (transaction_taskChain_sound_and_length p roles.child.id 3 roles.left
    roles.leftOperations roles.leftPlaces roles.leftParsed).1

theorem right_chain {p : Program} (roles : TransactionAdmittedRoles p) :
    TransactionTaskChain p roles.child.id roles.right roles.rightOperations roles.rightPlaces :=
  (transaction_taskChain_sound_and_length p roles.child.id 3 roles.right
    roles.rightOperations roles.rightPlaces roles.rightParsed).1

theorem branches_by_role {p : Program} (roles : TransactionAdmittedRoles p) :
    (roles.leftOperations = roles.ordinaryBranch ∧ roles.rightOperations = roles.cancelBranch) ∨
    (roles.leftOperations = roles.cancelBranch ∧ roles.rightOperations = roles.ordinaryBranch) := by
  have ordinaryExact := unique_exact _ _ roles.ordinarySelected
  have cancelExact := unique_exact _ _ roles.cancelBranchSelected
  have ordinaryMember := List.mem_filter.mp
    (show roles.ordinaryBranch ∈ [roles.leftOperations, roles.rightOperations].filter endsNormally by
      rw [ordinaryExact]; simp)
  have cancelMember := List.mem_filter.mp
    (show roles.cancelBranch ∈ [roles.leftOperations, roles.rightOperations].filter
      (fun operations => operations.getLast? == some roles.cancel) by
      rw [cancelExact]; simp)
  have different : roles.ordinaryBranch ≠ roles.cancelBranch := by
    intro equal
    have last : roles.cancelBranch.getLast? = some roles.cancel := by
      simpa only [beq_iff_eq] using cancelMember.2
    obtain ⟨id, origin, input, boundary, shape⟩ := roles.cancelShape
    have normal := ordinaryMember.2
    simp [endsNormally, equal, last, shape] at normal
  have ordinaryOnBranch := ordinaryMember.1
  have cancelOnBranch := cancelMember.1
  simp only [List.mem_cons, List.not_mem_nil, or_false] at ordinaryOnBranch cancelOnBranch
  rcases ordinaryOnBranch with ordinaryLeft | ordinaryRight
  · rcases cancelOnBranch with cancelLeft | cancelRight
    · exact False.elim (different (ordinaryLeft.trans cancelLeft.symm))
    · exact Or.inl ⟨ordinaryLeft.symm, cancelRight.symm⟩
  · rcases cancelOnBranch with cancelLeft | cancelRight
    · exact Or.inr ⟨cancelLeft.symm, ordinaryRight.symm⟩
    · exact False.elim (different (ordinaryRight.trans cancelRight.symm))

theorem left_length {p : Program} (roles : TransactionAdmittedRoles p) :
    2 ≤ roles.leftOperations.length ∧ roles.leftOperations.length ≤ 3 := by
  rcases roles.branches_by_role with selected | selected
  · simpa only [selected.1] using roles.ordinaryLength
  · simpa only [selected.1] using roles.cancelLength

theorem right_length {p : Program} (roles : TransactionAdmittedRoles p) :
    2 ≤ roles.rightOperations.length ∧ roles.rightOperations.length ≤ 3 := by
  rcases roles.branches_by_role with selected | selected
  · simpa only [selected.2] using roles.cancelLength
  · simpa only [selected.2] using roles.ordinaryLength

end TransactionAdmittedRoles

/-- Start's normal form is derived from the selected root; the child register begins only at entry. -/
def transactionRootStartState {p : Program} (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) (variables : List VariableBinding) : RuntimeState :=
  let owner : ScopeOccurrenceId :=
    { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 }
  { runningStartState instanceId variables with
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := roles.root.id, count := 1 }]
    compensationActivityRetentions := [] }

theorem transaction_start_builder_normal_form (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (variables : List VariableBinding) :
    runningProgramStartState? p instanceId variables =
      some (transactionRootStartState roles instanceId variables) := by
  simp [runningProgramStartState?, roles.root_definition_selected, roles.retentionPresent,
    roles.retentionScope, roles.child_scope_ne_root wellFormed, transactionRootStartState]

/-- Actual committed Start admission fixes every state field, with no runtime-validity premise. -/
theorem transaction_committed_start_normal_form (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (commandId processId instanceId : SemanticId)
    (submitted : List VariableBinding)
    (committed : (admitStimulusWithCompensationSnapshots p initialState
      (.startProcess commandId processId instanceId submitted)).outcome = .committed) :
    ∃ variables, (admitStimulusWithCompensationSnapshots p initialState
      (.startProcess commandId processId instanceId submitted)).state =
        transactionRootStartState roles instanceId variables := by
  let stimulus : Stimulus := .startProcess commandId processId instanceId submitted
  have legacy := admitStimulusWithCompensationSnapshots_withoutDeclaration
    p initialState stimulus roles.snapshotsAbsent
  have accepted : (admitStimulus p initialState stimulus).outcome = .committed := by
    change (admitStimulusWithCompensationSnapshots p initialState stimulus).outcome =
      .committed at committed
    rw [legacy] at committed
    exact committed
  obtain ⟨_, variables, built⟩ := admitStimulus_committed_start_shape p stimulus instanceId
    (by rfl) accepted
  rw [transaction_start_builder_normal_form p roles wellFormed instanceId variables] at built
  refine ⟨variables, ?_⟩
  change (admitStimulusWithCompensationSnapshots p initialState stimulus).state = _
  rw [legacy]
  exact (Option.some.inj built).symm

def transactionInitiatedState {p : Program} (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) (variables : List VariableBinding) : RuntimeState :=
  { transactionRootStartState roles instanceId variables with
    initiationPending := false
    tokens := [{ placeId := roles.first, owner :=
      { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 } }] }

/-- The real dispatcher consumes pending initiation and produces the sole root entry token. -/
theorem transaction_start_operation_reaches_entry (p : Program) (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) (variables : List VariableBinding) :
    attemptInternalOperation p roles.start (transactionRootStartState roles instanceId variables) =
      .applied
        { operation := roles.start
          successor := transactionInitiatedState roles instanceId variables } := by
  obtain ⟨id, origin, startShape⟩ := roles.startShape
  simp only [startShape, attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
  change (match initiateState? (transactionRootStartState roles instanceId variables) roles.first with
    | none => InternalOperationAttempt.disabled (.initiate id origin roles.first)
    | some successor => InternalOperationAttempt.applied
        { operation := .initiate id origin roles.first, successor }) = _
  simp [initiateState?, rootScopeOccurrence?, transactionRootStartState, transactionInitiatedState,
    runningStartState, initialState, addToken, canonicalInsertBy]

def transactionChildOwner {p : Program} (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := roles.child.id, activation := 1 }

def transactionEnteredState {p : Program} (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) (variables : List VariableBinding) : RuntimeState :=
  let parent : ScopeOccurrenceId :=
    { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 }
  let child := transactionChildOwner roles instanceId
  { transactionInitiatedState roles instanceId variables with
    tokens := [{ placeId := roles.childEntry, owner := child }]
    scopeOccurrences := insertScopeOccurrence { id := child, parent := some parent }
      [{ id := parent, parent := none }]
    scopeActivations := setScopeActivationCount [{ scopeId := roles.root.id, count := 1 }]
      roles.child.id 1
    compensationActivityRetentions := [{ owner := child, nextCompletionOrdinal := 1, records := [] }] }

theorem transaction_primitive_entry_normal_form (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (variables : List VariableBinding) :
    enterScopeState? (transactionInitiatedState roles instanceId variables)
      roles.first roles.childEntry roles.child.id =
      some { transactionEnteredState roles instanceId variables with compensationActivityRetentions := [] } := by
  have different := Ne.symm (roles.child_scope_ne_root wellFormed)
  simp [enterScopeState?, transactionInitiatedState, transactionRootStartState,
    transactionEnteredState, transactionChildOwner, runningStartState, initialState,
    onlyTokenOwner?, tokenOwners, scopeActivationCount, different, removeToken, addToken,
    canonicalInsertBy]

theorem transaction_entered_child_is_unique (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (variables : List VariableBinding) :
    (transactionEnteredState roles instanceId variables).scopeOccurrences.filter
      (fun occurrence => occurrence.id.definitionScopeId == roles.child.id) =
      [{ id := transactionChildOwner roles instanceId
         parent := some
           { processInstanceId := instanceId
             definitionScopeId := roles.root.id
             activation := 1 } }] := by
  apply List.Perm.eq_singleton
  have inserted := filter_canonicalInsertBy_perm scopeOccurrenceBefore
    (fun occurrence => occurrence.id.definitionScopeId == roles.child.id)
    { id := transactionChildOwner roles instanceId
      parent := some
        { processInstanceId := instanceId
          definitionScopeId := roles.root.id
          activation := 1 } }
    [{ id :=
         { processInstanceId := instanceId
           definitionScopeId := roles.root.id
           activation := 1 }
       parent := none }] (by simp [transactionChildOwner])
  simpa [transactionEnteredState, insertScopeOccurrence,
    Ne.symm (roles.child_scope_ne_root wellFormed)] using inserted

/-- Entry succeeds from the derived root token and initializes the newly created child's register. -/
theorem transaction_entry_operation_reaches_child (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (instanceId : SemanticId)
    (variables : List VariableBinding) :
    attemptInternalOperation p roles.entry (transactionInitiatedState roles instanceId variables) =
      .applied
        { operation := roles.entry
          successor := transactionEnteredState roles instanceId variables } := by
  obtain ⟨id, origin, input, shape⟩ := roles.entryShape
  have inputSelected := (soleConsumer_facts p roles.first roles.entry roles.entrySelected).2
  rw [shape] at inputSelected
  have inputEqual : input = roles.first := Option.some.inj inputSelected
  subst input
  have entered := transaction_primitive_entry_normal_form p roles wellFormed instanceId variables
  have unique := transaction_entered_child_is_unique p roles wellFormed instanceId variables
  have applied : enterScopeWithCompensationRetention? p
      (transactionInitiatedState roles instanceId variables) roles.first roles.childEntry roles.child.id =
      some (transactionEnteredState roles instanceId variables) := by
    unfold enterScopeWithCompensationRetention?
    rw [entered]
    dsimp only [Bind.bind, Option.bind]
    simp only [roles.retentionPresent, Option.map_some, roles.retentionScope, ↓reduceIte]
    change (match (transactionEnteredState roles instanceId variables).scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == roles.child.id) with
      | [occurrence] => some (initializeTransactionRetention p
          { transactionEnteredState roles instanceId variables with compensationActivityRetentions := [] }
          occurrence.id)
      | _ => none) = some (transactionEnteredState roles instanceId variables)
    rw [unique]
    simp [initializeTransactionRetention, roles.retentionPresent, roles.retentionScope,
      transactionChildOwner, transactionEnteredState]
  simp only [shape, attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
  change (match enterScopeWithCompensationRetention? p
      (transactionInitiatedState roles instanceId variables) roles.first roles.childEntry roles.child.id with
    | none => InternalOperationAttempt.disabled
        (.enterScope id origin roles.first roles.childEntry roles.child.id)
    | some successor => InternalOperationAttempt.applied
        { operation := .enterScope id origin roles.first roles.childEntry roles.child.id
          successor }) = _
  rw [applied]

def transactionSplitState {p : Program} (roles : TransactionAdmittedRoles p)
    (instanceId : SemanticId) (variables : List VariableBinding) : RuntimeState :=
  { transactionEnteredState roles instanceId variables with
    tokens := addTokens [] [roles.left, roles.right] (transactionChildOwner roles instanceId) }

/-- Split preserves the complete entered state except for its two canonically ordered child tokens. -/
theorem transaction_split_operation_reaches_two_children (p : Program)
    (roles : TransactionAdmittedRoles p) (instanceId : SemanticId) (variables : List VariableBinding) :
    attemptInternalOperation p roles.split (transactionEnteredState roles instanceId variables) =
      .applied
        { operation := roles.split
          successor := transactionSplitState roles instanceId variables } := by
  obtain ⟨id, origin, input, shape⟩ := roles.splitShape
  have inputSelected := (soleConsumer_facts p roles.childEntry roles.split roles.splitSelected).2
  rw [shape] at inputSelected
  have inputEqual : input = roles.childEntry := Option.some.inj inputSelected
  subst input
  simp only [shape, attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
  change (match duplicateState? (transactionEnteredState roles instanceId variables)
      roles.childEntry [roles.left, roles.right] with
    | none => InternalOperationAttempt.disabled (.duplicate id origin roles.childEntry [roles.left, roles.right])
    | some successor => InternalOperationAttempt.applied
        { operation := .duplicate id origin roles.childEntry [roles.left, roles.right]
          successor }) = _
  simp [duplicateState?, onlyTokenOwner?, tokenOwners, duplicateToken, removeToken,
    transactionEnteredState, transactionSplitState]

theorem transaction_split_exact_child_register_and_empty_waits (p : Program)
    (roles : TransactionAdmittedRoles p) (instanceId : SemanticId) (variables : List VariableBinding) :
    (transactionSplitState roles instanceId variables).compensationActivityRetentions =
      [{ owner := transactionChildOwner roles instanceId, nextCompletionOrdinal := 1, records := [] }] ∧
    (transactionSplitState roles instanceId variables).waits = [] ∧
    (transactionSplitState roles instanceId variables).compensationParentContextRetentions = [] := by
  exact ⟨rfl, rfl, rfl⟩

/-- Keeping the two operation inputs cannot recover the exact reached state after its register is erased. -/
theorem transaction_erased_register_is_not_split_normal_form (p : Program)
    (roles : TransactionAdmittedRoles p) (instanceId : SemanticId) (variables : List VariableBinding) :
    { transactionSplitState roles instanceId variables with compensationActivityRetentions := [] } ≠
      transactionSplitState roles instanceId variables := by
  intro same
  have registers := congrArg RuntimeState.compensationActivityRetentions same
  change [] = [_] at registers
  cases registers

theorem transaction_taskChain_first_task (program : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation)
    (places : List ControlPlaceId)
    (chain : TransactionTaskChain program child place operations places)
    (nontrivial : 2 ≤ operations.length) :
    ∃ id origin input output task rest,
      operations = .awaitUserTask id origin input output task :: rest := by
  cases chain
  all_goals first | exact ⟨_, _, _, _, _, _, rfl⟩ | simp at nontrivial

theorem transaction_taskChain_start_member (program : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation)
    (places : List ControlPlaceId)
    (chain : TransactionTaskChain program child place operations places) : place ∈ places := by
  cases chain <;> simp

theorem transaction_admitted_split_places_distinct (program : Program)
    (roles : TransactionAdmittedRoles program) : roles.left ≠ roles.right := by
  intro equal
  have left := transaction_taskChain_start_member program roles.child.id roles.left
    roles.leftOperations roles.leftPlaces roles.left_chain
  have right := transaction_taskChain_start_member program roles.child.id roles.right
    roles.rightOperations roles.rightPlaces roles.right_chain
  exact roles.branch_places_disjoint roles.left left (equal.symm ▸ right)

structure TransactionInitialTask where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  output : ControlPlaceId
  task : UserTaskDefinition

def TransactionInitialTask.operation (head : TransactionInitialTask) : SemanticOperation :=
  .awaitUserTask head.id head.origin head.input head.output head.task

def TransactionInitialTask.arm (head : TransactionInitialTask) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (state : RuntimeState) : RuntimeState :=
  activateUserTask state instanceId owner head.input head.output head.task

structure TransactionInitialTasks {p : Program} (roles : TransactionAdmittedRoles p) where
  left : TransactionInitialTask
  right : TransactionInitialTask
  leftInput : left.input = roles.left
  rightInput : right.input = roles.right
  leftHead : roles.leftOperations.head? = some left.operation
  rightHead : roles.rightOperations.head? = some right.operation

private theorem transaction_chain_initial_task (p : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p child place operations places) (nontrivial : 2 ≤ operations.length) :
    ∃ head : TransactionInitialTask, head.input = place ∧ operations.head? = some head.operation := by
  cases chain with
  | task place id origin input output task operations places _ _ consumer _ _ =>
      have same : input = place := Option.some.inj (soleConsumer_facts p place _ consumer).2
      exact ⟨⟨id, origin, input, output, task⟩, same, rfl⟩
  | noneEnd => simp at nontrivial
  | cancelEnd => simp at nontrivial

theorem transaction_admitted_initial_tasks (p : Program) (roles : TransactionAdmittedRoles p) :
    Nonempty (TransactionInitialTasks roles) := by
  obtain ⟨left, leftInput, leftHead⟩ := transaction_chain_initial_task p roles.child.id roles.left
    roles.leftOperations roles.leftPlaces roles.left_chain roles.left_length.1
  obtain ⟨right, rightInput, rightHead⟩ := transaction_chain_initial_task p roles.child.id roles.right
    roles.rightOperations roles.rightPlaces roles.right_chain roles.right_length.1
  exact ⟨⟨left, right, leftInput, rightInput, leftHead, rightHead⟩⟩

inductive TransactionInitialArmingStage where
  | split | one | both

/-- Both orders retain actual primitive states; equality between orders remains a batch-law conclusion. -/
def transactionInitialArmingState {p : Program} (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (reverse : Bool) (stage : TransactionInitialArmingStage) : RuntimeState :=
  let first := if reverse then heads.right else heads.left
  let second := if reverse then heads.left else heads.right
  let split := transactionSplitState roles instanceId variables
  let one := first.arm instanceId (transactionChildOwner roles instanceId) split
  match stage with
  | .split => split
  | .one => one
  | .both => second.arm instanceId (transactionChildOwner roles instanceId) one

def TransactionInitialArmingPhase {p : Program} (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (state : RuntimeState) : Prop :=
  ∃ reverse stage, state = transactionInitialArmingState roles heads instanceId variables reverse stage

private theorem transaction_initial_task_attempt (p : Program) (roles : TransactionAdmittedRoles p)
    (head : TransactionInitialTask) (instanceId : SemanticId) (state : RuntimeState)
    (selected : onlyTokenOwner? state head.input = some (transactionChildOwner roles instanceId))
    (running : state.control = .running instanceId) :
    attemptInternalOperation p head.operation state =
      .applied
        { operation := head.operation
          successor := head.arm instanceId (transactionChildOwner roles instanceId) state } := by
  simp only [TransactionInitialTask.operation, attemptInternalOperation,
    roles.executionPresent, roles.snapshotsAbsent]
  change (match awaitUserTaskState? state head.input head.output head.task with
    | none => InternalOperationAttempt.disabled _
    | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
  simp [awaitUserTaskState?, selected, runningInstance?, running,
    transactionChildOwner, TransactionInitialTask.arm]

/-- Each order includes its one-arm prefix, with the next task selected by its actual owned token. -/
theorem transaction_initial_arming_actual_steps (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (reverse second : Bool) :
    let firstHead := if reverse then heads.right else heads.left
    let secondHead := if reverse then heads.left else heads.right
    let head := if second then secondHead else firstHead
    attemptInternalOperation p head.operation
        (transactionInitialArmingState roles heads instanceId variables reverse
          (if second then .one else .split)) =
      .applied
        { operation := head.operation
          successor := transactionInitialArmingState roles heads instanceId variables reverse
            (if second then .both else .one) } := by
  have different := transaction_admitted_split_places_distinct p roles
  cases reverse <;> cases second <;> apply transaction_initial_task_attempt p roles
  all_goals try rfl
  all_goals
    by_cases ordered : controlTokenBefore
        { placeId := roles.left, owner := transactionChildOwner roles instanceId }
        { placeId := roles.right, owner := transactionChildOwner roles instanceId } = true
    all_goals simp [transactionInitialArmingState, TransactionInitialTask.arm, transactionSplitState,
      activateUserTask, onlyTokenOwner?, tokenOwners, addTokens, addToken, canonicalInsertBy,
      removeToken, heads.leftInput, heads.rightInput, different, Ne.symm different, ordered]

/-- Both drained orders have precisely two child waits and retain the same empty child register. -/
theorem transaction_initial_arming_both_waits (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (reverse : Bool) :
    let state := transactionInitialArmingState roles heads instanceId variables reverse .both
    state.tokens = [] ∧ state.waits.length = 2 ∧
      state.waits.all (fun wait => wait.owner == transactionChildOwner roles instanceId) = true ∧
      state.compensationActivityRetentions =
        [{ owner := transactionChildOwner roles instanceId, nextCompletionOrdinal := 1, records := [] }] := by
  have owned : (transactionInitialArmingState roles heads instanceId variables reverse .both).waits.all
      (fun wait => wait.owner == transactionChildOwner roles instanceId) = true := by
    cases reverse <;> dsimp only [transactionInitialArmingState, TransactionInitialTask.arm, activateUserTask]
    all_goals simp only [all_insertUserTaskWait, BEq.rfl, Bool.true_and]
    all_goals rfl
  have different := transaction_admitted_split_places_distinct p roles
  refine ⟨?_, ?_, owned, rfl⟩
  all_goals cases reverse
  all_goals
    by_cases ordered : controlTokenBefore
        { placeId := roles.left, owner := transactionChildOwner roles instanceId }
        { placeId := roles.right, owner := transactionChildOwner roles instanceId } = true
    all_goals simp [transactionInitialArmingState, TransactionInitialTask.arm, transactionSplitState,
      activateUserTask, addTokens, addToken, canonicalInsertBy, removeToken,
      heads.leftInput, heads.rightInput, different, Ne.symm different, ordered,
      transactionEnteredState, transactionInitiatedState, transactionRootStartState,
      runningStartState, initialState, insertUserTaskWait, apply_ite]

private theorem transaction_chain_head_selected (p : Program) (child : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p child place operations places) (head : SemanticOperation)
    (selected : operations.head? = some head) : soleConsumer? p place = some head := by
  cases chain <;> simp only [List.head?_cons, Option.some.injEq] at selected
  all_goals subst head; assumption

theorem transaction_initial_heads_consumers (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) :
    soleConsumer? p roles.left = some heads.left.operation ∧
      soleConsumer? p roles.right = some heads.right.operation :=
  ⟨transaction_chain_head_selected p _ _ _ _ roles.left_chain _ heads.leftHead,
    transaction_chain_head_selected p _ _ _ _ roles.right_chain _ heads.rightHead⟩

/-- All live scopes have a concrete blocker throughout the two initial Task arms. -/
theorem transaction_initial_arming_scope_barriers (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (reverse : Bool) (stage : TransactionInitialArmingStage) :
    let state := transactionInitialArmingState roles heads instanceId variables reverse stage
    ∀ occurrence ∈ state.scopeOccurrences, TransactionScopeBarrier state occurrence.id := by
  let state := transactionInitialArmingState roles heads instanceId variables reverse stage
  let parent : ScopeOccurrenceId :=
    { processInstanceId := instanceId, definitionScopeId := roles.root.id, activation := 1 }
  let child : RuntimeScopeOccurrence :=
    { id := transactionChildOwner roles instanceId, parent := some parent }
  have scopes : state.scopeOccurrences = insertScopeOccurrence child [{ id := parent, parent := none }] := by
    cases stage <;> rfl
  have childBarrier : TransactionScopeBarrier state child.id := by
    cases stage with
    | split =>
        apply TransactionScopeBarrier.token { placeId := roles.left, owner := child.id }
        · exact (addTokens_perm [] [roles.left, roles.right] child.id).mem_iff.mpr (by simp)
        · rfl
    | one => apply transaction_task_arming_keeps_scope_blocked
    | both => apply transaction_task_arming_keeps_scope_blocked
  change ∀ occurrence ∈ state.scopeOccurrences, TransactionScopeBarrier state occurrence.id
  intro occurrence member
  change occurrence ∈ state.scopeOccurrences at member
  rw [scopes, mem_insertScopeOccurrence] at member
  rcases member with same | same
  · subst occurrence; exact childBarrier
  · have same : occurrence = { id := parent, parent := none } := by simpa using same
    subst occurrence
    apply TransactionScopeBarrier.child child
    · rw [scopes, mem_insertScopeOccurrence]; exact Or.inl rfl
    · rfl

theorem transaction_initial_arming_completions_disabled (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding)
    (reverse : Bool) (stage : TransactionInitialArmingStage) (id : OperationId)
    (origin : BpmnElementOrigin) (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    attemptInternalOperation p (.completeScope id origin scope output)
      (transactionInitialArmingState roles heads instanceId variables reverse stage) =
      .disabled (.completeScope id origin scope output) := by
  let state := transactionInitialArmingState roles heads instanceId variables reverse stage
  have barriers := transaction_initial_arming_scope_barriers p roles heads instanceId variables reverse stage
  have refused : completeScopeState? state scope output = none := by
    unfold completeScopeState?
    split
    · rename_i occurrence selected
      have member : occurrence ∈ state.scopeOccurrences :=
        (List.mem_filter.mp (show occurrence ∈ state.scopeOccurrences.filter
          (fun candidate => decide (candidate.id.definitionScopeId = scope)) by rw [selected]; simp)).1
      simp [transaction_scope_barrier_not_quiescent state occurrence.id (barriers occurrence member)]
    · rfl
  have selected : completeSelectedScope? p state scope output = none := by
    unfold completeSelectedScope?
    split
    · simp only [completeMonitoredScope?]
      cases monitoredScopePairForChild? p state scope with
      | none => rfl
      | some pair => dsimp only [Bind.bind, Option.bind]; split <;> simp [refused]
    · simp [completeBoundedScope?, refused]
  simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent]
  change (match completeSelectedScope? p state scope output with
    | none => InternalOperationAttempt.disabled _
    | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
  rw [selected]

theorem transaction_frontier_attempt_iff (p : Program) (state : RuntimeState)
    (operation : SemanticOperation) (after : RuntimeState) :
    (operation, after) ∈ (snapshotInternalTransitionFrontier p state).transitions ↔
      operation ∈ p.operations ∧ attemptInternalOperation p operation state =
        .applied { operation, successor := after } := by
  simp only [snapshotInternalTransitionFrontier, canonicalEnabledInternalTransitions,
    InternalCommutation.snapshot_sort_eq, InternalCommutation.mem_sortBy]
  constructor
  · intro offered
    obtain ⟨attempt, member, selected⟩ := List.mem_filterMap.mp offered
    obtain ⟨source, member, attempted⟩ := List.mem_map.mp ((InternalCommutation.mem_sortBy _ _ _).mp member)
    cases attempt with
    | disabled _ | refused _ _ => contradiction
    | applied step =>
        have identity := InternalCommutation.attemptInternalOperation_operation_identity p source state
        rw [attempted] at identity
        cases step with
        | mk selectedOperation successor =>
            have pair := Option.some.inj selected
            have operationEq : selectedOperation = operation := congrArg Prod.fst pair
            have successorEq : successor = after := congrArg Prod.snd pair
            subst selectedOperation
            subst successor
            change operation = source at identity
            subst source
            exact ⟨member, attempted⟩
  · rintro ⟨member, attempted⟩
    apply List.mem_filterMap.mpr
    refine ⟨.applied { operation, successor := after }, ?_, rfl⟩
    exact (InternalCommutation.mem_sortBy _ _ _).mpr (List.mem_map.mpr ⟨operation, member, attempted⟩)

/-- An offered initial transition is one of the two reader-selected branch heads. -/
theorem transaction_initial_frontier_only_heads (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (instanceId : SemanticId) (variables : List VariableBinding) (operation : SemanticOperation)
    (after : RuntimeState) (offered : (operation, after) ∈
      (snapshotInternalTransitionFrontier p (transactionSplitState roles instanceId variables)).transitions) :
    operation = heads.left.operation ∨ operation = heads.right.operation := by
  obtain ⟨member, applied⟩ := (transaction_frontier_attempt_iff p _ _ _).mp offered
  have blocked := transaction_initial_arming_completions_disabled p roles heads instanceId variables false .split
  obtain ⟨input, consumes⟩ := transaction_applied_consumes_input p roles _ graph rfl
    (fun id origin scope output _ => blocked id origin scope output) operation member _ applied
  have inputs : input = roles.left ∨ input = roles.right := by
    by_cases outside : input = roles.left ∨ input = roles.right
    · exact outside
    · exfalso
      simp only [not_or] at outside
      have missing : onlyTokenOwner? (transactionSplitState roles instanceId variables) input = none := by
        by_cases ordered : controlTokenBefore
            { placeId := roles.left, owner := transactionChildOwner roles instanceId }
            { placeId := roles.right, owner := transactionChildOwner roles instanceId } = true
        all_goals simp [onlyTokenOwner?, tokenOwners, transactionSplitState, addTokens, addToken,
          canonicalInsertBy, ordered, Ne.symm outside.1, Ne.symm outside.2]
      rw [transaction_consuming_attempt_without_token p _ operation input roles.execution
        roles.executionPresent roles.snapshotsAbsent consumes missing] at applied
      contradiction
  have choose (place : ControlPlaceId) (head : SemanticOperation)
      (consumer : soleConsumer? p place = some head) (same : input = place) : operation = head := by
    have selected : operation ∈ p.operations.filter (fun candidate => operationInput? candidate == some place) :=
      List.mem_filter.mpr ⟨member, by simp [consumes, same]⟩
    rw [soleConsumer_exact p place head consumer] at selected
    simpa using selected
  have consumers := transaction_initial_heads_consumers p roles heads
  exact inputs.elim (fun same => Or.inl (choose _ _ consumers.1 same))
    (fun same => Or.inr (choose _ _ consumers.2 same))

theorem transaction_one_arm_frontier_cardinality (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (instanceId : SemanticId) (variables : List VariableBinding) (reverse : Bool) :
    (snapshotInternalTransitionFrontier p
      (transactionInitialArmingState roles heads instanceId variables reverse .one)).transitions.length ≤ 1 := by
  have consumers := transaction_initial_heads_consumers p roles heads
  have blocked := transaction_initial_arming_completions_disabled p roles heads instanceId variables reverse .one
  have tokens : (transactionInitialArmingState roles heads instanceId variables reverse .one).tokens =
      [{ placeId := if reverse then roles.left else roles.right, owner := transactionChildOwner roles instanceId }] := by
    have different := transaction_admitted_split_places_distinct p roles
    cases reverse
    all_goals
      by_cases ordered : controlTokenBefore
          { placeId := roles.left, owner := transactionChildOwner roles instanceId }
          { placeId := roles.right, owner := transactionChildOwner roles instanceId } = true
      all_goals simp [transactionInitialArmingState, TransactionInitialTask.arm, transactionSplitState,
        activateUserTask, addTokens, addToken, canonicalInsertBy, removeToken, ordered,
        heads.leftInput, heads.rightInput, different, Ne.symm different]
  apply transaction_single_token_frontier_cardinality p roles _ graph _ tokens rfl
    (fun id origin scope output _ => blocked id origin scope output)
    (if reverse then heads.left.operation else heads.right.operation)
  cases reverse
  · exact consumers.2
  · exact consumers.1

theorem transaction_initial_frontier_contains_heads (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (instanceId : SemanticId) (variables : List VariableBinding) :
    (heads.left.operation, transactionInitialArmingState roles heads instanceId variables false .one) ∈
      (snapshotInternalTransitionFrontier p (transactionSplitState roles instanceId variables)).transitions ∧
    (heads.right.operation, transactionInitialArmingState roles heads instanceId variables true .one) ∈
      (snapshotInternalTransitionFrontier p (transactionSplitState roles instanceId variables)).transitions := by
  have consumers := transaction_initial_heads_consumers p roles heads
  constructor
  · apply (transaction_frontier_attempt_iff p _ _ _).mpr
    exact ⟨(soleConsumer_facts p _ _ consumers.1).1,
      transaction_initial_arming_actual_steps p roles heads instanceId variables false false⟩
  · apply (transaction_frontier_attempt_iff p _ _ _).mpr
    exact ⟨(soleConsumer_facts p _ _ consumers.2).1,
      transaction_initial_arming_actual_steps p roles heads instanceId variables true false⟩

theorem transaction_both_arms_frontier_empty (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (instanceId : SemanticId) (variables : List VariableBinding) (reverse : Bool) :
    (snapshotInternalTransitionFrontier p
      (transactionInitialArmingState roles heads instanceId variables reverse .both)).transitions.length = 0 := by
  have tokens := (transaction_initial_arming_both_waits p roles heads instanceId variables reverse).1
  exact transaction_token_free_frontier_cardinality p roles _ graph tokens rfl
    (fun id origin scope output _ =>
      transaction_initial_arming_completions_disabled p roles heads instanceId variables reverse .both
        id origin scope output)

/-- The admitted identity boundary constrains only Start's instance ID, not the complete wire contract. -/
def TransactionStartIdentityAdmitted : Stimulus → Prop
  | .startProcess _ _ instanceId _ => nonempty instanceId.value = true
  | _ => True

/-- The command evaluator, including rejection and rollback, defines boundary reachability. -/
inductive TransactionCommandBoundaryReachable (program : Program) : RuntimeState → Prop where
  | initial : TransactionCommandBoundaryReachable program initialState
  | command (before : RuntimeState) (closureLimit : Nat) (stimulus : Stimulus)
      (reachable : TransactionCommandBoundaryReachable program before)
      (startIdentity : TransactionStartIdentityAdmitted stimulus) :
      TransactionCommandBoundaryReachable program
        (applyStimulusWithCompensationSnapshots closureLimit program before stimulus).state

/-- Prefixes begin at actual admission and retain each attempt-aware internal successor. -/
inductive TransactionInternalPrefixReachable (program : Program) : RuntimeState → Prop where
  | admitted (before : RuntimeState) (stimulus : Stimulus)
      (reachable : TransactionCommandBoundaryReachable program before)
      (startIdentity : TransactionStartIdentityAdmitted stimulus)
      (committed : (admitStimulusWithCompensationSnapshots program before stimulus).outcome =
        .committed) :
      TransactionInternalPrefixReachable program
        (admitStimulusWithCompensationSnapshots program before stimulus).state
  | step (before after : RuntimeState) (operation : SemanticOperation)
      (reachable : TransactionInternalPrefixReachable program before)
      (noRefusal : (snapshotInternalTransitionFrontier program before).refusal = none)
      (offered : (operation, after) ∈
        (snapshotInternalTransitionFrontier program before).transitions) :
      TransactionInternalPrefixReachable program after

theorem transaction_failed_closure_preserves_boundary (program : Program)
    (before : RuntimeState) (closureLimit : Nat) (stimulus : Stimulus)
    (failed :
      ((applyStimulusWithCompensationSnapshots closureLimit program before stimulus).internalStepBoundExceeded ||
        (applyStimulusWithCompensationSnapshots closureLimit program before stimulus).ambiguousInternalChoice) = true) :
    (applyStimulusWithCompensationSnapshots closureLimit program before stimulus).state = before :=
  (applyStimulusWithCompensationSnapshots_closure_failure_rolls_back
    closureLimit program before stimulus failed).2

end BpmnSemantics.SemanticProcess
