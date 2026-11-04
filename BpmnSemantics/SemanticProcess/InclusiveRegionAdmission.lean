module

public import BpmnSemantics.SemanticProcess.InclusiveRegionWalk
public import BpmnSemantics.SemanticProcessContract

/-! IGR-ADMIT-01 conditions 2 to 6 and IGR-BIND-01 of the [Inclusive regions proposal](../../docs/capsules/INCLUSIVE-GATEWAY-REGIONS-PROPOSAL.md#admission): what the shared nested analysis cannot see about root Inclusive regions of the nested scope-data profile. That analysis projects a split as a fork and its join as a join, so it already admits a region's structure, depth and burst; this leaf checks the kind of each paired vertex, root-only placement, the outputs and default rule, the strict cut, the Call exclusion and, over a Program, every branch's expected join input. `NestedScopeControl` consumes it in hidden bodies only, through a private import; the TypeScript twin is `inclusive-region-admission.ts`. -/

public section

namespace BpmnSemantics.SemanticProcess.InclusiveRegion

/-- Condition 4, the strict cut: every path from the edge reaches a User Task, Service Task or Sub-Process first. -/
def arms (graph : Graph) : Nat → Edge → Bool
  | 0, _ => false
  | fuel + 1, edge =>
      match graph.vertex? edge.target with
      | none => false
      | some vertex =>
          match vertex.kind with
          | .work => true
          | .pass =>
              match vertex.outputs with
              | [next] => arms graph fuel next
              | _ => false
          | .fork | .split => vertex.outputs.all (arms graph fuel)
          | _ => false

/-- Condition 3: two or more distinct outputs, at most one default, and a selection that is never empty and reaches its default. -/
private def guardsAdmitted (outputs : List Edge) : Bool :=
  let defaults := (outputs.filter (·.guard == .default)).length
  let always := outputs.any (·.guard == .always)
  2 ≤ outputs.length && (outputs.map (·.id)).eraseDups.length == outputs.length && defaults ≤ 1 &&
    (if defaults == 1 then !always else always)

/-- Conditions 2 to 5 over one projected graph, and condition 6 when `program` asks for the expected join inputs. A terminal fork pairs with no join; a fork that does pairs with a Parallel join. -/
private def regionsAdmitted (graph : Graph) (program : Bool) : Bool :=
  let fuel := walkFuel graph
  let splits := graph.vertices.filter (·.kind == .split)
  if splits.isEmpty && !graph.vertices.any (·.kind == .inclusiveJoin) then true
  else
    let paired := splits.filterMap (pairedJoin graph)
    splits.all (fun split =>
      match pairedJoin graph split with
      | some join =>
          split.scope == graph.root && join.kind == .inclusiveJoin && join.pairing == some split.id &&
            guardsAdmitted split.outputs && split.outputs.all (arms graph fuel) &&
            (!program || split.outputs.all fun output =>
              output.expectedJoinInput == (branchEnd graph fuel output).map (·.id))
      | none => false) &&
      graph.vertices.all fun vertex =>
        (vertex.kind != .fork || (pairedJoin graph vertex).all (·.kind != .inclusiveJoin)) &&
          (vertex.kind != .inclusiveJoin || paired.any (·.id == vertex.id)) && vertex.kind != .call

private def programVertexKind : SemanticOperation → VertexKind
  | .initiate .. => .start
  | .awaitUserTask .. | .awaitEffect .. | .enterScope .. => .work
  | .mergeExclusive _ _ inputs _ => if inputs.length == 1 then .pass else .other
  | .duplicate .. => .fork
  | .synchronize .. => .join
  | .selectMany .. => .split
  | .synchronizeSelected .. => .inclusiveJoin
  | .reachNoneEnd .. => .finish
  | .invokeProcess .. => .call
  | _ => .other

private def programInputs : SemanticOperation → List ControlPlaceId
  | .initiate .. => []
  | .awaitUserTask _ _ input .. | .awaitEffect _ _ input .. | .enterScope _ _ input .. | .duplicate _ _ input _
  | .selectMany _ _ input .. | .reachNoneEnd _ _ input | .invokeProcess _ _ input .. => [input]
  | .synchronize _ _ inputs _ | .synchronizeSelected _ _ inputs _ _ | .mergeExclusive _ _ inputs _ => inputs
  | _ => []

private def alwaysTrue : SimpleBooleanExpression → Bool
  | .literal true => true
  | _ => false

/-- The Program's own control places as a region graph; a Sub-Process continues at its completion's parent output, and a join names the one split operation carrying its selection key. -/
private def programGraph (program : Program) : Graph :=
  let root := ((program.definitionScopes.find? fun scope =>
    scope.parentScopeId.isNone && scope.originElementId.value == program.processId.value).map (·.id.value)).getD ""
  let operations := program.operations.filter fun
    | .completeScope .. | .returnProcess .. => false
    | _ => true
  let consumer := fun (place : ControlPlaceId) =>
    match operations.filter (fun operation => (programInputs operation).contains place) with
    | [operation] => operation.id.value
    | _ => ""
  let edge := fun (place : ControlPlaceId) (guard : Guard) (expected : Option ControlPlaceId) =>
    ({ id := place.value, target := consumer place, guard, expectedJoinInput := expected.map (·.value) } : Edge)
  let parentOutput := fun (child : DefinitionScopeId) =>
    match program.operations.filter (fun | .completeScope _ _ scopeId _ => scopeId == child | _ => false) with
    | [.completeScope _ _ _ (some output)] => [edge output .conditioned none]
    | _ => []
  let splitOf := fun (key : String) =>
    match operations.filter (fun | .selectMany _ _ _ _ _ selectionKey => selectionKey == key | _ => false) with
    | [operation] => operation.id.value
    | _ => ""
  { root
    vertices := operations.map fun operation =>
      { id := operation.id.value
        kind := programVertexKind operation
        scope := ((program.operationScopes.find? (·.operationId == operation.id)).map (·.scopeId.value)).getD ""
        inputs := (programInputs operation).map (·.value)
        outputs := match operation with
          | .selectMany _ _ _ candidates defaultBranch _ =>
              candidates.map (fun candidate => edge candidate.output
                (if alwaysTrue candidate.condition then .always else .conditioned) (some candidate.expectedJoinInput)) ++
              defaultBranch.toList.map fun branch => edge branch.output .default (some branch.expectedJoinInput)
          | .duplicate _ _ _ outputs => outputs.map (edge · .conditioned none)
          | .enterScope _ _ _ _ child => parentOutput child
          | .initiate _ _ output | .awaitUserTask _ _ _ output _ | .awaitEffect _ _ _ output _ _
          | .synchronize _ _ _ output | .synchronizeSelected _ _ _ output _ | .mergeExclusive _ _ _ output =>
              [edge output .conditioned none]
          | _ => []
        pairing := match operation with
          | .synchronizeSelected _ _ _ _ key => some (splitOf key)
          | _ => none } }

/-- IGR-ADMIT-01 over the checked graph. -/
def checkedRegionsAdmitted (source : CheckedProcess) : Bool :=
  regionsAdmitted (checkedGraph source) false

/-- IGR-ADMIT-01 and IGR-BIND-01 over the Program, independent of the checked graph. -/
def programRegionsAdmitted (program : Program) : Bool :=
  regionsAdmitted (programGraph program) true

end BpmnSemantics.SemanticProcess.InclusiveRegion
