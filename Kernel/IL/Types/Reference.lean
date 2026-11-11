module

public import Kernel.IL.Types.Expression
public import Kernel.IL.Types.Lexical
public import Kernel.IL.Types.Options

/-! # References between definitions

Qualified names, the definition a process is bound to, a program's identity and a Call Activity's selector, with the
one query that says which carried definitions a selector admits. Part of `Kernel.IL.Types`, which re-exports it.
-/

public section

namespace Kernel

/-- An XML QName as the reader resolved it: the namespace its prefix is bound to (the Definitions' `targetNamespace`
for an unprefixed name), and its local part, which names an element by its id (BPMN 2.0.2 §15.3.2). -/
structure QName where
  «namespace» : Option String
  localName : String
  deriving DecidableEq, Repr

inductive CallBinding where
  | latest
  | deployment
  | version (value : ValueSource)
  | versionTag (value : ValueSource)
  deriving Repr

/-- `calledElement` is the attribute's text, `calledQName` the QName the reader resolved it to: `none` for an expression
or a prefix without a namespace binding (`Semantic.xsd` types `calledElement` as `xsd:QName`, PC-SCOPE-03). -/
structure CallWork where
  calledElement : ValueSource
  calledQName : Option QName := none
  binding : CallBinding := .latest
  tenant : Option ValueSource := none
  businessKey : Option Expression := none
  inputs : List Mapping := []
  outputs : List Mapping := []
  propagateAllInputs : Bool := false
  propagateAllOutputs : Bool := false
  deriving Repr

/-- The definition a called process is bound to: its key and the namespace of the Definitions that declare it.
`version` to `tenant` name a binding of a Call Activity, `none` for the process this program carries; `deployment` is
the deploy ordinal of the deployment that carries it; `sourceSha256` pins the source (PC-SCOPE-03). -/
structure DefinitionRef where
  key : String
  «namespace» : Option String := none
  version : Option Nat := none
  versionTag : Option String := none
  deployment : Option Nat := none
  tenant : Option String := none
  sourceSha256 : Option String := none
  deriving DecidableEq, Repr

/-- `namespace` is the root process's Definitions' `targetNamespace`, so that a Call resolved by QName can tell the root
process from a same-id process of another namespace; `deployment` is the root's own deploy ordinal. -/
structure ProgramIdentity where
  processId : String
  «namespace» : Option String := none
  sourceSha256 : String
  profile : String
  deployment : Option Nat := none
  deriving Repr

/-- Whether `definition` belongs to a deployment no later than the caller's: every carried definition when the caller
has no deploy ordinal, and an unstamped definition always (PC-SCOPE-03: a Call binds among callees deployed at or
before its caller). -/
def DefinitionRef.eligibleFor (callerDeployment : Option Nat) (definition : DefinitionRef) : Bool :=
  match callerDeployment, definition.deployment with
  | some caller, some deployed => deployed ≤ caller
  | _, _ => true

/-- Whether a Call's target names `definition`: its resolved QName under `qualifiedName`, its literal text as the key
under `cibKey` (PC-SCOPE-03). -/
def CallWork.namesDefinition (resolution : CalledElementResolution) (work : CallWork) (definition : DefinitionRef) : Bool :=
  match resolution with
  | .qualifiedName => work.calledQName == some { «namespace» := definition.«namespace», localName := definition.key }
  | .cibKey =>
    match work.calledElement with
    | .literal key => key == definition.key
    | .expression _ => false

/-- The definitions among `carried` a Call's selector admits for a caller deployed at `callerDeployment`: the eligible
ones it targets, narrowed by its binding. `latest` keeps the highest version; `deployment` the caller's own deployment;
a literal `version` or `versionTag` the definitions carrying it; an expression admits none. A definition no population
stamped is version 1, as every process of a single-instance program is its one deployment's first (population
contract §2.1). More than one result is an ambiguous selector, none a missing one. -/
def CallWork.selects (resolution : CalledElementResolution) (callerDeployment : Option Nat) (work : CallWork)
    (carried : List DefinitionRef) : List DefinitionRef :=
  let targets := carried.filter fun definition =>
    definition.eligibleFor callerDeployment && work.namesDefinition resolution definition
  let literal (value : ValueSource) (keep : String → DefinitionRef → Bool) : List DefinitionRef :=
    match value with
    | .literal text => targets.filter (keep text)
    | .expression _ => []
  match work.binding with
  | .latest =>
    let highest := targets.foldl (fun top definition => max top (definition.version.getD 1)) 1
    targets.filter (·.version.getD 1 == highest)
  | .deployment => targets.filter (·.deployment == callerDeployment)
  -- CIB reads a literal version with `Integer.valueOf`, `parseInt`'s decimal reading (`BaseCallableElement.java:95-100`).
  | .version value => literal value fun text definition =>
    match parseJavaInt? text with
    | some number => decide (0 ≤ number) && definition.version.getD 1 == number.toNat
    | none => false
  | .versionTag value => literal value fun text definition => definition.versionTag == some text

end Kernel
