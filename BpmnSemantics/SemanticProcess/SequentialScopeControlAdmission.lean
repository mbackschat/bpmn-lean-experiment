import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import BpmnSemantics.SemanticProcess.ClosureLimit

/-! SMIS-ADMIT-01 composes body bursts with the outer lifecycle; generic graph and data admission remain separate conjuncts. -/

namespace BpmnSemantics.SemanticProcess.SequentialScopeControl

def inputs : SemanticOperation → List ControlPlaceId
  | .awaitUserTask _ _ input .. | .awaitEffect _ _ input ..
  | .enterSequentialMultiInstanceScope _ _ input .. | .enterParallelMultiInstanceScope _ _ input .. | .duplicate _ _ input _
  | .reachNoneEnd _ _ input => [input]
  | .synchronize _ _ places _ => places
  | _ => []

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

end BpmnSemantics.SemanticProcess.SequentialScopeControl
