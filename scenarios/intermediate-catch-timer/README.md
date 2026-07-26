# Intermediate Catch Timer scenario

The answer-free [scenario](scenario.json) starts the exact [BPMN Process](process.bpmn), observes one `PT1S` timer occurrence at logical deadline 1000 ms, and supplies an explicit exact-deadline `fireTimer` semantic input. Lean and the TypeScript semantic core apply that input directly. CIB Seven realizes it through controlled-clock advancement and eligibility-gated job execution. The Temporal adapter must derive the identical content-bound stimulus from committed semantic state and must not receive it through scenario delivery.

Expected observations remain outside the scenario in content-bound retained CIB evidence and verifier-side assertions.
