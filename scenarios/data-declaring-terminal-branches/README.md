# Data-declaring terminal branch scenarios

The [data-declaring terminal branches proposal](../../docs/capsules/DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [expense claim](expense-claim.bpmn) with its [handler](expense-claim-overlay.json) checks the claim policy and forks at the root into three branches: the plain Task *Assign reviewer* before the Sub-Process *Review claim*, which declares the local `verdict` and maps it out as `reviewVerdict`, and two wait-free branches to their own Ends, the Manual Task *File paper receipt* and the plain Task *Notify cost centre*.

One answer-free schedule:

- [Expense claim](expense-claim.scenario.json) returns the policy result, whose closure enters *Review claim* beside both wait-free Ends, then approves the claim, which completes *Review claim* and the Process.
