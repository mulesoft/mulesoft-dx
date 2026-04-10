# Makefile for validating Anypoint Platform API specifications
#
# Usage:
#   make validate-all          - Validate all APIs without governance rules
#   make validate-all-governed - Validate all APIs with governance rules
#   make validate-api API=api_manager - Validate specific API
#   make report                - Generate summary report
#   make help                  - Show this help message

.PHONY: help validate-all validate-all-governed validate-api clean report generate-portal serve-portal serve-proxy deploy-test deploy-prod test-portal validate-jtbd validate-xorigin validate-descriptions

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
MAGENTA := \033[0;35m
CYAN := \033[0;36m
NC := \033[0m # No Color

# Configuration
ANYPOINT_CLI := anypoint-cli-v4
RULESET := ./.agents/skills/api-spec-validator/scripts/ruleset.yaml
REPORT_DIR := ./validation-reports
TIMESTAMP := $(shell date +%Y%m%d_%H%M%S)

# APIs to skip during governed validation (override via SKIP_GOVERNED="api1 api2")
SKIP_GOVERNED :=

# Discover all API directories (those with exchange.json in apis/)
API_DIRS := $(shell find ./apis -maxdepth 2 -name "exchange.json" -exec dirname {} \; | sed 's|^\./||' | sort)

# Default target
help:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Anypoint API Specification Validation$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@echo "  $(YELLOW)make validate-all$(NC)          - Validate all APIs (basic OAS validation)"
	@echo "  $(YELLOW)make validate-all-governed$(NC) - Validate all APIs with governance rules"
	@echo "  $(YELLOW)make validate-api API=<name>$(NC) - Validate specific API"
	@echo "  $(YELLOW)make report$(NC)                - Generate comprehensive validation report"
	@echo "  $(YELLOW)make clean$(NC)                 - Clean validation reports"
	@echo "  $(YELLOW)make list-apis$(NC)             - List all discovered APIs"
	@echo "  $(YELLOW)make generate-portal$(NC)       - Generate static API documentation portal"
	@echo "  $(YELLOW)make serve-portal$(NC)          - Serve the API portal (default port 8082)"
	@echo "  $(YELLOW)make serve-proxy$(NC)           - Start the CORS proxy server (default port 8080)"
	@echo "  $(YELLOW)make deploy-test$(NC)           - Deploy portal to test environment via FTP"
	@echo "  $(YELLOW)make deploy-prod$(NC)           - Deploy portal to production via FTP"
	@echo "  $(YELLOW)make test-portal$(NC)           - Run portal generator test suite"
	@echo "  $(YELLOW)make validate-xorigin$(NC)      - Validate x-origin annotations across APIs"
	@echo "  $(YELLOW)make validate-jtbd$(NC)         - Validate all JTBD files in skills/ directories"
	@echo "  $(YELLOW)make validate-descriptions$(NC) - Validate API descriptions use imperative format"

	@echo "  $(YELLOW)make help$(NC)                  - Show this help message"
	@echo ""
	@echo "$(GREEN)Examples:$(NC)"
	@echo "  make validate-api API=api_manager"
	@echo "  make validate-all-governed"
	@echo "  make generate-portal BASE_URL=http://localhost:8080"
	@echo ""
	@echo "$(BLUE)Found $(words $(API_DIRS)) APIs$(NC)"
	@echo ""

# List all discovered APIs
list-apis:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Discovered APIs ($(words $(API_DIRS)) total)$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@for api in $(API_DIRS); do \
		echo "  $(GREEN)✓$(NC) $$api"; \
	done
	@echo ""

# Create report directory
$(REPORT_DIR):
	@mkdir -p $(REPORT_DIR)

# Validate all APIs without governance rules
validate-all: $(REPORT_DIR)
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Validating All APIs - Basic OAS Validation$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@passed=0; failed=0; \
	for api in $(API_DIRS); do \
		echo "$(BLUE)Validating:$(NC) $$api"; \
		report=$(REPORT_DIR)/$$api-basic-$(TIMESTAMP).txt; \
		if $(ANYPOINT_CLI) api-project validate --location=./$$api > "$$report" 2>&1; then \
			violations=$$(grep -c "Severity:.*Violation" "$$report" 2>/dev/null || true); \
			warnings=$$(grep -c "Severity:.*Warning" "$$report" 2>/dev/null || true); \
			if [ "$$violations" -gt 0 ] 2>/dev/null; then \
				echo "  $(RED)✗ FAILED$(NC) - Violations: $$violations, Warnings: $$warnings"; \
				failed=$$((failed + 1)); \
			else \
				echo "  $(GREEN)✓ PASSED$(NC) - Violations: 0, Warnings: $$warnings"; \
				passed=$$((passed + 1)); \
			fi; \
		else \
			violations=$$(grep -c "Severity:.*Violation" "$$report" 2>/dev/null || true); \
			warnings=$$(grep -c "Severity:.*Warning" "$$report" 2>/dev/null || true); \
			echo "  $(RED)✗ FAILED$(NC) - Violations: $$violations, Warnings: $$warnings"; \
			head -1 "$$report" 2>/dev/null | grep -v "^$$" | while read line; do echo "    $$line"; done; \
			failed=$$((failed + 1)); \
		fi; \
		echo ""; \
	done; \
	echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"; \
	echo "$(GREEN)Results:$(NC) $$passed passed, $(RED)$$failed failed$(NC) ($(words $(API_DIRS)) total)"; \
	echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"; \
	if [ $$failed -gt 0 ]; then exit 1; fi

# Validate all APIs with governance rules
validate-all-governed: $(REPORT_DIR)
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Validating All APIs - With Governance Rules$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@if [ ! -f $(RULESET) ]; then \
		echo "$(RED)Error: Ruleset not found at $(RULESET)$(NC)"; \
		exit 1; \
	fi; \
	passed=0; failed=0; skipped=0; \
	for api in $(API_DIRS); do \
		skip=false; \
		for s in $(SKIP_GOVERNED); do [ "$$api" = "$$s" ] && skip=true; done; \
		if $$skip; then \
			echo "$(YELLOW)Skipping:$(NC) $$api (in SKIP_GOVERNED list)"; \
			skipped=$$((skipped + 1)); \
			echo ""; \
			continue; \
		fi; \
		echo "$(BLUE)Validating:$(NC) $$api"; \
		report=$(REPORT_DIR)/$$api-governed-$(TIMESTAMP).txt; \
		if $(ANYPOINT_CLI) api-project validate --location=./$$api --local-ruleset=$(RULESET) > "$$report" 2>&1; then \
			violations=$$(grep -c "Severity:.*Violation" "$$report" 2>/dev/null || true); \
			warnings=$$(grep -c "Severity:.*Warning" "$$report" 2>/dev/null || true); \
			if [ "$$violations" -gt 0 ] 2>/dev/null; then \
				echo "  $(RED)✗ FAILED$(NC) - Violations: $$violations, Warnings: $$warnings"; \
				failed=$$((failed + 1)); \
			else \
				echo "  $(GREEN)✓ PASSED$(NC) - Violations: 0, Warnings: $$warnings"; \
				passed=$$((passed + 1)); \
			fi; \
		else \
			violations=$$(grep -c "Severity:.*Violation" "$$report" 2>/dev/null || true); \
			warnings=$$(grep -c "Severity:.*Warning" "$$report" 2>/dev/null || true); \
			echo "  $(RED)✗ FAILED$(NC) - Violations: $$violations, Warnings: $$warnings"; \
			head -1 "$$report" 2>/dev/null | grep -v "^$$" | while read line; do echo "    $$line"; done; \
			failed=$$((failed + 1)); \
		fi; \
		echo ""; \
	done; \
	echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"; \
	echo "$(GREEN)Results:$(NC) $$passed passed, $(RED)$$failed failed$(NC), $(YELLOW)$$skipped skipped$(NC) ($(words $(API_DIRS)) total)"; \
	echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"; \
	if [ $$failed -gt 0 ]; then exit 1; fi

# Validate specific API
validate-api:
	@if [ -z "$(API)" ]; then \
		echo "$(RED)Error: API parameter required$(NC)"; \
		echo "Usage: make validate-api API=<api-name>"; \
		exit 1; \
	fi
	@if [ ! -d "$(API)" ]; then \
		echo "$(RED)Error: API directory '$(API)' not found$(NC)"; \
		exit 1; \
	fi
	@mkdir -p $(REPORT_DIR)
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Validating: $(API)$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(BLUE)Step 1: Basic OAS Validation$(NC)"
	@$(ANYPOINT_CLI) api-project validate --location=./$(API) > $(REPORT_DIR)/$(API)-basic-$(TIMESTAMP).txt 2>&1 || true
	@violations=$$(grep -c "Severity:.*Violation" $(REPORT_DIR)/$(API)-basic-$(TIMESTAMP).txt 2>/dev/null || echo 0); \
	warnings=$$(grep -c "Severity:.*Warning" $(REPORT_DIR)/$(API)-basic-$(TIMESTAMP).txt 2>/dev/null || echo 0); \
	echo "  Violations: $$violations"; \
	echo "  Warnings: $$warnings"; \
	echo ""
	@echo "$(BLUE)Step 2: Governance Rules Validation$(NC)"
	@if [ -f $(RULESET) ]; then \
		$(ANYPOINT_CLI) api-project validate --location=./$(API) --local-ruleset=$(RULESET) > $(REPORT_DIR)/$(API)-governed-$(TIMESTAMP).txt 2>&1 || true; \
		violations=$$(grep -c "Severity:.*Violation" $(REPORT_DIR)/$(API)-governed-$(TIMESTAMP).txt 2>/dev/null || echo 0); \
		warnings=$$(grep -c "Severity:.*Warning" $(REPORT_DIR)/$(API)-governed-$(TIMESTAMP).txt 2>/dev/null || echo 0); \
		echo "  Violations: $$violations"; \
		echo "  Warnings: $$warnings"; \
		echo ""; \
		echo "$(BLUE)Top Violation Categories:$(NC)"; \
		grep "Constraint:.*ruleset.yaml" $(REPORT_DIR)/$(API)-governed-$(TIMESTAMP).txt 2>/dev/null | \
			sed 's/.*#\/encodes\/validations\///' | sort | uniq -c | sort -rn | head -5 | \
			while read count type; do echo "  $$count  $$type"; done; \
	else \
		echo "  $(YELLOW)Skipped: Ruleset not found$(NC)"; \
	fi
	@echo ""
	@echo "$(GREEN)Reports saved to:$(NC)"
	@echo "  $(REPORT_DIR)/$(API)-basic-$(TIMESTAMP).txt"
	@echo "  $(REPORT_DIR)/$(API)-governed-$(TIMESTAMP).txt"
	@echo ""

# Generate comprehensive report
report: $(REPORT_DIR)
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Generating Validation Report$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "Running validation on all APIs..."
	@echo ""
	@report_file=$(REPORT_DIR)/summary-$(TIMESTAMP).md; \
	echo "# API Validation Summary Report" > $$report_file; \
	echo "" >> $$report_file; \
	echo "Generated: $$(date)" >> $$report_file; \
	echo "" >> $$report_file; \
	echo "## Overview" >> $$report_file; \
	echo "" >> $$report_file; \
	echo "Total APIs: $(words $(API_DIRS))" >> $$report_file; \
	echo "" >> $$report_file; \
	echo "## Validation Results" >> $$report_file; \
	echo "" >> $$report_file; \
	echo "| API | Format | Basic Violations | Basic Warnings | Governed Violations | Governed Warnings |" >> $$report_file; \
	echo "|-----|--------|-----------------|----------------|---------------------|-------------------|" >> $$report_file; \
	for api in $(API_DIRS); do \
		echo "$(BLUE)Processing:$(NC) $$api"; \
		$(ANYPOINT_CLI) api-project validate --location=./$$api > $(REPORT_DIR)/$$api-basic-report.txt 2>&1 || true; \
		$(ANYPOINT_CLI) api-project validate --location=./$$api --local-ruleset=$(RULESET) > $(REPORT_DIR)/$$api-governed-report.txt 2>&1 || true; \
		format=$$(grep -E "openapi|swagger" $$api/api.yaml $$api/oas/api.*.yaml 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ' || echo "Unknown"); \
		basic_v=$$(grep -c "Severity:.*Violation" $(REPORT_DIR)/$$api-basic-report.txt 2>/dev/null || echo 0); \
		basic_w=$$(grep -c "Severity:.*Warning" $(REPORT_DIR)/$$api-basic-report.txt 2>/dev/null || echo 0); \
		gov_v=$$(grep -c "Severity:.*Violation" $(REPORT_DIR)/$$api-governed-report.txt 2>/dev/null || echo 0); \
		gov_w=$$(grep -c "Severity:.*Warning" $(REPORT_DIR)/$$api-governed-report.txt 2>/dev/null || echo 0); \
		echo "| $$api | $$format | $$basic_v | $$basic_w | $$gov_v | $$gov_w |" >> $$report_file; \
	done; \
	echo "" >> $$report_file; \
	echo "$(GREEN)Report generated:$(NC) $$report_file"; \
	echo ""; \
	cat $$report_file

# Clean validation reports
clean:
	@echo "$(YELLOW)Cleaning validation reports...$(NC)"
	@rm -rf $(REPORT_DIR)
	@echo "$(GREEN)Done$(NC)"

# Targets for individual APIs (generated dynamically)
.PHONY: $(API_DIRS)
$(API_DIRS):
	@$(MAKE) validate-api API=$@

# Generate static API documentation portal
# Usage: make generate-portal [BUILD_LABEL="branch: sha"] [BASE_URL=https://api-portal.mulesoft.com]
PORTAL_ARGS :=
ifdef BUILD_LABEL
PORTAL_ARGS += --build-label "$(BUILD_LABEL)"
endif
ifdef BASE_URL
PORTAL_ARGS += --base-url "$(BASE_URL)"
endif

generate-portal:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Generating Static API Portal$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@python3 scripts/generate_portal.py --output portal $(PORTAL_ARGS)
	@echo ""
	@echo "$(GREEN)✓ Portal generated successfully!$(NC)"
	@echo "$(BLUE)📂 Output: portal/$(NC)"
	@echo "$(BLUE)🌐 Open: portal/index.html$(NC)"
	@echo ""

# Serve the documentation portal
# Usage: make serve-portal [PORT=8083]
serve-portal:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Serving API Portal$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@if [ ! -d "portal" ]; then \
		echo "$(RED)Error: portal/ directory not found. Run 'make generate-portal' first.$(NC)"; \
		exit 1; \
	fi; \
	PORT_VAL=$(PORT); \
	if [ -z "$$PORT_VAL" ]; then PORT_VAL=8083; fi; \
	echo "$(GREEN)✓ Portal is being served at http://localhost:$$PORT_VAL$(NC)"; \
	echo "$(BLUE)Press Ctrl+C to stop the server$(NC)"; \
	echo ""; \
	python3 -m http.server $$PORT_VAL --directory portal

# Start CORS proxy server
# Usage: make serve-proxy [PROXY_PORT=8080]
serve-proxy:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Starting CORS Proxy Server$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@PROXY_PORT_VAL=$(PROXY_PORT); \
	if [ -z "$$PROXY_PORT_VAL" ]; then PROXY_PORT_VAL=8080; fi; \
	echo "$(GREEN)✓ Proxy server starting at http://localhost:$$PROXY_PORT_VAL$(NC)"; \
	echo "$(BLUE)Press Ctrl+C to stop the server$(NC)"; \
	echo ""; \
	python3 scripts/proxy_server.py --port $$PROXY_PORT_VAL

# FTP deployment settings
FTP_HOST := 564243.ftp.upload.akamai.com
FTP_TEST_PATH := /564243/api-portal.mulesoft.com/test
FTP_PROD_PATH := /564243/api-portal.mulesoft.com/prod

# Deploy portal to test environment via FTP
# Requires: AKAMAI_FTP_USER and AKAMAI_FTP_PASSWORD environment variables
deploy-test:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Deploying Portal to TEST$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@if [ ! -d "portal" ]; then \
		echo "$(RED)Error: portal/ directory not found. Run 'make generate-portal' first.$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$$AKAMAI_FTP_USER" ] || [ -z "$$AKAMAI_FTP_PASSWORD" ]; then \
		echo "$(RED)Error: AKAMAI_FTP_USER and AKAMAI_FTP_PASSWORD env vars are required.$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Uploading to $(FTP_HOST):$(FTP_TEST_PATH)$(NC)"
	@lftp -e "mirror --reverse --delete --verbose portal/ $(FTP_TEST_PATH); bye" -u $$AKAMAI_FTP_USER,$$AKAMAI_FTP_PASSWORD $(FTP_HOST)
	@echo ""
	@echo "$(GREEN)✓ Deployed to test environment$(NC)"

# Deploy portal to production via FTP
# Requires: AKAMAI_FTP_USER and AKAMAI_FTP_PASSWORD environment variables
deploy-prod:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Deploying Portal to PRODUCTION$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@if [ ! -d "portal" ]; then \
		echo "$(RED)Error: portal/ directory not found. Run 'make generate-portal' first.$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$$AKAMAI_FTP_USER" ] || [ -z "$$AKAMAI_FTP_PASSWORD" ]; then \
		echo "$(RED)Error: AKAMAI_FTP_USER and AKAMAI_FTP_PASSWORD env vars are required.$(NC)"; \
		exit 1; \
	fi
	@echo "$(RED)⚠  WARNING: You are about to deploy to PRODUCTION$(NC)"
	@echo -n "$(YELLOW)Are you sure? [y/N] $(NC)" && read ans && [ "$$ans" = "y" ] || (echo "$(RED)Aborted.$(NC)"; exit 1)
	@echo "$(YELLOW)Uploading to $(FTP_HOST):$(FTP_PROD_PATH)$(NC)"
	@lftp -e "mirror --reverse --delete --verbose portal/ $(FTP_PROD_PATH); bye" -u $$AKAMAI_FTP_USER,$$AKAMAI_FTP_PASSWORD $(FTP_HOST)
	@echo ""
	@echo "$(GREEN)✓ Deployed to production$(NC)"

# Run portal generator test suite
test-portal:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Running Portal Generator Tests$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@cd scripts && python3 -m pytest tests/ -v
	@echo ""
	@cd scripts && npx jest --verbose
	@echo ""

# Validate x-origin annotations across APIs
validate-xorigin:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Validating x-origin Annotations$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@python3 scripts/build/validate_xorigin.py
	@echo ""

# Validate all JTBD files in skills directories
validate-jtbd:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Validating JTBD Files$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@files=$$(find . \
		-type d \( -name .git -o -name .agents -o -name .claude \) -prune -o \
		-type f -path "*/skills/*.md" -print | sort); \
	if [ -z "$$files" ]; then \
		echo "$(YELLOW)No JTBD files found under */skills/*.md$(NC)"; \
		exit 0; \
	fi; \
	passed=0; failed=0; \
	for file in $$files; do \
		echo "$(BLUE)Validating:$(NC) $$file"; \
		if python3 scripts/build/validate_jtbd.py "$$file" .; then \
			echo "  $(GREEN)✓ PASSED$(NC)"; \
			passed=$$((passed + 1)); \
		else \
			echo "  $(RED)✗ FAILED$(NC)"; \
			failed=$$((failed + 1)); \
		fi; \
		echo ""; \
	done; \
	echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"; \
	echo "$(GREEN)Results:$(NC) $$passed passed, $(RED)$$failed failed$(NC)"; \
	echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"; \
	if [ $$failed -gt 0 ]; then exit 1; fi

# Validate API descriptions use imperative format
validate-descriptions:
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(CYAN)  Validating API Descriptions$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@python3 scripts/build/validate_descriptions.py
	@echo ""
