module

public import Kernel.Admission.Flow.Concurrency

/-! # The compensation order of one closure's records

Under `BranchSchedule.orderInvariant` `Kernel.Feature.Compensation.completedBefore` orders two records completed in
one closure by the structural order of their subjects (`Kernel.structurallyBefore`), never by the order the closure ran
them in, which no input states (COMPENSATION-SEMANTICS-SPEC I1 (d), DC15 (c)). So admission refuses a model in which
one Compensation throw or Cancel End may meet two records of one closure whose order `precedes` needs and the
structural order cannot give: a subject that may complete again after itself in the closure it completed in
(`compensation.repeatsInClosure`), a sequential Multi-Instance Sub-Process whose instances may complete in one closure
(`compensation.sequentialInstancesInClosure`), and two dependent subjects that may complete in one closure unless one
completes after the other there and not the other way round, as the structural order has it
(`compensation.unorderedDependency`). Records of one closure that §13.5.5 leaves unordered, parallel instances and
independent subjects, stay admitted. This is a forward-compatible restriction: a later causal order may admit these
models by ordering their records within the closure.

A closure begins where an input begins one: the process starting, a waiting element completing, a boundary firing,
an Event Sub-Process starting. Its walk passes a Scope or a Call as it enters it, so the completion it records counts
only for one that may complete without waiting (`quick`), or that holds the element the closure began at.
-/

public section

namespace Kernel.Admission.Flow.Order

open Kernel.Admission.Flow
open Kernel.Admission.Flow.Concurrency

/-- Whether `element` names a compensation handler. -/
def compensable (element : Element) : Bool :=
  !((element.envelope?.map (·.compensationHandlers)).getD []).isEmpty

/-- Whether `element` is a Multi-Instance Sub-Process or Transaction, whose body keeps its instances' records. -/
def multiInstanceScope (element : Element) : Bool :=
  element.scope?.isSome && ((element.envelope?).bind (·.multiInstance)).isSome

/-- A Multi-Instance Sub-Process without a handler of its own holding compensable work: each instance leaves one group
record of the records inside it (I9). -/
def group (program : Program) (element : Element) : Bool :=
  multiInstanceScope element && !compensable element && (program.interior element).any compensable

/-- The subjects of compensation records: the compensable elements, then the groups, each in program order. -/
def subjects (program : Program) : List Element :=
  program.elements.filter compensable ++ program.elements.filter (group program)

/-- Where `element`'s records are kept while a trigger may meet them: the nearest enclosing Scope that keeps records as
its children, one with a handler or a Multi-Instance body; `none` at the process level. -/
def home (program : Program) (element : Element) : Option ElementId :=
  ((ancestors program program.elements.length element.header.parent).find? fun scope =>
    compensable scope || multiInstanceScope scope).map (·.header.id)

/-- Whether one Compensation throw or Cancel End may compensate records of both subjects: a group's are found through
the records inside it. -/
def together (reading : Reading) (program : Program) (first second : Element) : Bool :=
  let covers (covered : List ElementId) (subject : Element) : Bool :=
    covered.contains subject.header.id ||
      (group program subject && (program.interior subject).any (covered.contains ·.header.id))
  (program.elements.filter reading.compensates).any fun thrower =>
    let covered := (handlersOf reading program thrower).flatMap (subjectsOf program)
    covers covered first && covers covered second

/-- The visits an input may begin a closure with: a root start, a waiting element's completion, an Event Sub-Process
start, and a boundary's firing other than a Compensation start's. -/
def closureStarts (reading : Reading) (program : Program) : List (List Visit) :=
  program.elements.flatMap fun element =>
    let eventSubProcess := ((element.scope?).bind fun (_, payload) => payload.kind.start?).isSome
    let root := element.header.parent.isNone && element.incoming.isEmpty && !eventSubProcess &&
      !element.isCompensationActivity
    (if root || eventSubProcess then [[Visit.enters element]] else []) ++
      (if awaitsStimulus element then [[Visit.completes element]] else []) ++
      ((((element.envelope?.map (·.boundaries)).getD []).filter (!reading.compensationStart ·.subscription)).map
        fun boundary => [Visit.fires boundary])

/-- Whether `element` may complete in the closure that begins it: a Scope whose entered children may end without
waiting, a Call whose called processes hold nothing that waits, and every other element, since a waiting one's
completion begins a closure of its own. -/
def quick (reading : Reading) (program : Program) (element : Element) : Bool :=
  match element.scope? with
  | some (header, _) =>
    (closureWalk reading program { stop := awaitsStimulus, ascends := false }
      ((program.enteredChildren header.id).map Visit.enters)).ends
  | none =>
    match (element.activity?).bind fun (_, payload) => payload.work.call? with
    | some work =>
      let called := program.calledProcessFor program.options.calledElementResolution
        (program.callerDeployment element.header) work
      !called.isEmpty && called.all fun process =>
        !(declaredIn program program.elements.length (program.processChildren process)).any awaitsStimulus
    | none => true

/-- The elements `closure` completes, a Scope or Call only when it is `quick` or holds `anchor`, where the closure
began. -/
def completedIn (program : Program) (quickOnes : List ElementId) (closure : Closure) (anchor : Option Element) :
    List ElementId :=
  let holds (id : ElementId) : Bool := anchor.any fun anchor =>
    anchor.header.id == id || (ancestors program program.elements.length anchor.header.parent).any (·.header.id == id)
  closure.completed.filter fun id => (program.element? id).isNone || quickOnes.contains id || holds id

/-- The walk of one closure: it stops where an element waits and ascends into the completions a token's end allows. -/
def closureOrder : Walk := { stop := awaitsStimulus, ascends := true }

/-- What may complete after `element` completes, in the closure it completed in. -/
def following (reading : Reading) (program : Program) (quickOnes : List ElementId) (element : Element) :
    List ElementId :=
  completedIn program quickOnes (closureWalk reading program closureOrder (after reading program closureOrder element))
    none

/-- The refusal of two subjects, `first` declared before `second`, when one trigger may meet their records completed
in one closure, `precedes` needs their order (a Sequence Flow path or a data dependency either way), and that one
completes after the other there and not the other way round is not what the structural order has. -/
def unorderedPair (reading : Reading) (program : Program) (quickOnes : List ElementId)
    (sameClosure : ElementId → ElementId → Bool) (first second : Element) : Option (String × ElementId × List ElementId) :=
  let a := first.header.id
  let b := second.header.id
  let enclosing (inner outer : Element) : Bool :=
    (ancestors program program.elements.length inner.header.parent).any (·.header.id == outer.header.id)
  if enclosing first second || enclosing second first || home program first != home program second ||
      !together reading program first second || !sameClosure a b then none
  else
    let dependent := flowReaches program [a] b || flowReaches program [b] a ||
      (subjectData program b).reads.meets (subjectData program a).writes ||
      (subjectData program a).reads.meets (subjectData program b).writes
    let ab := (following reading program quickOnes first).contains b
    let ba := (following reading program quickOnes second).contains a
    if !dependent || (ab && !ba && structurallyBefore program a b) || (ba && !ab && structurallyBefore program b a) then
      none
    else some ("compensation.unorderedDependency", a, [b])

/-- The first pair of `subjects` `unorderedPair` refuses. -/
def unorderedPairs (reading : Reading) (program : Program) (quickOnes : List ElementId)
    (sameClosure : ElementId → ElementId → Bool) : List Element → Option (String × ElementId × List ElementId)
  | [] => none
  | first :: rest =>
    rest.findSome? (unorderedPair reading program quickOnes sameClosure first) <|>
      unorderedPairs reading program quickOnes sameClosure rest

/-- Under `BranchSchedule.orderInvariant`, the first refusal of a model whose records of one closure the structural
order cannot order where `precedes` needs it: its code, the subject it names and the other subject of a pair. -/
def unorderedRecords (reading : Reading) (program : Program) : Option (String × ElementId × List ElementId) :=
  match program.options.branchSchedule with
  | .declarationDepthFirst => none
  | .orderInvariant =>
    let quickOnes := (program.elements.filter (quick reading program)).map (·.header.id)
    let closures := (closureStarts reading program).map fun begun =>
      completedIn program quickOnes (closureWalk reading program closureOrder begun) (begun.head?.bind (anchorOf program))
    let sameClosure (first second : ElementId) : Bool :=
      closures.any fun completed => completed.contains first && completed.contains second
    let alone := (subjects program).findSome? fun subject =>
      if !awaitsStimulus subject && quickOnes.contains subject.header.id &&
          (following reading program quickOnes subject).contains subject.header.id then
        some ("compensation.repeatsInClosure", subject.header.id, [])
      else if multiInstanceScope subject && reading.nextInstance subject &&
          (instanceClosure reading program subject).completes then
        some ("compensation.sequentialInstancesInClosure", subject.header.id, [])
      else none
    alone <|> unorderedPairs reading program quickOnes sameClosure (subjects program)

end Kernel.Admission.Flow.Order
