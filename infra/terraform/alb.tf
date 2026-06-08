# ── ALB dédié (complètement séparé de l'ALB Grimp existant) ──────────────────

resource "aws_lb" "explo" {
  name               = "explo-agent"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = { Name = "explo-agent" }
}

resource "aws_lb_target_group" "explo" {
  name        = "explo-agent"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.explo.id
  target_type = "ip" # Fargate awsvpc = IP target

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Certificat ACM pour chat.grimp.io — validation DNS via Route53
resource "aws_acm_certificate" "explo" {
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Enregistrements Route53 pour valider le certificat ACM
# Note : chat.grimp.io spécifique bat le wildcard *.grimp.io de l'ALB existant.
data "aws_route53_zone" "grimp" {
  name         = "grimp.io"
  private_zone = false
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.explo.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }
  zone_id = data.aws_route53_zone.grimp.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "explo" {
  certificate_arn         = aws_acm_certificate.explo.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Redirect HTTP → HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.explo.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.explo.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.explo.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.explo.arn
  }
}

# Enregistrement Route53 : chat.grimp.io → ce nouvel ALB
# Précède le wildcard *.grimp.io donc le trafic n'atteint pas l'ALB existant.
resource "aws_route53_record" "explo" {
  zone_id = data.aws_route53_zone.grimp.zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_lb.explo.dns_name
    zone_id                = aws_lb.explo.zone_id
    evaluate_target_health = true
  }
}
