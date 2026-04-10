# API Validation Guide

This repository includes a comprehensive Makefile for validating all Anypoint Platform API specifications.

## Quick Start

```bash
# Show available commands
make help

# List all discovered APIs
make list-apis

# Validate a specific API
make validate-api API=secrets-manager

# Validate all APIs (basic OAS validation)
make validate-all

# Validate all APIs with governance rules
make validate-all-governed

# Generate comprehensive report
make report
```

## Validation Levels

### 1. Basic OAS Validation

Validates the OpenAPI specification structure without custom governance rules:

```bash
make validate-all
```

**Checks:**
- Valid OAS/Swagger syntax
- Schema consistency
- Reference integrity
- Parameter definitions

### 2. Governance Rules Validation

Validates against AI-agent-friendly best practices:

```bash
make validate-all-governed
```

**Additional Checks:**
- Operation IDs in camelCase
- No duplicated operation IDs
- All operations have descriptions
- Request/response examples present
- Schema properties documented
- No "naked strings" (enums required)
- Explicit required fields

## Individual API Validation

Validate a specific API with detailed output:

```bash
make validate-api API=api_manager
```

This runs both basic and governance validation and shows:
- Violation counts
- Warning counts
- Top violation categories
- Report file locations

## Generating Reports

Create a comprehensive validation report for all APIs:

```bash
make report
```

Generates a Markdown report in `./validation-reports/summary-<timestamp>.md` with:
- Overview of all APIs
- Format (OAS 3.0, Swagger 2.0, etc.)
- Violation and warning counts
- Comparison table

## Report Location

All validation reports are saved to:
```
./validation-reports/
```

Files are named with timestamps:
- `<api-name>-basic-<timestamp>.txt` - Basic OAS validation
- `<api-name>-governed-<timestamp>.txt` - Governance validation
- `summary-<timestamp>.md` - Comprehensive report

## Clean Up

Remove all validation reports:

```bash
make clean
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Validate API Specs

on:
  pull_request:
    paths:
      - '*/api.yaml'
      - '*/oas/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Anypoint CLI
        run: |
          npm install -g anypoint-cli-v4
          anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin

      - name: Validate Changed APIs
        run: |
          # Get changed API directories
          CHANGED_APIS=$(git diff --name-only origin/master... | grep -E 'api\.yaml|api\.json' | xargs -n1 dirname | sort -u)

          for api in $CHANGED_APIS; do
            echo "Validating $api"
            make validate-api API=$api
          done

      - name: Upload Reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: validation-reports
          path: validation-reports/
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g anypoint-cli-v4'
                sh 'anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin'
            }
        }

        stage('Validate All APIs') {
            steps {
                sh 'make validate-all-governed'
            }
        }

        stage('Generate Report') {
            steps {
                sh 'make report'
                archiveArtifacts artifacts: 'validation-reports/**', fingerprint: true
            }
        }
    }

    post {
        always {
            publishHTML([
                reportDir: 'validation-reports',
                reportFiles: 'summary-*.md',
                reportName: 'API Validation Report'
            ])
        }
    }
}
```

## Makefile Targets Reference

| Target | Description |
|--------|-------------|
| `help` | Show available commands |
| `list-apis` | List all discovered APIs |
| `validate-all` | Validate all APIs (basic) |
| `validate-all-governed` | Validate all APIs with governance rules |
| `validate-api API=<name>` | Validate specific API |
| `report` | Generate comprehensive report |
| `clean` | Remove validation reports |

## Discovered APIs

The Makefile automatically discovers all API directories by looking for `exchange.json` files. Currently discovering **32 APIs**:

- access-management
- amc-application-manager
- analytics-event-export
- anypoint-monitoring-archive
- anypoint-mq-admin
- anypoint-mq-broker
- anypoint-mq-stats
- anypoint-security-policies
- api-designer-experience
- api-manager
- api-platform
- arm-monitoring-query
- arm-rest-services
- audit-log-query
- citizen-platform-experience
- cloudhub
- cloudhub-20
- exchange-experience
- flex-gateway-manager
- metrics
- mule-agent-plugin
- object-store-v2
- object-store-v2-stats
- partner-manager-v2-partners
- partner-manager-v2-tracking
- proxies-xapi
- runtime-fabric
- secrets-manager
- tokenization-creation-and-mgmt
- tokenization-runtime-service
- usage

## Governance Rules

The governance rules are defined in:
```
./.agents/skills/api-spec-validator/scripts/ruleset.yaml
```

See [api-spec-validator skill documentation](https://github.com/machaval/api-spec-skills) for details on the rules.

## Troubleshooting

### "Ruleset not found" error

Ensure the api-spec-validator skill is installed:
```bash
/plugin marketplace add machaval/api-spec-skills
```

### "API directory not found" error

Check the API name matches the directory name:
```bash
make list-apis
```

### Validation hangs

Large API specs may take time to validate. Be patient or validate smaller batches.

### Permission errors

Ensure the validation-reports directory is writable:
```bash
chmod -R u+w validation-reports/
```

## Examples

### Validate APIs before PR

```bash
# Validate all APIs with governance rules
make validate-all-governed

# Review violations
ls -lh validation-reports/
```

### Check specific API compliance

```bash
# Validate and see top issues
make validate-api API=exchange-experience

# View detailed report
cat validation-reports/exchange-experience-governed-*.txt
```

### Generate weekly compliance report

```bash
# Generate report
make report

# Email or post to Slack
cat validation-reports/summary-*.md | mail -s "API Compliance Report" team@example.com
```

## Contributing

When adding a new API to the repository:

1. Create API directory with `exchange.json`
2. Run validation: `make validate-api API=<your-api>`
3. Fix violations until compliant
4. Submit PR with validation report

## Support

For issues with:
- **Makefile**: Open an issue in this repository
- **Validation rules**: See [api-spec-validator documentation](https://github.com/machaval/api-spec-skills)
- **Anypoint CLI**: See [Anypoint CLI documentation](https://docs.mulesoft.com/anypoint-cli)
