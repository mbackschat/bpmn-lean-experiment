module

public meta import Lean.Meta.Eqns
public meta import Lean.Meta.Match.MatchEqsExt
public meta import Lean.Meta.Match.MatcherInfo
public meta import Lean.ReservedNameAction
public meta import Lean.DefEqAttrib

/-!
Declares equation lemmas of hidden definitions as ordinary private declarations, before a proof's `simp [f]`,
`rw [f]` or `unfold f` would realize them. Lean v4.34.1 exports every realized constant, even a private one
(`Environment.lean:723-724`, an upstream `TODO`), so a realized lemma states a hidden body in the module's public
`.olean` and a body edit rebuilds every importer; an ordinary private declaration is never exported
(`AddDecl.lean:138-143`), and Lean reuses an equation lemma already present under its expected name
(`Eqns.lean:225`, `:313`). The lemmas are the ones Lean would realize, computed by the same functions.
-/

public meta section

open Lean Meta

/-- The constants `names` need that `env₀` lacks, dependencies first. -/
private partial def realizedClosure (env₀ : Environment) (names : Array Name) : MetaM (Array ConstantInfo) := do
  let rec visit (n : Name) (seen : NameSet) (out : Array ConstantInfo) : MetaM (NameSet × Array ConstantInfo) := do
    if seen.contains n || env₀.contains n then return (seen, out)
    let info ← withoutExporting <| getConstInfo n
    let mut state := (seen.insert n, out)
    let used := info.type.getUsedConstants ++
      ((info.value? (allowOpaque := true)).map (·.getUsedConstants) |>.getD #[])
    for dependency in used do
      state ← visit dependency state.1 state.2
    return (state.1, state.2.push info)
  let mut state : NameSet × Array ConstantInfo := ({}, #[])
  for n in names do
    state ← visit n state.1 state.2
  return state.2

/-- The constants whose user-facing name is `user`: itself, else this module's private one, else every opened module's. -/
private def constantsNamed (user : Name) : MetaM (Array Name) := do
  let env ← getEnv
  if env.contains user then return #[user]
  let own := mkPrivateName env user
  if env.contains own then return #[own]
  return env.constants.map₁.fold (init := #[]) fun found n _ =>
    if privateToUserName? n == some user then found.push n else found

/-- The one constant whose user-facing name is `user`; several are an error, since none of them is the definition. -/
private def constantNamed? (user : Name) : MetaM (Option Name) := do
  match ← constantsNamed user with
  | #[n] => return some n
  | #[] => return none
  | several => throwError "{user} names several private constants: {several}"

/--
The matcher among the prefixes of `user`, whose equations, splitter and their helpers Lean realizes together. A prefix
may name helpers that several opened modules realized privately, such as a splitter; only the matcher, which its
definition's module declares once, has to be unique.
-/
private partial def matcherAbove? (user : Name) : MetaM (Option Name) := do
  match user with
  | .str parent _ | .num parent _ =>
    let env ← getEnv
    match (← constantsNamed parent).filter (isMatcherCore env) with
    | #[matcher] => return some matcher
    | #[] => matcherAbove? parent
    | several => throwError "{parent} names several matchers: {several}"
  | .anonymous => return none

/--
Realizes a dependency of an equation lemma the way Lean does: a reserved name through its action, a matcher's
equations, splitter and their helpers through `Match.getEquationsFor`. A copy would bypass the registration later
lookups need (`failed to retrieve match equations`). These state matchers and helpers, never a definition's body.
-/
private def realizeDependency (dependency : Name) : MetaM Unit := do
  if (← getEnv).contains dependency then return
  if isReservedName (← getEnv) dependency then
    executeReservedNameAction dependency
  else if let some matcher ← matcherAbove? ((privateToUserName? dependency).getD dependency) then
    discard <| Match.getEquationsFor matcher
  unless (← getEnv).contains dependency do
    throwError "unexpected realized dependency {dependency}"

/-- `name`, or the private definition, of this module or an opened one, whose user-facing name it is. -/
private def definitionNamed (name : Name) : MetaM Name := do
  let some declName ← constantNamed? name | throwError "no definition {name}"
  return declName

/--
Declares the equation lemmas, and the unfolding lemma of a recursive definition, of each definition `scope ++ name`
as ordinary private declarations; the names are appended, never resolved, so no open namespace can redirect one. It
fails when a definition's lemmas were realized earlier in the module, since those are exported already.
-/
def privateEquations (scope : Name) (names : Array Name) : MetaM Unit := do
  for name in names do
    let declName ← definitionNamed (scope ++ name)
    let env₀ ← getEnv
    -- Only an exported lemma is a leak, and the `.olean` writer exports what `find?` finds while exporting,
    -- realizations included (`Environment.lean:1874-1875`); well-founded recursion's eager private `eq_def`
    -- (`WF/Unfold.lean:211-238`) is no realization and stays out of that view.
    for suffix in #["eq_1", "eq_def", "eq_unfold"] do
      if ((env₀.setExporting true).find? (mkEqLikeNameFor env₀ declName suffix)).isSome then
        throwError "{declName}: its {suffix} lemma was realized before this call; move the call before its first use"
    let infos ← withoutModifyingEnv do
      let some eqns ← getEqnsFor? declName | throwError "{declName} has no equation lemmas"
      let unfold? ← getUnfoldEqnFor? declName
      realizedClosure env₀ (eqns ++ unfold?.toArray)
    for info in infos do
      if (← getEnv).contains info.name then continue
      -- Only an equation-like lemma states a definition's body; it is the one to keep out of the public `.olean`.
      unless (declFromEqLikeName env₀ info.name).isSome do
        realizeDependency info.name
        continue
      let .thmInfo thm := info | throwError "{declName}: unexpected realized constant {info.name}"
      addDecl (.thmDecl thm)
      inferDefEqAttr info.name

end
