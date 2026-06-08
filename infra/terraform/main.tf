terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  # Décommenter pour stocker l'état en S3 (recommandé en équipe) :
  # backend "s3" {
  #   bucket = "grimp-terraform-state"
  #   key    = "explo-agent/terraform.tfstate"
  #   region = "eu-west-3"
  # }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ── VPC isolé ────────────────────────────────────────────────────────────────
# Réseau dédié, complètement séparé de l'infra Grimp existante.
# Sous-réseaux publics (pas de NAT Gateway = ~32€/mois économisé) :
# les tasks ont une IP publique mais le SG n'accepte que le trafic de l'ALB.

resource "aws_vpc" "explo" {
  cidr_block           = "10.10.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "explo-agent" }
}

resource "aws_internet_gateway" "explo" {
  vpc_id = aws_vpc.explo.id
  tags   = { Name = "explo-agent" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.explo.id
  cidr_block              = cidrsubnet("10.10.0.0/16", 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "explo-public-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.explo.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.explo.id
  }
  tags = { Name = "explo-public" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── Security Groups ────────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name   = "explo-alb"
  vpc_id = aws_vpc.explo.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "explo-alb" }
}

resource "aws_security_group" "task" {
  name   = "explo-task"
  vpc_id = aws_vpc.explo.id

  # N'accepte que le trafic venant de l'ALB
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # Sortie libre : appels Anthropic API, Grimp API, Deno registry
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "explo-task" }
}
