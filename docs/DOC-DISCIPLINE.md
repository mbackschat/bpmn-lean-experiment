# Documentation discipline

## Purpose and alignment

This document owns the repository’s documentation roles, filename contracts, lifecycle, placement, and same-change update rules. `CLAUDE.md` keeps the short triggers that contributors must see before acting; this document owns the rationale and procedure behind them.

The convention deliberately aligns with the sibling `a12-rulekit` documentation discipline inspected at the revision recorded in [SOURCES.md](SOURCES.md). The central shared rule is lifecycle-sensitive: `-SPEC` means an implemented current contract, while approved intent that is not implemented remains `-PROPOSAL`.

This project retains two deliberate assurance-specific control surfaces that `a12-rulekit` does not use in the same way: [PLAN.md](PLAN.md) owns immediate execution order and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) routes exact current claims to five cohesive detail implementation maps. Neither is a feature-history board.

## Filename grammar

Use uppercase kebab case:

```text
<SUBJECT>-<ROLE>.md
```

The role suffix is a contract, not decoration. Do not encode approval state, dates, semantic-profile versions, or release versions in a filename. Put exact status and identity inside the document or artifact.

Do not stack roles such as `-APPROVED-SPEC`, `-DRAFT-PROPOSAL`, or `-RESEARCH-DECISION`. Choose the role that owns the document’s content.

## Lifecycle roles

| Suffix | Contract |
|---|---|
| `-SPEC.md` | Stable current contract that is implemented and maintained with its producers, consumers, tests, and evidence |
| `-PROPOSAL.md` | Intent, rationale, proposed contract, and acceptance conditions that are not fully implemented |
| `-GAPS.md` | Only open, deferred, or explicitly out-of-scope work; shipped gaps are removed |
| `-LEDGER.md` | Durable row-by-row classification of a defined external or normative inventory; rows are retained |

An approved proposal remains a proposal until its contract is implemented. “Approved” answers whether implementation may proceed; `-SPEC` answers whether the maintained contract already describes the implemented surface.

## Evidence and governance roles

| Suffix | Contract |
|---|---|
| `-RESEARCH.md` | Read-only source study, external findings, alternatives, and bounded recommendations; not semantic authority |
| `-EXPERIMENT.md` | Bounded executable question with competing accounts, a separating witness, result, and disposition |
| `-DECISION.md` | Adopted choice, alternatives, rationale, consequences, and re-open conditions |
| `-POLICY.md` | Mandatory project procedure or governance boundary |
| `-REGISTER.md` | Living classified collection whose denominator is the set of items reviewed or registered, not necessarily an external complete corpus |
| `-MAP.md` | Current derived or maintained correspondence between claims and another live surface |
| `-TARGET.md` | Durable declared objective and its exact boundary, without implying implementation |
| `-GUIDE.md` or `-WALKTHROUGH.md` | Reader-facing use or explanation organized around a task or path |
| `-HANDOFF.md` | Preserved supplied or transferred context with an explicit authority boundary |

`-LEDGER` and `-REGISTER` are intentionally different. A ledger classifies a defined denominator and retains its rows. A register records every relationship that has entered review but does not imply that the unreviewed external universe has been enumerated.

## Reserved singleton names

The following names identify repository-wide owners and do not require another suffix:

- `README.md` — navigation and project front door;
- `ARCHITECTURE.md` — concrete repository layout, package dependency direction, deployment shape, and architecture decision register;
- `PROJECT-DESIGN.md` — the durable architectural argument and decision model;
- `PLAN.md` — current ordered work, blockers, and exact resume point;
- `CAPSULE-COST-LEDGER.md` — retained commit-bounded capsule and enabling-increment measurements;
- `SOURCES.md` — source provenance and controlled reference navigation;
- `IMPLEMENTATION-MAP.md` — mandatory routing entry point for exact live implementation, proof, evidence, and absence maps;
- `DOC-DISCIPLINE.md` — this documentation workflow;
- `CLAUDE.md` and `AGENTS.md` — mandatory contributor triggers and workflow.

Directory `README.md` files are human-facing local entry points, not independent policy owners or dense implementation ledgers. A component README starts with what the component is for, what a user can do with it, the shortest useful local command, and links to deeper contracts. When contributor or agent-facing detail remains necessary, move it into a linked purpose-named document: `SOURCE-MAP.md` owns source-file responsibilities, ownership, and implementation inventories; another existing role suffix such as `-REGISTER.md`, `-MAP.md`, or `-GUIDE.md` is valid only when its defined contract matches the content. Do not create a generic `INDEX.md`, because its name does not identify the document's owner or purpose. Repository-wide mandatory instructions stay in canonical `CLAUDE.md`, with `AGENTS.md` preserving its symlink. Short profile, scenario, schema, research, and capsule registries may remain in a README when the registry itself is the human navigation purpose.

### Suffixless singleton exceptions

The executable filename guard permits exactly these suffixless names under `docs/`; the longer list above also names singleton owners whose filenames already satisfy the role grammar or live at repository root:

- `README.md`;
- `ARCHITECTURE.md`;
- `PROJECT-DESIGN.md`;
- `PLAN.md`;
- `SOURCES.md`;
- `DOC-DISCIPLINE.md`.

## Status is separate from role

Every maintained proposal, spec, research result, experiment, decision, policy, target, and handoff must contain an exact `## Status` section within its first 15 nonblank lines. Archived and locally ingested reference documents are outside this current-status rule.

An active proposal uses exactly two machine-readable lines in its Status section:

```text
Lifecycle: <closed-value>
Review: <closed-value>
```

Lifecycle is one of `draft`, `owner-approved`, `implementation-in-progress`, `implemented-awaiting-closure`, `superseded`, or `archived`. Review is one of `pending`, `approved`, `approved-with-required-edits`, `rejected`, or `not-required`. Dates, commits, findings, scope narration, and implementation results belong in a current-boundary section, review receipt, plan, or implementation detail map rather than Status. Only `owner-approved`, `implementation-in-progress`, and `implemented-awaiting-closure` authorize implementation.

Other maintained document roles continue to use concise plain status language such as Draft, Owner-approved, Implemented, Evidence-closed draft, Superseded, or Archived.

A status never changes the suffix contract. An owner-approved but unimplemented document is still a proposal. An implemented spec may remain a draft compatibility contract when immutability or release approval is still absent.

## Proposal graduation

When a proposal is implemented:

1. complete the governed closure review and record the approved `Independent cold-review receipt` required by [TESTING-SPEC.md](TESTING-SPEC.md#review-receipt), using guarded checkpoint-reviewer warm continuity only when its executable manifest passes; pre-policy documents in the closed executable grandfather set do not receive invented historical receipts;
2. move the stable implemented contract into the corresponding `-SPEC.md`;
3. update every current producer, consumer, schema, test, evidence lane, and documentation owner in the same change;
4. remove implementation sequencing and completed-work narration from the spec;
5. move residual rejected, superseded, or historically useful rationale to `docs/archived/`, or delete it when Git contains all remaining history; successful graduation does not require preserving a second proposal copy beside the spec;
6. update the documentation registry and all inbound links atomically.

Do not leave a `-PROPOSAL.md` describing a shipped current surface. Do not create a `-SPEC.md` merely because a design has been approved.

## Specs and moving results

Specs own stable method, contracts, invariants, exclusions, and acceptance criteria. They do not own a chronological run diary.

Current measured verification results and exact resume state belong in [PLAN.md](PLAN.md). Stable gate definitions and evidence requirements belong in [TESTING-SPEC.md](TESTING-SPEC.md). The root [implementation map](IMPLEMENTATION-MAP.md) routes exact implemented or absent claims to the applicable detail map and does not duplicate them.

## Project document homes

| Information | Owner role |
|---|---|
| Project mission, authority, and durable product or semantic boundaries | `PROJECT-DESIGN.md` |
| Concrete repository layout, module ownership, dependency direction, and deployment shape | `ARCHITECTURE.md` |
| Implemented semantic feature contract | capsule `-SPEC.md` |
| Approved but unimplemented semantic feature | capsule `-PROPOSAL.md` |
| Checked graph and Semantic Process IL before implementation | `SEMANTIC-PROCESS-IL-SPEC.md` |
| Checked graph and Semantic Process IL after implementation | `SEMANTIC-PROCESS-IL-SPEC.md` |
| CIB behavior relative to BPMN | `CIB-BPMN-RELATION-REGISTER.md` |
| Reviewed normative BPMN requirement dispositions | root `BPMN-REQUIREMENT-LEDGER.md` |
| External-system and downstream-product findings, including their bounded compatibility ledgers | `research/*-RESEARCH.md` and `research/*-LEDGER.md` |
| Bounded executable questions | `experiments/*-EXPERIMENT.md` |
| Adopted one-time architecture or dependency choice | `*-DECISION.md` |
| Mandatory research-lane procedure | `*-POLICY.md` |
| Exact implementation and assurance status | The detail map registered by `IMPLEMENTATION-MAP.md` |
| Immediate work order | `PLAN.md` |
| Reproducible completed capsule cost and comparison | `CAPSULE-COST-LEDGER.md` |
| Retained process findings, their instance counts, and dispositions | `PROCESS-ASSESSMENT-LEDGER.md` |
| Test method and gates | `TESTING-SPEC.md` |
| External revisions and licenses | `SOURCES.md` |

## Same-change triggers

- Adding, renaming, moving, graduating, archiving, or deleting a document requires updating [the documentation registry](README.md), every inbound relative link, `CLAUDE.md` routing when applicable, and the repository link guard in the same change.
- A semantic implementation changes its capsule spec or graduates its proposal in the same change.
- A structural implementation-architecture change updates [ARCHITECTURE.md](ARCHITECTURE.md); a change to the mission, authority, or durable product and semantic boundaries additionally updates [PROJECT-DESIGN.md](PROJECT-DESIGN.md). Neither receives roadmap or transient status.
- A new external finding updates its owning research document and [SOURCES.md](SOURCES.md) when provenance changes.
- A new experiment records its question, competing accounts, separating witness, result, and disposition; an experiment never becomes semantic authority merely by passing.
- A changed gate updates [TESTING-SPEC.md](TESTING-SPEC.md); the last verified command and exact next action update [PLAN.md](PLAN.md).
- A changed implemented or absent surface updates each genuinely affected detail map registered by [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). The root map changes only when an area state, route, or cross-area invariant changes.
- A directory source map, register, or other purpose-named navigation owner changes in the same change as the contents it inventories.

## Writing and linking

Write one Markdown paragraph per line without fixed-column hard wrapping. Prefer a small table or diagram when it makes a comparison, ownership split, data flow, or lifecycle easier to scan.

Markdown line count is not a useful generic size metric under the one-paragraph-per-line rule. Reviewability is enforced at the ownership and review-unit boundary: split a document when it combines unrelated owners, makes mandatory context impractical to read in full, or exceeds an applicable document-specific executable limit.

Match a document's length to the substance its owner actually holds. Do not pad with filler sections, redundant summaries, restated context, or boilerplate. Apply a deletion test to each paragraph: if removing it loses no owned fact, invariant, decision, evidence pointer, or exclusion, remove it.

Use regular relative Markdown links for project documents. Do not duplicate an owned fact merely to avoid a link.

When a fact genuinely must appear in two owners, the change that creates the second copy adds an executable check that fails when the copies disagree. A claim written about a referent without reading that referent is the mechanism behind both rejected closure targets recorded in this repository, and a copy nobody compares is the same defect waiting on a reader who does not check. Project boundaries belong in [PROJECT-DESIGN.md](PROJECT-DESIGN.md); their concrete package realization belongs in [ARCHITECTURE.md](ARCHITECTURE.md), which links to those boundaries instead of restating their rationale.

Write documents as current contracts or arguments, not changelogs. Preserve historical rationale only where it remains useful; keep volatile disposition in [PLAN.md](PLAN.md), a `-GAPS` document, or an archived proposal.

## Verification

After a documentation change, run:

```sh
./scripts/verify.sh
git diff --check
```

The infrastructure gate enumerates maintained Markdown outside the ignored normative reference corpus, requires every document to appear in [the documentation registry](README.md), enforces the role suffixes and reserved singleton names above, and fails if a project-authored local Markdown file or heading anchor is stale. The focused control-plane guards additionally require the four-section plan, one active stable work ID, matching resume ID, exact root/detail map registry, independent tracked-path routing, map word and review-unit bounds, proposal Status contract, and delegated capsule scope. A rename is incomplete until those guards and every applicable focused gate are green.
