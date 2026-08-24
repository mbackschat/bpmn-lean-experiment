# Runtime-state Activity issuing-discipline proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

[The runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity) records identity non-reissue as an open two-state obligation. Its implemented `RSI-BOUND-01` slice proves that every live Activity occurrence activation is at or below the Activity element's recorded high-water mark, and `RSI-MONO-01` proves that the mark does not decrease across a committed transition. Neither rule constrains the activation chosen when a later transition adds an Activity occurrence that was absent from its predecessor, so both admit the three-state counterexample already retained by the invariant account: activation 1 is live under counter 1, then withdrawn under counter 1, then reintroduced as activation 1 under counter 1.

Sequential Multi-Instance publishes the outer Activity occurrence identity and retains it across body turnover. [Its active proposal](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md#public-contract) therefore blocks execution registration until the Activity family states and discharges the missing issuing discipline, or until the public projection is narrowed. This proposal selects the additive discipline. It does not narrow `ActivityOccurrenceId`, change any BPMN meaning, or register the Multi-Instance profile.

## Selected rule

`RSI-ISSUE-01`: for a committed successor pair `(before, after)`, every Activity occurrence record in `after` whose exact Activity occurrence identity is absent from `before` has an activation strictly greater than the `before.activityActivations` high-water mark for its `activityElementId`.

In typed pseudocode:

```text
for every record in after.activityOccurrences:
  if no prior in before.activityOccurrences has
       prior.processInstanceId == record.processInstanceId
    && prior.activityElementId == record.activityElementId
    && prior.activation == record.activation:
      activityActivationCount(before, record.activityElementId) < record.activation
```

The antecedent is a criterion over the committed pair, not a list of operation kinds. A transition issues an Activity identity exactly when the identity exists after the transition and did not exist before it. A body replacement that preserves the outer identity is not an issue. A removal is not an issue. A duplicate insertion of an identity already live is handled by `RSI-UNIQ-02`, while reintroduction after an intervening committed withdrawal is an issue and is refused by this rule.

The conclusion is deliberately `preCount < activation`, not `activation = preCount + 1`. Every current issuer uses the exact successor value, but the weaker strict inequality is the non-reissue obligation and remains compatible with a future transition that atomically issues several distinct occurrences for one Activity element and advances the post-state high-water mark to their maximum. `RSI-BOUND-01` separately requires every resulting live activation to be at or below that post-state mark, and `RSI-MONO-01` separately prevents the mark from decreasing.

## Why the three rules establish Activity non-reissue

Suppose an Activity identity is live in a committed state, is absent from a later committed state, and appears again after another committed transition. `RSI-BOUND-01` places its old activation at or below the counter while it is live. Repeated `RSI-MONO-01` steps keep every later pre-state counter at or above that value. Because the identity is absent immediately before its reappearance, `RSI-ISSUE-01` requires the new activation to be strictly above that later counter. The reappearing activation is therefore strictly above the retired activation and cannot be the same identity.

This argument is family-local. It establishes non-reissue for `ActivityOccurrenceId` only. User Task, Timer, Message, Effect, Event race, Call, and Scope issuing disciplines remain outside this proposal even where they use analogous counters.

## Current issuer audit

The audit is criterion-driven: inspect every production assignment to `activityOccurrences`, then classify the assignment by whether it can leave an identity in the successor that was absent from the predecessor. The current roots are:

| Root mechanism | Lean realization | TypeScript realization | Issue behavior |
|---|---|---|---|
| bounded and monitored User Task arming | [`activateBoundedUserTask`](../BpmnSemantics/SemanticProcess/WaitActivation.lean) | bounded and monitored task runtime arming | mints `preCount + 1` and writes the same value to `activityActivations` atomically |
| bounded Sub-Process arming | [`armScopeDeadline`](../BpmnSemantics/SemanticProcess/BoundedScopeArming.lean) | bounded-scope runtime arming | mints `preCount + 1` and writes the same value to `activityActivations` atomically |
| sequential Multi-Instance entry | reuses `activateBoundedUserTask` | sequential Multi-Instance runtime entry | mints `preCount + 1` and writes the same value to `activityActivations` atomically |

The remaining production writers map, replace, filter, or regionally withdraw records. [Activity body turnover](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#lean-assurance-lane) replaces the body while preserving the exact outer Activity identity and counter. Completion, interruption, called-instance removal, and regional cancellation remove records. None creates a successor identity absent from its predecessor.

This table is evidence about the current implementation, not the membership definition. A new writer belongs to the rule automatically when it meets the pairwise criterion, even if it introduces a new operation kind or shares none of the current helper functions.

## Lean and TypeScript contract

Lean adds one named decidable pair predicate for `RSI-ISSUE-01` beside the two-state runtime relations. `RuntimeStateMonotone` incorporates that predicate so a caller cannot claim the complete Layer 3 relation while omitting the issuing discipline. The Lean lane proves the shared arming root and bounded-scope root satisfy the rule, proves record-preserving and record-removing rewrites satisfy it without advancing the Activity counter, and retains one kernel-decided three-state reissue witness that passes the identity bound and counter monotonicity but fails the issuing discipline.

The independently structured TypeScript account adds a distinct `RuntimeStateRegression` arm for an Activity issue at or below the predecessor counter. `runtimeStateRegressions` evaluates the pairwise criterion directly rather than dispatching on operation kinds. The preservation lane continues to enumerate evaluator-produced successors and must report no regression. A focused negative constructs the same three committed states without copying a Lean result, and a second positive reaches a later valid issue through an actual Activity arming evaluator after withdrawal.

The two implementations intentionally share the rule and wire representation but not an implementation algorithm. The common-mode risk is a shared mistaken definition of "newly issued". The separating cases are therefore structural: body turnover preserves the identity and must pass without a counter advance; withdrawal followed by exact reintroduction must fail; withdrawal followed by a higher activation from an evaluator must pass; and adding a future issuer without updating an operation enumeration cannot escape because neither oracle enumerates operations.

## Registration consequence

Once the rule is implemented and its governed checkpoint is approved, the Activity-family non-reissue premise used by the public `OpenSequentialMultiInstance.id` projection is stated and discharged for every current Activity issuer. Sequential Multi-Instance registration may then cite the stable invariant, the per-root Lean laws, the independent TypeScript regression oracle, and its own evaluator evidence. No projection narrowing or compatibility branch is introduced.

This proposal does not itself register the profile. Registration still waits for the capsule's Temporal host class, refinement witnesses, measured capacity owner, complete gates, and closure review.

## Temporal hosting and refinement preflight

This amendment adds no transition family, durable ingress, wait, timer, effect, cancellation route, lifecycle state, or public projection. Its Temporal relevance is information preservation: a carried Activity high-water mark must remain paired with the exact committed Activity occurrence identities across replay and Continue-As-New. Existing exact-state carry already transports both fields. The smallest host-side witness remains the sequential Multi-Instance recovery case that preserves the outer Activity identity and counter through body turnover and Worker replacement; this amendment adds the semantic premise that prevents a later evaluator step from reissuing a retired outer identity.

No Event History fact, Workflow Run ID, Activity attempt, retry, or Temporal Task is interpreted as BPMN identity. A host cannot repair a violating successor by renumbering it. The semantic transition is defective and must fail the semantic evidence lane.

## Required and excluded implementation

Required:

- one criterion-based Lean pair predicate and its integration into the complete Layer 3 relation;
- one independent TypeScript pair oracle and a distinct regression classification;
- the three-state reissue negative, the identity-preserving turnover positive, and a later valid evaluator issue;
- per-root Lean discharge for the current Activity issuers, with shared roots proved once and reused by their consumers;
- preservation-lane coverage that fails if any evaluator creates an Activity identity at or below the predecessor counter;
- stable-owner, routed-map, capsule, cost, and PLAN updates in the same change as the implementation claim they change.

Excluded:

- changing the `ActivityOccurrenceId` representation or public projection;
- changing an Activity arming transition that already uses `preCount + 1`;
- adding a history field or deriving identity from Temporal history;
- extending the rule to another counter family;
- closing general quantified preservation of every runtime-state conjunct;
- changing cross-family Activity wait withdrawal or scope-cancellation controller cleanup;
- registering Sequential Multi-Instance before its remaining Temporal, refinement, capacity, and closure obligations pass.

## Evidence and stage boundary

The first Red is the three-state counterexample. It must be accepted by `runtimeStateIdentityBound`, accepted by the counter-monotonicity part of the pair relation, and rejected only by the new issuing rule. The second instance is not another hand-built reissue: after a real family withdraws activation 1 while retaining counter 1, its evaluator must issue activation 2 and pass. This distinguishes a correct rule from a patch that rejects all post-withdrawal arming.

The first green checkpoint changes a two-state proof boundary and the classification of successor regressions, so it receives a governed semantic checkpoint review. It changes no public schema or observation. Closure remains with the active Sequential Multi-Instance capsule after Temporal and capacity evidence land.

Focused implementation gates are the narrow Lean modules through [`./scripts/lake.sh`](../scripts/lake.sh), the semantic-core runtime-state and Activity-family tests, the preservation lane, the source-contract and import-boundary guards, and `git diff --check`. The root then runs the complete applicable semantic gate and the selected clean-HEAD pre-push entry point at the governed boundary. The exact Temporal pins remain unchanged.

## Same-change owners and reopen conditions

Implementation changes the residual absence recorded by [the runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity), the non-reissue premise in [Activity occurrence ownership](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md), the registration blocker and evidence lanes in [Sequential Multi-Instance](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md), and the runtime/proof, semantic-family, and Temporal routed maps. Those owners must distinguish "Activity family discharged" from the still-open issuing disciplines of every other identity family.

Reopen this account if Activity counters cease to be per-element high-water marks, if an Activity identity can enter a committed successor through restore or import rather than a semantic transition, if a transition can issue several occurrences but cannot advance the post-state mark to cover all of them, if body turnover changes the outer Activity identity, or if the public projection ceases to expose `ActivityOccurrenceId`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

Cold proposal review is required because this selects a new two-state invariant, changes the proof boundary, and supplies a premise for a published runtime identity. No implementation is authorized before an approved proposal review and owner-approved lifecycle.
