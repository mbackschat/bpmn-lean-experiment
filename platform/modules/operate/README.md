# Operate module

The Operate module owns Product 2 cross-instance discovery and operator actions. It keeps the exact confirmed public Process identity and private opaque engine locator together, freshly observes every nonclosed registration for current incidents, and returns no partial aggregate.

Its Fetch-compatible route contributes only `GET /api/v1/process-instances`. Exact optional filters and opaque cursor paging cross unchanged to the search service, while malformed query or body transport is rejected before search.

Incident Retry and root-Process Cancel actions bind the authorized actor, complete published interaction, hosting identity, incident identity, and locator before Product 1 is called. Their reserved and outcome transitions share a SQLite transaction with an exact audit outbox snapshot. Outbox delivery is acknowledged before the first engine call, uncertain submissions retain an indeterminate result for exact reconciliation, and distinct action IDs remain independent.

The module stores private active, closed, and indeterminate registration classifications but never persists an incident as current semantic authority. It does not inspect Temporal, Event History, diagnostic traces, Activity attempts, or derive lifecycle or action eligibility from Product 2 state.
