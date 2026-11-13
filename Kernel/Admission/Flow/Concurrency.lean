module

public import Kernel.Admission.Flow

/-! # Order invariance of concurrent branches and instances

Under `BranchSchedule.orderInvariant` a closure takes its queued tokens first in, first out, and BPMN 2.0.2 lets the
branches of a split and the instances of a parallel Multi-Instance Activity interleave in any order (Table 13.1,
§13.3.1, §13.3.7). These checks compare the closures `Kernel.Admission.Flow.closureWalk` finds for them and refuse a
model whose committed result would depend on that order: `flow.concurrentWrite` and `flow.concurrentInterference` for
a split's branches, and the `races` `Kernel.Admission.MultiInstance.concurrentInstances` reads for instances.
-/

public section

namespace Kernel.Admission.Flow.Concurrency

open Kernel.Admission.Flow

/-- The closure a token on `start` runs in: the work it reaches, stopping where it waits or joins. -/
def branchClosure (reading : Reading) (program : Program) (start : FlowId) : Closure :=
  closureWalk reading program { stop := branchStop, ascends := false } ((flowTargets program [start]).map Visit.enters)

/-- The closure the resumptions in `wakes` run in, which one Signal broadcast may start together. -/
def wakeClosure (reading : Reading) (program : Program) (wakes : List Visit) : Closure :=
  closureWalk reading program { stop := branchStop, ascends := false } wakes

/-- Whether `withdrawal` removes the element `id`: `id` lies in its region, or in a called process a Call in it
calls. -/
def removesElement (program : Program) (withdrawal : Withdrawal) : Nat → ElementId → Bool
  | 0, _ => false
  | fuel + 1, id =>
    match program.element? id with
    | none => false
    | some element =>
      let enclosing := ancestors program program.elements.length element.header.parent
      let top := (enclosing.getLast?).getD element
      let inside := match withdrawal.root with
        | some root => (withdrawal.inclusive && id == root) || enclosing.any (·.header.id == root)
        | none => (program.element? withdrawal.source).any fun source =>
          (program.processOf source.header).map (·.definition) == (program.processOf top.header).map (·.definition)
      inside || ((program.processOf top.header).map fun process =>
        (callers program process).any fun call => removesElement program withdrawal fuel call.header.id).getD false

/-- Whether `own` acts on work `other` begins or completes, so their order decides what is left: it removes a region
holding an element `other` begins, resumes a Signal subscription `other` opens, or compensates an Activity `other`
completes. -/
def interferes (program : Program) (own other : Closure) : Bool :=
  own.withdraws.any (fun withdrawal =>
      other.begun.any (removesElement program withdrawal (program.elements.length + 1))) ||
    own.resumes.any other.begun.contains || own.compensates.any other.completed.contains

/-- What two closures that may run in either order would answer differently: a name one writes and the other reads or
writes (`flow.concurrentWrite`), or work one acts on that the other begins or completes
(`flow.concurrentInterference`). -/
def conflict (program : Program) (own other : Closure) : Option String :=
  if own.footprint.races other.footprint then some "flow.concurrentWrite"
  else if interferes program own other || interferes program other own then some "flow.concurrentInterference"
  else none

/-- Under `BranchSchedule.orderInvariant`, the branches of a split may not conflict (`conflict`) in the closure that
begins them, nor in the one a later Signal broadcast starts by resuming a subscription each branch left open, which it
resumes in the order this closure opened them: BPMN 2.0.2 lets concurrent branches interleave in any order (Table 13.1,
§13.3.1), so a value, a removal, a resumption or a record would depend on the closure's order, which no input states
(issue #81). CIB runs the first-declared branch first (CIB-OP-0016), the profile option `declarationDepthFirst`
(PC-BASIC-03). A split is a Parallel or Inclusive Gateway, or any element or Boundary Event with several outgoing
flows. A forward-compatible restriction, and a conservative one: a branch counts what its elements write
(`Reading.writes`), what the catchers, handlers and Signal and Conditional catches it may resume in the closure do, and
a loop that may run no instance as completing (issue #99); a Call's output mappings count as written even when the
called instance waits, and a JUEL text as reading every name; any raise may meet any catcher around it, any Signal
throw any Signal subscription and any Compensation throw any record in its Scope; a later profile may take the
interleaving as a choice input instead. Not counted: what an element it stops at evaluates besides its input mappings
and Multi-Instance definition. -/
def concurrentBranches (reading : Reading) (program : Program) (flow : Flow) : Option String :=
  match program.options.branchSchedule with
  | .declarationDepthFirst => none
  | .orderInvariant =>
    let concurrent := ((program.element? flow.source).bind (·.gateway?)).all fun (_, payload) =>
      (routing payload).concurrent
    let own := branchClosure reading program flow.id
    let others := ((leaving program flow.source).filter (· != flow.id)).map (branchClosure reading program)
    let woken (closure : Closure) : Option Closure :=
      if closure.wakes.isEmpty then none else some (wakeClosure reading program closure.wakes)
    if !concurrent then none
    else others.findSome? (conflict program own) <|>
      (woken own).bind fun ownWake => (others.filterMap woken).findSome? (conflict program ownWake)

/-- What the instances of a looping `element` do in the closure that begins them, which
`Kernel.Admission.MultiInstance.concurrentInstances` reads. -/
structure InstanceClosure where
  /-- One instance writes a name before it waits, removes the body, or resumes what a sibling instance opens, there or
  after one broadcast resumes them all; every instance has the same closure, so it meets its own. -/
  races : Bool
  /-- An instance may complete in that closure. -/
  completes : Bool

/-- A Sub-Process instance runs from its `enteredChildren` and continues past a join, which the instance's own branches
reach in that closure; a task instance is its work, which completes at once unless it awaits a stimulus. `completes`
over-approximates: a token reaching an element that neither waits nor continues, ignoring that a sibling branch of a
Parallel split may wait, which flows a condition selects and whether a nested Call waits. -/
def instanceClosure (reading : Reading) (program : Program) (element : Element) : InstanceClosure :=
  let walk := closureWalk reading program { stop := awaitsStimulus, ascends := false }
  -- An instance meets a sibling when it may remove the body, which holds them all, or act on what the sibling opens or
  -- completes.
  let meetsSibling (closure : Closure) : Bool :=
    closure.withdraws.any (removesElement program · (program.elements.length + 1) element.header.id) ||
      closure.resumes.any closure.begun.contains || closure.compensates.any closure.completed.contains
  let conflicts (closure : Closure) : Bool := closure.footprint.races closure.footprint || meetsSibling closure
  match element.scope? with
  | some (header, _) =>
    let closure := walk ((enteredChildren program header.id).map Visit.enters)
    { races := conflicts closure || (!closure.wakes.isEmpty && conflicts (walk closure.wakes)), completes := closure.ends }
  | none =>
    if awaitsStimulus element then { races := false, completes := false }
    else
      let reads := (footprint program element).reads
      let own : Footprint := { reads, writes := (footprint program element).writes.union (reading.writes element) }
      { races := own.races own || meetsSibling (walk (beyond reading program element true)), completes := true }

end Kernel.Admission.Flow.Concurrency
