module

public import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
import BpmnSemantics.SemanticProcess.ClosureLimit

/-! # Scope-data burst

SRE-BURST-01 and PTT-BURST-01 for `nestedScopeDataProfileId`: the longest automatic burst of a scope-data model, from
Start or from any wait's resumption, per the [scope re-entry specification](../../docs/capsules/SCOPE-REENTRY-SPEC.md#capacity)
and the [pass-through Task proposal](../../docs/capsules/PASS-THROUGH-TASK-PROPOSAL.md). The re-entry account applies it
to every root graph; the serial route applies it only to a model holding a pass-through Task, so serial models without
one keep their admission. Transcribed independently by the TypeScript `scopeDataMaximumBurst`.
-/

public section

namespace BpmnSemantics.SemanticProcess.ScopeDataBurst

open BpmnSemantics
open NestedScopeData

/-- The automatic steps from `id` along one body's serial path, with whether a wait armed: arming a wait costs
one and stops; a body's or called Process's Start is no operation and costs nothing; a pass-through Task costs one and
continues; its End costs two, its own step and its scope's completion or the called Process's return; an enclosed
Sub-Process or Call costs its entry plus its own body. `none` refuses, which the serial walk's admission of every
body precludes. -/
private def bodySteps (vertices : List Vertex) : Nat → String → String → Option (Nat × Bool)
  | 0, _, _ => none
  | fuel + 1, scope, id => do
      let v ← vertices.find? (·.id == id)
      if v.scope != scope then none else do
      let here ← match v.kind with
        | .human | .service => some (1, true)
        | .start => some (0, false)
        | .passThrough => some (1, false)
        | .finish => some (2, false)
        | .subProcess child entry _ | .call child entry .. => do
            let (cost, stops) ← bodySteps vertices fuel child entry
            some (1 + cost, stops)
      if here.2 then some here else
      match v.outputs with
      | [] => some here
      | [next] => do
          let (cost, stops) ← bodySteps vertices fuel scope next
          some (here.1 + cost, stops)
      | _ => none

/-- A root vertex's successors: a Choice's or Merge's from its joint, every other vertex's its own. -/
def jointOutputs (vertices : List Vertex) (joints : List (String × List String)) (id : String) : List String :=
  match joints.find? (·.1 == id) with
  | some joint => joint.2
  | none => ((vertices.find? (·.id == id)).map (·.outputs)).getD []

/-- Entering one root vertex: a root Start costs one, its End two and stops the Process, a Choice, Merge or
pass-through Task one. -/
private def rootEntry (vertices : List Vertex) (joints : List (String × List String)) (id : String) :
    Option (Nat × Bool) :=
  if joints.any (·.1 == id) then some (1, false) else do
  let v ← vertices.find? (·.id == id)
  match v.kind with
  | .human | .service => some (1, true)
  | .start | .passThrough => some (1, false)
  | .finish => some (2, true)
  | .subProcess child entry _ | .call child entry .. => do
      let (cost, stops) ← bodySteps vertices (2 * vertices.length + 1) child entry
      some (1 + cost, stops)

/-- The longest automatic burst from entering root vertex `id`. Every root step costs at least one, so `fuel`
of `scenarioClosureLimit + 1` root steps refuses exactly the bursts above the limit, an automatic cycle among
them. -/
private def rootSteps (vertices : List Vertex) (joints : List (String × List String)) : Nat → String → Option Nat
  | 0, _ => none
  | fuel + 1, id => do
      let (cost, stops) ← rootEntry vertices joints id
      if stops then some cost else do
      let rests ← (jointOutputs vertices joints id).mapM (rootSteps vertices joints fuel)
      some (cost + rests.foldl max 0)

/-- The steps after vertex `v` completes: the rest of its body, then each enclosing owner's continuation; each
recursion moves to an enclosing scope, so the vertex count bounds `fuel`. -/
private def stepsAfter (vertices : List Vertex) (joints : List (String × List String)) (root : String) :
    Nat → Vertex → Option Nat
  | 0, _ => none
  | fuel + 1, v =>
      if v.scope == root then do
        let rests ← v.outputs.mapM (rootSteps vertices joints (scenarioClosureLimit + 1))
        some (rests.foldl max 0)
      else do
        let (cost, stops) ← match v.outputs with
          | [next] => bodySteps vertices (2 * vertices.length + 1) v.scope next
          | _ => none
        if stops then some cost else do
        let owners := vertices.filter fun owner => match owner.kind with
          | .subProcess child .. | .call child .. => child == v.scope
          | _ => false
        if owners.isEmpty then none else do
        let continued ← owners.mapM (stepsAfter vertices joints root fuel)
        some (cost + continued.foldl max 0)

/-- SRE-BURST-01: the longest burst from Start or from any wait's resumption, `none` above the limit. -/
def scopeDataBurst? (vertices : List Vertex) (joints : List (String × List String)) (root entry : String) :
    Option Nat := do
  let fromStart ← rootSteps vertices joints (scenarioClosureLimit + 1) entry
  let resumed ← (vertices.filter fun v => match v.kind with
    | .human | .service => true
    | _ => false).mapM (stepsAfter vertices joints root (vertices.length + 1))
  let burst := resumed.foldl max fromStart
  if burst ≤ scenarioClosureLimit then some burst else none

/-- PTT-BURST-01 over serial vertices: a model holding a pass-through Task is admitted only within the limit. -/
private def serialBurstAdmitted (vertices : List Vertex) (root entry : String) : Bool :=
  !vertices.any (·.kind == .passThrough) || (scopeDataBurst? vertices [] root entry).isSome

/-- PTT-BURST-01 over a serial Program; a Program the serial envelope or projection refuses passes here, since its
analysis refuses it anyway. -/
def programSerialBurstAdmitted (program : Program) : Bool :=
  match programEnvelope? program with
  | none => true
  | some (root, start, operations) =>
      match operations.mapM (operationVertex? program) with
      | none => true
      | some vertices => serialBurstAdmitted vertices root.value start.value

/-- PTT-BURST-01 over a serial checked graph, independent of the Program. -/
def checkedSerialBurstAdmitted (source : CheckedProcess) : Bool :=
  match checkedEnvelope? source with
  | none => true
  | some (root, entry) =>
      match source.nodes.mapM (checkedVertex? source) with
      | none => true
      | some vertices => serialBurstAdmitted vertices root.value entry.value

end BpmnSemantics.SemanticProcess.ScopeDataBurst
