variable "aws_region" {
  type    = string
  default = "us-east-2"
}

variable "cluster_name" {
  type    = string
  default = "flex-bench"
}

variable "k8s_version" {
  type    = string
  default = "1.30"
}

variable "system_node" {
  type = object({
    instance_type = string
    desired_size  = number
    max_size      = number
    min_size      = number
  })
  default = {
    instance_type = "t3.large"
    desired_size  = 2
    max_size      = 3
    min_size      = 2
  }
}

variable "workload_node" {
  type = object({
    instance_type = string
    desired_size  = number
    max_size      = number
    min_size      = number
  })
  default = {
    instance_type = "c6i.2xlarge"
    desired_size  = 3
    max_size      = 6
    min_size      = 3
  }
}

variable "tags" {
  type    = map(string)
  default = { project = "flex-gateway-benchmark", work_item = "W-21368048" }
}

# CIDR allowlist for the EKS public API endpoint. Default of 0.0.0.0/0 leaves
# the cluster reachable from the internet, which only makes sense for short-
# lived benchmark clusters; pass `-var 'public_access_cidrs=["x.y.z.w/32"]'`
# (e.g. the operator's egress IP) for a tighter posture.
variable "public_access_cidrs" {
  type        = list(string)
  default     = ["0.0.0.0/0"]
  description = "CIDR blocks allowed to reach the EKS public API endpoint"
}

# Pin the helm charts that run for the lifetime of the cluster so a `terraform
# apply` six months from now doesn't silently jump to a new major.
variable "kps_chart_version" {
  type        = string
  default     = "65.5.0"
  description = "kube-prometheus-stack chart version"
}

variable "k6_operator_chart_version" {
  type        = string
  default     = "4.4.1"
  description = "grafana/k6-operator chart version"
}
