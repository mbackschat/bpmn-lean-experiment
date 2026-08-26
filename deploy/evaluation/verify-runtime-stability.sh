#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'usage: %s BUNDLE_ROOT\n' "$0" >&2
  exit 64
fi

bundle_root=$1
environment_file=$bundle_root/deploy/evaluation/published-images.env
published_compose=$bundle_root/deploy/evaluation/published-images.compose.yaml

compose() {
  docker compose \
    --project-name bpmn-lean-guided-demo \
    --env-file "$environment_file" \
    -f "$bundle_root/compose.yaml" \
    -f "$published_compose" \
    "$@"
}

for service in postgresql temporal bpmn-worker platform-api platform-recovery-worker; do
  container_ids=$(compose ps --all --quiet "$service")
  set -- $container_ids
  if [ "$#" -ne 1 ]; then
    printf 'Runtime service %s must resolve to exactly one container\n' "$service" >&2
    exit 1
  fi
  container_id=$1
  restart_count=$(docker inspect --format '{{.RestartCount}}' "$container_id")
  status=$(docker inspect --format '{{.State.Status}}' "$container_id")
  if [ "$restart_count" -ne 0 ] || [ "$status" != running ]; then
    printf 'Runtime service %s is unstable: status=%s restartCount=%s\n' \
      "$service" "$status" "$restart_count" >&2
    exit 1
  fi
done

printf 'RUNTIME_STABILITY_OK restartCount=0\n'
