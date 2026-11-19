# Owner intents

The owner's standing intents, priorities, concerns and working mode, in the owner's terms. Agents are assessed by how well they follow and honor them. A later owner statement supersedes an earlier one only where it says so; where this record and another document disagree, raise it with the owner rather than choosing.

## Goal and scope (2026-11-17)

- The goal is Product 2: the BPM platform, deployed and used by a third party on their own BPMN models, on the engine. [Practical CIB7 Coverage](PRACTICAL-CIB7-COVERAGE-TARGET.md) was a milestone on the way, not the goal.
- Scope is settled in the documents and is not re-derived in conversation: [PROJECT-DESIGN](PROJECT-DESIGN.md) (mission, the CIB Seven `2.2.0` implemented-breadth ceiling, no drop-in API replacement), the [conformance target](BPMN-CONFORMANCE-TARGET.md), the [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) with its exclusions, and the [showcase milestone ladder](SHOWCASE-MILESTONE-LADDER-DECISION.md). Any exclusion list is at most a subset of their exclusions. Before a decision is raised with the owner, or marked as an owner decision in any document, it is checked against these documents and their wording is quoted. A true technical fact never narrows settled scope: for example, both profiles stay selectable even though P6 binds only the standards profile.
- The product is gap-less and issue-less, built on the promised design, with a clean codebase.

## Priorities and concerns (2026-11-17)

- **No more surprises.** Every costly topic is disclosed up front, with evidence and a real cost, before work depends on it; the promise holds at all times until the plan is written, and after it under [CLAUDE.md's goal and milestone rules](../CLAUDE.md#goal-and-milestones).
- **Preparation first.** Before a second rewrite is approved: a full disclosure of all costly topics; a full design based on the current one with the discovered fixes built in; proof that every costly topic is well prepared, properly designed and its cost real (measured calibration, not estimate alone); one cold review; then a plan the owner approves. Being well prepared for all costly topics is the first priority; reuse of the current code is welcome where the disclosure shows no costly topic forces a change.
- **Cost proportion.** The first rewrite took about 7 agent-days; spending about three times that on one proof (P6) is unacceptable, and so is discovering the next costly issue only after committing.
- **Milestones serve the goal.** Design for the goal and build toward the milestone; every milestone acceptance presents a priced ledger of what remains to the goal; a disclosed limit is debt, not an end state.
- **Kernel design risk first (2026-11-19).** The highest risk is the Lean kernel's design against the CIB7/BPMN 2.0.2 coverage: bad core designs found late caused both earlier rewrites. Product 2's finishing (UI, operator surfaces) carries far less risk. Kernel-touching breadth is therefore probed through the core and built before the platform.
- **Bounds change later (2026-11-17).** Every value, state and capacity bound is expected to change later; the architecture keeps each in one owner and changeable without rework.
- **Own models (2026-11-17).** The owner may add their own models to the goal's census at any time; the plan does not wait for them, and the root asks for them at a later stage.
- **Docs are part of the product.** `docs/` and `docs/kernel/` are reworked with the design; every document gets a keep, revise, replace or retire verdict.

## Working mode (2026-11-17)

- Decide autonomously in the session, but only after double-checking the premise of the decision (the findings) and the recommendation itself. Record the decision and its rationale, and report it.
- Push back, offer alternatives, or ask for a decision when warranted; escalate only a real blocker: something the owner would not like or expect and that changes the game.
- When the owner says stop, stop every agent and background job, verify with the agent list that none runs, and wait.
