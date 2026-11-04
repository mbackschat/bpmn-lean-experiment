module

public import BpmnSemantics.CheckedProcessContract

/-! The region walk of IGR-BIND-01 in the [Inclusive regions specification](../../docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#representation-and-runtime-ownership): from one branch edge, a serial vertex passes to its sole output, a nested Parallel or Inclusive split passes to its paired join's output, and the walk stops at the edge into the first join it meets. Lowering derives each branch's expected join input with it over the checked graph, and the region admission runs it over checked graphs and Programs alike. The TypeScript twin is `inclusive-region-admission.ts`. -/

public section

namespace BpmnSemantics.SemanticProcess.InclusiveRegion

inductive VertexKind where
  | start | work | pass | fork | join | split | inclusiveJoin | finish | call | other
  deriving DecidableEq, BEq, Repr

/-- How a split output is gated: by a condition that can be false, always (absent or literal `true`), or as default. -/
inductive Guard where
  | conditioned | always | default
  deriving DecidableEq, BEq, Repr

/-- One Sequence Flow or control place; `expectedJoinInput` is the Program's recorded value on a split output. -/
structure Edge where
  id : String
  target : String
  guard : Guard := .conditioned
  expectedJoinInput : Option String := none
  deriving DecidableEq, BEq, Repr

/-- `pairing` is the split a join names: its `pairedGatewayId`, or the split operation carrying its selection key. -/
structure Vertex where
  id : String
  kind : VertexKind
  scope : String
  outputs : List Edge
  inputs : List String
  pairing : Option String := none
  deriving DecidableEq, BEq, Repr

structure Graph where
  root : String
  vertices : List Vertex
  deriving Repr

def Graph.vertex? (graph : Graph) (id : String) : Option Vertex :=
  graph.vertices.find? (·.id == id)

/-- The join every branch end names, when all ends exist, share one target, are distinct and are exactly its inputs. -/
private def joinOf (graph : Graph) (ends : List (Option Edge)) : Option Vertex :=
  match ends.head? with
  | some (some first) =>
      match graph.vertex? first.target with
      | some join =>
          let ids := ends.filterMap (·.map (·.id))
          if ends.all (fun item => item.any (·.target == first.target)) &&
              ids.eraseDups.length == ends.length && join.inputs.length == ends.length &&
              ids.all join.inputs.contains then some join else none
      | none => none
  | _ => none

/-- The walk with explicit fuel; `none` when the branch ends, forks unevenly or leaves the structured form. -/
def branchEnd (graph : Graph) : Nat → Edge → Option Edge
  | 0, _ => none
  | fuel + 1, edge =>
      match graph.vertex? edge.target with
      | none => none
      | some vertex =>
          match vertex.kind with
          | .work | .pass | .call =>
              match vertex.outputs with
              | [next] => branchEnd graph fuel next
              | _ => none
          | .fork | .split =>
              match joinOf graph (vertex.outputs.map fun output => branchEnd graph fuel output) with
              | some join =>
                  match join.outputs with
                  | [next] => branchEnd graph fuel next
                  | _ => none
              | none => none
          | .join | .inclusiveJoin => some edge
          | _ => none

def walkFuel (graph : Graph) : Nat := graph.vertices.length + 1

/-- The join a fork or split pairs with by the walk. -/
def pairedJoin (graph : Graph) (vertex : Vertex) : Option Vertex :=
  joinOf graph (vertex.outputs.map (branchEnd graph (walkFuel graph)))

private def checkedVertexKind : CheckedNode → VertexKind
  | .noneStartEvent _ => .start
  | .userTask .. | .serviceTask .. | .embeddedSubProcess .. => .work
  | .nonOperationalTask .. | .noneIntermediateThrowEvent _ => .pass
  | .parallelGateway _ .diverging => .fork
  | .parallelGateway _ .converging => .join
  | .inclusiveGatewayDiverging .. => .split
  | .inclusiveGatewayConverging .. => .inclusiveJoin
  | .noneEndEvent _ => .finish
  | .callActivity .. => .call
  | _ => .other

/-- The checked graph as a region graph. An absent condition and the literal `true` are both always true (CIB-INT-0005), so both levels classify a guard alike: the Program lowers an absent condition to that literal, and Simple Boolean v1 parses exactly the body `true` to it. With a called Process the graph holds a Call, which the admission refuses beside a split, so the one parentless scope is the root. -/
def checkedGraph (source : CheckedProcess) : Graph :=
  let root := match source.definitionScopes.filter (·.parentScopeId.isNone) with
    | [scope] => scope.id.value
    | _ => ""
  { root
    vertices := source.nodes.map fun node =>
      let defaultFlow : Option SequenceFlowId := match node with
        | .inclusiveGatewayDiverging _ _ defaultFlowId => defaultFlowId
        | _ => none
      let guard (flow : CheckedSequenceFlow) : Guard :=
        if defaultFlow == some flow.id then .default
        else if flow.condition.all (·.body == "true") then .always
        else .conditioned
      { id := node.id.value
        kind := checkedVertexKind node
        scope := ((source.nodeScopes.find? (·.nodeId == node.id)).map (·.scopeId.value)).getD ""
        outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map fun flow =>
          { id := flow.id.value, target := flow.targetId.value, guard := guard flow }
        inputs := (source.sequenceFlows.filter (·.targetId == node.id)).map (·.id.value)
        pairing := match node with
          | .inclusiveGatewayConverging _ paired => some paired.value
          | _ => none } }

/-- IGR-BIND-01 over the checked graph: the input flow of the paired join that the branch from `flowId` reaches. -/
def checkedBranchJoinInput? (source : CheckedProcess) (flowId : SequenceFlowId) : Option SequenceFlowId :=
  let graph := checkedGraph source
  (source.sequenceFlows.find? (·.id == flowId)).bind fun flow =>
    (branchEnd graph (walkFuel graph) { id := flow.id.value, target := flow.targetId.value }).map
      fun edge => ⟨edge.id⟩

end BpmnSemantics.SemanticProcess.InclusiveRegion
