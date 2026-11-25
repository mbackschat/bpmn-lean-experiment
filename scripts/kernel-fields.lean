import Lean

/-!
The field table of [DC29](../docs/REWRITE-2-PROPOSAL.md), read from the built environment because only the elaborated
structures show every field and its type, and only the elaborated table shows which field each row resolved to.

- `Kernel.Laws.State.fields` classifies, exactly once, every field of `Kernel.State` and of every structure its fields'
  types name that a state module (`Kernel.State` and its submodules) defines, but a key type (one with a lawful order,
  whose fields are its key's components) and a map's key, as content or index.
- A List-typed content field gives a registered reason its order is semantic, or the container change that removes the
  order; no other field gives one, and no reason is empty.
- An index summarizes content rows, so a body's read of it can be declared as a read of that content.
- Every map key type in those fields has the lawful order the kernel's maps need (`Std.TransOrd`, `Std.LawfulEqOrd`).

A value an inductive constructor carries is part of the field that holds it and has no rows of its own.

Usage, after `./scripts/lake.sh build Kernel kernelRun`: `./scripts/lake.sh run scripts/kernel-fields.lean`. Prints one
line per finding and exits 1 when it prints any. `--self-test` elaborates the fixture below with violations seeded
(guard 23) and exits 0 only when each is reported, no clean row is, and a scan of an environment with no kernel fails.
-/

open Lean Meta

namespace KernelFields

/-- The field table (DC29 of [the rewrite-2 proposal](../docs/REWRITE-2-PROPOSAL.md)): `table` classifies every field of
`root`, and of every structure a field's type names that a module under `stateModule` defines, except a key type (one
with a lawful order: its fields are its key's components) and a map's key; `maps` are the map types, each with the index
of its key argument. -/
structure FieldTableRule where
  table : Name := `Kernel.Laws.State.fields
  root : Name := `Kernel.State
  stateModule : Name := `Kernel.State
  maps : List (Name × Nat) := [(`Std.ExtTreeMap, 0)]

/-- One row of the table as read: its field, the content order reason it gives (`none` for no reason, `some ""` for an
empty one) and, for an index, the fields it summarizes. -/
structure FieldRow where
  field : Name
  index : Option (List Name)
  reason : Option String

/-- The elements of a list literal, read by weak-head reduction so a `let`-split literal reads alike. -/
partial def listElements (list : Expr) : MetaM (Option (List Expr)) := do
  let list ← whnf list
  match list.getAppFnArgs with
  | (``List.nil, _) => pure (some [])
  | (``List.cons, #[_, head, tail]) => return (← listElements tail).map (head :: ·)
  | _ => pure none

/-- A row of `rule.table`, whose types are declared beside it: `Field.mk field fieldClass`, with `FieldClass.content`
of an optional `ListOrder` or `FieldClass.index` of a name list. -/
def decodeRow (rule : FieldTableRule) (row : Expr) : MetaM (Option FieldRow) := do
  let types := rule.table.getPrefix
  let row ← whnf row
  let #[name, fieldClass] := row.getAppArgs | return none
  let some field := name.name? | return none
  let fieldClass ← whnf fieldClass
  match fieldClass.getAppFn.constName?, fieldClass.getAppArgs with
  | some ctor, #[order] =>
    unless ctor == types ++ `FieldClass.content do return none
    let order ← whnf order
    match order.getAppFn.constName?, order.getAppArgs with
    | some ``Option.none, _ => return some { field, index := none, reason := none }
    | some ``Option.some, #[_, reason] =>
      match (← whnf reason).getAppArgs with
      | #[text] =>
        match (← whnf text) with
        | .lit (.strVal text) => return some { field, index := none, reason := some text }
        | _ => return none
      | _ => return none
    | _, _ => return none
  | some ctor, #[summarizes, _] =>
    unless ctor == types ++ `FieldClass.index do return none
    let some names ← listElements summarizes | return none
    return some { field, index := some (names.filterMap (·.name?)), reason := none }
  | _, _ => return none

/-- Whether `type` has the lawful order the kernel's maps need: `Std.TransOrd` and `Std.LawfulEqOrd`. -/
def lawfulKey (type : Expr) : MetaM Bool := do
  try
    -- `mkAppM` leaves a trailing instance argument unfilled; `mkAppOptM` synthesizes it, failing without an `Ord`.
    let trans ← mkAppOptM ``Std.TransOrd #[some type, none]
    let lawful ← mkAppOptM ``Std.LawfulEqOrd #[some type, none]
    return (← synthInstance? trans).isSome && (← synthInstance? lawful).isSome
  catch _ => return false

/-- The map keys a type names: each `rule.maps` application's key argument. -/
def mapKeys (rule : FieldTableRule) (type : Expr) : Array Expr := Id.run do
  let mut keys : Array Expr := #[]
  let mut stack := [type]
  while !stack.isEmpty do
    let expr := stack.head!
    stack := stack.tail!
    if let .app .. := expr then
      let arguments := expr.getAppArgs
      if let some (_, index) := rule.maps.find? (some ·.1 == expr.getAppFn.constName?) then
        if let some key := arguments[index]? then keys := keys.push key
      stack := expr.getAppFn :: arguments.toList ++ stack
  return keys

/-- DC29's table against the state: a field without a row, a row without a field or twice, a List-typed content field
without an order reason, an order reason on a field that holds no list or an empty one, an index summarizing a field that
is no content row, and a map key without a lawful order. A missing root or table fails, so a rename cannot read as clean. -/
def fieldTableFindings (rule : FieldTableRule) (moduleOf : Name → Option Name) : MetaM (Array String) := do
  let env ← getEnv
  unless isStructure env rule.root do
    return #[s!"DC29: {rule.root} is not a structure, so the field-table scan read nothing"]
  let some table := (env.find? rule.table).bind (·.value? (allowOpaque := true)) |
    return #[s!"DC29: {rule.table} is not defined, so the field-table scan read nothing"]
  let mut findings : Array String := #[]
  -- The state's fields, each with whether its type holds a list.
  let mut fields : Array (Name × Bool) := #[]
  let mut seen : NameSet := {}
  let mut pending := [rule.root]
  while !pending.isEmpty do
    let record := pending.head!
    pending := pending.tail!
    if seen.contains record then continue
    seen := seen.insert record
    for name in getStructureFields env record do
      let some projection := getProjFnForField? env record name | continue
      let some info := env.find? projection | continue
      let reach ← forallTelescope info.type fun _ body => do
        let body ← deltaExpand body fun constant => getReducibilityStatusCore env constant == .reducible
        let keys := mapKeys rule body
        let mut unlawful : Array Expr := #[]
        for key in keys do
          unless ← lawfulKey key do unlawful := unlawful.push key
        let mut records : Array Name := #[]
        for constant in body.getUsedConstants do
          if keys.any (·.isConstOf constant) || !isStructure env constant then continue
          unless (moduleOf constant).any rule.stateModule.isPrefixOf do continue
          unless ← lawfulKey (mkConst constant) do records := records.push constant
        return (body.getUsedConstants.contains ``List, ← unlawful.mapM ppExpr, records)
      let (isList, unlawful, records) := reach
      fields := fields.push (projection, isList)
      for key in unlawful do
        findings := findings.push s!"DC29 {projection}: map key {key} has no lawful order (Std.TransOrd, Std.LawfulEqOrd)"
      pending := pending ++ records.toList
  -- The table's rows.
  let some elements ← listElements table |
    return findings.push s!"DC29: {rule.table} is not a list literal, so the field-table scan read nothing"
  let mut rows : Array FieldRow := #[]
  for element in elements do
    match ← decodeRow rule element with
    | some row => rows := rows.push row
    | none => findings := findings.push s!"DC29: a row of {rule.table} is not in the table's form: {← ppExpr element}"
  let contentRows := rows.filter (·.index.isNone) |>.map (·.field)
  for (field, isList) in fields do
    match rows.filter (·.field == field) with
    | #[] => findings := findings.push s!"DC29 {field}: a state field with no row in the field table"
    | #[row] =>
      if row.index.isNone then
        match isList, row.reason with
        | true, none => findings := findings.push s!"DC29 {field}: a List-typed content field with no registered order reason"
        | false, some _ => findings := findings.push s!"DC29 {field}: an order reason on a field that holds no list"
        | _, some "" => findings := findings.push s!"DC29 {field}: an empty order reason"
        | _, _ => pure ()
    | _ => findings := findings.push s!"DC29 {field}: more than one row in the field table"
  for row in rows do
    unless fields.any (·.1 == row.field) do
      findings := findings.push s!"DC29 {row.field}: a row in the field table for no state field"
    if let some summarized := row.index then
      if summarized.isEmpty then findings := findings.push s!"DC29 {row.field}: an index that summarizes no field"
      for name in summarized do
        unless contentRows.contains name do
          findings := findings.push s!"DC29 {row.field}: an index summarizing {name}, which is no content row"
  return findings

def run (env : Environment) (rule : FieldTableRule) (moduleOf : Name → Option Name) : IO (Array String) :=
  Prod.fst <$> (fieldTableFindings rule moduleOf).run'.toIO { fileName := "kernel-fields", fileMap := default } { env }

/-- A self-contained state with a nested record, map fields and a table that seeds each violation once. -/
def fixture : String := "
namespace Kernel
structure KeyMap (α β : Type) where
  entries : List (α × β)
structure State.LooseKey where
  index : Nat
structure State.Slots where
  held : List Nat := []
  count : Nat := 0
structure State where
  batchTokens : List Nat := []
  occurrences : List Nat := []
  activations : List Nat := []
  variables : List Nat := []
  writes : List Nat := []
  slots : State.Slots := {}
  loose : KeyMap State.LooseKey Nat := ⟨[]⟩
  counted : KeyMap Nat Nat := ⟨[]⟩
  busy : Nat := 0
  stale : Nat := 0
namespace Laws.State
inductive ListOrder where
  | semantic (reason : String)
  | container (change : String)
inductive FieldClass where
  | content (order : Option ListOrder := none)
  | index (summarizes : List Lean.Name) (erase : Kernel.State → Kernel.State)
structure Field where
  field : Lean.Name
  fieldClass : FieldClass
def stateRows : List Field := [
  ⟨``Kernel.State.batchTokens, .content (some (.semantic \"one unit's batch\"))⟩,
  ⟨``Kernel.State.occurrences, .content (some (.container \"keyed later\"))⟩,
  ⟨``Kernel.State.activations, .content (some (.semantic \"\"))⟩,
  ⟨``Kernel.State.writes, .content⟩,
  ⟨``Kernel.State.slots, .content⟩,
  ⟨``Kernel.State.loose, .content⟩,
  ⟨``Kernel.State.counted, .content⟩,
  ⟨``Kernel.State.busy, .index [``Kernel.State.batchTokens] id⟩,
  ⟨``Kernel.State.stale, .index [`Kernel.State.nowhere] id⟩,
  ⟨`Kernel.State.gone, .content⟩]
def slotRows : List Field := [⟨``Kernel.State.Slots.count, .content (some (.semantic \"not a list\"))⟩]
def fields : List Field := stateRows ++ slotRows
end Laws.State
end Kernel
"

/-- The fixture's modules, by namespace: the state's records are `Kernel.State`'s, the map `Kernel.IL.Types`'s. -/
def fixtureModuleOf (declaration : Name) : Option Name :=
  if (`Kernel.Laws).isPrefixOf declaration then some `Kernel.Laws.State
  else if (`Kernel.State).isPrefixOf declaration then some `Kernel.State
  else if (`Kernel).isPrefixOf declaration then some `Kernel.IL.Types
  else none

def expected : List String := [
  "DC29 Kernel.State.variables: a state field with no row in the field table",
  "DC29 Kernel.State.Slots.held: a state field with no row in the field table",
  "DC29 Kernel.State.writes: a List-typed content field with no registered order reason",
  "DC29 Kernel.State.activations: an empty order reason",
  "DC29 Kernel.State.Slots.count: an order reason on a field that holds no list",
  "DC29 Kernel.State.loose: map key Kernel.State.LooseKey has no lawful order",
  "DC29 Kernel.State.stale: an index summarizing Kernel.State.nowhere, which is no content row",
  "DC29 Kernel.State.gone: a row in the field table for no state field"]

/-- Fixture fields whose rows keep the table's rules: a reason given, a nested record, a lawful map key, an index. -/
def clean : List String :=
  ["Kernel.State.batchTokens:", "Kernel.State.occurrences:", "Kernel.State.slots:", "Kernel.State.counted:",
   "Kernel.State.busy:"]

def selfTest : IO UInt32 := do
  let base ← importModules #[{ module := `Init }] {} (loadExts := true)
  let (env, messages) ← Elab.process fixture base {} (some "kernel-fields-fixture")
  if messages.hasErrors then
    for message in messages.toList do IO.eprintln (← message.toString)
    IO.eprintln "the self-test fixture did not elaborate"
    return 1
  let findings ← run env { maps := [(`Kernel.KeyMap, 0)] } fixtureModuleOf
  let joined := "\n".intercalate findings.toList
  let mut failed := false
  for line in expected do
    unless (joined.splitOn line).length > 1 do
      IO.eprintln s!"self-test: the seeded violation was not reported: {line}"
      failed := true
  for field in clean do
    if (joined.splitOn s!"DC29 {field}").length > 1 then
      IO.eprintln s!"self-test: {field} keeps the field table's rules, yet was reported"
      failed := true
  let empty ← run base {} fixtureModuleOf
  unless empty.any (fun line => (line.splitOn "read nothing").length > 1) do
    IO.eprintln "self-test: a scan of an environment with no kernel did not fail"
    failed := true
  if failed then
    IO.eprintln joined
    return 1
  IO.println "kernel-fields self-test: every seeded violation was reported and the empty input failed"
  return 0

end KernelFields

open KernelFields in
unsafe def main (arguments : List String) : IO UInt32 := do
  initSearchPath (← findSysroot)
  enableInitializersExecution
  if arguments.contains "--self-test" then return ← selfTest
  let env ← importModules #[{ module := `Kernel, importAll := true }] {} (loadExts := true)
  let moduleOf (declaration : Name) : Option Name :=
    (env.getModuleIdxFor? declaration).bind fun idx => env.header.moduleNames[idx.toNat]?
  let lines := (← run env {} moduleOf).qsort (· < ·)
  for line in lines do IO.println line
  return if lines.isEmpty then 0 else 1
