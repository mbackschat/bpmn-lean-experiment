import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.ScopeCompletion
import BpmnSemantics.SemanticProcess.ScopeVariableData
import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection

/-! PMIS-ENTER-01, PMIS-END-01 and PMIS-CANCEL-01: atomic population entry and exact quiescent retirement. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Immutable facts of the paired entry; the Activity body alone owns iteration membership. -/
structure ParallelScopeEntry where
  id : OperationId
  elementId : NodeId
  input : ControlPlaceId
  childEntry : ControlPlaceId
  childScopeId : DefinitionScopeId
  normalOutput : ControlPlaceId
  collectionName : String
  itemName : String
  bodyInputs : List VariableMapping
  completionBooleanName : Option String
  deriving Repr, DecidableEq

/-- PMIS-ENTER-01 initializes each body without changing the enclosing snapshot used by later bodies. -/
def issueParallelBodies? (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) :
    List String → Nat → RuntimeState → Option (RuntimeState × List ParallelScopeIteration)
  | [], _, state => some (state, [])
  | item :: items, index, state => do
      let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId,
        scopeActivationCount state entry.childScopeId + 1⟩
      let variables ← initializeScopeVariables? state.variables child entry.bodyInputs
      let issued := { state with
        variables := variables,
        scopeOccurrences := insertScopeOccurrence ⟨child, some parent⟩ state.scopeOccurrences,
        scopeActivations := setScopeActivationCount state.scopeActivations entry.childScopeId child.activation,
        tokens := addToken state.tokens entry.childEntry child }
      let (successor, rest) ← issueParallelBodies? entry parent items (index + 1) issued
      some (successor, ⟨child, index, item⟩ :: rest)

def enterParallelScope? (entry : ParallelScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Option RuntimeState := do
  if state.control != .running parent.processInstanceId ||
      (state.tokens.filter fun token => token.placeId == entry.input && token.owner == parent).length != 1 ||
      (state.scopeOccurrences.filter fun occurrence => occurrence.id == parent).length != 1 ||
      state.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) ||
      state.activityOccurrences.any (fun record => record.activityElementId == entry.elementId) then none
  else
    let [binding] := state.variables.process.bindings.filter (·.name == entry.collectionName) | none
    let .stringList items := binding.value | none
    if items.length > 16 || !(items.all fun item => decide (item.utf8ByteSize ≤ 512)) ||
        canonicalJsonStringCollectionUtf8Bytes items > 8192 then none
    else
      let consumed := removeToken state.tokens entry.input parent
      match items with
      | [] => some { state with tokens := addToken consumed entry.normalOutput parent }
      | _ :: _ => do
          let (issued, first :: rest) ← issueParallelBodies? entry parent items 0 { state with tokens := consumed }
            | none
          let activation := activityActivationCount state ⟨entry.elementId.value⟩ + 1
          let record : ActivityOccurrence :=
            { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
              activation, owner := parent, body := .parallelChildScopes first rest, attachedHandlers := [] }
          some { issued with
            activityOccurrences := insertActivityOccurrence record issued.activityOccurrences,
            activityActivations := setActivationCount issued.activityActivations ⟨entry.elementId.value⟩ activation,
            parallelScopeControllers := issued.parallelScopeControllers ++
              [⟨⟨parent.processInstanceId, ⟨entry.elementId.value⟩, activation⟩, items.length, 0⟩] }

private def parallelRuntimeActivityId (record : ActivityOccurrence) : ActivityOccurrenceId :=
  ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩

/-- Exact ownership and one local frame are required for every body, including nonselected siblings. -/
def parallelScopeBodyBound (entry : ParallelScopeEntry) (state : RuntimeState)
    (record : ActivityOccurrence) (scope : ScopeOccurrenceId) : Bool :=
  match state.scopeOccurrences.filter (fun occurrence => occurrence.id == scope) with
  | [body] => scope.definitionScopeId == entry.childScopeId && body.parent == some record.owner &&
      (selectScopeVariables? state.variables scope).isSome &&
      decide ((state.activityOccurrences.filter fun candidate =>
        (activityBodyScopeClaims candidate.body).contains scope).length = 1)
  | _ => false

private def parallelCompletionCondition? (entry : ParallelScopeEntry) (state : RuntimeState) : Option Bool := do
  match entry.completionBooleanName with
  | none => some false
  | some name =>
      let [binding] := state.variables.process.bindings.filter (·.name == name) | none
      let .boolean condition := binding.value | none
      some condition

def completeParallelScope? (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) : Option RuntimeState := do
  let .running instanceId := state.control | none
  let [record] := state.activityOccurrences.filter (fun candidate =>
    (activityBodyScopeClaims candidate.body).contains target) | none
  let .parallelChildScopes first rest := record.body | none
  if record.activityElementId != entry.elementId || record.processInstanceId != instanceId ||
      record.owner.processInstanceId != instanceId || !record.attachedHandlers.isEmpty ||
      (state.scopeOccurrences.filter fun occurrence => occurrence.id == record.owner).length != 1 then none
  else
    let [controller] := state.parallelScopeControllers.filter (fun controller =>
      controller.id == parallelRuntimeActivityId record) | none
    let iterations := first :: rest
    if controller.total > 16 || !validParallelScopePopulation controller iterations ||
        !(iterations.all fun iteration => parallelScopeBodyBound entry state record iteration.scope) ||
        !scopeQuiescent state target ||
        state.activityOccurrences.any (fun candidate => candidate.owner == target) then none
    else
      let variables ← removeScopeVariables? state.variables target
      let disposed := { state with variables := variables }
      let condition ← parallelCompletionCondition? entry disposed
      let result ← retireParallelScopeIteration controller iterations target condition
      let detached := { disposed with
        activityOccurrences := state.activityOccurrences.filter (· != record),
        parallelScopeControllers := state.parallelScopeControllers.filter (· != controller) }
      let retired := cancelScopeSubtree detached target .remove
      match result with
      | .remaining successor _ first rest =>
          some (cancelScopeSubtree { disposed with
            activityOccurrences := state.activityOccurrences.map fun candidate =>
              if candidate == record then { candidate with body := .parallelChildScopes first rest } else candidate,
            parallelScopeControllers := state.parallelScopeControllers.map fun candidate =>
              if candidate == controller then successor else candidate } target .remove)
      | .naturalCompletion .. =>
          some { retired with tokens := addToken retired.tokens entry.normalOutput record.owner }
      | .earlyCompletion _ _ first rest =>
          let cancelled := (first :: rest).foldl
            (fun current iteration => cancelScopeSubtree current iteration.scope .remove) retired
          some { cancelled with tokens := addToken cancelled.tokens entry.normalOutput record.owner }

def parallelScopeEntry? : SemanticOperation → Option ParallelScopeEntry
  | .enterParallelMultiInstanceScope id origin input childEntry childScopeId output collection item mappings condition =>
      some ⟨id, origin.elementId, input, childEntry, childScopeId, output, collection, item, mappings, condition⟩
  | _ => none

/-- PMIS-SELECT-01 binds the selected IL operation and full owner without choosing a sibling implicitly. -/
def applyParallelScopeOperation? (program : Program) (operationId : OperationId) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Option RuntimeState := do
  let [operation] := program.operations.filter (·.id == operationId) | none
  let entryId ← match operation with
    | .enterParallelMultiInstanceScope id .. => some id
    | .completeParallelMultiInstanceScope _ _ entryId => some entryId
    | _ => none
  let [entryOperation] := program.operations.filter (·.id == entryId) | none
  let entry ← parallelScopeEntry? entryOperation
  let [completion] := program.operations.filter (fun candidate => match candidate with
    | .completeParallelMultiInstanceScope _ _ paired => paired == entry.id | _ => false) | none
  if completion.origin.elementId != entry.elementId then none
  else
    let [entryOwner] := program.operationScopes.filter (·.operationId == entry.id) | none
    let [completionOwner] := program.operationScopes.filter (·.operationId == completion.id) | none
    if completionOwner.scopeId != entry.childScopeId then none
    else match operation with
    | .enterParallelMultiInstanceScope .. =>
        if owner.definitionScopeId == entryOwner.scopeId then enterParallelScope? entry state owner else none
    | .completeParallelMultiInstanceScope id .. =>
        let [body] := state.scopeOccurrences.filter (·.id == owner) | none
        if id != completion.id || owner.definitionScopeId != entry.childScopeId ||
            body.parent.map (·.definitionScopeId) != some entryOwner.scopeId then none
        else completeParallelScope? entry state owner
    | _ => none

/-- PMIS-DATA-01: issuing siblings cannot make an earlier body's locals visible to later input mappings. -/
theorem issueParallelBodies_preserves_process {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.variables.process = state.variables.process := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; rfl
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact (ih generated).trans (initializeScopeVariables_preserves_other_data initialized).1

/-- PMIS-ENTER-01 preserves the collection's multiplicity and assigns consecutive immutable indices. -/
theorem issueParallelBodies_preserves_items_and_indices {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    iterations.map (·.item) = items ∧ iterations.map (·.loopCounter) = List.range' index items.length := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      obtain ⟨itemsEqual, indicesEqual⟩ := ih generated
      simp [itemsEqual, indicesEqual, List.range']

end BpmnSemantics.SemanticProcess
