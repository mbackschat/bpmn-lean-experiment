# Repeated, nested and concurrent Call sources

This directory contains one exact BPMN 2.0.2 source, the [supplier onboarding source](supplier-onboarding.bpmn), for the [repeated, nested and concurrent Calls proposal](../../docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-PROPOSAL.md). Clause 10.3.6 makes each Call Activity activation transfer control to its called element, and Clause 13.3.4 gives the called Process the instantiation and completion semantics of a Sub-Process, so every activation creates its own called instance and the Call Activity completes when that instance completes. That is the mechanism this source witnesses.

The entry Process registers a supplier and forks into collecting tax documents followed by the Tax approval Call, and collecting bank details followed by the Bank approval Call. Both Calls run Four-eyes approval (Prepare approval, then Approve). After the join, Review risk calls Supplier risk review, which assesses the risk and then reaches the nested Check compliance Call of Compliance check (Screen sanctions). Final approval then calls Four-eyes approval a third time.

- Repeated and concurrent: the three Four-eyes approval instances have distinct called identities, and their User Task activations count per element across all instances in commit order. A completion order never routes a return to another instance's caller, including an instance of the same definition.
- Nested: the nested call keeps the outer called root live. Supplier risk review holds no task of its own and is not completed while Screen sanctions waits, so the inner return precedes the outer return.

A called instance's tasks carry that instance's own `processInstanceId`, derived deterministically from the caller instance, the Call element and the Call activation, for example `call:10:Instance_1:24:CallActivity_TaxApproval:1` for the Tax approval instance of `Instance_1`. The scenarios address called tasks by these literal identities.

The focused [runtime test](../../packages/bpmn-source/test/repeated-nested-concurrent-calls-runtime.test.ts) drives both completion orders and the nested return through the semantic core.

Two answer-free schedules are registered as standards-only [pipeline cases](../../packages/differential/test/repeated-nested-concurrent-calls-pipeline-cases.ts), each with one seeded mutation:

- [Natural order](natural-order.scenario.json) completes every task in the order the instances were invoked, tax approval before bank approval, then risk review, sanctions screening and final approval, to Process completion. Its mutation completes the outer called root while its nested call is live, which would open Final approval's Prepare approval beside Screen sanctions.
- [Reverse order with stale and cross-addressed completions](reverse-order-stale-and-cross-addressed.scenario.json) finishes the bank approval instance before the tax approval instance, so the bank instance returns into its own branch and the join keeps waiting for the tax instance. While the tax instance is live, it completes a bank task addressed with the tax instance's identity, and after the tax instance has returned it completes the tax instance's Approve task again; both are rejected with the state unchanged. Its mutation retires the tax instance at the bank return, as a return selected by the called definition or by the first-invoked record would.
