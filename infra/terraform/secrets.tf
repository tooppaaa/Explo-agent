# Les clés API sont dans Secrets Manager — jamais dans le code ni dans l'image.
# Injectées dans la task comme variables d'environnement via valueFrom.

resource "aws_secretsmanager_secret" "anthropic" {
  name                    = "explo-agent/anthropic-api-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "anthropic" {
  secret_id     = aws_secretsmanager_secret.anthropic.id
  secret_string = var.anthropic_api_key
}

resource "aws_secretsmanager_secret" "mistral" {
  name                    = "explo-agent/mistral-api-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "mistral" {
  secret_id     = aws_secretsmanager_secret.mistral.id
  secret_string = var.mistral_api_key
}

resource "aws_secretsmanager_secret" "grimp" {
  name                    = "explo-agent/grimp-api-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "grimp" {
  secret_id     = aws_secretsmanager_secret.grimp.id
  secret_string = var.grimp_api_key
}

resource "aws_secretsmanager_secret" "langfuse_public" {
  name                    = "explo-agent/langfuse-public-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "langfuse_public" {
  secret_id     = aws_secretsmanager_secret.langfuse_public.id
  secret_string = var.langfuse_public_key
}

resource "aws_secretsmanager_secret" "langfuse_secret" {
  name                    = "explo-agent/langfuse-secret-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "langfuse_secret" {
  secret_id     = aws_secretsmanager_secret.langfuse_secret.id
  secret_string = var.langfuse_secret_key
}
