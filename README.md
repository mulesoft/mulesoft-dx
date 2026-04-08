# README

This repository is the **single source of truth** for all public Anypoint Platform API specifications. It contains OpenAPI (OAS) specifications for all production-accessible APIs.

## Purpose

- Centralized registry of all public Anypoint Platform APIs
- Ensures API specifications are validated and compliant with AI-agent-friendly standards
- Enables API discovery and consumption through standardized, well-documented specs
- Provides version control and change tracking for API specifications

## Repository Structure

Each API service has its own directory containing:
```
<service-name>/
├── api.yaml           # Main OpenAPI specification file
├── exchange.json      # Exchange metadata (groupId, assetId, version, etc.)
├── schemas/           # Reusable schema definitions (optional)
├── examples/          # Request/response examples (optional)
└── skills/            # JTBD workflow skills (optional)
```



