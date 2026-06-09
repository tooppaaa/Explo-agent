resource "aws_ecr_repository" "explo" {
  name                 = "explo-agent"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "explo-agent" }
}

# Supprime les images de plus de 30 jours (évite les coûts ECR)
resource "aws_ecr_lifecycle_policy" "explo" {
  repository = aws_ecr_repository.explo.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
