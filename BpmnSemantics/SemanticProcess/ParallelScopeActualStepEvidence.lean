import BpmnSemantics.SemanticProcess.ParallelScopeCommandPhaseProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! Actual PMIS singleton and Start evidence is shared by position and publication
preservation, as required by AA-01. The classification retains the resolved
declaration and canonical replay; each consumer still owns its field invariants.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

/-- Branch-specific evidence accompanies the classifier's common actual replay. -/
inductive ParallelScopeSingletonExecution (program : Program) (analysis : ProgramAnalysis)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence) : SemanticOperation → Prop where
  | body {operation : SemanticOperation}
      (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) :
      ParallelScopeSingletonExecution program analysis before after candidate operation
  | initiation (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
      (rootFound : rootScopeOccurrence? before = some candidate.owner)
      (initiated : initiateState? before output = some after) :
      ParallelScopeSingletonExecution program analysis before after candidate (.initiate id origin output)
  | entry {operation : SemanticOperation}
      (parsed : parallelScopeEntry? operation = some analysis.entry)
      (entered : enterParallelScope? analysis.entry before candidate.owner = some after) :
      ParallelScopeSingletonExecution program analysis before after candidate operation
  | retirement {operation : SemanticOperation}
      (kind : operation.kind = .completeParallelMultiInstanceScope)
      (completed : completeParallelScope? analysis.entry before candidate.owner = some after) :
      ParallelScopeSingletonExecution program analysis before after candidate operation
  | rootCompletion {operation : SemanticOperation} (scopeId : DefinitionScopeId)
      (parentOutput : Option ControlPlaceId) (instanceId : SemanticId)
      (kind : operation.kind = .completeScope)
      (completion : completeSelectedScope? program before scopeId parentOutput = some after)
      (completed : after.control = .completed instanceId) :
      ParallelScopeSingletonExecution program analysis before after candidate operation

/-- Successful admitted singleton application supplies one Running instance and actual replay, without a reachability premise. -/
theorem parallelScope_singleton_execution_cases (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ instanceId operation, before.control = .running instanceId ∧
      resolveInternalOperationOccurrence? program before candidate = some operation ∧
      replayInternalOperationOccurrence? program before {
        operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none } = some after ∧
      ParallelScopeSingletonExecution program analysis before after candidate operation := by
  obtain ⟨operation, resolved, -, replayed⟩ :=
    applyInternalOperationOccurrence_replay_record program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId, operationKind := operation.kind,
    origin := operation.origin, owner := candidate.owner, mergeInput := none }
  have replay : replayInternalOperationOccurrence? program before record = some after := replayed
  have active : ∃ instanceId, before.control = .running instanceId := by
    cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control] at applied <;> try contradiction
    exact ⟨_, rfl⟩
  obtain ⟨instanceId, running⟩ := active
  refine ⟨instanceId, operation, running, resolved, replayed, ?_⟩
  by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
  · exact .body body
  · cases operation <;> simp [SemanticOperation.kind] at body
    case initiate id origin output =>
      obtain ⟨declaredOutput, _, declaration, _, _, rootFound, initiated⟩ :=
        replayed_initiation_execution program before after record rfl replay
      have outputEq : declaredOutput = output := by
        have unique := resolved_operation_unique program before candidate (.initiate id origin output) resolved
        have sole : SemanticOperation.initiate record.operationId record.origin declaredOutput =
            SemanticOperation.initiate id origin output := by
          have member : SemanticOperation.initiate record.operationId record.origin declaredOutput ∈
              program.operations.filter (fun op => op.id == candidate.operationId) :=
            List.mem_filter.mpr ⟨declaration, by simp [record, SemanticOperation.id]⟩
          rw [unique] at member
          exact List.mem_singleton.mp member
        exact SemanticOperation.initiate.inj sole |>.2.2
      subst declaredOutput
      exact .initiation id origin output rootFound initiated
    case enterParallelMultiInstanceScope id origin input childEntry childScope normalOutput collection item mappings condition =>
      have entered := replayed_parallel_entry_execution program analysis admitted before after record rfl replay
      have declared := (resolveInternalOperationOccurrence_declaration program before candidate _ resolved).1
      obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
      let entry : ParallelScopeEntry :=
        ⟨id, origin.elementId, input, childEntry, childScope, normalOutput, collection, item, mappings, condition⟩
      have sameEntry : entry = analysis.entry := by
        simpa only [entries, List.mem_singleton] using
          (List.mem_filterMap.mpr ⟨_, declared, rfl⟩ : entry ∈ program.operations.filterMap parallelScopeEntry?)
      exact .entry (congrArg some sameEntry) entered
    case completeParallelMultiInstanceScope =>
      obtain ⟨entry, member, completed⟩ := replayed_retirement_execution program before after record rfl replay
      obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
      have sameEntry : entry = analysis.entry := by simpa only [entries, List.mem_singleton] using member
      subst entry
      exact .retirement rfl completed
    case completeScope =>
      obtain ⟨_, instanceId, _, _, _, completed, _⟩ :=
        replayed_final_root_completion program analysis admitted before after record rfl replay
      obtain ⟨scopeId, output, _, _, _, _, completion⟩ :=
        replayed_scope_completion_execution program before after record rfl replay (analyzed_not_nested program analysis admitted)
      exact .rootCompletion scopeId output instanceId rfl completion completed
    all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied <;> contradiction

/-- Actual boundary reachability makes every committed Start originate at the initial state with its admitted identity. -/
theorem ParallelScopeCommandBoundaryReachable.committed_start_from_initial
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (selected : programSelected program = true) (before : RuntimeState)
    (boundary : ParallelScopeCommandBoundaryReachable program before)
    (commandId processId instanceId : SemanticId) (values : List VariableBinding)
    (committed : (admitStimulus program before (.startProcess commandId processId instanceId values)).outcome = .committed) :
    before = initialState ∧
      runningProgramStartState? program instanceId values =
        some (admitStimulus program before (.startProcess commandId processId instanceId values)).state ∧
      instanceId.value ≠ "" := by
  have control : before.control = .notStarted := by
    rcases parallelScope_committed_ingress_kind program selected before
      (.startProcess commandId processId instanceId values) committed with
      ⟨_, _, _, _, _, control⟩ | completion
    · exact control
    · exact False.elim completion
  rcases boundary.start_certificate program analysis admitted before with rfl | ⟨seed, _, phases⟩
  · obtain ⟨started, _, _⟩ :=
      parallelScope_committed_start_exact program selected commandId processId instanceId values committed
    refine ⟨rfl, started, ?_⟩
    have accepted : ParallelScopeCommand.stimulusAdmitted program initialState
        (.startProcess commandId processId instanceId values) = true := by
      cases checked : ParallelScopeCommand.stimulusAdmitted program initialState
          (.startProcess commandId processId instanceId values) with
      | false => cases snapshot : program.compensationEventSubProcessSnapshots <;> simp [admitStimulus, snapshot, checked] at committed
      | true => rfl
    have nonempty := ParallelScopeCommand.admitted_start_instance_nonempty program initialState
      commandId processId instanceId values selected accepted
    intro empty; simp [empty] at nonempty
  · rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with ready |
      ⟨_, _, _, initial, records, _, _, phase⟩
    · have running := runningProgramStartState_control program seed.instanceId seed.values seed.ready seed.started
      rw [ready, running] at control; contradiction
    · exact False.elim (phase.not_notStarted program analysis selected _ seed.parent initial before records control)

end BpmnSemantics.SemanticProcess
