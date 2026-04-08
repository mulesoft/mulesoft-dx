# Getting Started

## Overview
The Anypoint Flex Gateway Manager API provides endpoints to manage Flex Gateways registered in Anypoint Platform. It exposes all CRUD (Create, Read, Update, Delete) operations on Anypoint Managed Flex Gateways (Flex Gateways deployed to Cloudhub 2.0) through this RESTful API.

## Base URL
The API is accessible through the Anypoint Platform base URL in `/gatewaymanager` path. For example:
- US Production: `https://anypoint.mulesoft.com/gatewaymanager/api/v1`
- EU Production: `https://eu1.anypoint.mulesoft.com/gatewaymanager/api/v1`

## Authentication
All API requests require authentication using Anypoint Platform credentials.

## Available Operations

### List Managed Gateways
- **Endpoint**: `GET /organizations/{organizationId}/environments/{environmentId}/gateways`
- **Description**: Retrieves a list of managed gateways for a specific organization and environment
- **Query Parameters**:
  - `name`: Filter gateways by name
  - `pageSize`: Number of items per page
  - `pageNumber`: Page number for pagination
  - `sortBy`: Field to sort by
  - `sortOrder`: Sort order (asc/desc)

### Create Managed Gateway
- **Endpoint**: `POST /organizations/{organizationId}/environments/{environmentId}/gateways`
- **Description**: Creates a new managed gateway in the specified environment
- **Request Body**: Gateway configuration details

### Get Gateway Details
- **Endpoint**: `GET /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}`
- **Description**: Retrieves detailed information about a specific managed gateway
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway

### Update Gateway
- **Endpoint**: `PUT /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}`
- **Description**: Updates the configuration of an existing managed gateway
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway
- **Request Body**: Updated gateway configuration

### Delete Gateway
- **Endpoint**: `DELETE /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}`
- **Description**: Removes a managed gateway from the environment
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway

### Get Gateway Registration Data
- **Endpoint**: `GET /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}/registration`
- **Description**: Retrieves registration information for a specific gateway
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway

### Get Runtime Configuration
- **Endpoint**: `GET /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}/runtime-configuration`
- **Description**: Retrieves the runtime configuration of a Managed or Self-Managed Flex Gateway
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway

### Upsert Runtime Configuration
- **Endpoint**: `PUT /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}/runtime-configuration`
- **Description**: Creates or updates the runtime configuration of a Managed or Self-Managed Flex Gateway
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway
- **Request Body**: A JSON object with a required `configuration` property. The shape of `configuration` depends on the gateway type and runtime version (e.g. 1.12.1).

**Configuration overview (Flex Gateway 1.12.1)**

- **Logging**: Forward logs to Anypoint (`logging.anypoint.forwardLogs`), runtime log level (`logging.runtimeLogs.logLevel`: `debug`, `info`, `warn`, `error`, `fatal`). Self-managed gateways additionally support Fluent Bit–based `logging.outputs` (e.g. stdout, file, http, kafka, elasticsearch) and output toggles for access/runtime logs.
- **Tracing**: Enable/disable tracing, provider (`anypoint` for both; self-managed also supports `opentelemetry`), sampling (e.g. `overall` 0–100), and optional labels (literal, request header, or environment variable with name and default value).
- **Proxy Protocol**: Enable/disable (`proxyProtocol.enabled`).
- **Timeouts**: `streamIdleSeconds`, `upstreamResponseSeconds`, `upstreamConnectionIdleSeconds`.
- **Circuit breaker**: Optional thresholds: `maxRetries`, `maxRequests`, `maxConnections`, `maxConnectionPools`, `maxPendingRequests`.
- **Connection buffer limits**: Global buffer limit (`connectionBufferLimits.global`).
- **Routing**: `rewriteHostHeader` to control host header rewriting on upstream requests.
- **Probe** (self-managed only): Optional health probe with `path`, `port`, and `enabled`.

**Example — Managed Flex Gateway (1.12.1)**

```json
{
  "configuration": {
    "logging": {
      "anypoint": { "forwardLogs": true },
      "runtimeLogs": { "logLevel": "info" }
    },
    "tracing": {
      "enabled": true,
      "provider": { "type": "anypoint" },
      "sampling": { "overall": 2 }
    },
    "proxyProtocol": { "enabled": false },
    "timeouts": {
      "streamIdleSeconds": 300,
      "upstreamResponseSeconds": 15,
      "upstreamConnectionIdleSeconds": 60
    },
    "routing": { "rewriteHostHeader": false }
  }
}
```

**Example — Self-Managed Flex Gateway (1.12.1)**

```json
{
  "configuration": {
    "logging": {
      "anypoint": { "forwardLogs": false },
      "runtimeLogs": { "logLevel": "warn" },
      "outputs": {
        "stdout": {
          "type": "stdout",
          "parameters": {}
        }
      }
    },
    "tracing": {
      "enabled": true,
      "provider": { "type": "opentelemetry" },
      "sampling": { "overall": 10 }
    },
    "timeouts": {
      "streamIdleSeconds": 300,
      "upstreamResponseSeconds": 15,
      "upstreamConnectionIdleSeconds": 60
    },
    "probe": {
      "enabled": true,
      "path": "/health",
      "port": 8080
    },
    "routing": { "rewriteHostHeader": true }
  }
}
```

### Get Gateway Status
- **Endpoint**: `GET /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}/status`
- **Description**: Retrieves current status data for the managed gateway (status, ready, running)
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway

### Update Desired Status
- **Endpoint**: `PATCH /organizations/{organizationId}/environments/{environmentId}/gateways/{gatewayId}/desiredstatus`
- **Description**: Updates the desired status of a gateway (e.g. STARTED or STOPPED)
- **Path Parameters**:
  - `gatewayId`: UUID of the gateway
- **Request Body**: Desired status (STARTED or STOPPED)

### Get Gateway Usage
- **Endpoint**: `GET /organizations/{organizationId}/usage/managed-gateways`
- **Description**: Retrieves usage information for managed gateways in an organization
- **Query Parameters**:
  - `size`: Gateway size (small/large)
