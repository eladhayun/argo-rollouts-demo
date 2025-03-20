provider "azurerm" {
  subscription_id = var.subscription_id # Fixed typo here
  features {}
}

# Resource Group
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# Azure Container Registry
resource "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = var.acr_sku
  admin_enabled       = false
}

# ACR Scope Map for retention policies
resource "azurerm_container_registry_scope_map" "retention" {
  name                    = "retention-policy"
  resource_group_name     = azurerm_resource_group.rg.name
  container_registry_name = azurerm_container_registry.acr.name
  actions = [
    "repositories/delete",
    "repositories/read",
    "repositories/write",
    "repositories/delete-metadata"
  ]
}

# ACR Token for retention policies
resource "azurerm_container_registry_token" "retention" {
  name                    = "retention-token"
  resource_group_name     = azurerm_resource_group.rg.name
  container_registry_name = azurerm_container_registry.acr.name
  scope_map_id           = azurerm_container_registry_scope_map.retention.id
}

# Virtual Network
resource "azurerm_virtual_network" "vnet" {
  name                = var.vnet_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  address_space       = [var.vnet_address_space]
}

# Subnet
resource "azurerm_subnet" "subnet" {
  name                 = var.subnet_name
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [var.subnet_address_prefix]
}

# AKS Cluster
resource "azurerm_kubernetes_cluster" "aks" {
  name                = var.aks_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = var.aks_dns_prefix

  default_node_pool {
    name           = var.node_pool_name
    node_count     = var.node_count
    vm_size        = var.node_vm_size
    vnet_subnet_id = azurerm_subnet.subnet.id
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }

  tags = var.tags
}

# Grant AKS access to pull images from ACR
resource "azurerm_role_assignment" "aks_acr" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id
}