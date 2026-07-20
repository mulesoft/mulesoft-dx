# Static cluster-wide releases that live for the lifetime of the cluster:
# kube-prometheus-stack, the local flex-bench-extras chart, and k6-operator.
# Per-run resources (Flex itself, k6 TestRun, upstream Deployment) stay in the
# Makefile because they're parameterised by RUN_ID/N_APIS/POLICIES.

resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
  }
}

resource "kubernetes_namespace" "k6_operator_system" {
  metadata {
    name = "k6-operator-system"
  }
}

resource "helm_release" "kube_prometheus_stack" {
  name       = "kps"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = var.kps_chart_version
  namespace  = kubernetes_namespace.monitoring.metadata[0].name

  values = [file("${path.module}/../k8s/observability/values.yaml")]

  # Wait for the operator + Prometheus statefulset before flex-bench-extras
  # tries to create ServiceMonitors against the CRDs it installs.
  wait    = true
  timeout = 600
}

resource "helm_release" "flex_bench_extras" {
  name      = "flex-bench-extras"
  chart     = "${path.module}/../charts/flex-bench-extras"
  namespace = kubernetes_namespace.monitoring.metadata[0].name

  # ServiceMonitor + PrometheusRule CRDs come from kps; install order matters.
  depends_on = [helm_release.kube_prometheus_stack]

  wait    = true
  timeout = 120
}

resource "helm_release" "k6_operator" {
  name       = "k6-operator"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "k6-operator"
  version    = var.k6_operator_chart_version
  namespace  = kubernetes_namespace.k6_operator_system.metadata[0].name

  values = [file("${path.module}/../k8s/k6/operator-values.yaml")]

  wait    = true
  timeout = 600
}
