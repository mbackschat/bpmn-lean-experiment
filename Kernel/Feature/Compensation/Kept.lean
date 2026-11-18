module

public import Kernel.State

/-! # Compensation: the records a completed Sub-Process keeps

How a completed Sub-Process's record keeps the records retained in it, flat, each under its group key
(`CompensableChild.group`), and how its handler's or group's begin hands them back as records of their own, each with
the ones it keeps in turn. `Kernel.Feature.Compensation` retains and begins records; this module only moves them
between the two forms.
-/

public section

namespace Kernel.Feature.Compensation

/-- `record` as its new holder keeps it: itself, directly, then what it keeps, one group deeper, under its completion
number. -/
def keptRecords (record : Compensable) : List CompensableChild :=
  { subject := record.subject, handler := record.handler, occurrence := record.occurrence,
    completion := record.completion, snapshot := record.snapshot } ::
    record.children.map fun child => { child with group := record.completion :: child.group }

/-- The records `direct` a begun holder kept directly, each now retained in `context` and keeping the records of
`below` whose group key starts with its completion number, one group shallower; each takes them before the next one
looks, so no kept record goes to two. -/
def releaseKept (context : ScopeOccurrenceId) : List CompensableChild → List CompensableChild → List Compensable
  | [], _ => []
  | child :: direct, below =>
    let (inside, rest) := below.partition (·.group.head? == some child.completion)
    { subject := child.subject, handler := child.handler, scope := context, occurrence := child.occurrence,
      completion := child.completion, snapshot := child.snapshot,
      children := inside.map fun record => { record with group := record.group.tail } } ::
      releaseKept context direct rest

/-- The records `record` keeps directly, retained in `context` once its handler or group begins there, each with the
records it keeps in turn. -/
def begunChildren (record : Compensable) (context : ScopeOccurrenceId) : List Compensable :=
  let (direct, below) := record.children.partition (·.group.isEmpty)
  releaseKept context direct below

end Kernel.Feature.Compensation
