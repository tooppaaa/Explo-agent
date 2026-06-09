# ── OIDC GitHub Actions → AWS (pas de clés statiques) ────────────────────────

# Provider OIDC GitHub — déjà existant dans le compte, on le référence
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# Rôle assumable uniquement depuis le repo tooppaaa/Explo-agent, branche main
resource "aws_iam_role" "github_deploy" {
  name = "explo-agent-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Autorise main ET les branches claude/* pour les déploiements de test
          "token.actions.githubusercontent.com:sub" = [
            "repo:tooppaaa/Explo-agent:ref:refs/heads/main",
            "repo:tooppaaa/Explo-agent:ref:refs/heads/claude/*",
          ]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "explo-agent-deploy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Push image ECR
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:BatchGetImage",
        ]
        Resource = aws_ecr_repository.explo.arn
      },
      {
        # Déploiement ECS
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeServices",
        ]
        Resource = "*"
      },
      {
        # Nécessaire pour passer les rôles task/execution à ECS
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [
          aws_iam_role.execution.arn,
          aws_iam_role.task.arn,
        ]
      },
    ]
  })
}

output "github_deploy_role_arn" {
  description = "ARN à mettre dans le secret GitHub AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}
