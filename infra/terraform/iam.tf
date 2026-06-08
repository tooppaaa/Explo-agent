data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Rôle d'exécution : pull ECR, écrire logs CloudWatch, lire Secrets Manager
resource "aws_iam_role" "execution" {
  name               = "explo-agent-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "explo-agent-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.anthropic.arn,
        aws_secretsmanager_secret.grimp.arn,
      ]
    }]
  })
}

# Rôle de la task : pas de permissions AWS supplémentaires (le code ne touche pas AWS)
resource "aws_iam_role" "task" {
  name               = "explo-agent-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
