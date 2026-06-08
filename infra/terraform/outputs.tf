output "url" {
  description = "URL publique de l'agent"
  value       = "https://${var.domain}"
}

output "ecr_url" {
  description = "URL ECR à utiliser dans le workflow CI/CD"
  value       = aws_ecr_repository.explo.repository_url
}

output "alb_dns" {
  description = "DNS natif de l'ALB (avant propagation Route53)"
  value       = aws_lb.explo.dns_name
}

output "widget_embed" {
  description = "Snippet d'intégration à copier dans le frontend Grimp"
  value       = <<-EOT
    <script src="https://${var.domain}/widget/agent.js"></script>
    <script>
      window.initAgent({
        backendUrl: "https://${var.domain}/chat",
        launcher: { label: "Assistant Grimp" },
      });
    </script>
  EOT
}
