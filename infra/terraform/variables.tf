variable "region" {
  description = "AWS region"
  default     = "eu-west-3" # Paris — ajuste selon ta localisation
}

variable "domain" {
  description = "Sous-domaine dédié à l'agent (enregistrement Route53 à créer)"
  default     = "chat.grimp.io"
}

variable "allowed_origin" {
  description = "Origine CORS autorisée (frontend Grimp)"
  default     = "https://app.grimp.io"
}

variable "chat_model" {
  description = "Modèle Anthropic à utiliser"
  default     = "claude-sonnet-4-5"
}

# Passées via TF_VAR_* ou terraform.tfvars (ne pas committer)
variable "anthropic_api_key" {
  sensitive = true
}

variable "grimp_api_key" {
  sensitive = true
}
