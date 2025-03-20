variable "location" {
  description = "Azure region where resources will be deployed"
  type        = string
  default     = "East US"
}

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = "b76ecd16-669b-4ca9-b797-b7786eb1b334"
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "playground-rg"
}

variable "acr_name" {
  description = "Name of the Azure Container Registry"
  type        = string
  default     = "playgroundacr1234"
}

variable "acr_sku" {
  description = "SKU for ACR (Basic, Standard, Premium)"
  type        = string
  default     = "Standard"
}

variable "vnet_name" {
  description = "Name of the Virtual Network"
  type        = string
  default     = "playground-vnet"
}

variable "vnet_address_space" {
  description = "Address space for the Virtual Network"
  type        = string
  default     = "10.1.0.0/16"
}

variable "subnet_name" {
  description = "Name of the Subnet"
  type        = string
  default     = "playground-aks-subnet"
}

variable "subnet_address_prefix" {
  description = "Subnet address prefix"
  type        = string
  default     = "10.1.1.0/24"
}

variable "aks_name" {
  description = "Name of the AKS Cluster"
  type        = string
  default     = "playground-aks"
}

variable "aks_dns_prefix" {
  description = "DNS prefix for AKS"
  type        = string
  default     = "playgroundaks"
}

variable "node_pool_name" {
  description = "Name of the default AKS node pool"
  type        = string
  default     = "default"
}

variable "node_count" {
  description = "Number of nodes in the default node pool"
  type        = number
  default     = 2
}

variable "node_vm_size" {
  description = "VM size for AKS nodes"
  type        = string
  default     = "Standard_B2s" # Cheaper instance for playground
}

variable "tags" {
  description = "Tags for resources"
  type        = map(string)
  default = {
    environment = "playground"
    project     = "demos-pocs"
    owner       = "your-name"
  }
}
