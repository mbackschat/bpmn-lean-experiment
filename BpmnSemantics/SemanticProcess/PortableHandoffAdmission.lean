module

public import BpmnSemantics.SemanticProcess.ValueDomain

/-! # Portable handoff profile admission

Source shape, Program shape and Start admission for `portableHandoffProfileId`, per the
[serial-handoff amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#source-type-and-port-contract).
The admitted graph is the structured-composition graph restricted to Start → first → second → End:
two composed User Tasks whose Property associations carry one value through three distinct
Properties. Both source and Program sides project onto the structured-composition vertices, so one
role check serves both; business identifiers never select behavior.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open StructuredComposition

/-- The first task's source Property when the four vertices form the serial handoff: the first task
reads `pIn` and writes `pMid`, the second reads `pMid` and writes `pOut`, and the three Properties are
distinct, so the second task always reads the value the first one wrote. -/
def serialHandoffChain (start first second finish : Vertex) : Option String :=
  match first.reads, first.writes, second.reads, second.writes with
  | some pIn, some pMid, some secondSource, some pOut =>
      if start.outputs == [first.id] && first.outputs == [second.id] &&
          second.outputs == [finish.id] && finish.outputs.isEmpty && pMid == secondSource &&
          pIn != pMid && pIn != pOut && pMid != pOut then
        some pIn
      else none
  | _, _, _, _ => none

/-- Vertex order is declaration order, which carries no meaning; either task may be listed first. -/
def serialHandoffInput? (vertices : List Vertex) : Option String :=
  match vertices.filter (·.kind == .start), vertices.filter (·.kind == .task),
      vertices.filter (·.kind == .finish) with
  | [start], [left, right], [finish] =>
      if vertices.length == 4 then
        serialHandoffChain start left right finish <|> serialHandoffChain start right left finish
      else none
  | _, _, _ => none

def portableHandoffCheckedGraph (source : CheckedProcess) : Bool :=
  structuredCompositionCheckedGraph source &&
    ((source.nodes.mapM (checkedVertex? source)).bind serialHandoffInput?).isSome

/-- The Program's Start Property, or `none` unless its operations other than the root completion form
the serial handoff. -/
def portableHandoffProgramInput? (program : Program) : Option String := do
  let vertices ← (program.operations.filter fun operation => !isScopeCompletion operation).mapM
    (operationVertex? program)
  serialHandoffInput? vertices

def portableHandoffProgramGraph (program : Program) : Bool :=
  structuredCompositionProgramGraph program && (portableHandoffProgramInput? program).isSome

/-- Start supplies exactly the first task's source Property; any other binding set refuses, so the
handoff never starts from unrelated or missing data. -/
def portableHandoffStartBindingsAdmitted (program : Program) (bindings : List VariableBinding) :
    Bool :=
  portableHandoffProgramGraph program &&
    match portableHandoffProgramInput? program, bindings with
    | some input, [binding] =>
        binding.name == input &&
          processDataBindingsAdmitted program.identity.semanticProfile .processStart bindings
    | _, _ => false

def portableHandoffScenarioStartAdmitted (program : Program) (stimuli : List Stimulus) : Bool :=
  if program.identity.semanticProfile != portableHandoffProfileId then true
  else match stimuli with
    | .startProcess _ _ _ bindings :: _ => portableHandoffStartBindingsAdmitted program bindings
    | _ => false

end BpmnSemantics.SemanticProcess
