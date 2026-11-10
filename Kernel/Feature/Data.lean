module

public import Kernel.Hooks
public import Kernel.Feature.Data.Juel

/-! # Data: expression evaluation and variable writes

The kernel evaluates the [Simple Boolean subset](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md), plain variable
references and, under `Evaluator.juel`, the Core JUEL level (`Kernel.Feature.Data.Juel`); admission refuses every other
expression. Variables are looked up innermost scope first. This
feature is the only writer of variables (guard 17): writes reach it through the completion pipeline and `Signal.write`.
-/

public section

namespace Kernel.Feature.Data

def lookup (variables : List (String × Value)) (name : String) : Option Value :=
  (variables.find? (·.1 == name)).map (·.2)

/-- Decision table: presence includes an explicit null; `stringEquals` is false for absence and null. -/
def simpleBoolean (variables : List (String × Value)) : SimpleBoolean → Bool
  | .literal value => value
  | .isPresent name => (lookup variables name).isSome
  | .isNull name =>
    match lookup variables name with
    | some .null => true
    | _ => false
  | .stringEquals name expected =>
    match lookup variables name with
    | some (.string actual) => actual == expected
    | _ => false

def evaluate (context : EvalContext) : Expression → Evaluation
  | .literal value => .value value
  | .simpleBoolean body => .value (.bool (simpleBoolean context.variables body))
  | .variable name =>
    match lookup context.variables name with
    | some value => .value value
    | none => .failure "unknown-variable"
  | .juel nodes => Juel.evaluateJuel context nodes
  -- Admission refuses it (`expression.outsideSimpleBoolean`, `mapping.expression`, `flow.condition.foreign`), so it is
  -- `unsupported` like every refused shape (guard 20).
  | .foreign _ _ => .unsupported "expression.outsideSimpleBoolean"

/-- One write seen from `scope`. Outward, a name no scope binds goes to the instance root when the instance's process
declares it, since a target is a declared item ([BPMN 2.0.2 §10.4.1](../../docs/reference/bpmn-2.0.2/README.md)); any
other name is the profile's choice: refused, or created at the instance root as CIB does (`UndeclaredWrite`,
`AbstractVariableScope.setVariable`). -/
def write (ctx : Ctx) (rule : WriteRule) (scope : ScopeOccurrenceId) (state : State) (binding : String × Value) :
    Outcome :=
  let (name, value) := binding
  match rule with
  | .own => .ok (state.setVariable scope name value)
  | .outward =>
    match state.owner? scope name with
    | some owner => .ok (state.setVariable owner name value)
    | none =>
      let root := state.instanceRoot scope
      let definition := (state.slots.instances.find? (·.root == root)).bind (·.definition)
      if ctx.program.declares definition name then .ok (state.setVariable root name value)
      else
        match ctx.program.options.undeclaredWrite with
        | .refused => .error (.semanticFailure "undeclared-write")
        | .atInstanceRoot => .ok (state.setVariable root name value)

/-- `Hooks.writeOutputs`: apply writes from a scope occurrence, under the writing feature's rule. -/
def writeOutputs (ctx : Ctx) (scope : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule) (state : State) :
    Outcome :=
  writes.foldlM (write ctx rule scope) state

/-- `Hooks.removeVariables`: delete each name from the innermost scope that declares it; an undeclared name is nothing
to delete. -/
def removeVariables (_ : Ctx) (scope : ScopeOccurrenceId) (names : List String) (state : State) : Outcome :=
  .ok <| names.foldl (fun state name =>
    match state.owner? scope name with
    | some owner => state.removeVariable owner name
    | none => state) state

end Kernel.Feature.Data
