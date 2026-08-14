# Platform UI kit

This package owns reusable accessible behavior and platform design tokens. Its React Aria Button, TextField, Checkbox, explicit Boolean radio-choice, tabs, and confirmation-dialog primitives preserve native interaction, keyboard, focus-containment, and dismissal semantics, while its TanStack Table wrapper supplies a headless row model rendered as a native table. It contains no deployment, task, operations, or other business workflow.

Feature layout and visual rules remain in the consuming application's CSS Modules. The kit exports one small global stylesheet for shared tokens and primitive states because those classes are an intentional cross-feature contract. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#user-interface) owns the boundary.

Build and test the package with `./scripts/pnpm.sh --filter @bpmn-lean/platform-ui-kit test`.
