module

import BpmnSemantics.SemanticProcess.ParallelScopeBodyAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierClassificationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeParentAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeParentProgress
import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerReadinessProofs
import BpmnSemantics.SemanticProcess.ParallelScopeCommandPhaseProofs

/-! # Reachable Human and Service input multiplicity

PMIS-SELECT-01 bounds actual input credit before native arming or discovery. Start
and the pre-entry cursor supply the initial cases; admitted predecessor incidence
and actual lifetime firing accounting supply child and returned-parent cases.
Token multiplicity follows from token-or-wait credit, independently of any future
application, reservation or successful frontier discovery.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem wait_inputs_singleton (operation : SemanticOperation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
    (input : ControlPlaceId) (member : input ∈ bodyConsumedPorts operation) :
    bodyConsumedPorts operation = [input] := by
  cases operation <;> simp [SemanticOperation.kind] at kind <;>
    simp_all [bodyConsumedPorts, SequentialScopeControl.inputs]

private theorem converted_nonentry (body : List SemanticOperation) (operation : SemanticOperation)
    (vertex : StructuredParallelBody.Vertex)
    (converted : SequentialScopeControl.bodyVertex? body operation = some vertex) :
    operation.kind ≠ .enterParallelMultiInstanceScope := by
  cases operation <;> simp_all [SemanticOperation.kind, SequentialScopeControl.bodyVertex?]

private theorem parent_history_credit_le_one (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent state)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) : continuationMarking state owner place ≤ 1 := by
  rcases parents.cursor program analysis admitted parent state with
    ⟨_, zero⟩ | ⟨_, operations, port, path, _, _, _, credit⟩
  · rw [zero owner place]
    omega
  · by_cases sameOwner : owner = parent
    · subst owner
      rw [credit place]
      by_cases samePort : port.id = place <;> simp [ownedPortCount, samePort]
    · rw [(parents.clean_and_foreign_marking program analysis.entry parent state).2 owner sameOwner place]
      omega

private theorem start_credit_zero (program : Program) (seed : ParallelScopeAcceptedStart program)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) : continuationMarking seed.ready owner place = 0 := by
  have started := seed.started
  simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at started
  change _ = seed.ready at started
  rw [← started]
  simp [continuationMarking, runningStartState, initialState]

private theorem child_wait_credit_le_one (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (parent : ScopeOccurrenceId) (before issued state : RuntimeState)
    (candidate : InternalOperationOccurrence) (childOwner : candidate.owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program candidate.owner issued state records)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
    (input : ControlPlaceId) (inputs : bodyConsumedPorts operation = [input]) :
    continuationMarking state candidate.owner input ≤ 1 := by
  obtain ⟨child, completion, body, first, converted, ordered, childEq, completions, bodyEq,
    convertedEq, _, predecessors⟩ := analyzeProgram_chosen_input_predecessor program analysis admitted
  obtain ⟨countChild, countCompletion, countBody, countChildEq, countCompletions, countBodyEq, bounded⟩ :=
    history.body_firing_le_one_from_parent_history program analysis admitted candidate.owner parent selected before issued state
      childOwner parents entered records
  have sameChild : countChild = child := countChildEq.trans childEq.symm
  rw [sameChild] at countCompletions countBodyEq
  have sameCompletion : countCompletion = completion := by simpa using countCompletions.symm.trans completions
  rw [sameCompletion] at countBodyEq
  have sameBody : countBody = body := countBodyEq.trans bodyEq.symm
  rw [sameBody] at bounded
  have population (current : SemanticOperation) (member : current ∈ body) : current ∈ program.operations := by
    rw [bodyEq] at member
    have included := (List.mem_filter.mp member).1
    rw [childEq] at included
    exact (List.mem_filter.mp included).1
  have completionSelected : completion ∈ child.filter
      (fun operation => match operation with | .completeParallelMultiInstanceScope .. => true | _ => false) :=
    completions.symm ▸ List.mem_singleton_self completion
  have completionMember : completion ∈ program.operations := by
    have included := (List.mem_filter.mp completionSelected).1
    rw [childEq] at included
    exact (List.mem_filter.mp included).1
  have completionKind : completion.kind = .completeParallelMultiInstanceScope := by
    have accepted := (List.mem_filter.mp completionSelected).2
    cases completion <;> simp only [] at accepted <;> try contradiction
    rfl
  have member := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have owned := resolved_definition_owner program state candidate operation resolved
  rw [childOwner] at owned
  have childMember : operation ∈ child := childEq.symm ▸
    operation_owner_population program operation analysis.entry.childScopeId member owned
  have different : operation.id ≠ completion.id := by
    intro sameId
    have same := same_declaration program analysis admitted operation completion member completionMember sameId
    rw [same, completionKind] at kind
    simp at kind
  have bodyMember : operation ∈ body := by
    rw [bodyEq]
    exact List.mem_filter.mpr ⟨childMember, by simpa only [bne_iff_ne] using different⟩
  obtain ⟨port, portMember, source⟩ := predecessors operation bodyMember
  have portEq : port = input := by
    change port ∈ bodyConsumedPorts operation at portMember
    rw [inputs] at portMember
    exact List.mem_singleton.mp portMember
  rw [portEq] at source
  obtain ⟨place, declared, placeEq⟩ := parent_input_declared program analysis admitted operation member input
    (by change input ∈ bodyConsumedPorts operation; rw [inputs]; simp)
  obtain ⟨producerId, only, _, produced, _⟩ := history.port_firing_budget program analysis admitted candidate.owner selected
    issued state records operation member place declared (by rw [placeEq, inputs]; simp)
  rw [placeEq] at only produced
  have balance := history.continuation_budget program candidate.owner selected issued state records input
  obtain ⟨tokens, humans, effects⟩ := parents.live_owners program analysis.entry parent before
  obtain ⟨seed, empty⟩ := enterParallelScope_initial_credit analysis.entry parent candidate.owner before issued childOwner
    tokens humans effects entered
  rcases source with entry | ⟨producer, producerMember, output, _⟩
  · obtain ⟨entryOperation, entryMember, entryId, _, entryOutput⟩ := admitted_entry_declaration program analysis admitted
    have included := declared_output_producer program entryOperation entryMember input (by simpa only [entry] using entryOutput)
    rw [only] at included
    have sameId : analysis.entry.id = producerId := by simpa only [entryId] using List.mem_singleton.mp included
    have entryZero := history.entry_firing_count_zero program analysis admitted candidate.owner selected issued state records
    rw [← sameId, entryZero] at produced
    have initialBound : continuationMarking issued candidate.owner input ≤ 1 := by simpa only [entry] using seed
    omega
  · obtain ⟨vertex, _, vertexEq⟩ := mapped_member _ _ _ convertedEq producer producerMember
    have producerDeclared := population producer producerMember
    have differentEntry := nonentry_output_not_entry program analysis admitted producer producerDeclared
      (converted_nonentry body producer vertex vertexEq) place declared (by simpa only [placeEq] using output)
    have initialZero := empty input (by simpa only [placeEq] using differentEntry)
    have included := declared_output_producer program producer producerDeclared input output
    rw [only] at included
    have sameId : producer.id = producerId := List.mem_singleton.mp included
    rw [← sameId] at produced
    have firing := bounded producer producerMember
    rw [initialZero] at balance
    omega

private theorem parent_wait_credit_le_one (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued state : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin)
    (output : ControlPlaceId) (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) (prior suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before prior)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (history : ContinuationCommandHistory program owner issued state suffix)
    (candidate : InternalOperationOccurrence) (owned : candidate.owner = parent)
    (operation : SemanticOperation) (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
    (input : ControlPlaceId) (inputs : bodyConsumedPorts operation = [input]) :
    continuationMarking state parent input ≤ 1 := by
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have balance := preceding.parent_balance_from_start program analysis admitted owner parent selected instanceId values root
    ready initial before issued state output rootSelected parentIdentity started initiated prior suffix entered history clean input
  have distinct := admitted_start_output_ne_entry_normal program analysis admitted startId origin output startDeclared
  have creditBound : parentContinuationMarking analysis.entry parent state input ≤ 1 := by
    by_cases seed : input = output
    · have early := preceding.start_output_produced_charge_zero program analysis admitted owner parent selected initial before prior
        startId origin output startDeclared
      have late := history.start_output_produced_charge_zero program analysis admitted owner parent selected issued state suffix
        startId origin output startDeclared
      have zero : ((prior ++ suffix).map (transitionPortCharge program bodyProducedPorts parent input)).sum = 0 := by
        simp only [seed, List.map_append, List.sum_append, early, late, Nat.zero_add]
      rw [zero] at balance
      have startCredit : ownedPortCount [output] parent parent input = 1 := by simp [ownedPortCount, seed]
      have noNormal : ownedPortCount [analysis.entry.normalOutput] parent parent input = 0 := by
        simp [ownedPortCount, seed, distinct.symm]
      rw [startCredit, noNormal] at balance
      omega
    by_cases normal : input = analysis.entry.normalOutput
    · have early := preceding.entry_normal_produced_charge_zero program analysis admitted owner parent selected initial before prior
      have late := history.entry_normal_produced_charge_zero program analysis admitted owner parent selected issued state suffix
      have zero : ((prior ++ suffix).map (transitionPortCharge program bodyProducedPorts parent input)).sum = 0 := by
        simp only [normal, List.map_append, List.sum_append, early, late, Nat.zero_add]
      rw [zero] at balance
      have noStart : ownedPortCount [output] parent parent input = 0 := by simp [ownedPortCount, Ne.symm seed]
      have normalCredit : ownedPortCount [analysis.entry.normalOutput] parent parent input = 1 := by simp [ownedPortCount, normal]
      rw [noStart, normalCredit] at balance
      omega
    obtain ⟨admittedRoot, operations, start, completion, path, roots, parentEq, startEq, completionKind, trace,
      coverage, _, bounded⟩ := preceding.parent_path_firing_le_one program analysis admitted owner parent selected
        instanceId values root ready initial before issued state startId origin output startDeclared rootSelected
        parentIdentity started initiated prior suffix entered history clean
    have rootEq : root = admittedRoot := by
      have selection := rootSelected
      unfold rootDefinitionScope? at selection
      split at selection <;> try contradiction
      rename_i scopes chosen census
      have same : chosen = root := Option.some.inj selection
      subst chosen
      have included : root ∈ program.definitionScopes.filter (fun scope =>
          scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) := by
        rw [census]
        simp
      obtain ⟨member, checks⟩ := List.mem_filter.mp included
      have rootMember : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
        List.mem_filter.mpr ⟨member, (Bool.and_eq_true_iff.mp checks).1⟩
      simpa [roots] using rootMember
    have member := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
    have ownership := resolved_definition_owner program state candidate operation resolved
    have definition : parent.definitionScopeId = admittedRoot.id := by simp [parentIdentity, rootEq]
    rw [owned, definition] at ownership
    have parentMember : operation ∈ operations := parentEq.symm ▸
      operation_owner_population program operation admittedRoot.id member ownership
    have listed := coverage.mem_iff.mp parentMember
    have startKind : start.kind = .initiate := by simpa only [SemanticOperation.kind] using congrArg SemanticOperation.kind startEq
    have pathMember : operation ∈ path := by
      rcases List.mem_cons.mp listed with same | later
      · rw [same, startKind] at kind
        simp at kind
      rcases List.mem_append.mp later with present | same
      · exact present
      · have sameOperation := List.mem_singleton.mp same
        rw [sameOperation, completionKind] at kind
        simp at kind
    have declared (current : SemanticOperation) (present : current ∈ path) : current ∈ program.operations :=
      (List.mem_filter.mp (parentEq ▸ coverage.mem_iff.mpr (by simp [present]))).1
    obtain ⟨port, portMember, source⟩ := parent_trace_predecessors analysis.entry.id _ output false path trace operation pathMember
    have portEq : port = input := by
      change port ∈ bodyConsumedPorts operation at portMember
      rw [inputs] at portMember
      exact List.mem_singleton.mp portMember
    rw [portEq] at source
    rcases source with initialPort | ⟨producer, earlier, middle, later, shape, produced⟩
    · exact False.elim (seed initialPort)
    have producerMember : producer ∈ path := by rw [shape]; simp
    rcases produced with produced | ⟨entry, decoded, _, returned⟩
    · obtain ⟨place, placeMember, placeEq⟩ := parent_input_declared program analysis admitted operation member input
        (by change input ∈ bodyConsumedPorts operation; rw [inputs]; simp)
      obtain ⟨producerId, only, budget, _⟩ := preceding.parent_port_firing_budget_from_start program analysis admitted owner parent
        selected instanceId values root ready initial before issued state startId origin output startDeclared rootSelected
        parentIdentity started initiated prior suffix entered history clean operation member place placeMember (by rw [placeEq, inputs]; simp)
      have included := declared_output_producer program producer (declared producer producerMember) place.id
        (by simpa only [placeEq] using produced)
      rw [only] at included
      have sameId : producer.id = producerId := List.mem_singleton.mp included
      have noStart : ownedPortCount [output] parent parent place.id = 0 := by simp [ownedPortCount, placeEq, Ne.symm seed]
      have noNormal : ownedPortCount [analysis.entry.normalOutput] parent parent place.id = 0 := by
        simp [ownedPortCount, placeEq, Ne.symm normal]
      rw [noStart, noNormal, ← sameId, placeEq] at budget
      have firing := bounded producer producerMember
      omega
    · have included : entry ∈ program.operations.filterMap parallelScopeEntry? :=
        List.mem_filterMap.mpr ⟨producer, declared producer producerMember, decoded⟩
      obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
      rw [entries] at included
      have sameEntry : entry = analysis.entry := List.mem_singleton.mp included
      rw [sameEntry] at returned
      exact False.elim (normal returned)
  unfold parentContinuationMarking at creditBound
  omega

/-- Actual reachable Human/Service input credit is at most one before native enabledness or frontier discovery is known. -/
theorem ParallelScopeInternalPrefixReachable.wait_input_continuation_le_one (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
    (input : ControlPlaceId) (member : input ∈ bodyConsumedPorts operation) :
    continuationMarking state candidate.owner input ≤ 1 := by
  have inputs := wait_inputs_singleton operation kind input member
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  by_cases child : candidate.owner.definitionScopeId = analysis.entry.childScopeId
  · rcases phases candidate.owner child with rfl | ⟨_, _, _, initial, _, _, _, phase⟩
    · rw [start_credit_zero program seed candidate.owner input]
      omega
    rcases phase with ⟨parents, _⟩ | ⟨before, issued, _, _, suffix, _, parents, _, _, _, entered, later⟩
    · exact parent_history_credit_le_one program analysis admitted seed.parent state parents candidate.owner input
    rcases later with history | ⟨_, _, _, _, _, _, _, completed, _⟩
    · exact child_wait_credit_le_one program analysis admitted selected seed.parent before issued state candidate child
        parents entered suffix history operation resolved kind input inputs
    · obtain ⟨completedInstance, completed⟩ := completed
      rw [running] at completed
      cases completed
  · let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
    rcases phases observer rfl with rfl | ⟨startId, origin, output, initial, records, startDeclared, initiated, phase⟩
    · rw [start_credit_zero program seed candidate.owner input]
      omega
    rcases phase with ⟨parents, _⟩ |
      ⟨before, issued, prior, entryRecord, suffix, _, parents, preceding, _, _, entered, later⟩
    · exact parent_history_credit_le_one program analysis admitted seed.parent state parents candidate.owner input
    rcases later with history | ⟨_, _, _, _, _, _, _, completed, _⟩
    · have count : (state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner))).length = 1 :=
        of_decide_eq_true (resolved_exactLiveOccurrence program state candidate operation resolved)
      obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp count
      have included := List.mem_filter.mp (census.symm ▸ List.mem_singleton_self scope)
      have sameOwner : scope.id = candidate.owner := of_decide_eq_true included.2
      have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1
      have domain := enterParallelScope_clean_scope_domain analysis.entry seed.parent before issued clean entered
      have retained := history.scopeOccurrences_sublist program observer selected issued state suffix
      have owned : candidate.owner = seed.parent := by
        rcases domain scope (retained.subset included.1) with parentOwner | bodyOwner
        · exact sameOwner.symm.trans parentOwner
        · exact False.elim (child (by simpa only [sameOwner] using bodyOwner))
      rw [owned]
      exact parent_wait_credit_le_one program analysis admitted selected observer seed.parent seed.instanceId seed.values seed.root
        seed.ready initial before issued state startId origin output startDeclared seed.rootSelected rfl seed.started initiated
        prior suffix preceding parents entered history candidate owned operation resolved kind input inputs
    · obtain ⟨completedInstance, completed⟩ := completed
      rw [running] at completed
      cases completed

/-- Reachable Human/Service discovery cannot hide two owned input tokens by treating failed arming as disabled. -/
theorem ParallelScopeInternalPrefixReachable.wait_input_multiplicity_le_one (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
    (input : ControlPlaceId) (member : input ∈ bodyConsumedPorts operation) :
    (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length ≤ 1 := by
  have credit := reachable.wait_input_continuation_le_one program analysis admitted state instanceId running
    candidate operation resolved kind input member
  have reordered : state.tokens.filter (fun token => token.owner == candidate.owner && token.placeId == input) =
      state.tokens.filter (fun token => token.placeId == input && token.owner == candidate.owner) := by
    simp only [Bool.and_comm]
  simp only [continuationMarking, reordered] at credit
  omega

end BpmnSemantics.SemanticProcess
