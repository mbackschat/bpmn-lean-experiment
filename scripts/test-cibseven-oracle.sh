#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
runner_dir="$project_root/runners/cibseven"
java_home=$(node "$project_root/scripts/java-home.ts")
maven_settings=${BPMN_MAVEN_SETTINGS:-"$runner_dir/maven-settings.xml"}
xsd_path="$project_root/docs/reference/bpmn-2.0.2/machine-readable/BPMN20.xsd"
sequential_bpmn_path="$project_root/scenarios/user-task-discovery-completion/process.bpmn"
parallel_bpmn_path="$project_root/scenarios/parallel-fork-join/process.bpmn"
timer_bpmn_path="$project_root/scenarios/intermediate-catch-timer/process.bpmn"
service_task_bpmn_path="$project_root/scenarios/service-task-effect/process.bpmn"
parallel_probe_path="$runner_dir/src/test/resources/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.duplicateSameFlow.bpmn"

test -x "$java_home/bin/java"
test -f "$maven_settings"

for bpmn_path in "$sequential_bpmn_path" "$parallel_bpmn_path" "$timer_bpmn_path" "$service_task_bpmn_path" "$parallel_probe_path"; do
  if test -f "$xsd_path"; then
    xmllint --noout --schema "$xsd_path" "$bpmn_path"
  else
    xmllint --noout "$bpmn_path"
  fi
done

set -- \
  -s "$maven_settings" \
  -f "$runner_dir/pom.xml" \
  --no-transfer-progress \
  -Dstyle.color=never \
  test

if test -n "${BPMN_MAVEN_REPO_LOCAL:-}"; then
  set -- "-Dmaven.repo.local=$BPMN_MAVEN_REPO_LOCAL" "$@"
fi

JAVA_HOME="$java_home" "$runner_dir/mvnw" "$@"
