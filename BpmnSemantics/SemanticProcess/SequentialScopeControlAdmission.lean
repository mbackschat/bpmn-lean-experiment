module

public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeRuntime
public import BpmnSemantics.SemanticProcess.ContinuationMarking

/-! SMIS-ADMIT-01 composes body bursts with the outer lifecycle; generic graph and data admission remain separate conjuncts. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.SequentialScopeControl

def inputs : SemanticOperation → List ControlPlaceId := bodyConsumedPorts

def consumer? (operations : List SemanticOperation) (place : ControlPlaceId) : Option String := do
  let [operation] := operations.filter (fun operation => (inputs operation).contains place) | none
  return operation.id.value

def bodyVertex? (operations : List SemanticOperation) (operation : SemanticOperation) : Option StructuredParallelBody.Vertex := do
  let (kind, outputs) ← match operation with
    | .awaitUserTask _ _ _ output _ | .awaitEffect _ _ _ output _ none => some (.task, [output])
    | .duplicate _ _ _ outputs => some (.fork, outputs)
    | .synchronize _ _ _ output => some (.join, [output])
    | .reachNoneEnd .. => some (.finish, [])
    | _ => none
  return ⟨operation.id.value, kind, ← outputs.mapM (consumer? operations)⟩

def parentPath : Nat → List SemanticOperation → OperationId → ControlPlaceId → Bool → Nat → Nat → Option (Nat × Nat)
  | 0, _, _, _, _, _, _ => none
  | fuel + 1, operations, entryId, next, entered, before, after => do
      let [operation] := operations.filter (fun operation => (inputs operation).contains next) | none
      let rest := operations.filter (·.id != operation.id)
      match operation with
      | .awaitUserTask _ _ _ output _ | .awaitEffect _ _ _ output _ none =>
          parentPath fuel rest entryId output entered (before + if entered then 0 else 1) (after + if entered then 1 else 0)
      | .enterSequentialMultiInstanceScope id _ _ _ _ output .. | .enterParallelMultiInstanceScope id _ _ _ _ output .. =>
          if entered || id != entryId then none else parentPath fuel rest entryId output true before after
      | .reachNoneEnd .. => if entered && rest.isEmpty then some (before, after) else none
      | _ => none

def parentWaits? (operations : List SemanticOperation) (entryId : OperationId) : Option (Nat × Nat) := do
  let [start] := operations.filter (fun operation => match operation with | .initiate .. => true | _ => false) | none
  let [completion] := operations.filter (fun operation => match operation with | .completeScope .. => true | _ => false) | none
  let .initiate _ _ output := start | none
  let .completeScope _ _ _ none := completion | none
  parentPath operations.length (operations.filter fun operation => operation.id != start.id && operation.id != completion.id)
    entryId output false 0 0

/-- Turnover includes the old body's final steps, replacement, and the next body's arming in one resumption. -/
def maximumBurst (bursts : StructuredParallelBody.Bursts) (before after : Nat) : Nat :=
  let continuation := if after > 0 then 1 else 2
  let entry := 1 + max bursts.entry continuation
  max (if before > 0 then 2 else 1 + entry)
    (max entry (max bursts.resumption (max (bursts.terminal + 1 + max bursts.entry continuation) 2)))

structure Analysis where
  entryOperationId : OperationId
  childScopeId : DefinitionScopeId
  maximumBurst : Nat
  deriving Repr, DecidableEq

def analyze (program : Program) : Option Analysis := do
  if !sequentialScopeProgramSelected program || program.internalSchedulingMode != .rejectObservableChoice ||
      program.definitionScopes.length != 2 || program.compensationActivityRetention.isSome ||
      program.compensationEventSubProcessSnapshots.isSome || program.compensationExecution.isSome ||
      !program.interruptingMessageEventSubProcesses.isEmpty then none
  else do
    let [entry] := program.operations.filterMap sequentialScopeEntry? | none
    let [root] := program.definitionScopes.filter (·.parentScopeId.isNone) | none
    if !(program.definitionScopes.any fun scope => scope.id == entry.childScopeId && scope.parentScopeId == some root.id) ||
        (program.operations.map (·.id)).eraseDups.length != program.operations.length ||
        program.operationScopes.length != program.operations.length ||
        !(program.operations.all fun operation =>
          match program.operationScopes.filter (·.operationId == operation.id) with
          | [owner] => owner.scopeId == root.id || owner.scopeId == entry.childScopeId
          | _ => false) then none
    else do
      let owners := fun id scope => program.operationScopes.any (fun owner => owner.operationId == id && owner.scopeId == scope)
      if !owners entry.id root.id then none
      else do
        let parent := program.operations.filter (fun operation => owners operation.id root.id)
        let child := program.operations.filter (fun operation => owners operation.id entry.childScopeId)
        let [completion] := child.filter (fun operation => match operation with | .completeSequentialMultiInstanceScope .. => true | _ => false) | none
        let .completeSequentialMultiInstanceScope _ origin entryId := completion | none
        if entryId != entry.id || origin.elementId != entry.elementId then none
        else do
          let (before, after) ← parentWaits? parent entry.id
          let body := child.filter (·.id != completion.id)
          let first ← consumer? body entry.childEntry
          let vertices ← body.mapM (bodyVertex? body)
          let bursts ← StructuredParallelBody.analyze (⟨entry.id.value, .start, [first]⟩ :: vertices)
          let maximum := maximumBurst bursts before after
          if maximum > scenarioClosureLimit then none
          else return ⟨entry.id, entry.childScopeId, maximum⟩

/-- SMIS-ADMIT-01 retains the exact graph and parent spine used to calculate the accepted command bound. -/
theorem analyze_body_certificate (program : Program) (analysis : Analysis)
    (accepted : analyze program = some analysis) :
    ∃ (entry : SequentialScopeEntry) (root : DefinitionScope)
      (parent child body : List SemanticOperation) (completion : SemanticOperation)
      (origin : BpmnElementOrigin) (waits : Nat × Nat) (first : String)
      (vertices : List StructuredParallelBody.Vertex) (bursts : StructuredParallelBody.Bursts),
      program.operations.filterMap sequentialScopeEntry? = [entry] ∧
      program.definitionScopes.filter (·.parentScopeId.isNone) = [root] ∧
      parent = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == root.id)) ∧
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeSequentialMultiInstanceScope .. => true | _ => false) = [completion] ∧
      completion = .completeSequentialMultiInstanceScope completion.id origin entry.id ∧
      origin.elementId = entry.elementId ∧ body = child.filter (·.id != completion.id) ∧
      parentWaits? parent entry.id = some waits ∧ consumer? body entry.childEntry = some first ∧
      body.mapM (bodyVertex? body) = some vertices ∧
      StructuredParallelBody.analyze (⟨entry.id.value, .start, [first]⟩ :: vertices) = some bursts ∧
      analysis = ⟨entry.id, entry.childScopeId, maximumBurst bursts waits.1 waits.2⟩ ∧
      analysis.maximumBurst ≤ scenarioClosureLimit := by
  unfold analyze at accepted
  split at accepted <;> try contradiction
  split at accepted <;> try contradiction
  rename_i entries entry entrySelected
  split at accepted <;> try contradiction
  rename_i roots root rootSelected
  split at accepted <;> try contradiction
  dsimp only at accepted
  split at accepted <;> try contradiction
  try dsimp only at accepted
  split at accepted <;> try contradiction
  rename_i completions completion completionSelected
  split at accepted <;> try contradiction
  rename_i id origin entryId
  split at accepted <;> try contradiction
  rename_i paired
  try dsimp only at accepted
  obtain ⟨waits, waitsSelected, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨first, firstSelected, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨vertices, verticesSelected, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨bursts, burstsSelected, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  split at accepted <;> try contradiction
  rename_i limited
  cases Option.some.inj accepted
  let parent := program.operations.filter (fun operation => program.operationScopes.any
    (fun owner => owner.operationId == operation.id && owner.scopeId == root.id))
  let child := program.operations.filter (fun operation => program.operationScopes.any
    (fun owner => owner.operationId == operation.id && owner.scopeId == entry.childScopeId))
  let completion := SemanticOperation.completeSequentialMultiInstanceScope id origin entryId
  let body := child.filter (·.id != completion.id)
  refine ⟨entry, root, parent, child, body, completion, origin, waits, first, vertices, bursts,
    entrySelected, rootSelected, rfl, rfl, completionSelected, ?_, ?_, rfl,
    waitsSelected, firstSelected, verticesSelected, burstsSelected, rfl, ?_⟩
  · have same : entryId = entry.id := by
      simp only [Bool.or_eq_true, bne_iff_ne, not_or] at paired
      exact Classical.byContradiction paired.1
    simp only [completion, SemanticOperation.id, same]
  · simp only [Bool.or_eq_true, bne_iff_ne, not_or] at paired
    exact Classical.byContradiction paired.2
  · exact Nat.le_of_not_gt limited

end BpmnSemantics.SemanticProcess.SequentialScopeControl
