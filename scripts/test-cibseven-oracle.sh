#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
runner_dir="$project_root/runners/cibseven"
maven_settings=${BPMN_MAVEN_SETTINGS:-"$runner_dir/maven-settings.xml"}
sequential_bpmn_path="$project_root/scenarios/user-task-discovery-completion/process.bpmn"
parallel_bpmn_path="$project_root/scenarios/parallel-fork-join/process.bpmn"
timer_bpmn_path="$project_root/scenarios/intermediate-catch-timer/process.bpmn"
service_task_bpmn_path="$project_root/scenarios/service-task-effect/process.bpmn"
boundary_error_bpmn_path="$project_root/scenarios/boundary-error/process.bpmn"
embedded_subprocess_bpmn_path="$project_root/scenarios/embedded-subprocess-completion/process.bpmn"
subprocess_error_probe_path="$project_root/scenarios/subprocess-error-propagation/process.bpmn"
parallel_probe_path="$runner_dir/src/test/resources/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.duplicateSameFlow.bpmn"
juel_gateway_order_probe_path="$runner_dir/src/test/resources/org/bpmnlean/cibseven/exclusive-gateway-source-order.bpmn"
receive_task_probe_path="$project_root/scenarios/message-addressed-receive-task/process.bpmn"

test -f "$maven_settings"
"$project_root/scripts/check-external-sources.sh" verify

"$project_root/scripts/validate-bpmn-xml.sh" \
  "$sequential_bpmn_path" \
  "$parallel_bpmn_path" \
  "$timer_bpmn_path" \
  "$service_task_bpmn_path" \
  "$boundary_error_bpmn_path" \
  "$embedded_subprocess_bpmn_path" \
  "$subprocess_error_probe_path" \
  "$parallel_probe_path" \
  "$juel_gateway_order_probe_path" \
  "$receive_task_probe_path"

exec node "$project_root/scripts/run-cibseven-tests.ts"
