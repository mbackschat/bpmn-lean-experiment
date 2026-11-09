module

public import Kernel.IL.Types

/-! # Admission of data: expressions, mappings, conditions, element origins and the shared envelope. A refusal
carries a stable code.

Every expression the kernel reads is Simple Boolean, a literal or a variable read
([decision](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)); nothing else has an evaluator.
-/

public section

namespace Kernel.Admission.Data


def mapping (entry : Mapping) : Option String :=
  match entry.source with
  | .foreign _ _ => some "mapping.expression"
  | .literal _ => none
  | .simpleBoolean _ => none
  | .variable _ => none

def mappings (list : List Mapping) : Option String :=
  list.findSome? mapping

/-- An Activity's default flow has no kernel meaning yet (PC-CF-07). The asynchronous continuations are admitted:
`Kernel.Step` reads them as transaction boundaries (CIB-EXT-0027). -/
def envelope (fields : Envelope) : Option String :=
  if fields.defaultFlow.isSome then some "activity.defaultFlow"
  else mappings fields.inputs <|> mappings fields.outputs

/-- A Sequence Flow condition must be Simple Boolean: the exclusive and inclusive split evaluates it in the kernel. -/
def flowCondition (flow : Flow) : Option String :=
  match flow.condition with
  | none => none
  | some (.simpleBoolean _) => none
  | some (.literal _) => some "flow.condition.foreign"
  | some (.variable _) => some "flow.condition.foreign"
  | some (.foreign _ _) => some "flow.condition.foreign"

/-- `origin.sourceId` is what publication shows, so a program whose `Header.id` differs would publish another name;
no program binds an element to a definition until PC-SCOPE-03. -/
def origin (header : Header) : Option String :=
  if header.origin.sourceId != header.id.value then some "element.origin.sourceId"
  else if header.origin.definition.isSome then some "element.origin.definition"
  else none

end Kernel.Admission.Data
