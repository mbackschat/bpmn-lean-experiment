import BpmnSemantics.SemanticProcessContract
import BpmnSemantics.SemanticProcess.ClosureLimit

/-! The approved structured-composition proposal requires independent graph contraction, definite-write intersection and task-cut closure bounds. These private analysis vertices carry no serialized or runtime authority. -/

namespace BpmnSemantics.SemanticProcess

abbrev structuredCompositionCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-structured-process-composition-draft"⟩

namespace StructuredComposition

inductive Kind where
  | start | task | choice | merge | finish
  deriving Repr, DecidableEq

structure Vertex where
  id : String
  kind : Kind
  outputs : List String
  reads : Option String := none
  writes : Option String := none
  deriving Repr, DecidableEq

def incoming (vertices : List Vertex) (id : String) : List Vertex :=
  vertices.flatMap fun v => (v.outputs.filter (· == id)).map fun _ => v

def unique? (values : List α) : Option α :=
  match values with | [value] => some value | _ => none

def aritiesValid (vertices : List Vertex) : Bool :=
  vertices.all fun v =>
    let inputs := (incoming vertices v.id).length
    let outputs := v.outputs.length
    (v.outputs.all fun id => vertices.any (·.id == id)) &&
      match v.kind with
      | .start => inputs == 0 && outputs == 1
      | .task => inputs == 1 && outputs == 1
      | .choice => inputs == 1 && outputs == 3
      | .merge => inputs == 3 && outputs == 1
      | .finish => inputs == 1 && outputs == 0

def topologicalOrder : Nat → List Vertex → Option (List Vertex)
  | 0, vertices => if vertices.isEmpty then some [] else none
  | fuel + 1, vertices => do
      if vertices.isEmpty then return []
      let first ← vertices.find? fun v => (incoming vertices v.id).isEmpty
      let rest ← topologicalOrder fuel (vertices.filter (·.id != first.id))
      return first :: rest

def replaceTarget (vertices : List Vertex) (removed replacement : String) : List Vertex :=
  vertices.map fun v =>
    { v with outputs := v.outputs.map fun id => if id == removed then replacement else id }

def contractAt (vertices : List Vertex) (vertex : Vertex) : Option (List Vertex) := do
  match vertex.kind with
  | .task =>
      let next ← unique? vertex.outputs
      return replaceTarget (vertices.filter (·.id != vertex.id)) vertex.id next
  | .choice =>
      let target ← vertex.outputs.head?
      if !(vertex.outputs.length == 3 && vertex.outputs.all (· == target)) then none
      else do
        let merge ← unique? (vertices.filter (·.id == target))
        if !(merge.kind == .merge && (incoming vertices merge.id).length == 3) then none
        else do
          let next ← unique? merge.outputs
          return replaceTarget
            (vertices.filter fun v => v.id != vertex.id && v.id != merge.id) vertex.id next
  | _ => none

def paired : Nat → List Vertex → Bool
  | 0, _ => false
  | fuel + 1, vertices =>
      if vertices.length == 2 then
        match vertices.find? (·.kind == .start), vertices.find? (·.kind == .finish) with
        | some start, some finish => start.outputs == [finish.id] && finish.outputs.isEmpty
        | _, _ => false
      else
        let selected := vertices.foldl (init := none) fun best vertex =>
          match contractAt vertices vertex with
          | none => best
          | some reduced =>
              match best with
              | none => some (vertex.id, reduced)
              | some (id, _) => if vertex.id < id then some (vertex.id, reduced) else best
        match selected with
        | none => false
        | some (_, reduced) => paired fuel reduced

structure DataFact where
  id : String
  written : List String
  deriving Repr, DecidableEq

def definiteInputs (vertices : List Vertex) (facts : List DataFact) (id : String) : List String :=
  let predecessorSets := (incoming vertices id).map fun predecessor =>
    ((facts.find? (·.id == predecessor.id)).map (·.written)).getD []
  match predecessorSets with
  | [] => []
  | first :: rest => first.filter fun name => rest.all (·.contains name)

def accumulateDataFacts (vertices : List Vertex)
    (accumulated : List DataFact × List String) (vertex : Vertex) : List DataFact × List String :=
  let (facts, required) := accumulated
  let before := definiteInputs vertices facts vertex.id
  let needed := match vertex.reads with
    | some name => if before.contains name then required else name :: required
    | none => required
  let after := match vertex.writes with
    | some name => name :: before
    | none => before
  ({ id := vertex.id, written := after } :: facts, needed)

def requiredInputs (vertices ordered : List Vertex) : List String :=
  (ordered.foldl (accumulateDataFacts vertices) ([], [])).2.eraseDups

structure BurstFact where
  id : String
  remaining : Nat
  deriving Repr, DecidableEq

def burstFacts (ordered : List Vertex) : List BurstFact :=
  ordered.foldr (init := []) fun vertex facts =>
    let tail := vertex.outputs.foldl (init := 0) fun maximum id =>
      max maximum (((facts.find? (·.id == id)).map (·.remaining)).getD 0)
    let remaining := match vertex.kind with
      | .task => 1
      | .finish => 2
      | _ => 1 + tail
    { id := vertex.id, remaining } :: facts

def maximumBurst (vertices ordered : List Vertex) : Nat :=
  let facts := burstFacts ordered
  vertices.foldl (init := 0) fun maximum vertex =>
    let rank := fun id => (((facts.find? (·.id == id)).map (·.remaining)).getD 0)
    let burst := match vertex.kind with
      | .start => rank vertex.id
      | .task => vertex.outputs.foldl (fun m id => max m (rank id)) 0
      | _ => 0
    max maximum burst

structure Analysis where
  ordered : List Vertex
  required : List String
  maximumBurst : Nat
  deriving Repr, DecidableEq

def analyze (vertices : List Vertex) : Option Analysis := do
  if !((vertices.map (·.id)).eraseDups.length == vertices.length &&
      (vertices.filter (·.kind == .start)).length == 1 &&
      (vertices.filter (·.kind == .finish)).length == 1 &&
      vertices.any (·.kind == .task) && aritiesValid vertices) then none
  else do
    let ordered ← topologicalOrder vertices.length vertices
    if !(paired (vertices.length + 1) vertices) then none
    else return { ordered, required := requiredInputs vertices ordered
                  maximumBurst := maximumBurst vertices ordered }

def operationInputs : SemanticOperation → List ControlPlaceId
  | .awaitUserTask _ _ input .. | .awaitDataInputOutputUserTask _ _ input ..
  | .choose _ _ input .. | .reachNoneEnd _ _ input => [input]
  | .mergeExclusive _ _ inputs _ => inputs
  | _ => []

def consumer? (program : Program) (place : ControlPlaceId) : Option String := do
  let consumer ← unique? (program.operations.filter fun op =>
    (operationInputs op).contains place)
  return consumer.id.value

def operationVertex? (program : Program) (operation : SemanticOperation) : Option Vertex := do
  let id := operation.id.value
  match operation with
  | .initiate _ _ output =>
      return { id, kind := .start, outputs := [← consumer? program output] }
  | .awaitUserTask _ _ _ output task =>
      if task.metadata.isSome then none
      else return { id, kind := .task, outputs := [← consumer? program output] }
  | .awaitDataInputOutputUserTask _ _ _ output _ _ directInput directOutput =>
      match directInput.source, directOutput.target with
      | .property source, .property target =>
          return { id, kind := .task, outputs := [← consumer? program output]
                   reads := some source, writes := some target }
      | _, _ => none
  | .choose _ _ _ candidates defaultOutput _ =>
      if candidates.length != 2 then none
      else return { id, kind := .choice
                    outputs := ← ((candidates.map (·.output)) ++ [defaultOutput]).mapM
                      (consumer? program) }
  | .mergeExclusive _ _ inputs output =>
      if inputs.length != 3 then none
      else return { id, kind := .merge, outputs := [← consumer? program output] }
  | .reachNoneEnd .. => return { id, kind := .finish, outputs := [] }
  | _ => none

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  match node with
  | .noneStartEvent _ => return { id, kind := .start, outputs }
  | .noneEndEvent _ => return { id, kind := .finish, outputs }
  | .userTask _ _ metadata =>
      if metadata.isSome then none else return { id, kind := .task, outputs }
  | .dataInputOutputUserTask _ _ input output =>
      match input.source, output.target with
      | .property source, .property target =>
          return { id, kind := .task, outputs, reads := some source, writes := some target }
      | _, _ => none
  | .exclusiveGateway _ candidates _ =>
      if candidates.length != 2 then none else return { id, kind := .choice, outputs }
  | .exclusiveMerge _ => return { id, kind := .merge, outputs }
  | _ => none

/-- SPC-SOURCE-01 preserves unique declarations while allowing repeated root Property references. -/
def dataIdentitiesValid (declarations : List String)
    (interfaces : List (DirectActivityDataInput × DirectActivityDataOutput)) : Bool :=
  let owned := declarations ++ interfaces.flatMap fun (input, output) =>
    [input.associationId, input.targetDataInputId, output.associationId, output.sourceDataOutputId]
  owned.eraseDups.length == owned.length && interfaces.all fun (input, output) =>
    match input.source, output.target with
    | .property source, .property target => !owned.contains source && !owned.contains target
    | _, _ => false

def checkedIdentitiesValid (source : CheckedProcess) : Bool :=
  dataIdentitiesValid
    (source.processId.value :: (source.nodes.map (·.id.value)) ++ (source.sequenceFlows.map (·.id.value)))
    (source.nodes.filterMap fun node => match node with
      | .dataInputOutputUserTask _ _ input output => some (input, output)
      | _ => none)

def programIdentitiesValid (program : Program) : Bool :=
  dataIdentitiesValid
    (program.processId.value :: (program.operations.filterMap fun operation => match operation with
      | .completeScope .. => none
      | .initiate _ origin _ | .reachNoneEnd _ origin _ | .awaitUserTask _ origin ..
      | .awaitDataInputOutputUserTask _ origin .. | .choose _ origin ..
      | .mergeExclusive _ origin .. => some origin.elementId.value
      | _ => none) ++ (program.controlPlaces.map (·.origin.elementId.value)))
    (program.operations.filterMap fun operation => match operation with
      | .awaitDataInputOutputUserTask _ _ _ _ _ _ input output => some (input, output)
      | _ => none)

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  if !(source.definitionScopes.length == 1 && source.compensation.isNone &&
      source.transactionCancellation.isNone && checkedIdentitiesValid source) then none
  else analyze (← source.nodes.mapM (checkedVertex? source))

def isScopeCompletion : SemanticOperation → Bool
  | .completeScope .. => true
  | _ => false

def programAnalysis (program : Program) : Option Analysis := do
  if !(program.definitionScopes.length == 1 &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone &&
      program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone) then none
  else if !programIdentitiesValid program then none
  else do
    let completions := program.operations.filter isScopeCompletion
    let completion ← unique? completions
    match completion with
    | .completeScope _ _ _ none =>
        let vertices ← (program.operations.filter fun op => !isScopeCompletion op).mapM
          (operationVertex? program)
        analyze vertices
    | _ => none

end StructuredComposition

def structuredCompositionCheckedGraph (source : CheckedProcess) : Bool :=
  match StructuredComposition.checkedAnalysis source with
  | some analysis => analysis.maximumBurst ≤ scenarioClosureLimit
  | none => false

def structuredCompositionProgramGraph (program : Program) : Bool :=
  match StructuredComposition.programAnalysis program with
  | some analysis => analysis.maximumBurst ≤ scenarioClosureLimit
  | none => false

end BpmnSemantics.SemanticProcess
