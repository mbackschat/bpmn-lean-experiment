# Platform browser walkthrough screenshot project

This documentation-only Playwright project captures the stable landmarks used by the maintained [BPM platform browser walkthrough](../../docs/BPM-PLATFORM-BROWSER-WALKTHROUGH.md). It drives an already-running containerized evaluation distribution exclusively through its public browser UI. It does not start Docker, import product or showcase helpers, intercept requests, compare pixels, or supply an alternative host.

The ordered names and concise alternative text live in [`src/screenshot-catalog.ts`](src/screenshot-catalog.ts). Capture uses the tracked [`expense-exception-review`](../../scenarios/expense-exception-review/process.bpmn) and [`service-task-effect`](../../scenarios/service-task-effect/process.bpmn) BPMN files through the visible deployment file input. Generated images belong in [`docs/assets/bpm-platform-browser-walkthrough`](../../docs/assets/bpm-platform-browser-walkthrough/).

The ordinary focused loop is service-free:

```sh
node --test showcase/platform-browser-walkthrough/test/*.test.ts
./node_modules/.bin/tsc -p showcase/platform-browser-walkthrough/tsconfig.json --noEmit
```

Screenshot replacement is intentionally explicit. The repository command starts an isolated evaluation distribution on a dynamic loopback port and removes its named volumes after capture:

```sh
./scripts/pnpm.sh run walkthrough:screenshots:refresh
```

For an advanced already-running distribution, manage its lifecycle outside this package and invoke the package directly:

```sh
BPMN_EVALUATION_ORIGIN=http://127.0.0.1:3000 \
BPMN_REFRESH_WALKTHROUGH_SCREENSHOTS=true \
./scripts/pnpm.sh --filter @bpmn-lean/showcase-platform-browser-walkthrough refresh
```

The capture is a documentation aid, not semantic, compatibility, visual-regression, or performance evidence. The browser walkthrough remains text-first and usable when no screenshot tooling is installed.
