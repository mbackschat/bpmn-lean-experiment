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

/-- What an expression's site lets it read. `counters`: the Multi-Instance counter names are variables there, inside an
instance under `MultiInstanceCounters.cibLocals` (CIB-INT-0018); `hidden`: instance names the site may not read, which
`Kernel.Admission.MultiInstance.ownInputNames` lists for a Multi-Instance Activity's own input mappings. -/
structure Site where
  counters : Bool := false
  hidden : List String := []

/-- A name CIB resolves before any variable, or holds only inside a Multi-Instance instance or a decision task: the
engine objects of `VariableScopeElResolver.java:51-90`, the loop counters, which a site inside an instance admits, and
a decision task's `decisionResult`. -/
def juelName (site : Site) (name : String) : Option String :=
  if site.hidden.contains name then some "multiInstance.ownInputReadsInstance"
  else if ["execution", "task", "caseExecution", "externalTask", "authenticatedUserId"].contains name then
    some "expression.juel.engineContext"
  else if !site.counters && multiInstanceCounterNames.contains name then
    some "expression.juel.multiInstanceCounter"
  -- CIB binds it only as a transient local of a decision task's execution (`DecisionEvaluationUtil.java:82`), which
  -- the kernel does not carry; admission sees no expression's site owner, so the read is refused wherever it stands.
  else if name == "decisionResult" then some "expression.juel.decisionResult"
  else none

/-- A method call outside the closed list, by name or by argument count. -/
def juelCall (target : JuelCall) (count : Nat) : Option String :=
  match target with
  | .listed method => if method.admits count then none else some "expression.juel.method"
  | .other _ => some "expression.juel.method"

/-- Division yields a Double over Integers (EL §1.7.2), outside the portable domain; every other operator is admitted. -/
def juelOperator : JuelBinary → Option String
  | .div => some "expression.juel.division"
  | .or => none
  | .and => none
  | .eq => none
  | .ne => none
  | .lt => none
  | .gt => none
  | .le => none
  | .ge => none
  | .add => none
  | .sub => none
  | .mul => none
  | .mod => none

/-- A function call is refused whole once its arguments are well formed at every JUEL level, so a date-valued Timer
expression (`now()`, `dateTime()`) is refused (CIB-INT-0023's boundary). -/
def juelFunction (earlier : List Nat → Option String) : JuelFunctionNode → Option String
  | { qualifier := _, name := _, args } => earlier args <|> some "expression.juel.function"

/-- Node `position`'s refusal; a child must be an earlier node. -/
def juelNode (site : Site) (position : Nat) (node : JuelNode) : Option String :=
  let earlier (children : List Nat) : Option String :=
    if children.all (· < position) then none else some "expression.juel.malformed"
  match node with
  | .text _ => none
  | .null => none
  | .bool _ => none
  | .stringLiteral _ => none
  | .identifier name => juelName site name
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
    earlier [payload.left, payload.right] <|> juelOperator payload.op
  | .choice payload => earlier [payload.condition, payload.whenTrue, payload.whenFalse]

/-- The first node a Core JUEL table refuses at `site`, in node order. -/
def juelNodes (nodes : List JuelNode) (site : Site := {}) : Option String :=
  if nodes.isEmpty then some "expression.juel.malformed"
  else (nodes.zipIdx.findSome? fun (node, position) => juelNode site position node)

/-- The language the reader gives a JUEL text outside the pinned grammar (`kernel-reader/data.ts`). -/
def juelLanguage : String := "urn:cibseven:expression-language:juel"

/-- A Multi-Instance loop expression under `Evaluator.juel`: JUEL, a variable read or text
([Multi-Instance level](../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#multi-instance-level)). CIB reads no
declared language there (`BpmnParse.java:1824-1838`), so a declared one is refused; `counters` admits the counter
names, which only the completion condition reads. -/
def loopExpression (counters : Bool) : Expression → Option String
  | .juel nodes => juelNodes nodes { counters }
  | .variable name => juelName { counters } name
  | .literal _ => none
  | .simpleBoolean _ => some "expression.outsideJuel"
  | .foreign language _ => if language == juelLanguage then some "expression.juel.syntax" else some "multiInstance.expressionLanguage"

/-- A mapping's source at `site`. Under `Evaluator.juel` a CIB mapping (`ioParameter`, `callVariable`) may be JUEL, and
an unreadable one is the reader's `foreign`; a Data Association never carries JUEL at Core. -/
def mapping (evaluator : Evaluator) (site : Site) (entry : Mapping) : Option String :=
  let cib := entry.dialect != .dataAssociation
  match entry.source with
  | .foreign _ _ => if evaluator == .juel && cib then some "expression.juel.syntax" else some "mapping.expression"
  | .juel nodes =>
    if evaluator == .simpleBoolean then some "mapping.expression"
    else if cib then juelNodes nodes site else some "expression.juel.site"
  | .simpleBoolean _ => if evaluator == .juel then some "expression.outsideJuel" else none
  | .literal _ => none
  | .variable name => if evaluator == .juel then juelName site name else none

def mappings (evaluator : Evaluator) (site : Site) (list : List Mapping) : Option String :=
  list.findSome? (mapping evaluator site)

/-- An Activity's default flow is read by `Kernel.Feature.Flow.ownFlows` (PC-CF-07). The asynchronous continuations are
admitted: `Kernel.Step` reads them as transaction boundaries (CIB-EXT-0027). The inputs and the outputs each have
their site. -/
def envelope (evaluator : Evaluator) (inputs outputs : Site) (fields : Envelope) : Option String :=
  mappings evaluator inputs fields.inputs <|> mappings evaluator outputs fields.outputs

/-- A Sequence Flow condition is read by the profile's evaluator: Simple Boolean, or under `Evaluator.juel` a JUEL
table or a plain variable read (CIB-EXT-0030). A literal or `foreign` condition is refused under both. -/
def flowCondition (evaluator : Evaluator) (site : Site) (flow : Flow) : Option String :=
  match flow.condition with
  | none => none
  | some (.simpleBoolean _) => if evaluator == .juel then some "expression.outsideJuel" else none
  | some (.juel nodes) => if evaluator == .juel then juelNodes nodes site else some "flow.condition.foreign"
  | some (.variable name) => if evaluator == .juel then juelName site name else some "flow.condition.foreign"
  | some (.literal _) => some "flow.condition.foreign"
  | some (.foreign _ _) => some "flow.condition.foreign"

/-- `origin.sourceId`, and each of the element's boundaries' `sourceId`, is what publication shows, so an identifier is
the one its author wrote, or, in a copy of another deployment's process, exactly `<sourceId>@<deploymentId>` with that
copy's deploy ordinal, as `bpmn-source`'s assembly renames it (PC-SCOPE-03). No element's origin binds a definition. -/
def origin (program : Program) (header : Header) : Option String :=
  let copied := ((program.processOf header).bind (·.definition.deployment)).filter (some · != program.identity.deployment)
  let shown (id source : String) : Bool := id == source || copied.any fun deployment => id == s!"{source}@{deployment}"
  let boundaries := (((program.element? header.id).bind (·.envelope?)).map (·.boundaries)).getD []
  if !shown header.id.value header.origin.sourceId || boundaries.any (fun boundary => !shown boundary.id.value boundary.sourceId)
  then some "element.origin.sourceId"
  else if header.origin.definition.isSome then some "element.origin.definition"
  else none

end Kernel.Admission.Data
