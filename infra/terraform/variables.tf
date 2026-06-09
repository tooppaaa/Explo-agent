variable "region" {
  description = "AWS region"
  default     = "eu-west-3" # Paris — ajuste selon ta localisation
}

variable "aws_profile" {
  description = "Profil AWS CLI (aws sso login)"
  default     = "default"
}

variable "domain" {
  description = "Sous-domaine dédié à l'agent (enregistrement Route53 à créer)"
  default     = "chat.grimp.app"
}

variable "allowed_origin" {
  description = "Origine CORS autorisée (frontend Grimp)"
  default     = "https://app.grimp.app"
}

variable "chat_provider" {
  description = "Provider LLM : anthropic ou mistral"
  default     = "mistral"
}

variable "chat_model" {
  description = "Modèle LLM à utiliser"
  default     = "mistral-medium-latest"
}

variable "langfuse_baseurl" {
  description = "URL de l'instance Langfuse"
  default     = "https://cloud.langfuse.com"
}

# Passées via TF_VAR_* ou terraform.tfvars (ne pas committer)
variable "anthropic_api_key" {
  sensitive = true
  default   = ""
}

variable "mistral_api_key" {
  sensitive = true
}

variable "grimp_api_key" {
  sensitive = true
}

variable "langfuse_public_key" {
  sensitive = true
}

variable "langfuse_secret_key" {
  sensitive = true
}
