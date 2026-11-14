module

public import Kernel.Admission.Flow.Closure

/-! # Order invariance of concurrent branches and instances

Under `BranchSchedule.orderInvariant` a closure takes its queued tokens first in, first out, and BPMN 2.0.2 lets the
branches of a split and the instances of a parallel Multi-Instance Activity interleave in any order (Table 13.1,
§13.3.1, §13.3.7). These checks compare the closures `Kernel.Admission.Flow.closureWalk` finds for them and refuse a
model whose committed result would depend on that order: `flow.concurrentWrite` and `flow.concurrentInterference` for
a split's branches and for the units one element's run fans out to (`fanOutConflict`), and the `races`
`Kernel.Admission.MultiInstance.concurrentInstances` reads for instances.
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
    withdrawal.everything || match program.element? id with
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

/-- The first conflict (`conflict`) of `own` with one of `others`, branches one closure begins together, in that closure
or in the one a later Signal broadcast starts by resuming a subscription each left open, which it resumes in the order
this closure opened them. -/
def branchesAgainst (reading : Reading) (program : Program) (own : Closure) (others : List Closure) : Option String :=
  let woken (closure : Closure) : Option Closure :=
    if closure.wakes.isEmpty then none else some (wakeClosure reading program closure.wakes)
  others.findSome? (conflict program own) <|>
    (woken own).bind fun ownWake => (others.filterMap woken).findSome? (conflict program ownWake)

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
    if !concurrent then none else branchesAgainst reading program own others

/-! ## Fan-outs of one element's run

Besides a split's branches and a loop's instances, one element's run may queue several units of work that the closure
then runs in an order no input states: the resumptions a Signal throw fires beside its thrower's continuation, the
catcher of an intermediate or end Escalation beside its thrower, the Conditional items a write makes true beside its
writer, and the compensation handlers one trigger begins together. One check per mechanism compares the units with
`conflict`; a unit is the closure walk from where it starts, and a continuation ascends, since a token that ends its
Scope lets the Scope complete beside the other units (`Step.settle` completes idle scopes only after every signal and
token). -/

/-- The first conflict (`conflict`) between two of `units`, each against every later one. -/
def firstConflict (program : Program) : List Closure → Option String
  | [] => none
  | unit :: rest => rest.findSome? (conflict program unit) <|> firstConflict program rest

/-- The element a resumption's subscription hangs on: a catch, a boundary's host, an Event Sub-Process. -/
def anchorOf (program : Program) : Visit → Option Element
  | .completes caught => some caught
  | .fires boundary => (program.boundary? boundary.id).map (·.1)
  | .enters started => some started
  | .passes _ => none

/-- Whether a level, the children of a Scope or the elements of a process level, may hold two tokens at once: two
starts or implicitly begun children, a split (a concurrent Gateway or any other element or boundary with several
outgoing flows), a boundary that does not interrupt, an Event Sub-Process that does not interrupt, or a compensation
handler, which a throw may begin beside others. With `alongFlows` only tokens that move along the level's Sequence Flows
count, so a handler, which has none (`compensation.handlerFlow`), and a boundary without an outgoing flow, such as a
Compensation boundary, add none. -/
def concurrentLevel (reading : Reading) (alongFlows : Bool) (level : List Element) : Bool :=
  (level.filter (·.start?.isSome)).length ≥ 2 ||
    (!level.any (·.start?.isSome) && (level.filter (·.beginsImplicitly)).length ≥ 2) ||
    level.any fun element =>
      (!alongFlows && element.isCompensationActivity) ||
      (element.gateway?.any fun (_, payload) => (routing payload).concurrent && payload.outgoing.length ≥ 2) ||
      (element.gateway?.isNone && element.outgoing.length ≥ 2) ||
      ((element.envelope?.map (·.boundaries)).getD []).any (fun boundary =>
        (!boundary.interrupting && !(alongFlows && boundary.outgoing.isEmpty)) || boundary.outgoing.length ≥ 2) ||
      (((element.scope?).bind fun (_, payload) => payload.kind.start?).isSome && !reading.interrupts element &&
        !(alongFlows && handler reading element))

/-- Whether at most one token moves through `element`'s level at a time and the level is entered at most once at a
time: that level and every level around it hold no concurrency (`concurrentLevel`), no Scope around it loops, and its
process is the root process, which no Call calls. -/
def solitary (reading : Reading) (program : Program) (element : Element) : Bool :=
  let enclosing := ancestors program program.elements.length element.header.parent
  let top := (enclosing.getLast?).getD element
  !program.inCalledProcess top.header.id && !concurrentLevel reading (alongFlows := false) (program.siblings top.header) &&
    enclosing.all fun scope =>
      ((scope.envelope?).bind (·.multiInstance)).isNone &&
        !concurrentLevel reading (alongFlows := false) (program.children (some scope.header.id))

/-- Whether `element`'s level is entered once per process instance and moves one token at a time along its flows, so its
occurrences complete one after another along that token's path: that level and every level around it move no two tokens
at once along their flows (`concurrentLevel`), no Scope around it loops, is a compensation handler, begun once per
record, or may be entered again (`reaches` from it or its boundary Events back to it), and its process is the root
process, which no Call calls. -/
def runsOnce (reading : Reading) (program : Program) (element : Element) : Bool :=
  let enclosing := ancestors program program.elements.length element.header.parent
  let top := (enclosing.getLast?).getD element
  let boundariesOf (scope : Element) : List ElementId := ((scope.envelope?.map (·.boundaries)).getD []).map (·.id)
  !program.inCalledProcess top.header.id && !concurrentLevel reading (alongFlows := true) (program.siblings top.header) &&
    enclosing.all fun scope =>
      ((scope.envelope?).bind (·.multiInstance)).isNone && !handler reading scope &&
        !reaches program (scope.header.id :: boundariesOf scope) scope.header.id &&
        !concurrentLevel reading (alongFlows := true) (program.children (some scope.header.id))

/-- The elements whose occurrences tell apart two open occurrences of the subscription a resumption fires, which one
throw or write may resume together: the Scope its anchor lies in, or at a called process's level its Calls; none for a
solitary anchor (`solitary`), whose level is entered once at a time, and none at the root process's level, whose
subscriptions are open once. -/
def holders (reading : Reading) (program : Program) (visit : Visit) : List ElementId :=
  ((anchorOf program visit).filter (!solitary reading program ·)).map (fun element =>
    match element.header.parent with
    | some parent => [parent]
    | none => ((program.processOf element.header).map fun process => (callers program process).map (·.header.id)).getD [])
    |>.getD []

/-- Whether the subscription `visit` resumes cannot be open while `thrower` runs: its catch, or its boundary's host,
lies in a solitary level (`solitary`) whose one token is at the thrower or at another element holding it. An Event
Sub-Process start stays open while its scope occurrence lives, so it is never excluded. -/
def closedAt (reading : Reading) (program : Program) (thrower : Element) (visit : Visit) : Bool :=
  let level (element : Element) := (element.header.parent, (program.processOf element.header).map (·.definition))
  (if visit matches .enters _ then none else anchorOf program visit).any fun held => solitary reading program held &&
    (thrower :: ancestors program program.elements.length thrower.header.parent).any fun holder =>
      level holder == level held && holder.header.id != held.header.id

/-- What a resumption's first visit removes, as a queued signal that runs before any token moves: an interrupting
boundary's host or an interrupting Event Sub-Process's Scope. What its path removes later is not this. -/
def firstWithdrawals (reading : Reading) (program : Program) : Visit → List Withdrawal
  | .fires boundary => interruption program boundary
  | .enters started => removal reading started
  | .completes _ => []
  | .passes _ => []

/-- Whether a resumption's first visit removes `element` together with the level its token goes on in, so the
continuation never moves beside the resumption: the removal reaches `element` and is not an interruption of `element`
itself, whose outflow lies outside it. -/
def preempts (reading : Reading) (program : Program) (visit : Visit) (element : Element) : Bool :=
  (firstWithdrawals reading program visit).any fun withdrawal =>
    withdrawal.root != some element.header.id &&
      removesElement program withdrawal (program.elements.length + 1) element.header.id

/-- A path against a second occurrence of itself that the elements `held` tell apart: one occurrence's path may not
write a name, nor remove an element holding the other occurrence. -/
def againstHolders (program : Program) (held : List ElementId) (wake : Closure) : Option String :=
  if held.isEmpty then none
  else if wake.footprint.races wake.footprint then some "flow.concurrentWrite"
  else if wake.withdraws.any (fun withdrawal =>
      held.any (removesElement program withdrawal (program.elements.length + 1))) then
    some "flow.concurrentInterference"
  else none

/-- A resumption against itself, when its subscription may be open twice at once (`holders`, `againstHolders`). -/
def againstItself (reading : Reading) (program : Program) (visit : Visit) (wake : Closure) : Option String :=
  againstHolders program (holders reading program visit) wake

/-- The walk of a resumption's or catcher's path: a branch's, stopping where it waits or joins. -/
def pathOf (reading : Reading) (program : Program) (begun : List Visit) : Closure :=
  closureWalk reading program { stop := branchStop, ascends := false } begun

/-- What a token leaving `element` runs next in its closure: its flows and, ascending, the completion of the Scope or
called process its token may end (review change 4: `Step.settle` completes an idle scope only after every signal and
token, so that completion goes on beside the other units). -/
def continuation (reading : Reading) (program : Program) (element : Element) : Closure :=
  let walk : Walk := { stop := branchStop, ascends := true }
  closureWalk reading program walk (onwardVisits reading program walk element)

/-- Under `BranchSchedule.orderInvariant`, the work one Signal throw starts in its closure may not conflict
(`conflict`): its thrower's continuation and the resumption of every Signal subscription it may resume, any of the
program as `Kernel.Admission.Flow.beyond` counts, which the closure runs in arming order, an order no input states
(BPMN 2.0.2 §10.5.1 lets one Signal reach every catcher; issue #81). A resumption whose first visit removes the thrower
(`preempts`) is not held against the continuation: that removal is a queued signal, which runs before any token the
thrower's completion emits, whatever the schedule. A resumption that cannot be open while the thrower runs (`closedAt`)
is dropped, and one whose subscription may be open twice at once is held against itself (`againstItself`). -/
def signalFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  if !((element.event?.bind (·.2.throw?)).any fun thrown => (throwView thrown).signal.isSome) then none
  else
    let wakes := ((program.elements.flatMap (catching signalled)).filter (!closedAt reading program element ·)).map
      fun visit => (visit, pathOf reading program [visit])
    let own := continuation reading program element
    (wakes.filter fun (visit, _) => !preempts reading program visit element).findSome?
        (fun (_, wake) => conflict program own wake) <|>
      firstConflict program (wakes.map (·.2)) <|>
      wakes.findSome? fun (visit, wake) => againstItself reading program visit wake

/-- Under `BranchSchedule.orderInvariant`, an Escalation thrower's continuation may not conflict with what a catcher
that does not interrupt it runs: BPMN 2.0.2 §10.5.1 continues the thrower, an End Event's Scope included, while the
catcher's path runs, in an order no input states (issue #81). -/
def escalationFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  if !reading.escalates element then none
  else
    let beside := (catchers reading program element (program.elements.length + 1)).filter fun visit =>
      match visit with
      | .fires boundary => !boundary.interrupting
      | .enters started => !reading.interrupts started
      | .completes _ => false
      | .passes _ => false
    if beside.isEmpty then none
    else conflict program (continuation reading program element) (pathOf reading program beside)

/-- Whether a write of `written` may make true the Conditional subscription `visit` resumes: under
`ConditionalRetrigger.edge` only a write of a name its condition reads can turn it true (BPMN 2.0.2 Tables 10.89, 10.90);
under `eachWrite` every write its filters pass fires it while it holds (CIB-EXT-0035). -/
def mayMakeTrue (program : Program) (written : NameSet) (visit : Visit) : Bool :=
  (visitSubscription visit).any fun subscription => (subscription.trigger.condition?).any fun trigger =>
    trigger.variableName.all (fun name => written.all || written.names.contains name) &&
      (program.options.conditionalRetrigger == .eachWrite || (expressionReads trigger.condition).meets written)

/-- Whether two Conditional resumptions are one contest, whose order the input's ranking decides
(`Kernel.Feature.Subscriptions.resolveContests`, CIB-LIM-0053): one's first visit removes the other's anchor, or both
are arms of one Event-Based Gateway. -/
def contested (reading : Reading) (program : Program) (left right : Visit) : Bool :=
  let removes (first second : Visit) : Bool := (firstWithdrawals reading program first).any fun withdrawal =>
    (anchorOf program second).any (removesElement program withdrawal (program.elements.length + 1) ·.header.id)
  removes left right || removes right left ||
    (anchors program left).any fun id => (anchors program right).contains id &&
      (program.element? id).any (·.gateway?.any fun (_, payload) => (routing payload).waits)

/-- What the arming on entering `element` evaluates, and what that entry begins beside it. The arming's Conditional
resumptions: the element's Conditional boundaries and the Conditional Event Sub-Process starts of the level its entry
opens, a Scope's children or a Call's called processes' (`Kernel.Feature.Subscriptions.armScope`, which evaluates both as
one), or for a start Event of the root process the root's own starts (`Kernel.Step.step`'s `armScope`). What the entry
begins: a Scope's entered children, a Call's called none starts, the start Event itself. -/
def armedOn (program : Program) (element : Element) : List Visit × List Element :=
  let boundaries := (((element.envelope?.map (·.boundaries)).getD []).filter (conditional ·.subscription)).map Visit.fires
  let starts (level : List Element) : List Visit := (startingSubProcesses level conditional).map Visit.enters
  let called : List Element := ((element.activity?.bind fun (_, payload) => payload.work.call?).map fun work =>
    (program.calledProcessFor program.options.calledElementResolution (program.callerDeployment element.header)
      work).flatMap program.processChildren).getD []
  match element.scope? with
  | some (header, _) => (boundaries ++ starts (program.children (some header.id)), enteredChildren program header.id)
  | none =>
    if element.start?.isSome && element.header.parent.isNone && !program.inCalledProcess element.header.id then
      (starts (program.siblings element.header), [element])
    else
      (boundaries ++ starts called,
        called.filter fun child => child.start?.any fun (_, payload) => payload.subscription.isNone)

/-- Under `BranchSchedule.orderInvariant`, the Conditional items one arming finds true may not conflict with the work the
entry that armed them begins (`armedOn`), nor with each other: `Kernel.Feature.Subscriptions.subscribeAll` queues their
firings after the entry's `begin` signals, each contest at its first member's place in evaluation order, so the firings'
tokens and the entry's join one queue in an order no input states (BPMN 2.0.2 §13.4.4 gives simultaneous triggers no
order; issue #81; P1 census, G2). A firing whose first visit removes every element the entry begins
(`firstWithdrawals`), an interrupting boundary of the Scope or an interrupting Event Sub-Process start in it, is not held
against the entry: that removal is a queued signal, which runs before any token the entry emits. Two firings that are
one contest (`contested`) are ordered by the input's ranking. -/
def armingFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  let (fired, begun) := armedOn program element
  let paths := fired.map fun visit => (visit, pathOf reading program [visit])
  let entry := pathOf reading program (begun.map Visit.enters)
  let clears (visit : Visit) : Bool := (firstWithdrawals reading program visit).any fun withdrawal =>
    begun.all fun child => removesElement program withdrawal (program.elements.length + 1) child.header.id
  let rec rivals : List (Visit × Closure) → Option String
    | [] => none
    | (visit, path) :: rest =>
      (rest.filter fun (other, _) => !contested reading program visit other).findSome? (fun (_, other) =>
        conflict program path other) <|> rivals rest
  (if begun.isEmpty then none
    else (paths.filter fun (visit, _) => !clears visit).findSome? fun (_, path) => conflict program path entry) <|>
    rivals paths

/-- Under `BranchSchedule.orderInvariant`, a write's Conditional firings may not conflict with the writer's continuation
nor with each other: `Kernel.Feature.Subscriptions.offerWrites` queues the firings of the items one write makes true
after the writer's completion, each contest at its first member's place in evaluation order, an order no input states
(issue #81, review change 2). A writer is an element whose run writes, or a boundary whose firing writes; its
continuation is held against each resumption its write may make true (`mayMakeTrue`), except one whose first visit
removes it (`preempts`); an Event Sub-Process writes its start's outputs as it begins, so its entered children are
held against them too. The Conditional resumptions `element` holds are held against every other one a single write
may make true with them, a variable command's included, unless they are one contest (`contested`), whose order the
input's ranking states, and against themselves when open twice at once (`againstItself`). Every walk arms every
Conditional once its unit writes (`closureWalk`), so two writing units beside a writing Conditional path conflict: a
conservative bound. -/
def writeFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  let resumed (written : NameSet) : List (Visit × Closure) :=
    ((conditionalCatches program).filter (mayMakeTrue program written)).map fun visit => (visit, pathOf reading program [visit])
  let written := (runs reading program element).footprint.writes
  let inside : List Visit := if ((element.scope?).bind fun (_, payload) => payload.kind.start?).isSome then
      (((element.scope?).map fun (header, _) => enteredChildren program header.id).getD []).map Visit.enters
    else []
  let own := if written.names.isEmpty && !written.all then none
    else
      let next := continuation reading program element
      let begun := pathOf reading program inside
      ((resumed written).filter fun (visit, _) => !preempts reading program visit element).findSome?
        fun (_, wake) => conflict program next wake <|> conflict program begun wake
  let fired := ((element.envelope?.map (·.boundaries)).getD []).findSome? fun boundary =>
    if (reading.fires boundary).isEmpty then none
    else
      let next := closureWalk reading program { stop := branchStop, ascends := true }
        ((flowTargets program boundary.outgoing).map Visit.enters)
      (resumed { names := reading.fires boundary }).findSome? fun (_, wake) => conflict program next wake
  let reads (visit : Visit) : NameSet := ((visitSubscription visit).bind fun subscription =>
    (subscription.trigger.condition?).map (expressionReads ·.condition)).getD {}
  let together (left right : Visit) : Bool :=
    visitKey left != visitKey right && !contested reading program left right &&
      (program.options.conditionalRetrigger == .eachWrite || (reads left).meets (reads right))
  let rivals := (catching conditional element).findSome? fun visit =>
    let wake := pathOf reading program [visit]
    againstItself reading program visit wake <|>
      ((conditionalCatches program).filter (together visit)).findSome? fun other =>
        conflict program wake (pathOf reading program [other])
  own <|> fired <|> rivals

/-- Under `BranchSchedule.orderInvariant`, the compensation handlers one Compensation throw or Cancel End may begin
together may not conflict: a handler's own run, without the resumption of the trigger once it completes, which comes
after every handler it races. `Kernel.Feature.Compensation.precedes` orders two records by Sequence Flow from one
subject or its boundary Events to the other's, by data or by one subject; handlers it leaves unordered begin together,
in declaration order, an order no input states (BPMN 2.0.2 §13.5.5; issue #81). A pair of handlers counts as ordered
only when `precedes` orders every pair of their records in every run (P1 track review, change 1), which holds for two
subjects that are one, ordered by completion; or a path leads from one's boundary Events to the other, ordered whatever
the completion; or a path leads from `a` to `b`, which orders every record of `a` before a later one of `b`, and a record
of `a` after one of `b` is ordered too or cannot exist: a path leads back from `b` to `a`, so their completion orders
that pair the same way, or `a` runs once along one token's path (`runsOnce`) and no way a token can go from `b`
(`reaches`, which passes Activities and follows boundary flows, unlike `flowReaches`) returns to `a`. Without
`runsOnce` a second token completes `a` after `b` (a conditioned path from `a` to `b` beside a fork, the review's
witness; a fork sending a second token to `a`, though every path to `b` passes `a`); without `reaches` one token
returns to `a` through an Activity or a boundary flow; and a Scope around `a` entered again hands its parent the records
of two occurrences, which meet in one run. A data dependency is not counted, a conservative reading. -/
def compensationFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  if !reading.compensates element then none
  else
    let unit (handler : Element) : Closure :=
      let begun := closureWalk reading program
        { stop := fun other => other.header.id == handler.header.id || branchStop other, ascends := false }
        [Visit.enters handler]
      if branchStop handler then begun
      else
        let run := runs reading program handler
        { begun with footprint := begun.footprint.union run.footprint, withdraws := run.withdraws ++ begun.withdraws
                     completed := handler.header.id :: begun.completed }
    let boundariesOf (id : ElementId) : List ElementId :=
      (((program.element? id).bind (·.envelope?)).map (·.boundaries.map (·.id))).getD []
    let follows (first second : ElementId) : Bool :=
      flowReaches program [first] second && (flowReaches program [second] first ||
        (!reaches program [second] first && (program.element? first).any (runsOnce reading program)))
    let joined (first second : ElementId) : Bool := flowReaches program (boundariesOf first) second || follows first second
    let ordered (left right : Element) : Bool :=
      (subjectsOf program left).all fun first => (subjectsOf program right).all fun second =>
        first == second || joined first second || joined second first
    let rec pairs : List Element → Option String
      | [] => none
      | handler :: rest =>
        (rest.filter (!ordered handler ·)).findSome? (fun other => conflict program (unit handler) (unit other)) <|>
          pairs rest
    pairs (handlersOf reading program element)

/-- Under `BranchSchedule.orderInvariant`, the children the entry of a Scope begins together may not conflict, compared
as a split's branches (`branchesAgainst`): without a start Event every child that begins implicitly begins, one `begin`
signal each (`Kernel.Feature.Scopes.implicitStart`), and BPMN 2.0.2 §13.3.4 gives them no order, while each child's
tokens join the closure's queue in an order no input states (issue #81; P1 census, G1). -/
def implicitFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  let rec pairs : List Element → Option String
    | [] => none
    | child :: rest => branchesAgainst reading program (pathOf reading program [.enters child])
        (rest.map fun other => pathOf reading program [.enters other]) <|> pairs rest
  ((element.scope?).map fun (header, _) => pairs (enteredChildren program header.id)).getD none

/-- Whether `element` is an Inclusive join, which parks a token while a position may still reach an empty incoming flow
(`Kernel.Feature.Flow.join`). -/
def inclusiveJoin (element : Element) : Bool :=
  element.gateway?.any fun (_, payload) =>
    (routing payload).concurrent && (routing payload).conditional.isSome && payload.incoming.length ≥ 2

/-- The elements telling apart two parked occurrences of the join `element` that one closure may offer again: the Scope
it lies in, or at a called process's level a Call of it, when that holder may run twice at once, since it loops or is
not `solitary`. Two occurrences parked in one scope occurrence run one continuation twice, which no order changes. -/
def joinHolders (reading : Reading) (program : Program) (element : Element) : List ElementId :=
  let around : List Element := match element.header.parent with
    | some parent => (program.element? parent).toList
    | none => ((program.processOf element.header).map (callers program)).getD []
  (around.filter fun holder =>
    ((holder.envelope?).bind (·.multiInstance)).isSome || !solitary reading program holder).map (·.header.id)

/-- Under `BranchSchedule.orderInvariant`, the continuations of two Inclusive joins one quiescent closure may offer again
may not conflict, nor two occurrences of one join that two occurrences of its Scope or called process may park at once
(`joinHolders`, `againstHolders`): `Kernel.Step.reoffer?` fires the first ready one in parking order, which is the order
earlier tokens arrived in, and runs its continuation to quiescence before it offers the next, so two joins Table 13.3
activates by one state run in an order no input states (issue #81; P1 census, G4). Any two Inclusive joins count, a conservative bound: whether both can be
parked and ready at once is the run's. -/
def rejoinFanOut (reading : Reading) (program : Program) (element : Element) : Option String :=
  if !inclusiveJoin element then none
  else
    let own := continuation reading program element
    ((program.elements.filter fun other => inclusiveJoin other && other.header.id != element.header.id).findSome?
        fun other => conflict program own (continuation reading program other)) <|>
      againstHolders program (joinHolders reading program element) (pathOf reading program [.completes element])

/-- The fan-outs of one element's run or entry besides a split's and a loop's, under `BranchSchedule.orderInvariant`. -/
def fanOutConflict (reading : Reading) (program : Program) (element : Element) : Option String :=
  match program.options.branchSchedule with
  | .declarationDepthFirst => none
  | .orderInvariant =>
    signalFanOut reading program element <|> escalationFanOut reading program element <|>
      writeFanOut reading program element <|> compensationFanOut reading program element <|>
      implicitFanOut reading program element <|> armingFanOut reading program element <|>
      rejoinFanOut reading program element

/-- What the instances of a looping `element` do in the closure that begins them, which
`Kernel.Admission.MultiInstance.concurrentInstances` reads. -/
structure InstanceClosure where
  /-- One instance writes a name before it waits, removes the body, or resumes what a sibling instance opens, there or
  after one broadcast resumes them all; every instance has the same closure, so it meets its own. -/
  races : Bool
  /-- An instance may complete in that closure, or in the one where a broadcast resumes the instances together. -/
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
    -- A broadcast resumes every instance's subscription in one closure, which completes the idle instances in scope
    -- order (`Step.settle`), so an instance completing there meets the completion condition in an order no input states.
    let woken := if closure.wakes.isEmpty then none else some (walk closure.wakes)
    { races := conflicts closure || woken.any conflicts, completes := closure.ends || woken.any (·.ends) }
  | none =>
    if awaitsStimulus element then { races := false, completes := false }
    else
      -- The instance's run counts as every path counts a run (`runs`), its unhandled Error's withdrawal included.
      let run := runs reading program element
      let beside := walk (beyond reading program element true)
      { races := run.footprint.races run.footprint || meetsSibling { beside with withdraws := run.withdraws ++ beside.withdraws }
        completes := true }

end Kernel.Admission.Flow.Concurrency
