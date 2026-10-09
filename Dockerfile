# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:26.10.0-bookworm-slim@sha256:3ffc19ea878019d9e9ae8971732ad4a03cda44f167107173174b60ed7c65bed3

FROM ${NODE_IMAGE} AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:${PATH}
WORKDIR /workspace
RUN npm install --global --ignore-scripts --no-audit --no-fund pnpm@11.20.0
COPY . .
RUN --mount=type=cache,id=bpmn-lean-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline
RUN pnpm \
    --filter @bpmn-lean/platform-server... \
    --filter @bpmn-lean/platform-recovery-worker... \
    --filter @bpmn-lean/platform-postgresql-migrate... \
    --filter @bpmn-lean/platform-web... \
    --filter @bpmn-lean/temporal-runner... \
    --if-present run build

FROM builder AS packager
RUN pnpm --config.inject-workspace-packages=true --filter @bpmn-lean/platform-server deploy --prod /out/platform-api
RUN pnpm --config.inject-workspace-packages=true --filter @bpmn-lean/platform-recovery-worker deploy --prod /out/platform-recovery-worker
RUN pnpm --config.inject-workspace-packages=true --filter @bpmn-lean/platform-postgresql-migrate deploy --prod /out/platform-migrate
RUN pnpm --config.inject-workspace-packages=true --filter @bpmn-lean/temporal-runner deploy --prod /out/bpmn-worker
RUN cp -R platform/apps/web/dist /out/platform-web

FROM ${NODE_IMAGE} AS runtime-base
ARG BPMN_EVALUATION_SOURCE_REVISION=unbound
ARG BPMN_EVALUATION_SOURCE_TREE_SHA256=unbound
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/mbackschat/bpmn-lean-experiment"
LABEL org.opencontainers.image.revision="${BPMN_EVALUATION_SOURCE_REVISION}"
LABEL io.bpmn-lean.evaluation.source-tree-sha256="${BPMN_EVALUATION_SOURCE_TREE_SHA256}"
USER node

FROM runtime-base AS platform-api
WORKDIR /app/platform-api
COPY --from=packager --chown=node:node /out/platform-api/ ./
COPY --from=packager --chown=node:node /out/platform-web/ /app/platform-web/
CMD ["node", "dist/main.js"]

FROM runtime-base AS platform-recovery-worker
WORKDIR /app/platform-recovery-worker
COPY --from=packager --chown=node:node /out/platform-recovery-worker/ ./
CMD ["node", "dist/main.js"]

FROM runtime-base AS platform-migrate
WORKDIR /app/platform-migrate
COPY --from=packager --chown=node:node /out/platform-migrate/ ./
CMD ["node", "dist/main.js"]

FROM runtime-base AS bpmn-worker
WORKDIR /app/bpmn-worker
COPY --from=packager --chown=node:node /out/bpmn-worker/ ./
ENTRYPOINT ["node", "dist/evaluation-worker-main.js"]
CMD []
