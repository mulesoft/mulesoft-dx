# Resources Index

All resources provided by `terraform-provider-anypoint`.

## Access Management

| Resource | Description |
|----------|-------------|
| [anypoint_connected_app_scopes](anypoint_connected_app_scopes.md) | Manages scopes for an Anypoint Connected Application using user authentication. |
| [anypoint_environment](anypoint_environment.md) | Manages an Anypoint Platform environment. |
| [anypoint_organization](anypoint_organization.md) | Creates and manages an Anypoint Platform organization. |
| [anypoint_team](anypoint_team.md) | Manages an Anypoint Platform team. |

## API Management

| Resource | Description |
|----------|-------------|
| [anypoint_api_instance](anypoint_api_instance.md) | Manages an API instance in Anypoint API Manager. |
| [anypoint_api_instance_sla_tier](anypoint_api_instance_sla_tier.md) | Manages an SLA tier for an API instance in Anypoint API Manager. |
| [anypoint_api_policy](anypoint_api_policy.md) | Manages a policy applied to an API instance. Supports both known policies (via `policy_type`) and custom policies (via `group_id` + `asset_id`). |
| [anypoint_managed_omni_gateway](anypoint_managed_omni_gateway.md) | Manages a CloudHub 2.0 Managed Omni Gateway instance in Anypoint Platform. |

## Agents & Tools

| Resource | Description |
|----------|-------------|
| [anypoint_agent_instance](anypoint_agent_instance.md) | Manages an Agent instance in Anypoint API Manager. An Agent instance represents an Agent specification deployed to a Omni Gateway target with routing rules and upstream backends. |
| [anypoint_mcp_server](anypoint_mcp_server.md) | Manages an MCP server in Anypoint API Manager. An MCP server represents an MCP server specification deployed to a Omni Gateway target. |

## API Policies — Inbound

### Security & Authentication

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_access_block](anypoint_api_policy_access_block.md) | Manages an Access Block policy on an Anypoint API instance. |
| [anypoint_api_policy_client_id_enforcement](anypoint_api_policy_client_id_enforcement.md) | Manages a Client ID Enforcement policy on an Anypoint API instance. |
| [anypoint_api_policy_cors](anypoint_api_policy_cors.md) | Manages a CORS policy on an Anypoint API instance. |
| [anypoint_api_policy_external_oauth2_access_token_enforcement](anypoint_api_policy_external_oauth2_access_token_enforcement.md) | Manages an External OAuth 2.0 Access Token Enforcement policy on an Anypoint API instance. (mule4 only) |
| [anypoint_api_policy_http_basic_authentication](anypoint_api_policy_http_basic_authentication.md) | Manages an HTTP Basic Authentication policy on an Anypoint API instance. |
| [anypoint_api_policy_ip_allowlist](anypoint_api_policy_ip_allowlist.md) | Manages an IP Allowlist policy on an Anypoint API instance. |
| [anypoint_api_policy_ip_blocklist](anypoint_api_policy_ip_blocklist.md) | Manages an IP Blocklist policy on an Anypoint API instance. |
| [anypoint_api_policy_jwt_validation](anypoint_api_policy_jwt_validation.md) | Manages a JWT Validation policy on an Anypoint API instance. |
| [anypoint_api_policy_ldap_authentication](anypoint_api_policy_ldap_authentication.md) | Manages an LDAP Authentication policy on an Anypoint API instance. |
| [anypoint_api_policy_oauth2_token_introspection](anypoint_api_policy_oauth2_token_introspection.md) | Manages an OAuth 2.0 Token Introspection policy on an Anypoint API instance. |

### Traffic Management

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_health_check](anypoint_api_policy_health_check.md) | Manages a Health Check policy on an Anypoint API instance. |
| [anypoint_api_policy_http_caching](anypoint_api_policy_http_caching.md) | Manages an HTTP Caching policy on an Anypoint API instance. |
| [anypoint_api_policy_rate_limiting](anypoint_api_policy_rate_limiting.md) | Manages a Rate Limiting policy on an Anypoint API instance. |
| [anypoint_api_policy_rate_limiting_sla_based](anypoint_api_policy_rate_limiting_sla_based.md) | Manages a Rate Limiting SLA-Based policy on an Anypoint API instance. |
| [anypoint_api_policy_response_timeout](anypoint_api_policy_response_timeout.md) | Manages a Response Timeout policy on an Anypoint API instance. |
| [anypoint_api_policy_spike_control](anypoint_api_policy_spike_control.md) | Manages a Spike Control policy on an Anypoint API instance. |
| [anypoint_api_policy_spec_validation](anypoint_api_policy_spec_validation.md) | Manages a Spec Validation policy on an Anypoint API instance. |
| [anypoint_api_policy_sse_logging](anypoint_api_policy_sse_logging.md) | Manages an SSE Logging policy on an Anypoint API instance. |
| [anypoint_api_policy_stream_idle_timeout](anypoint_api_policy_stream_idle_timeout.md) | Manages a Stream Idle Timeout policy on an Anypoint API instance. |

### Threat Protection

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_injection_protection](anypoint_api_policy_injection_protection.md) | Manages an Injection Protection policy on an Anypoint API instance. |
| [anypoint_api_policy_json_threat_protection](anypoint_api_policy_json_threat_protection.md) | Manages a JSON Threat Protection policy on an Anypoint API instance. |
| [anypoint_api_policy_xml_threat_protection](anypoint_api_policy_xml_threat_protection.md) | Manages an XML Threat Protection policy on an Anypoint API instance. (mule4 only) |

### Transformation & Logging

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_body_transformation](anypoint_api_policy_body_transformation.md) | Manages a Body Transformation policy on an Anypoint API instance. |
| [anypoint_api_policy_dataweave_body_transformation](anypoint_api_policy_dataweave_body_transformation.md) | Manages a DataWeave Body Transformation policy on an Anypoint API instance. |
| [anypoint_api_policy_dataweave_headers_transformation](anypoint_api_policy_dataweave_headers_transformation.md) | Manages a DataWeave Headers Transformation policy on an Anypoint API instance. |
| [anypoint_api_policy_dataweave_request_filter](anypoint_api_policy_dataweave_request_filter.md) | Manages a DataWeave Request Filter policy on an Anypoint API instance. |
| [anypoint_api_policy_header_injection](anypoint_api_policy_header_injection.md) | Manages a Header Injection policy on an Anypoint API instance. |
| [anypoint_api_policy_header_removal](anypoint_api_policy_header_removal.md) | Manages a Header Removal policy on an Anypoint API instance. |
| [anypoint_api_policy_header_transformation](anypoint_api_policy_header_transformation.md) | Manages a Header Transformation policy on an Anypoint API instance. |
| [anypoint_api_policy_message_logging](anypoint_api_policy_message_logging.md) | Manages a Message Logging policy on an Anypoint API instance. |
| [anypoint_api_policy_script_evaluation_transformation](anypoint_api_policy_script_evaluation_transformation.md) | Manages a Script Evaluation Transformation policy on an Anypoint API instance. |
| [anypoint_api_policy_tracing](anypoint_api_policy_tracing.md) | Manages a Tracing policy on an Anypoint API instance. |

### Observability & Extensions

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_agent_connection_telemetry](anypoint_api_policy_agent_connection_telemetry.md) | Manages an Agent Connection Telemetry policy on an Anypoint API instance. |
| [anypoint_api_policy_native_ext_authz](anypoint_api_policy_native_ext_authz.md) | Manages a Native External Authorization policy on an Anypoint API instance. |
| [anypoint_api_policy_native_ext_proc](anypoint_api_policy_native_ext_proc.md) | Manages a Native External Processing policy on an Anypoint API instance. |

## API Policies — Outbound

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_circuit_breaker](anypoint_api_policy_circuit_breaker.md) | Manages a Circuit Breaker policy on an Anypoint API instance. |
| [anypoint_api_policy_credential_injection_basic_auth](anypoint_api_policy_credential_injection_basic_auth.md) | Manages a Credential Injection (Basic Auth) policy on an Anypoint API instance. |
| [anypoint_api_policy_credential_injection_oauth2](anypoint_api_policy_credential_injection_oauth2.md) | Manages a Credential Injection (OAuth2) policy on an Anypoint API instance. |
| [anypoint_api_policy_credential_injection_oauth2_obo](anypoint_api_policy_credential_injection_oauth2_obo.md) | Manages a Credential Injection (OAuth2 On-Behalf-Of) policy on an Anypoint API instance. |
| [anypoint_api_policy_idle_timeout](anypoint_api_policy_idle_timeout.md) | Manages an Idle Timeout policy on an Anypoint API instance. |
| [anypoint_api_policy_intask_authentication_policy](anypoint_api_policy_intask_authentication_policy.md) | Manages an InTask Authentication policy on an Anypoint API instance. |
| [anypoint_api_policy_intask_authorization_code_policy](anypoint_api_policy_intask_authorization_code_policy.md) | Manages an InTask Authorization Code policy on an Anypoint API instance. |
| [anypoint_api_policy_message_logging_outbound](anypoint_api_policy_message_logging_outbound.md) | Manages a Message Logging (Outbound) policy on an Anypoint API instance. |
| [anypoint_api_policy_native_aws_lambda](anypoint_api_policy_native_aws_lambda.md) | Manages a Native AWS Lambda policy on an Anypoint API instance. |

## API Policies — MCP (Model Context Protocol)

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_mcp_access_control](anypoint_api_policy_mcp_access_control.md) | Manages an MCP Access Control policy on an Anypoint API instance. |
| [anypoint_api_policy_mcp_global_access_policy](anypoint_api_policy_mcp_global_access_policy.md) | Manages an MCP Global Access Policy on an Anypoint API instance. |
| [anypoint_api_policy_mcp_pii_detector](anypoint_api_policy_mcp_pii_detector.md) | Manages an MCP PII Detector policy on an Anypoint API instance. |
| [anypoint_api_policy_mcp_schema_validation](anypoint_api_policy_mcp_schema_validation.md) | Manages an MCP Schema Validation policy on an Anypoint API instance. |
| [anypoint_api_policy_mcp_support](anypoint_api_policy_mcp_support.md) | Manages an MCP Support policy on an Anypoint API instance. |
| [anypoint_api_policy_mcp_tool_mapping](anypoint_api_policy_mcp_tool_mapping.md) | Manages an MCP Tool Mapping policy on an Anypoint API instance. |
| [anypoint_api_policy_mcp_transcoding_router](anypoint_api_policy_mcp_transcoding_router.md) | Manages an MCP Transcoding Router policy on an Anypoint API instance. |

## API Policies — LLM Gateway

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_bedrock_llm_provider_policy](anypoint_api_policy_bedrock_llm_provider_policy.md) | Manages a Bedrock LLM Provider policy on an Anypoint API instance. (outbound) |
| [anypoint_api_policy_gemini_llm_provider_policy](anypoint_api_policy_gemini_llm_provider_policy.md) | Manages a Gemini LLM Provider policy on an Anypoint API instance. (outbound) |
| [anypoint_api_policy_gemini_transcoding_policy](anypoint_api_policy_gemini_transcoding_policy.md) | Manages a Gemini Transcoding policy on an Anypoint API instance. (outbound) |
| [anypoint_api_policy_llm_gw_core_policy](anypoint_api_policy_llm_gw_core_policy.md) | Manages an LLM Gateway Core Policy on an Anypoint API instance. |
| [anypoint_api_policy_llm_proxy_core](anypoint_api_policy_llm_proxy_core.md) | Manages an LLM Proxy Core policy on an Anypoint API instance. |
| [anypoint_api_policy_llm_proxy_core_policy](anypoint_api_policy_llm_proxy_core_policy.md) | Manages an LLM Proxy Core Policy on an Anypoint API instance. |
| [anypoint_api_policy_model_based_routing](anypoint_api_policy_model_based_routing.md) | Manages a Model-Based Routing policy on an Anypoint API instance. |
| [anypoint_api_policy_openai_transcoding_policy](anypoint_api_policy_openai_transcoding_policy.md) | Manages an OpenAI Transcoding policy on an Anypoint API instance. (outbound) |
| [anypoint_api_policy_semantic_prompt_guard_policy_openai](anypoint_api_policy_semantic_prompt_guard_policy_openai.md) | Manages a Semantic Prompt Guard (OpenAI) policy on an Anypoint API instance. |
| [anypoint_api_policy_semantic_routing_policy_huggingface](anypoint_api_policy_semantic_routing_policy_huggingface.md) | Manages a Semantic Routing (HuggingFace) policy on an Anypoint API instance. |

## API Policies — A2A (Agent-to-Agent)

| Resource | Description |
|----------|-------------|
| [anypoint_api_policy_a2a_agent_card](anypoint_api_policy_a2a_agent_card.md) | Manages an A2A Agent Card policy on an Anypoint API instance. |
| [anypoint_api_policy_a2a_pii_detector](anypoint_api_policy_a2a_pii_detector.md) | Manages an A2A PII Detector policy on an Anypoint API instance. |
| [anypoint_api_policy_a2a_prompt_decorator](anypoint_api_policy_a2a_prompt_decorator.md) | Manages an A2A Prompt Decorator policy on an Anypoint API instance. |
| [anypoint_api_policy_a2a_schema_validation](anypoint_api_policy_a2a_schema_validation.md) | Manages an A2A Schema Validation policy on an Anypoint API instance. |
| [anypoint_api_policy_a2a_token_rate_limit](anypoint_api_policy_a2a_token_rate_limit.md) | Manages an A2A Token Rate Limit policy on an Anypoint API instance. |

## CloudHub 2.0

| Resource | Description |
|----------|-------------|
| [anypoint_private_space_config](anypoint_private_space_config.md) | Manages an Anypoint Private Space together with its network configuration and firewall rules as a single resource. |
| [anypoint_private_space_association](anypoint_private_space_association.md) | Creates and manages associations between a CloudHub 2.0 private space and environments. |
| [anypoint_private_space_upgrade](anypoint_private_space_upgrade.md) | Schedules an upgrade for a CloudHub 2.0 private space. |
| [anypoint_privatespace_advanced_config](anypoint_privatespace_advanced_config.md) | Manages advanced configuration for an Anypoint Private Space. |
| [anypoint_tls_context](anypoint_tls_context.md) | Manages a CloudHub 2.0 TLS Context with support for both PEM and JKS keystores. |
| [anypoint_vpn_connection](anypoint_vpn_connection.md) | Creates a VPN connection in a CloudHub 2.0 private space. |

## Secrets Manager

| Resource | Description |
|----------|-------------|
| [anypoint_secret_group_tls_context](anypoint_secret_group_tls_context.md) | Manages a Omni Gateway TLS context within a secret group in Anypoint Secrets Manager. |
| [anypoint_secret_group](anypoint_secret_group.md) | Manages a secret group in Anypoint Secrets Manager. |
| [anypoint_secret_group_certificate](anypoint_secret_group_certificate.md) | Manages a certificate within a secret group. Supports PEM, JKS, PKCS12, and JCEKS formats. |
| [anypoint_secret_group_certificate_pinset](anypoint_secret_group_certificate_pinset.md) | Manages a certificate pinset within a secret group for certificate pinning validation. |
| [anypoint_secret_group_keystore](anypoint_secret_group_keystore.md) | Manages a keystore within a secret group. Supports PEM, JKS, PKCS12, and JCEKS formats. |
| [anypoint_secret_group_shared_secret](anypoint_secret_group_shared_secret.md) | Manages a shared secret within a secret group. Supports UsernamePassword, S3Credential, SymmetricKey, and Blob types. |
| [anypoint_secret_group_truststore](anypoint_secret_group_truststore.md) | Manages a truststore within a secret group. Supports PEM, JKS, PKCS12, and JCEKS formats. |
