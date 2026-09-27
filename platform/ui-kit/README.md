# Platform UI kit

`@bpmn-lean/platform-ui-kit` provides reusable accessible React behavior and Product 2 design tokens. Business workflows, feature layout, and application state stay in the consuming web application.

## What you can do

Build forms, Boolean choices, tabs, modal and confirmation dialogs, inline disclosures, and native-table views with shared keyboard, focus, dismissal, and visual-state behavior.

- `ModalDialog` supplies the shared titled overlay and focus boundary; the feature owns its form, visible Cancel/Close button and pending state. `ConfirmationDialog` composes it with a safe initial Cancel action and destructive confirmation.
- `InlineDisclosure` supplies a visible Show/Hide button for supplementary content that expands in document flow. Do not use it for a floating form or hide a primary action inside it.

The [disclosure and dialog guideline](../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md#disclosures-and-dialogs) owns pattern selection and acceptance.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-ui-kit test
```

## Learn more

- [Web application](../apps/web/README.md) shows the kit in the complete Product 2 interface.
- [UI design specification](../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md) owns interaction, accessibility, responsive, and visual contracts.
- [Architecture](../../docs/ARCHITECTURE.md#user-interface) owns the package boundary.
