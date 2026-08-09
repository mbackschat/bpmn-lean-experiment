# Platform web application

This directory will contain the static React SPA. It consumes only the public HTTP API and never imports server, module, foundation, or engine implementation code.

The approved `bpmn-js` dependency is retained here for viewer-only diagram rendering. Its [bpmn.io license](public/third-party/bpmn-js.LICENSE.txt) requires the supplied bpmn.io watermark to remain unchanged, fully visible, linked to `https://bpmn.io`, and unobstructed. Keeping the exact notice under `public/` makes it part of the future static distribution. The future viewer adapter and browser acceptance gate must enforce the watermark condition. Modeling, editing, and any use of renderer parsing as an engine admission or semantic decision remain excluded.

M1 web behavior and UI dependencies are not implemented yet. See [the architecture](../../../docs/ARCHITECTURE.md#user-interface) and [the platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md#api-first-architecture).
