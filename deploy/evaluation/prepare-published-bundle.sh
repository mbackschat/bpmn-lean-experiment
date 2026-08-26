#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  printf 'usage: %s SOURCE_ROOT SOURCE_REVISION SOURCE_TREE_SHA256 BUNDLE_ROOT\n' "$0" >&2
  exit 64
fi

source_root=$1
source_revision=$2
source_tree_sha256=$3
bundle_root=$4
image_prefix=${BPMN_EVALUATION_IMAGE_PREFIX:-ghcr.io/mbackschat/bpmn-lean-experiment}
image_tag=sha-$source_revision

if ! printf '%s\n' "$source_revision" | grep -Eq '^[0-9a-f]{40}$'; then
  printf 'Candidate source revision must be an exact lowercase commit SHA\n' >&2
  exit 1
fi
if ! printf '%s\n' "$source_tree_sha256" | grep -Eq '^[0-9a-f]{64}$'; then
  printf 'Candidate source-tree digest must be an exact lowercase SHA-256\n' >&2
  exit 1
fi
if [ ! -f "$source_root/compose.yaml" ] || [ -e "$bundle_root" ]; then
  printf 'Candidate source must exist and bundle destination must be absent\n' >&2
  exit 1
fi
actual_revision=$(git -C "$source_root" rev-parse HEAD)
actual_source_tree_sha256=$(git -C "$source_root" ls-tree -r --full-tree -z HEAD | sha256sum | cut -d ' ' -f 1)
source_status=$(git -C "$source_root" status --porcelain --untracked-files=all)
if [ -n "$source_status" ] || [ "$actual_revision" != "$source_revision" ] || [ "$actual_source_tree_sha256" != "$source_tree_sha256" ]; then
  printf 'Candidate source checkout does not match its declared immutable identity\n' >&2
  exit 1
fi

environment_file=$bundle_root/deploy/evaluation/published-images.env
mkdir -p \
  "$bundle_root/deploy/evaluation/postgresql" \
  "$bundle_root/docs/assets" \
  "$bundle_root/scenarios"
cp "$source_root/compose.yaml" "$bundle_root/compose.yaml"
cp \
  "$source_root/deploy/evaluation/demo" \
  "$source_root/deploy/evaluation/published-images.compose.yaml" \
  "$bundle_root/deploy/evaluation/"
cp \
  "$source_root/deploy/evaluation/postgresql/001_roles.sql" \
  "$bundle_root/deploy/evaluation/postgresql/"
cp "$source_root/docs/BPM-PLATFORM-BROWSER-WALKTHROUGH.md" "$bundle_root/docs/"
cp -R \
  "$source_root/docs/assets/bpm-platform-browser-walkthrough" \
  "$source_root/docs/assets/mue-preview-alpha-demo" \
  "$bundle_root/docs/assets/"
cp -R \
  "$source_root/scenarios/expense-exception-review" \
  "$source_root/scenarios/service-task-effect" \
  "$source_root/scenarios/sequential-multi-instance" \
  "$bundle_root/scenarios/"
chmod +x "$bundle_root/deploy/evaluation/demo"

{
  printf 'BPMN_EVALUATION_SOURCE_REVISION=%s\n' "$source_revision"
  printf 'BPMN_EVALUATION_SOURCE_TREE_SHA256=%s\n' "$source_tree_sha256"
  printf 'BPMN_EVALUATION_ORIGIN=http://127.0.0.1:3000\n'
  printf 'BPMN_EVALUATION_PORT=3000\n'
  printf 'BPMN_EVALUATION_PROJECTION_MAX_AGE_MS=30000\n'
  printf 'BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS=5000\n'
} > "$environment_file"

resolve_image() {
  target=$1
  image_variable=$2
  image=$image_prefix/evaluation-$target
  inspection=$(docker buildx imagetools inspect "$image:$image_tag")
  printf '%s\n' "$inspection" | grep -Eq '^[[:space:]]*Platform:[[:space:]]+linux/amd64[[:space:]]*$'
  printf '%s\n' "$inspection" | grep -Eq '^[[:space:]]*Platform:[[:space:]]+linux/arm64[[:space:]]*$'
  digest=$(printf '%s\n' "$inspection" | awk '$1 == "Digest:" { print $2; exit }')
  if ! printf '%s\n' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
    printf 'Published image has no registry-reported index digest: %s\n' "$image" >&2
    exit 1
  fi
  printf '%s=%s@%s\n' "$image_variable" "$image" "$digest" >> "$environment_file"
}

resolve_image platform-api BPMN_EVALUATION_PLATFORM_API_IMAGE
resolve_image platform-recovery-worker BPMN_EVALUATION_PLATFORM_RECOVERY_WORKER_IMAGE
resolve_image platform-migrate BPMN_EVALUATION_PLATFORM_MIGRATE_IMAGE
resolve_image bpmn-worker BPMN_EVALUATION_BPMN_WORKER_IMAGE
resolve_image guided-demo-seed BPMN_EVALUATION_GUIDED_DEMO_SEED_IMAGE

jq -n \
  --arg sourceRevision "$source_revision" \
  --arg sourceTreeSha256 "$source_tree_sha256" \
  --rawfile environment "$environment_file" \
  '{
    sourceRevision: $sourceRevision,
    sourceTreeSha256: $sourceTreeSha256,
    exactImageAssignments: ($environment | split("\n") | map(select(test("_IMAGE="))))
  }' > "$bundle_root/candidate-manifest.json"
