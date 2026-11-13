# Concurrent scope Service Task sources

This directory contains two exact BPMN 2.0.2 sources and their handler overlays for the [concurrent scope Service Tasks proposal](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md). Each places data-free, overlay-bound Service Tasks alongside User Tasks, so several external effects are open at once beside human work and inside nested or concurrently live Sub-Process occurrences. Clause 13.3.3 activates one Service Task instance per arriving token, and Clause 13.3.4 keeps a Sub-Process open while any contained Activity is active. That is the mechanism these sources witness.

- The [supplier screening source](supplier-screening.bpmn) screens sanctions lists and verifies the bank account as Service Tasks beside a contract review in one Parallel block of the Onboard Sub-Process. Approval follows the join, and the root activates the supplier through a third Service Task only after Onboard completes. Its [handler overlay](supplier-screening-handlers.json) binds the three named handlers.
- The [claim intake source](claim-intake.bpmn) collects a police report and fetches the policy record in parallel. Both branches merge into their own Assess evidence item occurrence, whose Price damage Service Task runs before Confirm assessment, so two Price damage effects of one element are open at once. Its [handler overlay](claim-intake-handlers.json) binds the two named handlers.

Four answer-free schedules are registered as standards-only pipeline cases, each with one seeded mutation. Their effect completions carry content-bound command IDs, so the Temporal run releases each concurrent Activity result in the scenario's order:

- [Supplier, review first](supplier-review-first.scenario.json) completes the contract review, then sanctions screening, then bank verification.
- [Supplier, effects first](supplier-effects-first.scenario.json) completes both effects in reverse order before the review.
- [Claim, Price damage 2 first](claim-price-two-first.scenario.json) completes the second Assess occurrence's Price damage while the first one's stays open.
- [Claim, policy first](claim-fetch-first.scenario.json) fetches the policy before the police report, so the first Assess occurrence owns only its Price damage wait while Collect police report is open, and later the second owns only its own.
