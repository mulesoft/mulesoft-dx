---
page_title: "anypoint_organization Data Source - terraform-provider-anypoint"
subcategory: "Access Management"
description: |-
  Fetches information about an Anypoint Platform organization.
---

# anypoint_organization (Data Source)

Fetches information about an Anypoint Platform organization.

-> **Entitlements:** The `entitlements` attribute is returned as a JSON string. Use the `jsondecode()` function to access individual fields (e.g., `jsondecode(data.anypoint_organization.main.entitlements).workerClouds`).

## Example Usage

```terraform
data "anypoint_organization" "main" {
  id = var.organization_id
}

output "org_name" {
  value = data.anypoint_organization.main.name
}
```

## Schema

### Required

- `id` (String) The unique identifier for the organization.

### Read-Only

- `name` (String) The name of the organization.
- `created_at` (String) The creation timestamp of the organization.
- `updated_at` (String) The last update timestamp of the organization.
- `owner_id` (String) The owner ID of the organization.
- `client_id` (String) The client ID associated with the organization.
- `idprovider_id` (String) The identity provider ID.
- `is_federated` (Boolean) Whether the organization is federated.
- `parent_organization_ids` (List of String) List of parent organization IDs.
- `sub_organization_ids` (List of String) List of sub-organization IDs.
- `tenant_organization_ids` (List of String) List of tenant organization IDs.
- `mfa_required` (String) Whether MFA is required for the organization.
- `is_automatic_admin_promotion_exempt` (Boolean) Whether the organization is exempt from automatic admin promotion.
- `org_type` (String) The type of the organization.
- `gdot_id` (String) The GDOT ID of the organization.
- `deleted_at` (String) The deletion timestamp of the organization.
- `domain` (String) The domain of the organization.
- `is_root` (Boolean) Whether this is a root organization.
- `is_master` (Boolean) Whether this is a master organization.
- `session_timeout` (Number) The session timeout for the organization.
- `entitlements` (String) The entitlements for the organization as a JSON string. Use `jsondecode()` to access individual fields.
- `subscription` (Object) The subscription details for the organization. See [`subscription`](#nestedschema--subscription) below.
- `owner` (Object) The owner of the organization. See [`owner`](#nestedschema--owner) below.
- `environments` (List of Object) The environments within the organization. See [`environments`](#nestedschema--environments) below.

<a id="nestedschema--subscription"></a>
### Nested Schema for `subscription`

Read-Only:

- `category` (String) The subscription category.
- `type` (String) The subscription type.
- `expiration` (String) The subscription expiration date.
- `justification` (String) The subscription justification.

<a id="nestedschema--owner"></a>
### Nested Schema for `owner`

Read-Only:

- `id` (String) The owner's ID.
- `first_name` (String) The owner's first name.
- `last_name` (String) The owner's last name.
- `email` (String) The owner's email.
- `username` (String) The owner's username.
- `enabled` (Boolean) Whether the owner's account is enabled.
- `created_at` (String) The creation timestamp of the owner's account.
- `updated_at` (String) The last update timestamp of the owner's account.
- `organization_id` (String) The organization ID of the owner.
- `phone_number` (String) The owner's phone number.
- `idprovider_id` (String) The identity provider ID of the owner.
- `deleted` (Boolean) Whether the owner's account is deleted.
- `last_login` (String) The last login timestamp of the owner.
- `mfa_verification_excluded` (Boolean) Whether MFA verification is excluded for the owner.
- `mfa_verifiers_configured` (String) The MFA verifiers configured for the owner.
- `email_verified_at` (String) The email verification timestamp of the owner.
- `gdou_id` (String) The GDOU ID of the owner.
- `previous_last_login` (String) The previous last login timestamp of the owner.
- `type` (String) The type of the owner.

<a id="nestedschema--environments"></a>
### Nested Schema for `environments`

Read-Only:

- `id` (String) The environment ID.
- `name` (String) The environment name.
- `organization_id` (String) The organization ID.
- `is_production` (Boolean) Whether the environment is a production environment.
- `type` (String) The environment type.
- `client_id` (String) The environment client ID.
- `arc_namespace` (String) The ARC namespace of the environment.
