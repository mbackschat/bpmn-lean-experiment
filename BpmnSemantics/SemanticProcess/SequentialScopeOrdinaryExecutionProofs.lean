import BpmnSemantics.SemanticProcess.SequentialScopeExecutionCertificate
import BpmnSemantics.SemanticProcess.InternalTransitionPreservation

/-! Ordinary parent/body execution preserves the SMIS execution certificate. Repeated-body lifecycle and command ingress belong to the separate preservation owner; history and readiness remain above both. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- A nonempty consumed-port selection uses the same predecessor token-owner contract in accounting and exact outcomes. -/
theorem sequentialScope_consumed_token_owner (before : RuntimeState) (operation : SemanticOperation)
    (expected : ScopeOccurrenceId) (nonempty : bodyConsumedPorts operation ≠ [])
    (owners : ∀ token ∈ before.tokens, token.placeId ∈ bodyConsumedPorts operation → token.owner = expected)
    (selected : ScopeOccurrenceId)
    (present : ∀ port ∈ bodyConsumedPorts operation, (⟨port, selected⟩ : ControlToken) ∈ before.tokens) :
    selected = expected := by
  cases ports : bodyConsumedPorts operation with
  | nil => exact False.elim (nonempty ports)
  | cons first rest =>
      have member : first ∈ bodyConsumedPorts operation := by simp [ports]
      exact owners ⟨first, selected⟩ (present first member) member

/-- The selected owner comes from an actual consumed token; the graph's port-to-scope account identifies it with this body. -/
theorem SequentialScopeBodyPortAccounting.fire
    (program : Program) (entry : ControlPlaceId) (body : ScopeOccurrenceId)
    (fired : List SemanticOperation) (before after : RuntimeState) (operation : SemanticOperation)
    (accounting : SequentialScopeBodyPortAccounting entry body fired before)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (nonempty : bodyConsumedPorts operation ≠ [])
    (unique : (bodyConsumedPorts operation).Nodup)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (owners : ∀ token ∈ before.tokens, token.placeId ∈ bodyConsumedPorts operation → token.owner = body)
    (executed : fire? program operation before = some after) :
    SequentialScopeBodyPortAccounting entry body (operation :: fired) after := by
  obtain ⟨owner, present, _, balance⟩ :=
    (fire_body_port_accounting program before after operation bodyOperation unique absent executed).1
  have same := sequentialScope_consumed_token_owner before operation body nonempty owners owner present
  subst owner
  refine ⟨fun place => ?_⟩
  have prior := accounting.balance place
  have step := balance body place
  simp only [List.map_cons, List.sum_cons]
  omega

/-- Actual ordinary preparation supplies execution; SMIS-IDENTITY-01 identifies consumed owners from static ports and the current-body census. -/
theorem SequentialScopeBodyPortAccounting.prepared
    (program : Program) (hosting : SemanticId) (entry : SequentialScopeEntry)
    (binding : SequentialScopeBinding) (fired : List SemanticOperation) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalTransition)
    (accounting : SequentialScopeBodyPortAccounting entry.childEntry binding.body.id fired before)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (nonempty : bodyConsumedPorts operation ≠ [])
    (unique : (bodyConsumedPorts operation).Nodup)
    (ports : ∀ port ∈ bodyConsumedPorts operation,
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = port)) =
        [{ controlPlaceId := port, scopeId := entry.childScopeId }])
    (selected : prepareInternalTransition? program before operation = some prepared) :
    applyPreparedInternalTransition? program before prepared = some (prepared.apply program before) ∧
      SequentialScopeBodyPortAccounting entry.childEntry binding.body.id (operation :: fired)
        (prepared.apply program before) ∧
      (prepared.apply program before).scopeActivations = before.scopeActivations := by
  obtain ⟨ready, same, snapshots⟩ := prepareInternalTransition_sound program before operation prepared selected
  have applies := prepared_transition_applies program before prepared snapshots ready
  have executed : fire? program operation before = some (prepared.apply program before) := by
    have actual := applies.1
    rw [prepareInternalTransition_alternative program before operation prepared selected] at actual
    simpa only [same, fireInternalAlternative_operation] using actual
  have scopeFrame := (fire_body_port_accounting program before
    (prepared.apply program before) operation bodyOperation unique snapshots executed).2
  refine ⟨applies.2, ?_, scopeFrame⟩
  apply SequentialScopeBodyPortAccounting.fire program entry.childEntry binding.body.id fired before
    (prepared.apply program before) operation accounting bodyOperation nonempty unique snapshots _ executed
  intro token member port
  exact sequentialScope_current_body_token_owner program hosting entry before binding token
    wellFormed running declared bound member (ports token.placeId port)

private theorem smis_body_preparation_read_only (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalTransition) (hosting : SemanticId)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (selected : prepareInternalTransition? program before operation = some prepared) :
    prepared.ControlReadOnly hosting := by
  cases prepared <;> try trivial
  rename_i regional
  cases operation <;> simp_all only [SemanticOperation.kind, List.mem_cons, List.not_mem_nil, or_false] <;> try contradiction
  all_goals first
    | change (prepareInternalEnd? program before _).map PreparedInternalTransition.ordinaryEnd = some (.regional regional) at selected
    | change (if program.compensationEventSubProcessSnapshots.isSome then none else
        (prepareInternalLocalControl? program before _).map PreparedInternalTransition.localControl) = some (.regional regional) at selected
    | change (prepareInternalArming? program before _).map PreparedInternalTransition.arming = some (.regional regional) at selected
  all_goals try simp only [Option.map_eq_some_iff] at selected
  all_goals first
    | obtain ⟨_, _, impossible⟩ := selected; cases impossible
    | split at selected <;> simp_all only [Option.map_eq_some_iff, reduceCtorEq]
  all_goals obtain ⟨_, _, impossible⟩ := selected; contradiction

private theorem smis_user_arming_waiting (program : Program) (before : RuntimeState)
    (owner queried : ScopeOccurrenceId) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition) (candidate : SemanticOperation)
    (valid : programWellFormed program = true)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations)
    (candidateMember : candidate ∈ program.operations) :
    sequentialScopeTaskWaitingCount (activateUserTask before owner.processInstanceId owner input output task) queried candidate ≤
      sequentialScopeTaskWaitingCount before queried candidate +
        if queried = owner ∧ candidate = .awaitUserTask id origin input output task then 1 else 0 := by
  cases candidate <;> simp only [sequentialScopeTaskWaitingCount, activateUserTask] <;> try omega
  rename_i otherId otherOrigin otherInput otherOutput otherTask
  rw [length_filter_insertUserTaskWait]
  by_cases sameTask : task = otherTask
  · have same := sequentialScope_wait_declarer_unique program
      (.awaitUserTask id origin input output task) (.awaitUserTask otherId otherOrigin otherInput otherOutput otherTask)
      (userTaskWaitDeclarationKey task.id) valid member candidateMember
      (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
      (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, sameTask])
    cases same
    by_cases sameOwner : queried = owner
    · subst queried
      simp only [decide_true, Bool.and_true, true_and, ite_true]
      omega
    · have different : owner ≠ queried := Ne.symm sameOwner
      simp only [sameOwner, different, decide_false, Bool.false_and, Bool.false_eq_true, false_and,
        ite_false, Nat.zero_add, Nat.add_zero]; exact Nat.le_refl _
  · simp [sameTask]

private theorem smis_effect_arming_waiting (program : Program) (before : RuntimeState)
    (owner queried : ScopeOccurrenceId) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (arguments : List VariableBinding) (candidate : SemanticOperation)
    (valid : programWellFormed program = true)
    (member : SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations)
    (candidateMember : candidate ∈ program.operations) :
    sequentialScopeTaskWaitingCount (activateEffect before owner.processInstanceId owner input output effect route arguments) queried candidate ≤
      sequentialScopeTaskWaitingCount before queried candidate +
        if queried = owner ∧ candidate = .awaitEffect id origin input output effect route then 1 else 0 := by
  cases candidate <;> simp only [sequentialScopeTaskWaitingCount, activateEffect] <;> try omega
  rename_i otherId otherOrigin otherInput otherOutput otherEffect otherRoute
  rw [length_filter_insertEffectWait]
  by_cases sameElement : effect.elementId = otherEffect.elementId
  · have same := sequentialScope_wait_declarer_unique program
      (.awaitEffect id origin input output effect route) (.awaitEffect otherId otherOrigin otherInput otherOutput otherEffect otherRoute)
      (effectWaitDeclarationKey effect.elementId) valid member candidateMember
      (sequentialScope_effect_runtime_declarer program _ valid member)
      (by simpa [sameElement] using sequentialScope_effect_runtime_declarer program _ valid candidateMember)
    cases same
    by_cases sameOwner : queried = owner
    · subst queried
      simp only [decide_true, Bool.and_true, true_and, ite_true]
      omega
    · have different : owner ≠ queried := Ne.symm sameOwner
      simp only [sameOwner, different, decide_false, Bool.false_and, Bool.false_eq_true, false_and,
        ite_false, Nat.zero_add, Nat.add_zero]; exact Nat.le_refl _
  · simp [sameElement]


/-- Actual child-owned ordinary preparation advances the whole held certificate and records exactly this body firing. -/
theorem sequentialScope_body_prepared_certificate (program : Program)
    (data : SequentialScopeData.Analysis) (root : DefinitionScope) (before : RuntimeState)
    (hosting : SemanticId) (parentFired : List SemanticOperation) (operation : SemanticOperation)
    (bodyOperations : List SemanticOperation) (vertex : StructuredParallelBody.Vertex)
    (prepared : PreparedInternalTransition) (valid : programWellFormed program = true)
    (dataAnalyzed : SequentialScopeData.analyze program = some data)
    (certificate : SequentialScopeExecutionCertificateCore program data.entry root before hosting .held parentFired)
    (selectedBody : operation ∈ program.operations.filter (fun operation => program.operationScopes.any
      (fun ownership => decide (ownership.operationId = operation.id && ownership.scopeId = data.entry.childScopeId))))
    (parsed : SequentialScopeControl.bodyVertex? bodyOperations operation = some vertex)
    (selected : prepareInternalTransition? program before operation = some prepared) :
    SequentialScopeExecutionCertificateCore program data.entry root (prepared.apply program before) hosting .held parentFired := by
  let after := prepared.apply program before
  let parent : ScopeOccurrenceId := ⟨hosting, root.id, 1⟩
  obtain ⟨member, owned⟩ := List.mem_filter.mp selectedBody
  have kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd] := by
    cases operation <;> simp_all [SequentialScopeControl.bodyVertex?, SemanticOperation.kind]
  obtain ⟨nonempty, unique, ports⟩ := sequentialScope_body_operation_ports program operation data.entry.childScopeId valid member owned kind
  rcases certificate with ⟨wellFormed, projectable, invariant, census, provenance, initiation, unitStart, balance, waiting,
    running, binding, fired, bound, owner, forest, elements, locals, counter, accounting, bodyProvenance, bodyWaiting, zero⟩
  have entries := sequentialScope_analyzed_entry_census program data dataAnalyzed
  have declared : data.entry ∈ program.operations.filterMap sequentialScopeEntry? := by rw [entries]; simp
  obtain ⟨ready, same, absent⟩ := prepareInternalTransition_sound program before operation prepared selected
  have applies := prepared_transition_applies program before prepared absent ready
  have executed : fire? program operation before = some after := by
    have actual := applies.1
    rw [prepareInternalTransition_alternative program before operation prepared selected] at actual
    simpa only [same, fireInternalAlternative_operation] using actual
  have preserved := prepared_transition_preserves program before prepared hosting valid wellFormed running projectable ready
    (smis_body_preparation_read_only program before operation prepared hosting kind selected)
  have nextInvariant := sequentialScope_invariant_body_fire program operation bodyOperations vertex before after invariant parsed absent executed
  obtain ⟨frame, localFrame⟩ := sequentialScope_body_fire_frame program operation bodyOperations vertex before after parsed absent executed
  have scopeFrame := congrArg RuntimeState.scopeOccurrences frame
  have activityFrame := congrArg RuntimeState.activityOccurrences frame
  have controllerFrame := congrArg RuntimeState.sequentialScopeControllers frame
  have controlFrame := congrArg RuntimeState.control frame
  have nextBound : sequentialScopeBindingForEntry? data.entry after = some binding := by
    simpa only [sequentialScopeBindingForEntry?, selectScopeVariables?, controlFrame, activityFrame,
      scopeFrame, controllerFrame, localFrame] using bound
  have nextAccounting := (SequentialScopeBodyPortAccounting.prepared program hosting data.entry binding fired before operation prepared
    accounting wellFormed running declared bound kind nonempty unique ports selected).2.1
  have selectedOwner := sequentialScope_consumed_token_owner before operation binding.body.id nonempty
    (fun token selectedToken consumed => sequentialScope_current_body_token_owner program hosting data.entry before binding token
      wellFormed running declared bound selectedToken (ports token.placeId consumed))
  obtain ⟨actualOwner, present, _, delta⟩ :=
    (fire_body_port_accounting program before after operation kind unique absent executed).1
  have bodyOwner := selectedOwner actualOwner present
  subst actualOwner
  have different : binding.body.id ≠ parent := by
    intro equal
    have bodyParent := (sequentialScope_bound_controller_progress data.entry before binding bound).2.2
    have rootMember : (⟨parent, none⟩ : RuntimeScopeOccurrence) ∈ before.scopeOccurrences := forest.mem_iff.mpr (by simp [parent])
    have associations := invariant.associations
    have childCensus := sequentialScope_valid_body_census program data.entry before binding declared associations bound
    have selectedRoot : (⟨parent, none⟩ : RuntimeScopeOccurrence) ∈ before.scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == data.entry.childScopeId) :=
      List.mem_filter.mpr ⟨rootMember, by rw [← equal]; simpa only [beq_iff_eq] using (sequentialScope_binding_body_data data.entry before binding bound).2.2.2⟩
    rw [childCensus, List.mem_singleton] at selectedRoot
    have impossible := congrArg RuntimeScopeOccurrence.parent selectedRoot
    rw [bodyParent] at impossible
    contradiction
  have parentCredit : ∀ place, continuationMarking after parent place = continuationMarking before parent place := by
    intro place
    have credit := delta parent place
    rw [ownedPortCount_foreign _ _ _ _ different, ownedPortCount_foreign _ _ _ _ different] at credit
    simpa using credit
  have waitStep : ∀ queried candidate, candidate ∈ program.operations →
      sequentialScopeTaskWaitingCount after queried candidate ≤ sequentialScopeTaskWaitingCount before queried candidate +
        if queried = binding.body.id ∧ candidate = operation then 1 else 0 := by
    obtain ⟨outcomeOwner, outcome⟩ := sequentialScope_body_fire_outcome program operation bodyOperations vertex before after parsed absent executed
    have outcomeOwnerEq : outcomeOwner = binding.body.id := by
      have tokens : ∀ port ∈ bodyConsumedPorts operation, (⟨port, outcomeOwner⟩ : ControlToken) ∈ before.tokens := by
        cases operation <;> simp only [SequentialScopeControl.bodyVertex?] at parsed <;> try contradiction
        all_goals dsimp only at outcome
        all_goals first
          | exact ContinuationMarkingLaws.commonTokenOwner_present before _ outcomeOwner outcome.1
          | intro port selectedPort
            have token := ContinuationMarkingLaws.onlyTokenOwner_present before _ outcomeOwner outcome.1
            simp only [bodyConsumedPorts, List.mem_singleton] at selectedPort
            simpa only [selectedPort] using token
      exact selectedOwner outcomeOwner tokens
    subst outcomeOwner
    cases operation <;> simp only [SequentialScopeControl.bodyVertex?] at parsed <;> try contradiction
    all_goals dsimp only at outcome
    case awaitUserTask =>
      obtain ⟨_, outcome⟩ := outcome
      intro queried candidate selectedCandidate
      rw [outcome]
      exact smis_user_arming_waiting program before binding.body.id queried _ _ _ _ _ candidate valid member selectedCandidate
    case awaitEffect =>
      obtain ⟨_, arguments, outcome⟩ := outcome
      intro queried candidate selectedCandidate
      rw [outcome]
      exact smis_effect_arming_waiting program before binding.body.id queried _ _ _ _ _ _ arguments candidate valid member selectedCandidate
    all_goals obtain ⟨_, outcome⟩ := outcome
    all_goals intro queried candidate _; rw [outcome]; cases candidate <;> simp [sequentialScopeTaskWaitingCount, duplicateToken, synchronizeTokens, reachNoneEndToken]
  have censusAfter : after.messageWaits = [] ∧ after.eventSubProcessMessageSubscriptions = [] ∧ after.timerWaits = [] ∧
      after.effectIncidents = [] ∧ after.selectedBranchSets = [] ∧ after.eventRaces = [] ∧ after.calledProcessOccurrences = [] ∧
      after.parallelScopeControllers = [] ∧ after.sequentialMultiInstanceControllers = [] ∧ after.parallelMultiInstanceControllers = [] ∧
      after.compensationActivityRetentions = [] ∧ after.compensationParentContextRetentions = [] ∧ after.compensationTriggers = [] ∧
      after.compensationHandlerEffectWaits = [] := by rw [frame]; exact census
  refine ⟨preserved.1, preserved.2.2, nextInvariant, censusAfter, provenance,
    (congrArg RuntimeState.initiationPending frame).trans initiation, unitStart, ?_, ?_, preserved.2.1,
    binding, operation :: fired, nextBound, owner, ?_, ?_, ?_, ?_, nextAccounting, ?_, ?_, ?_⟩
  · intro place; rw [parentCredit]; exact balance place
  · intro candidate selectedCandidate
    have step := waitStep parent candidate selectedCandidate
    have prior := waiting candidate selectedCandidate
    change sequentialScopeTaskWaitingCount after parent candidate ≤ parentFired.count candidate
    change sequentialScopeTaskWaitingCount before parent candidate ≤ parentFired.count candidate at prior
    simp only [Ne.symm different, false_and, ite_false, Nat.add_zero] at step
    omega
  · rw [scopeFrame]; exact forest
  · intro record selectedRecord; exact elements record (activityFrame ▸ selectedRecord)
  · rw [localFrame]; exact locals
  · have counters : after.scopeActivations = before.scopeActivations := by
      have sameCounters := congrArg RuntimeState.scopeActivations frame
      exact sameCounters
    change binding.body.id.activation ≤ scopeActivationCount after data.entry.childScopeId
    simpa only [scopeActivationCount, counters] using counter
  · intro candidate selectedCandidate
    rcases List.mem_cons.mp selectedCandidate with rfl | previous
    · exact ⟨member, kind, owned⟩
    · exact bodyProvenance candidate previous
  · intro candidate selectedCandidate
    have step := waitStep binding.body.id candidate selectedCandidate
    have prior := bodyWaiting candidate selectedCandidate
    change sequentialScopeTaskWaitingCount after binding.body.id candidate ≤ (operation :: fired).count candidate
    by_cases equal : candidate = operation
    · subst candidate
      simp only [List.count_cons_self, true_and, ite_true] at step ⊢
      omega
    · have reverse : operation ≠ candidate := Ne.symm equal
      simp only [List.count_cons_of_ne reverse, equal, and_false, ite_false, Nat.add_zero] at step ⊢
      exact Nat.le_trans step prior
  · intro place; rw [parentCredit]; exact zero place

end BpmnSemantics.SemanticProcess
