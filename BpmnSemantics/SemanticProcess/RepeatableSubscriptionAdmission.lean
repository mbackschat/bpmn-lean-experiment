import BpmnSemantics.SemanticProcessContract

/-! The approved repeatable-subscription proposal selects a fork forest and an eight-operation
whole-burst limit. These independent representation readers supplement generic validation;
they neither replace reference validation nor grant public scheduling or hosting capability. -/

namespace BpmnSemantics.SemanticProcess

/-- Private identity of the approved RC subscription semantic checkpoint. -/
abbrev repeatableSubscriptionCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-repeatable-event-subscriptions-draft"⟩

private def one? (values : List α) : Option α :=
  match values with | [value] => some value | _ => none

private def distinct [DecidableEq α] (values : List α) : Bool := decide values.Nodup

private def operationMessage : MessageChannel → Bool
  | .operationMessage .. => true
  | _ => false

private def checkedAllowed : CheckedNode → Bool
  | .noneStartEvent _ | .embeddedSubProcess .. | .noneEndEvent _ | .terminateEndEvent _ => true
  | .userTask _ _ metadata => metadata.isNone
  | .intermediateCatchMessageEvent _ channel => operationMessage channel
  | .receiveTask _ channel => match channel with | .directMessage _ => true | _ => false
  | .intermediateCatchTimerEvent _ literal => literal == "PT1S"
  | .parallelGateway _ direction => decide (direction = .diverging)
  | .messageBoundaryEvent _ _ _ channel _ => operationMessage channel
  | .timerBoundaryEvent _ _ interruption expression _ =>
      match expression with
      | .duration literal => literal == "PT1S"
      | .cycle literal => literal == "R/PT1S" && decide (interruption = .nonInterrupting)
  | _ => false

private def checkedBoundary : CheckedNode → Bool
  | .timerBoundaryEvent .. | .messageBoundaryEvent .. => true
  | _ => false

private def checkedTimer : CheckedNode → Bool
  | .timerBoundaryEvent .. | .intermediateCatchTimerEvent .. => true
  | _ => false

def repeatableSubscriptionCheckedShape (nodes : List CheckedNode) (scopeCount : Nat) : Bool :=
  (scopeCount == 1 || scopeCount == 2) && nodes.all checkedAllowed &&
    (nodes.filter (fun node => match node with | .noneStartEvent _ => true | _ => false)).length == scopeCount &&
    (nodes.filter (fun node => match node with | .embeddedSubProcess .. => true | _ => false)).length + 1 == scopeCount &&
    (nodes.filter checkedBoundary).length ≤ 1 && (nodes.filter checkedTimer).length ≤ 1

private def timerArmAllowed (arm : BoundaryTimerArm) (monitored : Bool) : Bool :=
  arm.durationMs == 1000 && (monitored || arm.recurrence.isNone)

def repeatableSubscriptionOperationAllowed : SemanticOperation → Bool
  | .initiate .. | .enterScope .. | .reachNoneEnd .. | .terminateScope .. | .completeScope .. => true
  | .awaitUserTask _ _ _ _ task => task.metadata.isNone
  | .awaitMessage .. => true
  | .awaitTimer _ _ _ _ timer => timer.durationMs == 1000
  | .duplicate _ _ _ outputs => outputs.length ≥ 2 && distinct outputs
  | .awaitBoundedUserTask _ _ _ _ arm | .enterBoundedScope _ _ _ _ _ arm => timerArmAllowed arm false
  | .awaitMonitoredUserTask _ _ _ _ arm | .enterMonitoredScope _ _ _ _ _ arm => timerArmAllowed arm true
  | .awaitMessageBoundedUserTask _ _ _ _ arm | .awaitMessageMonitoredUserTask _ _ _ _ arm => operationMessage arm.channel
  | _ => false

def repeatableSubscriptionBoundaryOperation : SemanticOperation → Bool
  | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
  | .awaitMessageBoundedUserTask .. | .awaitMessageMonitoredUserTask ..
  | .enterBoundedScope .. | .enterMonitoredScope .. => true
  | _ => false

private def programTimer : SemanticOperation → Bool
  | .awaitTimer .. | .awaitBoundedUserTask .. | .awaitMonitoredUserTask ..
  | .enterBoundedScope .. | .enterMonitoredScope .. => true
  | _ => false

def repeatableSubscriptionChildScope? : SemanticOperation → Option DefinitionScopeId
  | .enterScope _ _ _ _ child | .enterBoundedScope _ _ _ _ child _
  | .enterMonitoredScope _ _ _ _ child _ => some child
  | _ => none

def repeatableSubscriptionProgramShape (operations : List SemanticOperation) (scopeCount : Nat) : Bool :=
  (scopeCount == 1 || scopeCount == 2) && operations.all repeatableSubscriptionOperationAllowed &&
    (operations.filter (fun op => match op with | .initiate .. => true | _ => false)).length == 1 &&
    (operations.filter (fun op => match op with | .completeScope .. => true | _ => false)).length == scopeCount &&
    (operations.filter (fun op => (repeatableSubscriptionChildScope? op).isSome)).length + 1 == scopeCount &&
    (operations.filter repeatableSubscriptionBoundaryOperation).length ≤ 1 && (operations.filter programTimer).length ≤ 1

private inductive VertexKey where
  | node (id : String)
  | boundary (id : String)
  | entry (id : String)
  deriving DecidableEq

private inductive VertexKind where
  | start
  | boundary (host : VertexKey) (timer repeated : Bool)
  | wait (timer : Bool)
  | enter (child : DefinitionScopeId)
  | fork
  | finish
  | terminate
  deriving DecidableEq

private structure Vertex where
  key : VertexKey
  owner : DefinitionScopeId
  kind : VertexKind
  outputs : List VertexKey

private structure Forest where
  scopes : List DefinitionScope
  root : DefinitionScopeId
  vertices : List Vertex

private def vertex? (forest : Forest) (key : VertexKey) : Option Vertex :=
  one? (forest.vertices.filter fun vertex => decide (vertex.key = key))

private def scopeStart? (forest : Forest) (scope : DefinitionScopeId) : Option Vertex :=
  one? (forest.vertices.filter fun vertex => decide (vertex.owner = scope ∧ vertex.kind = .start))

private def parentEntry? (forest : Forest) (scope : DefinitionScopeId) : Option Vertex :=
  one? (forest.vertices.filter fun vertex => decide (vertex.kind = .enter scope))

private def scopeForest (scopes : List DefinitionScope) (process : ProcessId) : Option DefinitionScopeId := do
  let root ← one? (scopes.filter fun scope => scope.parentScopeId.isNone)
  if !((scopes.length == 1 || scopes.length == 2) && distinct (scopes.map (·.id)) &&
      root.originElementId.value == process.value && scopes.all (fun scope =>
        decide (scope.id = root.id) || decide (scope.parentScopeId = some root.id))) then none
  else some root.id

private def checkedOwner? (checked : CheckedProcess) (id : NodeId) : Option DefinitionScopeId := do
  let owner ← one? (checked.nodeScopes.filter fun owner => decide (owner.nodeId = id))
  pure owner.scopeId

private def checkedVertex? (checked : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let owner ← checkedOwner? checked node.id
  let kind ← match node with
    | .noneStartEvent _ => some .start
    | .userTask .. | .intermediateCatchMessageEvent .. | .receiveTask .. => some (.wait false)
    | .intermediateCatchTimerEvent .. => some (.wait true)
    | .embeddedSubProcess _ child => some (.enter child)
    | .parallelGateway .. => some .fork
    | .noneEndEvent _ => some .finish
    | .terminateEndEvent _ => some .terminate
    | .messageBoundaryEvent _ host interruption _ _ =>
        some (.boundary (.node host.value) false (decide (interruption = .nonInterrupting)))
    | .timerBoundaryEvent _ host interruption _ _ =>
        some (.boundary (.node host.value) true (decide (interruption = .nonInterrupting)))
    | _ => none
  let flows := checked.sequenceFlows.filter fun flow => decide (flow.sourceId = node.id)
  pure { key := .node node.id.value, owner, kind, outputs := flows.map (fun flow => .node flow.targetId.value) }

private def checkedHost (checked : CheckedProcess) (host : NodeId) (timer : Bool) : Bool :=
  match one? (checked.nodes.filter fun node => decide (node.id = host)) with
  | some (.userTask ..) => true
  | some (.embeddedSubProcess ..) => timer
  | _ => false

private def checkedBindings (checked : CheckedProcess) : Bool :=
  distinct (checked.nodes.map (·.id)) && distinct (checked.sequenceFlows.map (·.id)) &&
    checked.nodeScopes.length == checked.nodes.length &&
    checked.sequenceFlowScopes.length == checked.sequenceFlows.length &&
    checked.sequenceFlows.all (fun flow => (do
      if flow.condition.isSome then none else do
      let source ← checkedOwner? checked flow.sourceId
      let target ← checkedOwner? checked flow.targetId
      let owned ← one? (checked.sequenceFlowScopes.filter fun (owner : SequenceFlowScopeOwnership) => decide (owner.sequenceFlowId = flow.id))
      if source = target ∧ source = owned.scopeId then some true else none).getD false) &&
    checked.nodes.all (fun node => match node with
      | .embeddedSubProcess id child => (do
          let scope ← one? (checked.definitionScopes.filter fun (scope : DefinitionScope) => decide (scope.id = child))
          let owner ← checkedOwner? checked id
          pure (decide (scope.originElementId = id ∧ scope.parentScopeId = some owner))).getD false
      | .messageBoundaryEvent id host _ _ output => checkedHost checked host false &&
          (checked.sequenceFlows.filter fun flow => decide (flow.sourceId = id)).map (·.id) == [output]
      | .timerBoundaryEvent id host _ _ output => checkedHost checked host true &&
          (checked.sequenceFlows.filter fun flow => decide (flow.sourceId = id)).map (·.id) == [output]
      | _ => true)

private def programOwner? (program : Program) (id : OperationId) : Option DefinitionScopeId := do
  let owner ← one? (program.operationScopes.filter fun owner => decide (owner.operationId = id))
  pure owner.scopeId

private def programInput : SemanticOperation → Option ControlPlaceId
  | .awaitUserTask _ _ input _ _ | .awaitTimer _ _ input _ _ | .awaitMessage _ _ input _ _
  | .awaitBoundedUserTask _ _ input _ _ | .awaitMonitoredUserTask _ _ input _ _
  | .awaitMessageBoundedUserTask _ _ input _ _ | .awaitMessageMonitoredUserTask _ _ input _ _
  | .duplicate _ _ input _ | .reachNoneEnd _ _ input | .terminateScope _ _ input _
  | .enterScope _ _ input _ _ | .enterBoundedScope _ _ input _ _ _
  | .enterMonitoredScope _ _ input _ _ _ => some input
  | _ => none

private def placeTarget? (program : Program) (place : ControlPlaceId) : Option VertexKey := do
  let operation ← one? (program.operations.filter fun op => decide (programInput op = some place))
  pure (.node operation.id.value)

private def completion? (program : Program) (scope : DefinitionScopeId) : Option SemanticOperation :=
  one? (program.operations.filter fun (op : SemanticOperation) => match op with | .completeScope _ _ id _ => decide (id = scope) | _ => false)

private def parentOutput? (program : Program) (scope : DefinitionScopeId) : Option ControlPlaceId := do
  let .completeScope _ _ _ (some output) ← completion? program scope | none
  pure output

private def programVertex? (program : Program) (op : SemanticOperation) : Option Vertex := do
  let owner ← programOwner? program op.id
  let (kind, outputs) ← match op with
    | .initiate _ _ output => some (.start, [output])
    | .awaitUserTask _ _ _ output _ | .awaitMessage _ _ _ output _ => some (.wait false, [output])
    | .awaitTimer _ _ _ output _ => some (.wait true, [output])
    | .awaitBoundedUserTask _ _ _ task _ | .awaitMonitoredUserTask _ _ _ task _
    | .awaitMessageBoundedUserTask _ _ _ task _ | .awaitMessageMonitoredUserTask _ _ _ task _ =>
        some (.wait false, [task.output])
    | .enterScope _ _ _ _ child | .enterBoundedScope _ _ _ _ child _ | .enterMonitoredScope _ _ _ _ child _ => do
        let output ← parentOutput? program child
        pure (.enter child, [output])
    | .duplicate _ _ _ outputs => some (.fork, outputs)
    | .reachNoneEnd .. => some (.finish, [])
    | .terminateScope .. => some (.terminate, [])
    | _ => none
  let targets ← outputs.mapM (placeTarget? program)
  pure { key := .node op.id.value, owner, kind, outputs := targets }

private def programBoundaryVertex? (program : Program) (op : SemanticOperation) : Option Vertex := do
  let owner ← programOwner? program op.id
  let (timer, repeated, output) ← match op with
    | .awaitMessageBoundedUserTask _ _ _ _ arm => some (false, false, arm.output)
    | .awaitMessageMonitoredUserTask _ _ _ _ arm => some (false, true, arm.output)
    | .awaitBoundedUserTask _ _ _ _ arm | .enterBoundedScope _ _ _ _ _ arm => some (true, false, arm.output)
    | .awaitMonitoredUserTask _ _ _ _ arm | .enterMonitoredScope _ _ _ _ _ arm => some (true, true, arm.output)
    | _ => none
  let target ← placeTarget? program output
  pure { key := .boundary op.id.value, owner, kind := .boundary (.node op.id.value) timer repeated, outputs := [target] }

private def programEntryVertex? (program : Program) (op : SemanticOperation) : Option Vertex := do
  let (child, place) ← match op with
    | .enterScope _ _ _ entry child | .enterBoundedScope _ _ _ entry child _
    | .enterMonitoredScope _ _ _ entry child _ => some (child, entry)
    | _ => none
  let target ← placeTarget? program place
  pure { key := .entry child.value, owner := child, kind := .start, outputs := [target] }

private def programProduced : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output | .awaitUserTask _ _ _ output _ | .awaitMessage _ _ _ output _
  | .awaitTimer _ _ _ output _ => [output]
  | .enterScope _ _ _ entry _ => [entry]
  | .enterBoundedScope _ _ _ entry _ arm | .enterMonitoredScope _ _ _ entry _ arm => [entry, arm.output]
  | .awaitBoundedUserTask _ _ _ task arm | .awaitMonitoredUserTask _ _ _ task arm => [task.output, arm.output]
  | .awaitMessageBoundedUserTask _ _ _ task arm | .awaitMessageMonitoredUserTask _ _ _ task arm => [task.output, arm.output]
  | .duplicate _ _ _ outputs => outputs
  | .completeScope _ _ _ output => output.toList
  | _ => []

private def programBindings (program : Program) (root : DefinitionScopeId) : Bool :=
  distinct (program.operations.map (·.id)) && distinct (program.controlPlaces.map (·.id)) &&
    program.operationScopes.length == program.operations.length &&
    program.controlPlaceScopes.length == program.controlPlaces.length &&
    program.controlPlaces.all (fun place => (do
      let owned ← one? (program.controlPlaceScopes.filter fun (owner : ControlPlaceScopeOwnership) => decide (owner.controlPlaceId = place.id))
      let consumer ← one? (program.operations.filter fun op => decide (programInput op = some place.id))
      let consumerOwner ← programOwner? program consumer.id
      pure (decide (owned.scopeId = consumerOwner) &&
        (program.operations.flatMap programProduced).count place.id == 1)).getD false) &&
    (program.operations.flatMap programProduced).all (fun place => program.controlPlaces.any (fun value => decide (value.id = place))) &&
    program.operations.all (fun op => (do
      let owner ← programOwner? program op.id
      match op with
      | .initiate .. => pure (decide (owner = root))
      | .completeScope _ origin scope output => do
          let declaration ← one? (program.definitionScopes.filter fun (value : DefinitionScope) => decide (value.id = scope))
          pure (decide (owner = scope ∧ origin.elementId = declaration.originElementId) &&
            if scope = root then output.isNone else output.isSome)
      | .terminateScope _ _ _ scope => pure (decide (owner = scope))
      | .enterScope _ origin _ _ child | .enterBoundedScope _ origin _ _ child _
      | .enterMonitoredScope _ origin _ _ child _ => do
          let declaration ← one? (program.definitionScopes.filter fun (value : DefinitionScope) => decide (value.id = child))
          pure (decide (declaration.parentScopeId = some owner ∧ declaration.originElementId = origin.elementId))
      | _ => pure true).getD false) &&
    program.definitionScopes.all (fun scope => (completion? program scope.id).isSome)

private def boundaryHost (forest : Forest) (vertex : Vertex) (host : VertexKey) (timer : Bool) : Bool :=
  match vertex? forest host with
  | none => false
  | some body => decide (body.owner = vertex.owner) &&
      match body.kind with | .wait false => true | .enter _ => timer | _ => false

private def resumed : VertexKind → Bool
  | .wait _ | .boundary .. => true
  | _ => false

private def vertexShape (forest : Forest) (vertex : Vertex) : Bool :=
  let incoming := forest.vertices.filter fun prior => prior.outputs.any (fun key => decide (key = vertex.key))
  let root := match vertex.kind with | .start | .boundary .. => true | _ => false
  forest.scopes.any (fun scope => decide (scope.id = vertex.owner)) &&
    incoming.length == (if root then 0 else 1) && distinct vertex.outputs &&
    vertex.outputs.all (fun key => ((vertex? forest key).map fun target => decide (target.owner = vertex.owner)).getD false) &&
    (match vertex.kind with
    | .fork => vertex.outputs.length ≥ 2
    | .finish => vertex.outputs.isEmpty
    | .terminate => vertex.outputs.isEmpty && incoming.all (fun prior => resumed prior.kind)
    | .boundary host timer _ => vertex.outputs.length == 1 && boundaryHost forest vertex host timer
    | .enter child => vertex.outputs.length == 1 && ((one? (forest.scopes.filter fun scope => decide (scope.id = child))).map
        (fun scope => decide (scope.parentScopeId = some vertex.owner))).getD false
    | _ => vertex.outputs.length == 1)

-- Traversal exhaustion rejects: malformed cyclic inputs never receive a successful bound.
private def descendants (forest : Forest) (allowed : Vertex → Bool) : Nat → VertexKey → Bool
  | 0, _ => false
  | fuel + 1, key => match vertex? forest key with
    | none => false
    | some vertex => allowed vertex && vertex.outputs.all (descendants forest allowed fuel)

private def handlerAllowed (forest : Forest) (vertex : Vertex) : Bool :=
  (match vertex.kind with | .wait false | .fork | .finish | .terminate => true | _ => false) &&
    !(forest.vertices.any fun boundary => match boundary.kind with
      | .boundary host _ _ => decide (host = vertex.key) | _ => false)

private def forestShape (forest : Forest) : Bool :=
  distinct (forest.vertices.map (·.key)) && forest.vertices.all (vertexShape forest) &&
    forest.scopes.all (fun scope => (scopeStart? forest scope.id).isSome &&
      (if scope.id = forest.root then (parentEntry? forest scope.id).isNone else (parentEntry? forest scope.id).isSome)) &&
    forest.vertices.all (fun vertex => descendants forest (fun _ => true) (forest.vertices.length + 1) vertex.key) &&
    forest.vertices.all (fun vertex => match vertex.kind with
      | .boundary _ _ true => vertex.outputs.all (descendants forest (handlerAllowed forest) (forest.vertices.length + 1))
      | _ => true)

private structure Burst where
  steps : Nat
  waiting : Bool

private def joinBursts (bursts : List Burst) : Burst :=
  { steps := (bursts.map (·.steps)).foldl (· + ·) 0, waiting := bursts.any (·.waiting) }

-- The fold sums every sibling. A child None Start has no IL transition; its completion does.
private def burst (forest : Forest) : Nat → VertexKey → Option Burst
  | 0, _ => none
  | fuel + 1, key => do
      let vertex ← vertex? forest key
      match vertex.kind with
      | .wait _ => pure { steps := 1, waiting := true }
      | .finish | .terminate => pure { steps := 1, waiting := false }
      | .boundary .. => none
      | .enter child => do
          let start ← scopeStart? forest child
          let childBurst ← burst forest fuel start.key
          if childBurst.waiting then pure { childBurst with steps := childBurst.steps + 1 }
          else do
            let tails ← vertex.outputs.mapM (burst forest fuel)
            let tail := joinBursts tails
            pure { tail with steps := 2 + childBurst.steps + tail.steps }
      | .start | .fork => do
          let tails ← vertex.outputs.mapM (burst forest fuel)
          let tail := joinBursts tails
          let step := if vertex.kind = .start ∧ vertex.owner ≠ forest.root then 0 else 1
          pure { tail with steps := step + tail.steps }

private def finishBurst (forest : Forest) : Nat → DefinitionScopeId → Burst → Option Burst
  | 0, _, _ => none
  | fuel + 1, scope, result => do
      if result.waiting then pure result
      else if scope = forest.root then pure { result with steps := result.steps + 1 }
      else do
        let entry ← parentEntry? forest scope
        let tails ← entry.outputs.mapM (burst forest (forest.vertices.length + 1))
        let tail := joinBursts tails
        finishBurst forest fuel entry.owner { tail with steps := result.steps + 1 + tail.steps }

private def burstWithin (forest : Forest) (owner : DefinitionScopeId) (keys : List VertexKey) : Bool :=
  (do
    let results ← keys.mapM (burst forest (forest.vertices.length + 1))
    let result ← finishBurst forest (forest.scopes.length + 1) owner (joinBursts results)
    pure (decide (result.steps ≤ 8))).getD false

private def forestBursts (forest : Forest) : Bool :=
  ((scopeStart? forest forest.root).map (fun start => burstWithin forest forest.root [start.key])).getD false &&
    forest.vertices.all (fun vertex => !resumed vertex.kind || burstWithin forest vertex.owner vertex.outputs)

def repeatableSubscriptionCheckedGraph (checked : CheckedProcess) : Bool :=
  repeatableSubscriptionCheckedShape checked.nodes checked.definitionScopes.length &&
    checked.compensation.isNone && checkedBindings checked && (do
      let root ← scopeForest checked.definitionScopes checked.processId
      let vertices ← checked.nodes.mapM (checkedVertex? checked)
      let forest := { scopes := checked.definitionScopes, root, vertices : Forest }
      pure (forestShape forest && forestBursts forest)).getD false

def repeatableSubscriptionProgramGraph (program : Program) : Bool :=
  repeatableSubscriptionProgramShape program.operations program.definitionScopes.length &&
    decide (program.internalSchedulingMode = .rejectObservableChoice) &&
    program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
    program.compensationExecution.isNone && (do
      let root ← scopeForest program.definitionScopes program.processId
      if !programBindings program root then none else do
      let ordinary ← (program.operations.filter fun (op : SemanticOperation) => match op with | .completeScope .. => false | _ => true).mapM (programVertex? program)
      let boundaries ← (program.operations.filter repeatableSubscriptionBoundaryOperation).mapM (programBoundaryVertex? program)
      let entries ← (program.operations.filter fun op => (repeatableSubscriptionChildScope? op).isSome).mapM (programEntryVertex? program)
      let forest := { scopes := program.definitionScopes, root, vertices := ordinary ++ boundaries ++ entries : Forest }
      pure (forestShape forest && forestBursts forest)).getD false

theorem repeatableSubscriptionProgramGraph_operation (program : Program)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    repeatableSubscriptionOperationAllowed operation = true := by
  simp only [repeatableSubscriptionProgramGraph, Bool.and_eq_true] at admitted
  have shape := admitted.1.1.1.1.1
  simp only [repeatableSubscriptionProgramShape, Bool.and_eq_true] at shape
  exact List.all_eq_true.mp shape.1.1.1.1.1.2 operation member

/-- The selected scope forest has one root and only direct children, as required by the
subscription proposal's depth-one admission boundary. -/
theorem repeatableSubscriptionProgramGraph_scope_forest (program : Program)
    (admitted : repeatableSubscriptionProgramGraph program = true) :
    (program.definitionScopes.map (·.id)).Nodup ∧
      ∃ root ∈ program.definitionScopes, root.parentScopeId = none ∧
      ∀ scope ∈ program.definitionScopes,
        scope.id = root.id ∨ scope.parentScopeId = some root.id := by
  simp only [repeatableSubscriptionProgramGraph, Bool.and_eq_true] at admitted
  have graph := admitted.2
  cases selected : scopeForest program.definitionScopes program.processId with
  | none => simp [selected] at graph
  | some rootId =>
      unfold scopeForest at selected
      cases rootSelected : one? (program.definitionScopes.filter fun scope => scope.parentScopeId.isNone) with
      | none => simp [rootSelected] at selected
      | some root =>
          simp only [rootSelected] at selected
          dsimp only [Bind.bind, Option.bind] at selected
          split at selected
          · contradiction
          · rename_i accepted
            simp only [Bool.not_eq_true', Bool.not_eq_false, Bool.and_eq_true] at accepted
            have fields : (program.definitionScopes.all fun scope =>
                decide (scope.id = root.id) || decide (scope.parentScopeId = some root.id)) = true := by
              exact accepted.2
            refine ⟨of_decide_eq_true accepted.1.1.2, ?_⟩
            have singleton : (program.definitionScopes.filter fun scope => scope.parentScopeId.isNone) = [root] := by
              unfold one? at rootSelected
              split at rootSelected
              · cases rootSelected; assumption
              · contradiction
            have member : root ∈ program.definitionScopes.filter fun scope => scope.parentScopeId.isNone := by
              rw [singleton]; simp
            refine ⟨root, (List.mem_filter.mp member).1, ?_, ?_⟩
            · exact Option.isNone_iff_eq_none.mp (List.mem_filter.mp member).2
            · intro scope member
              simpa only [Bool.or_eq_true, decide_eq_true_eq] using List.all_eq_true.mp fields scope member

/-- The selected one-boundary limit identifies any two admitted boundary operations;
this is an admission consequence, independent of runtime reachability or footprint choice. -/
theorem repeatableSubscriptionProgramGraph_boundary_unique (program : Program)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (left right : SemanticOperation) (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftBoundary : repeatableSubscriptionBoundaryOperation left = true)
    (rightBoundary : repeatableSubscriptionBoundaryOperation right = true) : left = right := by
  simp only [repeatableSubscriptionProgramGraph, Bool.and_eq_true] at admitted
  have shape := admitted.1.1.1.1.1
  simp only [repeatableSubscriptionProgramShape, Bool.and_eq_true] at shape
  have limit : (program.operations.filter repeatableSubscriptionBoundaryOperation).length ≤ 1 := by
    simpa only [decide_eq_true_eq] using shape.1.2
  have leftPresent := List.mem_filter.mpr ⟨leftMember, leftBoundary⟩
  have rightPresent := List.mem_filter.mpr ⟨rightMember, rightBoundary⟩
  generalize selected : program.operations.filter repeatableSubscriptionBoundaryOperation = boundaries at limit leftPresent rightPresent
  cases boundaries with
  | nil => simp at leftPresent
  | cons head tail =>
      cases tail with
      | nil => exact (List.mem_singleton.mp leftPresent).trans (List.mem_singleton.mp rightPresent).symm
      | cons next rest => simp at limit

/-- The selected one-child declaration limit applies before any runtime reachability claim. -/
theorem repeatableSubscriptionProgramGraph_child_unique (program : Program)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (left right : SemanticOperation) (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftChild : (repeatableSubscriptionChildScope? left).isSome = true)
    (rightChild : (repeatableSubscriptionChildScope? right).isSome = true) : left = right := by
  simp only [repeatableSubscriptionProgramGraph, Bool.and_eq_true] at admitted
  have shape := admitted.1.1.1.1.1
  simp only [repeatableSubscriptionProgramShape, Bool.and_eq_true] at shape
  have scopes : program.definitionScopes.length = 1 ∨ program.definitionScopes.length = 2 := by
    simpa only [Bool.or_eq_true, beq_iff_eq] using shape.1.1.1.1.1.1
  have count : (program.operations.filter (fun operation => (repeatableSubscriptionChildScope? operation).isSome)).length + 1 =
      program.definitionScopes.length := by
    simpa only [beq_iff_eq] using shape.1.1.2
  have limit : (program.operations.filter (fun operation => (repeatableSubscriptionChildScope? operation).isSome)).length ≤ 1 := by omega
  have leftPresent : left ∈ program.operations.filter (fun operation => (repeatableSubscriptionChildScope? operation).isSome) :=
    List.mem_filter.mpr ⟨leftMember, leftChild⟩
  have rightPresent : right ∈ program.operations.filter (fun operation => (repeatableSubscriptionChildScope? operation).isSome) :=
    List.mem_filter.mpr ⟨rightMember, rightChild⟩
  generalize selected : program.operations.filter (fun operation => (repeatableSubscriptionChildScope? operation).isSome) = children at limit leftPresent rightPresent
  cases children with
  | nil => simp at leftPresent
  | cons head tail =>
      cases tail with
      | nil => exact (List.mem_singleton.mp leftPresent).trans (List.mem_singleton.mp rightPresent).symm
      | cons next rest => simp at limit

end BpmnSemantics.SemanticProcess
