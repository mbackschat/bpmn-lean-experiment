# Operate module

The Operate module owns Product 2 cross-instance discovery. Its first capability is an append-only registry of exact public Process-instance identities that Product 2 has confirmed through an admitted producer.

Its Fetch-compatible route contributes only `GET /api/v1/process-instances`. Exact optional filters and opaque cursor paging cross unchanged to the search service, while malformed query or body transport is rejected before search.

The module does not infer lifecycle state, inspect Temporal, or project transition history. Its public item is the existing semantic Process-instance identity plus exact deployed-definition snapshot.
