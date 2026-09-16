output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_region" {
  value = var.aws_region
}

output "kubeconfig_cmd" {
  value = "aws eks --region ${var.aws_region} update-kubeconfig --name ${module.eks.cluster_name}"
}

output "ecr_repository_url" {
  value = aws_ecr_repository.upstream.repository_url
}

output "ecr_registry" {
  value = split("/", aws_ecr_repository.upstream.repository_url)[0]
}
