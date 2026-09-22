import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.CallReachability
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity

/-! Structural lifecycle preservation for the predecessor-selected scope creation account in
[Internal Commutation](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem filter_singleton_of_subpredicate (values : List α) (broad narrow : α → Bool)
    (value : α) (singleton : values.filter broad = [value])
    (included : ∀ candidate ∈ values, narrow candidate = true → broad candidate = true)
    (accepted : narrow value = true) : values.filter narrow = [value] := by
  have same : values.filter narrow = (values.filter broad).filter narrow := by
    rw [List.filter_filter]
    apply List.filter_congr
    intro candidate member
    by_cases yes : narrow candidate = true
    · simp [yes, included candidate member yes]
    · simp [Bool.eq_false_iff.mpr yes]
  rw [same, singleton]
  simp [accepted]

theorem definition_singleton (program : Program) (id : DefinitionScopeId)
    (definition : DefinitionScope) (found : definitionScope? program id = some definition) :
    program.definitionScopes.filter (fun scope => decide (scope.id = id)) = [definition] := by
  unfold definitionScope? at found
  split at found <;> simp_all

theorem child_entry_census (program : Program) (definition : DefinitionScope)
    (parent : DefinitionScopeId) (admitted : programWellFormed program = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (member : definition ∈ program.definitionScopes)
    (nested : definition.parentScopeId = some parent) :
    (program.operations.filter fun operation =>
      decide (enteredChildScopeId? operation = some definition.id)).length = 1 := by
  have graph := programWellFormed_graph program admitted
  unfold programGraphWellFormedForProgram at graph
  change (match (_ : List OperationId) with
    | [start] => match programEntryRootScopeId? program with
      | some root => _
      | none => false
    | _ => false) = true at graph
  split at graph
  · split at graph
    · rename_i root rootFound
      simp only [Bool.and_eq_true] at graph
      have lifecycle : compensationEventSubProcessSnapshotScopeLifecycleWellFormed program
          root = true := by grind
      simp only [compensationEventSubProcessSnapshotScopeLifecycleWellFormed, Bool.and_eq_true] at lifecycle
      have scopeValid := List.all_eq_true.mp lifecycle.2 definition member
      change (if (match program.compensationEventSubProcessSnapshots with
        | none => []
        | some declaration => declaration.targets.map
            CompensationEventSubProcessSnapshotTarget.handlerScopeId).contains definition.id
        then _ else _) = true at scopeValid
      simp only [snapshots, List.contains_nil, Bool.false_eq_true, ↓reduceIte] at scopeValid
      change ((_ : Bool) && match definition.parentScopeId with
        | none => _
        | some _ => (program.operations.filter fun operation =>
            decide (enteredChildScopeId? operation = some definition.id)).length = 1) = true at scopeValid
      simpa only [nested, Bool.and_eq_true, decide_eq_true_eq] using
        ((Bool.and_eq_true _ _).mp scopeValid).2
    · contradiction
  · contradiction

theorem prepareInternalScopeCreation_child_excludes_bounded_entry
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalScopeCreation)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (childScope : DefinitionScopeId) (timer : BoundaryTimerArm)
    (admitted : programWellFormed program = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (child : prepared.selection.kind = .child)
    (member : .enterBoundedScope id origin input entry childScope timer ∈ program.operations) :
    childScope ≠ prepared.selection.created.id.definitionScopeId := by
  obtain ⟨selected, hosting, ownerRecord, selectedOrigin, definition, start, delta,
    selection, running, snapshots, operations, _, _, definitionFound, checks, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  dsimp only [makeInternalScopeCreationPreparation] at child ⊢
  have matching := (internalScopeCreationPredecessorChecks_facts program state operation selected
    selectedOrigin definition checks).2.1
  have definitions := definition_singleton program selected.created.id.definitionScopeId
    definition definitionFound
  have definitionMember := (List.mem_filter.mp (show definition ∈ program.definitionScopes.filter
    (fun scope => decide (scope.id = selected.created.id.definitionScopeId)) by
      rw [definitions]; exact List.mem_cons_self)).1
  have operationMember : operation ∈ program.operations :=
    (List.mem_filter.mp (show operation ∈ program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) by
        rw [operations]; exact List.mem_cons_self)).1
  unfold selectInternalScopeCreation? at selection
  obtain ⟨hosting, _, selection⟩ := Option.bind_eq_some_iff.mp selection
  cases operation with
  | enterScope selectedId selectedOrigin selectedInput selectedEntry selectedScope =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      split at selection
      · contradiction
      · cases selection
        simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true, decide_eq_true_eq] at matching
        have census := child_entry_census program definition owner.definitionScopeId admitted snapshots
          definitionMember matching.1.2
        obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp census
        have ordinaryMember : .enterScope selectedId selectedOrigin selectedInput selectedEntry selectedScope ∈
            program.operations.filter (fun candidate =>
              decide (enteredChildScopeId? candidate = some definition.id)) :=
          List.mem_filter.mpr ⟨operationMember, by simp [enteredChildScopeId?, matching.1.1]⟩
        intro same
        have boundedMember : .enterBoundedScope id origin input entry childScope timer ∈
            program.operations.filter (fun candidate =>
              decide (enteredChildScopeId? candidate = some definition.id)) :=
          List.mem_filter.mpr ⟨member, by simp [enteredChildScopeId?, matching.1.1, same]⟩
        rw [singleton] at ordinaryMember boundedMember
        simp only [List.mem_singleton] at ordinaryMember boundedMember
        have impossible := ordinaryMember.trans boundedMember.symm
        contradiction
  | invokeProcess selectedId selectedOrigin selectedInput process scope entry returned =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals contradiction
  | _ => contradiction

def EntryBinding (program : Program) (occurrence : RuntimeScopeOccurrence)
    (definition : DefinitionScope) : Bool :=
  match occurrence.parent with
  | none => true
  | some parent => (program.operations.filter fun operation =>
      if !operationOwnedBy program operation parent then false
      else match operation with
      | .enterScope _ origin _ _ child | .enterBoundedScope _ origin _ _ child _ =>
          child = occurrence.id.definitionScopeId && origin.elementId = definition.originElementId
      | _ => false).length = 1

private theorem length_filterMap_as_filter (values : List α) (f : α → Option β) :
    (values.filterMap f).length = (values.filter fun value => (f value).isSome).length := by
  induction values with
  | nil => rfl
  | cons head tail ih => cases found : f head <;> simp [found, ih]

private theorem invoke_return_census (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (process : ProcessId) (root : DefinitionScopeId) (entry : ControlPlaceId)
    (returnedId : OperationId) (paired : callOperationsPaired program = true)
    (member : .invokeProcess id origin input process root entry returnedId ∈ program.operations) :
    (program.operations.filter fun operation => match operation with
      | .invokeProcess _ _ _ _ _ _ returned => decide (returned = returnedId)
      | _ => false).length = 1 := by
  unfold callOperationsPaired at paired
  dsimp only at paired
  split at paired
  · next empty =>
      simp only [Bool.and_eq_true, List.isEmpty_iff] at empty
      have absent := List.filterMap_eq_nil_iff.mp empty.1 _ member
      contradiction
  · split at paired
    · simp only [Bool.and_eq_true] at paired
      have selected := paired.1.2
      rw [List.all_filterMap] at selected
      have selected := List.all_eq_true.mp selected
        (.invokeProcess id origin input process root entry returnedId) member
      dsimp only at selected
      split at selected
      · next returned singleton =>
          have accepted := List.mem_cons_self (a := returned) (l := [])
          rw [← singleton] at accepted
          have identity := (List.mem_filter.mp accepted).2
          simp only [decide_eq_true_eq] at identity
          have reverse := List.all_eq_true.mp paired.2 returned (List.mem_filter.mp accepted).1
          rw [identity, List.filter_filterMap, length_filterMap_as_filter] at reverse
          refine Eq.trans ?_ (of_decide_eq_true reverse)
          congr 1
          apply List.filter_congr
          intro candidate _
          cases candidate <;> simp [Option.filter]
          split <;> simp_all
      · contradiction
    · contradiction

private def selectedOperationOwner? (program : Program) (operation : SemanticOperation) :
    Option DefinitionScopeId := do
  let selected ← match program.operations.filter fun candidate => decide (candidate.id = operation.id) with
    | [selected] => some selected
    | _ => none
  if selected ≠ operation then none
  else match program.operationScopes.filter fun binding => decide (binding.operationId = operation.id) with
    | [binding] => some binding.scopeId
    | _ => none

private theorem start_operation_owned (program : Program) (selected : InternalScopeCreationSelection)
    (start : UnnumberedFlowNodeOccurrenceStart)
    (found : internalScopeCreationStart? program selected = some start) :
    operationOwnedBy program selected.operation selected.owner = true := by
  have selectedProcess : ∃ process,
      (do
        let scope ← selectedOperationOwner? program selected.operation
        if scope ≠ selected.owner.definitionScopeId then none
        else candidateProcessIdForDefinitionScope? program scope) = some process := by
    cases kind : selected.kind <;>
      simp only [internalScopeCreationStart?, kind, candidateScopeStart?, candidateCallStart?] at found
    all_goals obtain ⟨process, processFound, _⟩ := Option.bind_eq_some_iff.mp found
    all_goals exact ⟨process, processFound⟩
  obtain ⟨process, processFound⟩ := selectedProcess
  obtain ⟨scope, scopeFound, processFound⟩ := Option.bind_eq_some_iff.mp processFound
  split at processFound
  · contradiction
  · next owned =>
      unfold selectedOperationOwner? at scopeFound
      unfold operationOwnedBy
      split
      all_goals repeat first | contradiction | split at scopeFound
      all_goals simp_all
      all_goals split at scopeFound <;> contradiction

def ScopeBinding (program : Program) (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match program.definitionScopes.filter fun scope => decide (scope.id = occurrence.id.definitionScopeId) with
  | [definition] =>
      !occurrence.id.processInstanceId.value.isEmpty && !occurrence.id.definitionScopeId.value.isEmpty &&
        occurrence.id.activation > 0 && flowNodeOccurrenceOwnerLiveUnique state occurrence.id &&
        EntryBinding program occurrence definition &&
        match definition.parentScopeId, occurrence.parent, state.control with
        | some expected, some parent, .running _ =>
            parent.processInstanceId = occurrence.id.processInstanceId &&
              parent.definitionScopeId = expected && flowNodeOccurrenceOwnerLiveUnique state parent
        | none, none, .running hosting =>
            if occurrence.id.processInstanceId = hosting then
              definition.originElementId.value = program.processId.value
            else (state.calledProcessOccurrences.filter fun record => decide
              (record.calledRoot = occurrence.id &&
                record.calledProcessId.value = definition.originElementId.value)).length = 1
        | _, _, _ => false
  | _ => false

def CallBinding (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) : Bool :=
  occurrenceOwnerValid state record.id.processInstanceId record.caller
      ⟨record.id.elementId.value⟩ record.id.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation record.caller then false
      else match operation with
      | .invokeProcess _ origin _ process root _ returned =>
          origin.elementId.value = record.id.elementId.value && process = record.calledProcessId &&
            root = record.calledRoot.definitionScopeId && returned = record.returnOperationId
      | _ => false).length = 1

private theorem structural_iff (program : Program) (state : RuntimeState) :
    flowNodeOccurrenceStructuralProgramValidity program state = true ↔
      (∀ occurrence ∈ state.scopeOccurrences, ScopeBinding program state occurrence = true) ∧
      ∀ record ∈ state.calledProcessOccurrences, CallBinding program state record = true := by
  change (state.scopeOccurrences.all (ScopeBinding program state) &&
    state.calledProcessOccurrences.all (CallBinding program state)) = true ↔ _
  simp only [Bool.and_eq_true, List.all_eq_true]

private theorem scope_binding_frame (program : Program) (before after : RuntimeState)
    (occurrence : RuntimeScopeOccurrence)
    (valid : ScopeBinding program before occurrence = true)
    (control : after.control = before.control)
    (owners : ∀ owner, flowNodeOccurrenceOwnerLiveUnique before owner = true →
      flowNodeOccurrenceOwnerLiveUnique after owner = true)
    (calls : ∀ origin, (after.calledProcessOccurrences.filter fun record => decide
      (record.calledRoot = occurrence.id && record.calledProcessId.value = origin)).length =
      (before.calledProcessOccurrences.filter fun record => decide
      (record.calledRoot = occurrence.id && record.calledProcessId.value = origin)).length) :
    ScopeBinding program after occurrence = true := by
  unfold ScopeBinding at valid ⊢
  split at valid
  · next definition definitions =>
      simp only [Bool.and_eq_true] at valid ⊢
      refine ⟨⟨⟨⟨⟨valid.1.1.1.1.1, valid.1.1.1.1.2⟩, valid.1.1.1.2⟩,
        owners _ valid.1.1.2⟩, valid.1.2⟩, ?_⟩
      rw [control]
      have binding := valid.2
      cases static : definition.parentScopeId <;> cases parent : occurrence.parent <;>
        cases running : before.control <;>
        simp only [static, parent, running, Bool.and_eq_true] at binding ⊢
      all_goals first
        | (solve | contradiction)
        | (solve | exact ⟨binding.1, owners _ binding.2⟩)
        | (split at binding <;> simp_all)
  · contradiction

private theorem call_binding_frame (program : Program) (before after : RuntimeState)
    (record : CalledProcessOccurrence) (valid : CallBinding program before record = true)
    (owners : ∀ owner, flowNodeOccurrenceOwnerLiveUnique before owner = true →
      flowNodeOccurrenceOwnerLiveUnique after owner = true) : CallBinding program after record = true := by
  simp only [CallBinding, occurrenceOwnerValid, Bool.and_eq_true] at valid ⊢
  exact ⟨⟨⟨⟨⟨valid.1.1.1.1.1, valid.1.1.1.1.2⟩, valid.1.1.1.2⟩,
    valid.1.1.2⟩, owners _ valid.1.2⟩, valid.2⟩

private theorem created_bindings (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    ScopeBinding program (prepared.selection.apply state) prepared.selection.created = true ∧
      ∀ record, prepared.selection.kind = .called record →
        CallBinding program (prepared.selection.apply state) record = true := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, snapshots, operations, owners, originFound, definitionFound, checks, startFound, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  dsimp only [makeInternalScopeCreationPreparation]
  have selectedOperation := selectInternalScopeCreation_operation state operation selected selection
  have owned := start_operation_owned program selected start startFound
  rw [selectedOperation] at owned
  have matching := internalScopeCreationPredecessorChecks_facts program state operation selected origin definition checks
  have definitions := definition_singleton program selected.created.id.definitionScopeId definition definitionFound
  have definitionFacts := List.mem_filter.mp (show definition ∈ program.definitionScopes.filter
      (fun scope => decide (scope.id = selected.created.id.definitionScopeId)) by
        rw [definitions]; exact List.mem_cons_self)
  have definitionNonempty := (internalScopeCreationDefinitionsExact_facts program definition
    matching.1 definitionFacts.1).1
  have operationMember := (List.mem_filter.mp (show operation ∈ program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) by
        rw [operations]; exact List.mem_cons_self)).1
  have ownerLive : exactLiveOccurrence state selected.owner = true := by
    simp [exactLiveOccurrence, owners]
  have afterOwner := selectInternalScopeCreation_preserves_live state operation selected
    selected.owner selection ownerLive
  have afterCreated := selectInternalScopeCreation_created_live state operation selected selection
  have matchingDefinition := matching.2.1
  have ownerNonempty := matching.2.2.2.2.1
  have originNonempty := matching.2.2.2.2.2.1
  unfold selectInternalScopeCreation? at selection
  simp only [running, bind, Option.bind] at selection
  cases operation with
  | enterScope id selectedOrigin input entry childScope =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      split at selection
      · contradiction
      · next excluded =>
          cases selection
          have ownerHosting : owner.processInstanceId = hosting := by
            by_cases equal : owner.processInstanceId = hosting
            · exact equal
            · exact False.elim (excluded (by simp [equal]))
          simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true, decide_eq_true_eq]
            at matchingDefinition
          have census := child_entry_census program definition owner.definitionScopeId admitted snapshots
            definitionFacts.1 matchingDefinition.1.2
          obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp census
          have operationFiltered : .enterScope id selectedOrigin input entry childScope ∈
              program.operations.filter (fun operation => decide (enteredChildScopeId? operation = some definition.id)) :=
            List.mem_filter.mpr ⟨operationMember, by simp [enteredChildScopeId?, matchingDefinition.1.1]⟩
          rw [singleton] at operationFiltered
          simp only [List.mem_singleton] at operationFiltered
          rw [← operationFiltered] at singleton
          have entryBinding : EntryBinding program
              { id := { processInstanceId := hosting, definitionScopeId := childScope,
                        activation := scopeActivationCount state childScope + 1 }, parent := some owner }
              definition = true := by
            unfold EntryBinding
            simp only [decide_eq_true_eq]
            suffices exactEntry : (program.operations.filter _ ) =
                [.enterScope id selectedOrigin input entry childScope] by rw [exactEntry]; rfl
            apply filter_singleton_of_subpredicate program.operations _ _ _ singleton
            · intro candidate _ accepted
              split at accepted <;> try contradiction
              cases candidate <;> simp only at accepted <;> try contradiction
              all_goals simp only [enteredChildScopeId?, Bool.and_eq_true, decide_eq_true_eq] at accepted ⊢
              all_goals exact congrArg some (accepted.1.trans matchingDefinition.1.1.symm)
            · simp [owned, matchingDefinition.2]
          refine ⟨?_, by intro record impossible; contradiction⟩
          unfold ScopeBinding
          rw [definitions]
          simp only [InternalScopeCreationSelection.apply, running, matchingDefinition.1.2,
            Bool.and_eq_true, decide_eq_true_eq]
          refine ⟨⟨⟨⟨⟨?_, ?_⟩, Nat.zero_lt_succ _⟩, afterCreated⟩, entryBinding⟩,
            ⟨⟨ownerHosting, trivial⟩, afterOwner⟩⟩
          · simpa [ownerHosting] using ownerNonempty
          · simpa [matchingDefinition.1.1] using definitionNonempty
  | invokeProcess id selectedOrigin input process root entry returned =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      try dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals
        simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true, decide_eq_true_eq]
          at matchingDefinition
        have paired : callOperationsPaired program = true := by
          simp only [programWellFormed, Bool.and_eq_true] at admitted
          grind
        have census := invoke_return_census program id selectedOrigin input process root entry returned
          paired operationMember
        obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp census
        have operationFiltered : .invokeProcess id selectedOrigin input process root entry returned ∈
            program.operations.filter (fun operation => match operation with
              | .invokeProcess _ _ _ _ _ _ candidate => decide (candidate = returned)
              | _ => false) := List.mem_filter.mpr ⟨operationMember, by simp⟩
        rw [singleton] at operationFiltered
        simp only [List.mem_singleton] at operationFiltered
        rw [← operationFiltered] at singleton
        refine ⟨?_, ?_⟩
        · let calledInstance := deriveCalledProcessInstanceId owner.processInstanceId selectedOrigin.elementId
            (callActivationCount state selectedOrigin.elementId + 1)
          let rootId : ScopeOccurrenceId :=
            { processInstanceId := calledInstance, definitionScopeId := root, activation := 1 }
          let added : CalledProcessOccurrence :=
            { id := { processInstanceId := owner.processInstanceId,
                      elementId := ⟨selectedOrigin.elementId.value⟩,
                      activation := callActivationCount state selectedOrigin.elementId + 1 },
              caller := owner, calledProcessId := process, calledRoot := rootId, returnOperationId := returned }
          have absent : state.calledProcessOccurrences.filter (fun record => decide
              (record.calledRoot = rootId &&
                record.calledProcessId.value = definition.originElementId.value)) = [] := by
            apply List.filter_eq_nil_iff.mpr
            intro record member accepted
            have accepted := (Bool.and_eq_true _ _).mp (of_decide_eq_true accepted)
            have equal := of_decide_eq_true accepted.1
            have excluded : (state.calledProcessOccurrences.filter fun candidate => decide
              (candidate.id = added.id || candidate.calledRoot.processInstanceId = calledInstance)).length = 0 := by
              assumption
            have denied := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp excluded) record member
            exact denied (by simp [equal, rootId])
          have count : ((sortCallRecords (added :: state.calledProcessOccurrences)).filter fun record => decide
              (record.calledRoot = rootId &&
                record.calledProcessId.value = definition.originElementId.value)).length = 1 := by
            rw [((sortCallRecords_perm (added :: state.calledProcessOccurrences)).filter _).length_eq]
            simp only [List.filter_cons, show added.calledRoot = rootId from rfl,
              show added.calledProcessId.value = definition.originElementId.value from matchingDefinition.2.symm,
              decide_true, Bool.true_and, ↓reduceIte, absent, List.length_singleton]
          have different : calledInstance ≠ hosting := by
            have callerHosting : owner.processInstanceId = hosting := by assumption
            rw [← callerHosting]
            exact calledProcessIdentity_differs_from_caller _ _ _
          have nonempty : calledInstance.value ≠ "" := by
            change "call:" ++ toString owner.processInstanceId.value.utf8ByteSize ++ ":" ++
              owner.processInstanceId.value ++ ":" ++ toString selectedOrigin.elementId.value.utf8ByteSize ++
              ":" ++ selectedOrigin.elementId.value ++ ":" ++
                toString (callActivationCount state selectedOrigin.elementId + 1) ≠ ""
            intro equal
            have size := congrArg String.utf8ByteSize equal
            simp only [String.utf8ByteSize_append] at size
            change 5 + _ + 1 + _ + 1 + _ + 1 + _ + 1 + _ = 0 at size
            omega
          simp only [ScopeBinding, InternalScopeCreationSelection.apply, definitions,
            matchingDefinition.1.2, running, EntryBinding, Bool.and_true,
            show deriveCalledProcessInstanceId owner.processInstanceId selectedOrigin.elementId
              (callActivationCount state selectedOrigin.elementId + 1) ≠ hosting from different,
            ↓reduceIte, Bool.and_eq_true, decide_eq_true_eq]
          exact ⟨⟨⟨⟨by simpa using nonempty,
            by simpa [matchingDefinition.1.1] using definitionNonempty⟩, by decide +kernel⟩,
            afterCreated⟩, by simpa only [Bool.and_eq_true, decide_eq_true_eq] using count⟩
        · intro record kind
          cases kind
          unfold CallBinding
          simp only [Bool.and_eq_true]
          constructor
          · simp only [occurrenceOwnerValid, Bool.and_eq_true, decide_eq_true_eq]
            simp only [internalScopeCreationOrigin?, Option.some.injEq] at originFound
            exact ⟨⟨⟨⟨by simpa using ownerNonempty, by simpa [← originFound] using originNonempty⟩,
              Nat.zero_lt_succ _⟩, trivial⟩, afterOwner⟩
          · simp only [decide_eq_true_eq]
            suffices exactCall : (program.operations.filter _) =
                [.invokeProcess id selectedOrigin input process root entry returned] by rw [exactCall]; rfl
            apply filter_singleton_of_subpredicate program.operations _ _ _ singleton
            · intro candidate _ accepted
              split at accepted <;> try contradiction
              cases candidate <;> simp only at accepted <;> try contradiction
              simp only [Bool.and_eq_true, decide_eq_true_eq] at accepted ⊢
              exact accepted.2
            · simp [owned]
  | _ => contradiction

private theorem selected_call_root (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection) (record : CalledProcessOccurrence)
    (found : selectInternalScopeCreation? state operation = some selected)
    (kind : selected.kind = .called record) :
    record.calledRoot = selected.created.id ∧ selected.created.parent = none := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals cases kind
      all_goals exact ⟨rfl, rfl⟩

theorem prepareInternalScopeCreation_excludes_bounded_entry
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalScopeCreation)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (childScope : DefinitionScopeId) (timer : BoundaryTimerArm)
    (admitted : programWellFormed program = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (member : .enterBoundedScope id origin input entry childScope timer ∈ program.operations) :
    prepared.selection.created.parent = none ∨
      childScope ≠ prepared.selection.created.id.definitionScopeId := by
  cases kind : prepared.selection.kind with
  | child => exact Or.inr (prepareInternalScopeCreation_child_excludes_bounded_entry
      program state operation prepared id origin input entry childScope timer admitted found kind member)
  | called record =>
      obtain ⟨selected, hosting, ownerRecord, selectedOrigin, definition, start, delta,
        selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
          prepareInternalScopeCreation_facts program state operation prepared found
      exact Or.inl (selected_call_root state operation selected record selection kind).2

theorem scopeCreation_structural_of_created_bindings
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (created : ScopeBinding program (selected.apply state) selected.created = true ∧
      ∀ record, selected.kind = .called record → CallBinding program (selected.apply state) record = true) :
    flowNodeOccurrenceStructuralProgramValidity program (selected.apply state) = true := by
  have fresh := selectInternalScopeCreation_fresh state operation selected selection
  have owners : ∀ owner, flowNodeOccurrenceOwnerLiveUnique state owner = true →
      flowNodeOccurrenceOwnerLiveUnique (selected.apply state) owner = true :=
    fun owner live => selectInternalScopeCreation_preserves_live state operation selected owner selection live
  have control : (selected.apply state).control = state.control := by
    cases kind : selected.kind <;> simp [InternalScopeCreationSelection.apply, kind]
  have old := (structural_iff program state).mp structural
  apply (structural_iff program (selected.apply state)).mpr
  constructor
  · intro occurrence member
    have scopes : (selected.apply state).scopeOccurrences =
        insertScopeOccurrence selected.created state.scopeOccurrences := by
      cases kind : selected.kind <;> simp [InternalScopeCreationSelection.apply, kind]
    rw [scopes] at member
    have insertedMember : occurrence = selected.created ∨ occurrence ∈ state.scopeOccurrences := by
      simpa [insertScopeOccurrence, mem_canonicalInsertBy] using member
    rcases insertedMember with rfl | member
    · exact created.1
    · apply scope_binding_frame program state (selected.apply state) occurrence (old.1 occurrence member)
        control owners
      intro origin
      cases kind : selected.kind with
      | child => simp [InternalScopeCreationSelection.apply, kind]
      | called record =>
          have root := (selected_call_root state operation selected record selection kind).1
          have different : record.calledRoot ≠ occurrence.id := by
            rw [root]; exact Ne.symm (fresh occurrence member)
          simp only [InternalScopeCreationSelection.apply, kind]
          rw [((sortCallRecords_perm (record :: state.calledProcessOccurrences)).filter _).length_eq]
          simp [different]
  · intro record member
    cases kind : selected.kind with
    | child =>
        have previous : record ∈ state.calledProcessOccurrences := by
          simpa only [InternalScopeCreationSelection.apply, kind] using member
        exact call_binding_frame program state (selected.apply state) record (old.2 record previous) owners
    | called inserted =>
        have previous : record ∈ inserted :: state.calledProcessOccurrences := by
          apply (sortCallRecords_perm (inserted :: state.calledProcessOccurrences)).subset
          simpa only [InternalScopeCreationSelection.apply, kind] using member
        rcases List.mem_cons.mp previous with rfl | previous
        · exact created.2 _ kind
        · exact call_binding_frame program state (selected.apply state) record (old.2 record previous) owners

theorem prepareInternalScopeCreation_preserves_structuralProgramValidity
    (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    flowNodeOccurrenceStructuralProgramValidity program (prepared.selection.apply state) = true := by
  have created := created_bindings program state operation prepared admitted found
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  exact scopeCreation_structural_of_created_bindings program state operation selected structural selection created

end BpmnSemantics.SemanticProcess.InternalCommutation
