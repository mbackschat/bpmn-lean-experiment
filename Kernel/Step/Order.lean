module

public import Kernel.Hooks

/-! # Step: the closure's order

The run log and the choice of a closure's next unit (DC4). A closure's queued work is content keyed by unit key
(`State.queuedTokens`, `State.queuedSignals`), which holds no order of entry; when each unit ran is the run log's, the
closure's one record of order. The log lives outside `State`, in the record `Kernel.Step.settle` threads, so no unit's
body can read it, by typing: the token scheduler and, under `declarationDepthFirst`, the position order (`issuerOrder`,
DC13) read it only through `orderKey`, and the commit's journal only through `RunLog.runPosition` (`byRun`). Signals run in breadth-first key order (`UnitKey.breadth`), which reads
no log (T56 F2). Every choice here picks the least entry under a strict total order that ends in the unit key itself,
so no choice reads the iteration order of a unit-keyed map (KD7). `scripts/kernel-effects.lean` holds the log to these
readers. None matches a guarded type.
-/

public section

namespace Kernel.Step

/-- The run log (DC4): the position at which each unit of the closure ran, from 0. Written only by `record`, read only
by `runPosition`. -/
structure RunLog where
  positions : TreeMap UnitKey Nat compare := ∅

/-- Record that `unit` ran next. -/
def RunLog.record (log : RunLog) (unit : UnitKey) : RunLog :=
  ⟨log.positions.insert unit log.positions.size⟩

/-- The position at which `unit` ran: the run log's one reader. A unit that has not run reads the log's size, the
position it takes once it has, so the running unit, which `settle` records after its micro-step, ranks after every unit
that ran (DC13). -/
def RunLog.runPosition (log : RunLog) (unit : UnitKey) : Nat :=
  (log.positions.get? unit).getD log.positions.size

/-- The place of the `index`th thing the unit `unit` made, a queued entry or an issue (DC4, DC13): the position at which
`unit` ran, then `index`. The one production reading of the log by the closure's choices and its bodies' order. -/
def orderKey (log : RunLog) (unit : UnitKey) (index : Nat) : Nat × Nat :=
  (log.runPosition unit, index)

/-- A queued entry's place in the order the closure runs tokens: its `orderKey` under the unit that queued it, at its
index in that unit's batch; a root key, which no unit queued, its own run position. -/
def queuedKey (log : RunLog) (key : UnitKey) : Nat × Nat :=
  match key.parent? with
  | none => orderKey log key 0
  | some (parent, step) => orderKey log parent step.batchIndex

/-- Whether queued entry `a` runs before `b` in token order: by `queuedKey`, then by the unit key itself, a strict total
order, so a choice never reads the iteration order of the map it scans (KD7). -/
def tokenBefore (log : RunLog) (a b : UnitKey) : Bool :=
  let (positionA, indexA) := queuedKey log a
  let (positionB, indexB) := queuedKey log b
  positionA < positionB || positionA == positionB && (indexA < indexB || indexA == indexB && compare a b == .lt)

/-- One step of `least`: `entry` replaces the least found so far when it comes before it. -/
def leastStep {α : Type} (before : UnitKey → UnitKey → Bool) (found : Option (UnitKey × α)) (entry : UnitKey × α) :
    Option (UnitKey × α) :=
  match found with
  | none => some entry
  | some best => if before entry.1 best.1 then some entry else found

/-- The least of `entries` under `before`, `none` for none. -/
def least {α : Type} (before : UnitKey → UnitKey → Bool) (entries : List (UnitKey × α)) : Option (UnitKey × α) :=
  entries.foldl (leastStep before) none

/-- The closure's order of units under `schedule`, which orders the pending positions its units issued (DC13,
`Issue.notAfter`): under `orderInvariant` breadth first (`UnitKey.breadth`), which reads no log, so no body's order depends on
the schedule; under `declarationDepthFirst` the order the units ran (`orderKey`), so positions order as they were taken.
The key itself breaks ties, so it is a total order. -/
def issuerOrder (schedule : BranchSchedule) (log : RunLog) : UnitKey → UnitKey → Ordering :=
  match schedule with
  | .orderInvariant => UnitKey.breadth.val
  | .declarationDepthFirst => compareLex (compareOn fun unit => (orderKey log unit 0).1) compare

/-- `ctx` for a unit of the closure that ran the units `log` records: its unit order (`issuerOrder`). -/
abbrev unitCtx (ctx : Ctx) (log : RunLog) : Ctx :=
  { ctx with issuerOrder := issuerOrder ctx.program.options.branchSchedule log }

/-- The queued token that was queued first: the oldest under `BranchSchedule.orderInvariant`. -/
def earliest (log : RunLog) (queued : TreeMap UnitKey Token compare) : Option (UnitKey × Token) :=
  least (tokenBefore log) queued.toList

/-- The queued token that was queued last: the newest under `BranchSchedule.declarationDepthFirst`. -/
def latest (log : RunLog) (queued : TreeMap UnitKey Token compare) : Option (UnitKey × Token) :=
  least (fun a b => tokenBefore log b a) queued.toList

/-- The queued signal first in breadth-first key order (`UnitKey.breadth`): it reads no log. Signals drain before any
other unit runs, so the queue holds one cascade, in which breadth-first order is the order the batches were queued in,
and a batch's signals have one depth, so the batch runs whole before any signal it queued (KD3, T56 F2). -/
def firstBreadth (queued : TreeMap UnitKey Signal compare) : Option (UnitKey × Signal) :=
  least (fun a b => UnitKey.breadth.val a b == .lt) queued.toList

end Kernel.Step
