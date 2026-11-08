module

public import Kernel.Hooks

/-! # Data: in-kernel expression evaluation

The kernel evaluates only the [Simple Boolean subset](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) and plain
variable references; every other expression is answered by the profile's host evaluator. Variables are looked up
innermost scope first.
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

def evaluate (variables : List (String × Value)) : Expression → Evaluation
  | .literal value => .value value
  | .simpleBoolean body => .value (.bool (simpleBoolean variables body))
  | .variable name =>
    match lookup variables name with
    | some value => .value value
    | none => .failure "unknown-variable"
  | .foreign _ _ => .needsHost

end Kernel.Feature.Data
