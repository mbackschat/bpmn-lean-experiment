variable "BPMN_EVALUATION_CONTEXT" {
  default = "."
}

variable "BPMN_EVALUATION_IMAGE_PREFIX" {
  default = "ghcr.io/mbackschat/bpmn-lean-experiment"
}

variable "BPMN_EVALUATION_IMAGE_TAG" {
  default = "unbound"
}

variable "BPMN_EVALUATION_SOURCE_REVISION" {
  default = "unbound"
}

variable "BPMN_EVALUATION_SOURCE_TREE_SHA256" {
  default = "unbound"
}

target "evaluation-image" {
  context = BPMN_EVALUATION_CONTEXT
  dockerfile = "Dockerfile"
  platforms = ["linux/amd64", "linux/arm64"]
  args = {
    BPMN_EVALUATION_SOURCE_REVISION = BPMN_EVALUATION_SOURCE_REVISION
    BPMN_EVALUATION_SOURCE_TREE_SHA256 = BPMN_EVALUATION_SOURCE_TREE_SHA256
  }
  cache-from = ["type=gha,scope=evaluation-distribution"]
  cache-to = ["type=gha,mode=max,scope=evaluation-distribution"]
  attest = ["type=provenance,mode=max", "type=sbom"]
}

target "platform-api" {
  inherits = ["evaluation-image"]
  target = "platform-api"
  tags = ["${BPMN_EVALUATION_IMAGE_PREFIX}/evaluation-platform-api:${BPMN_EVALUATION_IMAGE_TAG}"]
}

target "platform-recovery-worker" {
  inherits = ["evaluation-image"]
  target = "platform-recovery-worker"
  tags = ["${BPMN_EVALUATION_IMAGE_PREFIX}/evaluation-platform-recovery-worker:${BPMN_EVALUATION_IMAGE_TAG}"]
}

target "platform-migrate" {
  inherits = ["evaluation-image"]
  target = "platform-migrate"
  tags = ["${BPMN_EVALUATION_IMAGE_PREFIX}/evaluation-platform-migrate:${BPMN_EVALUATION_IMAGE_TAG}"]
}

target "bpmn-worker" {
  inherits = ["evaluation-image"]
  target = "bpmn-worker"
  tags = ["${BPMN_EVALUATION_IMAGE_PREFIX}/evaluation-bpmn-worker:${BPMN_EVALUATION_IMAGE_TAG}"]
}

target "guided-demo-seed" {
  inherits = ["evaluation-image"]
  target = "guided-demo-seed"
  tags = ["${BPMN_EVALUATION_IMAGE_PREFIX}/evaluation-guided-demo-seed:${BPMN_EVALUATION_IMAGE_TAG}"]
}

group "default" {
  targets = [
    "platform-api",
    "platform-recovery-worker",
    "platform-migrate",
    "bpmn-worker",
    "guided-demo-seed",
  ]
}
