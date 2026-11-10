module

public import Kernel.IL.Types

/-! # Admission of data: expressions, mappings, conditions, element origins and the shared envelope. A refusal
carries a stable code.

Under `Evaluator.simpleBoolean` every expression the kernel reads is Simple Boolean, a literal or a variable read
([decision](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)); under `Evaluator.juel` a condition or a CIB mapping may
also be a JUEL node table at the Core level
([expression semantics](../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#admission-at-core)).
-/

public section

namespace Kernel.Admission.Data

/-- A digits-only lexeme within `Long.valueOf`'s range (`Parser.java:140`). -/
def integerLexeme? (digits : String) : Option Nat :=
  if digits.isEmpty || !digits.all Char.isDigit then none
  else
    let value := digits.foldl (fun acc char => acc * 10 + (char.toNat - '0'.toNat)) 0
    if value ≤ 9223372036854775807 then some value else none

/-- A name CIB resolves before any variable, or holds only inside a Multi-Instance instance: the engine objects of
`VariableScopeElResolver.java:51-90` and the loop counters the Multi-Instance level (M5) puts in context. -/
def juelName (name : String) : Option String :=
  if ["execution", "task", "caseExecution", "externalTask", "authenticatedUserId"].contains name then
    some "expression.juel.engineContext"
  else if ["loopCounter", "nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"].contains name then
    some "expression.juel.multiInstanceCounter"
  else none

/-- A method call outside the closed list, by name or by argument count. -/
def juelCall (target : JuelCall) (count : Nat) : Option String :=
  match target with
  | .listed method => if method.admits count then none else some "expression.juel.method"
  | .other _ => some "expression.juel.method"

/-- A function call is refused whole once its arguments are well formed; the Events level admits `now()` and
`dateTime()` by their qualified name. -/
def juelFunction (earlier : List Nat → Option String) : JuelFunctionNode → Option String
  | { qualifier := _, name := _, args } => earlier args <|> some "expression.juel.function"

/-- Node `position`'s refusal; a child must be an earlier node. -/
def juelNode (position : Nat) (node : JuelNode) : Option String :=
  let earlier (children : List Nat) : Option String :=
    if children.all (· < position) then none else some "expression.juel.malformed"
  match node with
  | .text _ => none
  | .null => none
  | .bool _ => none
  | .stringLiteral _ => none
  | .identifier name => juelName name
  | .integer digits => if (integerLexeme? digits).isSome then none else some "expression.juel.malformed"
  | .float _ => some "expression.juel.floatLiteral"
  | .function payload => juelFunction earlier payload
  | .composite parts => earlier parts
  | .dot base _ => earlier [base]
  | .bracket base property => earlier [base, property]
  | .call payload => earlier (payload.receiver :: payload.args) <|> juelCall payload.target payload.args.length
  | .computedCall payload =>
    earlier (payload.receiver :: payload.name :: payload.args) <|> some "expression.juel.computedMethod"
  | .unary _ operand => earlier [operand]
  | .binary payload =>
    earlier [payload.left, payload.right] <|> if payload.op == .div then some "expression.juel.division" else none
  | .choice payload => earlier [payload.condition, payload.whenTrue, payload.whenFalse]

/-- The first node a Core JUEL table refuses, in node order. -/
def juelNodes (nodes : List JuelNode) : Option String :=
  if nodes.isEmpty then some "expression.juel.malformed"
  else (nodes.zipIdx.findSome? fun (node, position) => juelNode position node)

/-- A mapping's source. Under `Evaluator.juel` a CIB mapping (`ioParameter`, `callVariable`) may be JUEL, and an
unreadable one is the reader's `foreign`; a Data Association never carries JUEL at Core. -/
def mapping (evaluator : Evaluator) (entry : Mapping) : Option String :=
  let cib := entry.dialect != .dataAssociation
  match entry.source with
  | .foreign _ _ => if evaluator == .juel && cib then some "expression.juel.syntax" else some "mapping.expression"
  | .juel nodes =>
    if evaluator == .simpleBoolean then some "mapping.expression"
    else if cib then juelNodes nodes else some "expression.juel.site"
  | .simpleBoolean _ => if evaluator == .juel then some "expression.outsideJuel" else none
  | .literal _ => none
  | .variable name => if evaluator == .juel then juelName name else none

def mappings (evaluator : Evaluator) (list : List Mapping) : Option String :=
  list.findSome? (mapping evaluator)

/-- An Activity's default flow is read by `Kernel.Feature.Flow.ownFlows` (PC-CF-07). The asynchronous continuations are
admitted: `Kernel.Step` reads them as transaction boundaries (CIB-EXT-0027). -/
def envelope (evaluator : Evaluator) (fields : Envelope) : Option String :=
  mappings evaluator fields.inputs <|> mappings evaluator fields.outputs

/-- A Sequence Flow condition is read by the profile's evaluator: Simple Boolean, or under `Evaluator.juel` a JUEL
table or a plain variable read (CIB-EXT-0030). A literal or `foreign` condition is refused under both. -/
def flowCondition (evaluator : Evaluator) (flow : Flow) : Option String :=
  match flow.condition with
  | none => none
  | some (.simpleBoolean _) => if evaluator == .juel then some "expression.outsideJuel" else none
  | some (.juel nodes) => if evaluator == .juel then juelNodes nodes else some "flow.condition.foreign"
  | some (.variable name) => if evaluator == .juel then juelName name else some "flow.condition.foreign"
  | some (.literal _) => some "flow.condition.foreign"
  | some (.foreign _ _) => some "flow.condition.foreign"

/-- `origin.sourceId` is what publication shows, so a program whose `Header.id` differs would publish another name;
no program binds an element to a definition until PC-SCOPE-03. -/
def origin (header : Header) : Option String :=
  if header.origin.sourceId != header.id.value then some "element.origin.sourceId"
  else if header.origin.definition.isSome then some "element.origin.definition"
  else none

end Kernel.Admission.Data
