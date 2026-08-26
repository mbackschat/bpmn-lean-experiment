#!/bin/sh
set -u

if [ "$#" -ne 2 ]; then
  printf 'usage: %s BUNDLE_ROOT OUTPUT_DIRECTORY\n' "$0" >&2
  exit 64
fi

bundle_root=$1
output_directory=$2
environment_file=$bundle_root/deploy/evaluation/published-images.env
published_compose=$bundle_root/deploy/evaluation/published-images.compose.yaml
mkdir -p "$output_directory"

compose() {
  docker compose \
    --project-name bpmn-lean-guided-demo \
    --env-file "$environment_file" \
    -f "$bundle_root/compose.yaml" \
    -f "$published_compose" \
    "$@"
}

{
  printf 'capturedAtUtc=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'dockerServerVersion=%s\n' "$(docker version --format '{{.Server.Version}}' 2>/dev/null || printf unavailable)"
} > "$output_directory/context.txt"

compose ps --all > "$output_directory/compose-ps.txt" 2>&1 || true
compose logs --no-color --timestamps > "$output_directory/compose-logs.txt" 2>&1 || true

: > "$output_directory/container-states.tsv"
container_ids=$(compose ps --all --quiet 2>/dev/null || true)
for container_id in $container_ids; do
  docker inspect --format '{{.Name}}\t{{.Image}}\t{{.RestartCount}}\t{{.State.Status}}\t{{.State.ExitCode}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$container_id" >> "$output_directory/container-states.tsv" 2>&1 || true
done

exit 0
