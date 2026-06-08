resource "aws_ecs_cluster" "explo" {
  name = "explo-agent"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "explo" {
  name              = "/ecs/explo-agent"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "explo" {
  family                   = "explo-agent"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  # 0.5 vCPU / 1 GB : confortable pour Node + Deno sandbox concurrents.
  # Monter à 1024/2048 si les exécutions Deno dépassent 30s fréquemment.
  cpu    = 512
  memory = 1024

  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name  = "explo-agent"
    image = "${aws_ecr_repository.explo.repository_url}:latest"

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV",        value = "production" },
      { name = "ENGINE_CONFIG",   value = "engine.config.prod.json" },
      { name = "ALLOWED_ORIGIN",  value = var.allowed_origin },
      { name = "CHAT_MODEL",      value = var.chat_model },
    ]

    # Les secrets sont injectés depuis Secrets Manager — jamais dans l'image
    secrets = [
      {
        name      = "ANTHROPIC_API_KEY"
        valueFrom = aws_secretsmanager_secret.anthropic.arn
      },
      {
        name      = "GRIMP_API_KEY"
        valueFrom = aws_secretsmanager_secret.grimp.arn
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.explo.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60 # Deno + catalogue au démarrage prend ~20s
    }
  }])
}

resource "aws_ecs_service" "explo" {
  name            = "explo-agent"
  cluster         = aws_ecs_cluster.explo.id
  task_definition = aws_ecs_task_definition.explo.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Déploiement sans downtime : nouvelle task healthy avant d'arrêter l'ancienne
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true # Nécessaire en subnet public sans NAT
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.explo.arn
    container_name   = "explo-agent"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}
