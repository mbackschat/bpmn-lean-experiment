# Platform identity policy foundation

This package owns immutable actor snapshots and Product 2 authorization mechanisms. The Human Work policy retains exact candidate-group visibility, self-claim, and self-audit behavior.

Incident operations add one `OperationsAuthorizationPolicy` that applies exact membership in one configured group uniformly to incident list, detail, action, and audit. It consumes the existing actor shape, performs no identifier normalization, and selects no authentication provider or tenant model.

[ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#foundation-packages) owns the package boundary.
