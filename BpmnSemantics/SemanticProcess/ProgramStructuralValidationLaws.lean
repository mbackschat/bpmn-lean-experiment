module

public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.TimerStart

/-! # Semantic Process program structural validation laws

The admission facts that proofs consume, apart from the definitions in [`ProgramStructuralValidation`](ProgramStructuralValidation.lean): a proof edit here rebuilds no module that imports those definitions with `import all` to reduce their bodies ([hidden-edit fanout](../../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract)).
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem strictlySortedStrings_head_lt (head : String) (tail : List String)
    (sorted : strictlySortedStrings (head :: tail) = true) :
    ∀ value ∈ tail, head < value := by
  induction tail generalizing head with
  | nil => simp
  | cons next rest ih =>
      simp only [strictlySortedStrings, Bool.and_eq_true, decide_eq_true_eq] at sorted
      intro value member
      rcases List.mem_cons.mp member with rfl | member
      · exact sorted.1
      · exact String.lt_trans sorted.1 (ih next sorted.2 value member)

/-- Strictly sorted semantic identifiers are duplicate-free. -/
theorem strictlySortedStrings_nodup (values : List String)
    (sorted : strictlySortedStrings values = true) : values.Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      apply List.nodup_cons.mpr
      refine ⟨?_, ?_⟩
      · intro member
        have impossible := strictlySortedStrings_head_lt head tail sorted head member
        exact String.lt_asymm impossible impossible
      · cases tail with
        | nil => simp
        | cons next rest =>
            simp only [strictlySortedStrings, Bool.and_eq_true,
              decide_eq_true_eq] at sorted
            exact ih sorted.2

/-- Structural admission keeps control-place identifiers in canonical duplicate-free order. -/
theorem programWellFormed_controlPlaceIdsSorted (program : Program)
    (valid : programWellFormed program = true) :
    strictlySortedStrings (program.controlPlaces.map fun place => place.id.value) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission keeps operation identifiers in canonical duplicate-free order. -/
theorem programWellFormed_operationIdsSorted (program : Program)
    (valid : programWellFormed program = true) :
    strictlySortedStrings (program.operations.map fun operation => operation.id.value) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission validates every operation against the complete Program context. -/
theorem programWellFormed_operations (program : Program)
    (valid : programWellFormed program = true) :
    program.operations.all (operationWellFormed program program.controlPlaces) = true := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  grind

/-- Structural admission resolves every declared wait key to its one declaring operation. -/
theorem programWellFormed_waitDeclarer (program : Program) (operation : SemanticOperation)
    (key : WaitDeclarationKey) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations)
    (declares : operationDeclaresWaitKey operation key = true) :
    program.operations.filter (fun candidate => operationDeclaresWaitKey candidate key) =
      [operation] := by
  simp only [programWellFormed, Bool.and_eq_true] at valid
  have unique := List.all_eq_true.mp (by grind : programWaitDeclarersUnique program.operations = true)
    operation member
  simp only [List.all_eq_true] at unique
  have keyMember : key ∈ operationWaitDeclarationKeys operation := by
    simpa [operationDeclaresWaitKey] using declares
  have lengthOne := unique key keyMember
  simp only [decide_eq_true_eq] at lengthOne
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp lengthOne
  have operationFiltered : operation ∈
      program.operations.filter (fun candidate => operationDeclaresWaitKey candidate key) :=
    List.mem_filter.mpr ⟨member, declares⟩
  rw [singleton] at operationFiltered
  have operationEq : operation = sole := by simpa using operationFiltered
  simpa [operationEq] using singleton

/-- Two distinct operations cannot declare the same family-tagged runtime wait in an admitted
Program. This is the class-level rejection theorem for ordinary, bounded, Sequential MI, Parallel
MI, Event Race, and Effect declarer collisions. -/
theorem programWellFormed_rejects_waitDeclarerCollision (program : Program)
    (left right : SemanticOperation) (key : WaitDeclarationKey)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (different : left ≠ right) (leftDeclares : operationDeclaresWaitKey left key = true)
    (rightDeclares : operationDeclaresWaitKey right key = true) :
    programWellFormed program = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  have leftOnly := programWellFormed_waitDeclarer program left key valid leftMember leftDeclares
  have rightOnly := programWellFormed_waitDeclarer program right key valid rightMember rightDeclares
  rw [leftOnly] at rightOnly
  exact different (by simpa using rightOnly)

/-- An admitted selection key resolves to exactly one declaring split, independently of its
expected-input payload, as required by `hiddenRecordDeclarationsValid`. -/
theorem programWellFormed_selectMany_declarer_unique (program : Program)
    (valid : programWellFormed program = true)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (candidates : List InclusiveCandidate) (defaultBranch : InclusiveDefaultBranch)
    (selectionKey : String)
    (member : .selectMany id origin input candidates defaultBranch selectionKey ∈
      program.operations) :
    (program.operations.filter fun
      | .selectMany _ _ _ _ _ key => decide (key = selectionKey)
      | _ => false).length = 1 := by
  have paired : inclusiveOperationsPaired program.operations = true := by
    simp only [programWellFormed, Bool.and_eq_true] at valid
    grind
  let selections := program.operations.filterMap fun
    | .selectMany _ _ _ candidates defaultBranch key =>
        some (key, canonicalControlPlaceOrder
          (candidates.map (·.expectedJoinInput) ++ [defaultBranch.expectedJoinInput]))
    | _ => none
  let joins := program.operations.filterMap fun
    | .synchronizeSelected _ _ inputs _ key => some (key, inputs)
    | _ => none
  let selection := (selectionKey, canonicalControlPlaceOrder
    (candidates.map (·.expectedJoinInput) ++ [defaultBranch.expectedJoinInput]))
  have selected : selection ∈ selections :=
    List.mem_filterMap.mpr ⟨_, member, rfl⟩
  have nonempty : selections.isEmpty = false := by
    exact List.isEmpty_eq_false_iff.mpr (List.ne_nil_of_mem selected)
  change (if selections.isEmpty && joins.isEmpty then true else
    selections.length = joins.length &&
      (selections.all fun selection =>
        (joins.filter fun join => decide (join.1 = selection.1)) = [selection]) &&
      joins.all (fun join =>
        (selections.filter fun selection => decide (selection.1 = join.1)).length = 1)) =
    true at paired
  simp only [nonempty, Bool.false_and, Bool.false_eq_true, ↓reduceIte,
    Bool.and_eq_true, decide_eq_true_eq] at paired
  have matching := List.all_eq_true.mp paired.1.2 selection selected
  simp only [decide_eq_true_eq] at matching
  have joined : selection ∈ joins := by
    have filtered : selection ∈ joins.filter (fun join => decide (join.1 = selection.1)) := by
      rw [matching]
      exact List.mem_cons_self
    exact (List.mem_filter.mp filtered).1
  have unique := List.all_eq_true.mp paired.2 selection joined
  simp only [decide_eq_true_eq] at unique
  calc
    _ = (selections.filter fun candidate => decide (candidate.1 = selectionKey)).length := by
      simp only [selections, ← List.countP_eq_length_filter, List.countP_filterMap]
      congr 1
      funext operation
      cases operation <;> rfl
    _ = 1 := unique

/-- Distinct split declarations sharing a selection key are rejected even when their expected
join inputs differ; `IGW-TRACK-01` uses the split key as the retained-record identity. -/
theorem programWellFormed_rejects_selectMany_declarer_collision (program : Program)
    (leftId rightId : OperationId) (leftOrigin rightOrigin : BpmnElementOrigin)
    (leftInput rightInput : ControlPlaceId) (leftCandidates rightCandidates : List InclusiveCandidate)
    (leftDefault rightDefault : InclusiveDefaultBranch) (selectionKey : String)
    (leftMember : .selectMany leftId leftOrigin leftInput leftCandidates leftDefault selectionKey ∈
      program.operations)
    (rightMember : .selectMany rightId rightOrigin rightInput rightCandidates rightDefault selectionKey ∈
      program.operations)
    (different : SemanticOperation.selectMany leftId leftOrigin leftInput leftCandidates
      leftDefault selectionKey ≠
      .selectMany rightId rightOrigin rightInput rightCandidates rightDefault selectionKey) :
    programWellFormed program = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  have unique := programWellFormed_selectMany_declarer_unique program valid
    leftId leftOrigin leftInput leftCandidates leftDefault selectionKey leftMember
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp unique
  have leftFiltered : SemanticOperation.selectMany leftId leftOrigin leftInput leftCandidates
      leftDefault selectionKey ∈ program.operations.filter (fun
        | .selectMany _ _ _ _ _ key => decide (key = selectionKey)
        | _ => false) := List.mem_filter.mpr ⟨leftMember, by simp⟩
  have rightFiltered : SemanticOperation.selectMany rightId rightOrigin rightInput rightCandidates
      rightDefault selectionKey ∈ program.operations.filter (fun
        | .selectMany _ _ _ _ _ key => decide (key = selectionKey)
        | _ => false) := List.mem_filter.mpr ⟨rightMember, by simp⟩
  -- `erw` bridges the statement's and this proof's matchers (docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#module-matcher-defect).
  erw [singleton] at leftFiltered rightFiltered
  simp only [List.mem_singleton] at leftFiltered rightFiltered
  exact different (leftFiltered.trans rightFiltered.symm)

private theorem operationWellFormed_of_programWellFormed (program : Program)
    (operation : SemanticOperation) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations) :
    operationWellFormed program program.controlPlaces operation = true := by
  exact List.all_eq_true.mp (programWellFormed_operations program valid) operation member

/-- Every admitted Effect operation uses one BPMN element identity for its origin and definition. -/
theorem programWellFormed_awaitEffect_elements_align (program : Program)
    (valid : programWellFormed program = true)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (member : .awaitEffect id origin input output effect route ∈ program.operations) :
    origin.elementId = effect.elementId := by
  have operationValid := operationWellFormed_of_programWellFormed program _ valid member
  simp only [operationWellFormed, Bool.and_eq_true, decide_eq_true_eq] at operationValid
  exact operationValid.1.1.1.1.2

/-- Every admitted ordinary internal wait operation names a nonempty waited element. -/
theorem programWellFormed_internalArm_element_nonempty (program : Program)
    (operation : SemanticOperation) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations) :
    (match operation with
    | .awaitUserTask _ _ _ _ task => !task.id.value.isEmpty
    | .awaitDataInputUserTask _ _ _ _ taskId _ _ => !taskId.value.isEmpty
    | .awaitDataInputOutputUserTask _ _ _ _ taskId _ _ _ => !taskId.value.isEmpty
    | .awaitDataOutputUserTask _ _ _ _ taskId _ _ => !taskId.value.isEmpty
    | .awaitMessage _ _ _ _ message => !message.elementId.value.isEmpty
    | .awaitPayloadMessage _ _ _ _ message _ => !message.elementId.value.isEmpty
    | .awaitCorrelatedPayloadMessage _ _ _ _ message _ _ _ _ =>
        !message.elementId.value.isEmpty
    | .awaitTimer _ _ _ _ timer => !timer.elementId.value.isEmpty
    | .awaitEffect _ _ _ _ effect _ => !effect.elementId.value.isEmpty
    | _ => true) = true := by
  revert member
  cases operation <;> intro member <;> try rfl
  case awaitPayloadMessage id origin input output message directOutput =>
    have operationValid := operationWellFormed_of_programWellFormed program _ valid member
    generalize channelEq : message.channel = channel at operationValid
    cases channel with
    | directMessage messageId => simp_all [operationWellFormed]
    | operationMessage interfaceId operationId messageId =>
        simp only [operationWellFormed, channelEq, nonempty, Bool.and_eq_true,
          decide_eq_true_eq] at operationValid
        have allNonempty := List.all_eq_true.mp operationValid.1.1.1.1.1.1.2
        have originNonempty := allNonempty origin.elementId.value (by simp)
        rw [operationValid.1.1.1.1.2] at originNonempty
        exact originNonempty
  case awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector =>
    have operationValid := operationWellFormed_of_programWellFormed program _ valid member
    generalize channelEq : message.channel = channel at operationValid
    cases channel with
    | directMessage messageId => simp_all [operationWellFormed]
    | operationMessage interfaceId operationId messageId =>
        simp only [operationWellFormed, channelEq, nonempty, Bool.and_eq_true,
          decide_eq_true_eq] at operationValid
        have allNonempty := List.all_eq_true.mp operationValid.1.1.1.1.1.1.1.2
        have originNonempty := allNonempty origin.elementId.value (by simp)
        rw [operationValid.1.1.1.1.1.2] at originNonempty
        exact originNonempty
  all_goals
    have operationValid := operationWellFormed_of_programWellFormed program _ valid member
    simp_all [operationWellFormed, nonempty]

end BpmnSemantics.SemanticProcess
