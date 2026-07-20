SHELL := /usr/bin/env bash
.SHELLFLAGS := -euo pipefail -c
.ONESHELL:

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
RUN_ID ?= $(shell date -u +%Y%m%dT%H%M%SZ)
RUN_DIR := $(ROOT)/.run/$(RUN_ID)
TF_DIR := $(ROOT)/assets/terraform

# Load .env if present
ifneq (,$(wildcard $(ROOT)/.env))
	include $(ROOT)/.env
	export
endif

.PHONY: help benchmark up down render report push-upstream test \
        deploy-upstream deploy-flex run clean-deployment \
        preflight prepare-registration watch

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-22s %s\n", $$1, $$2}'

preflight: ## Verify CLIs, docker daemon, AWS auth, .env, registration before any other target
	$(ROOT)/scripts/preflight.sh

prepare-registration: ## Generate .run/registration/registration.yaml + prompt for CLIENT_ID/CLIENT_SECRET if needed
	$(ROOT)/scripts/prepare-registration.sh

up: ## Provision EKS via Terraform (idempotent)
	cd $(TF_DIR) && terraform init -input=false
	cd $(TF_DIR) && terraform apply -auto-approve \
		-var "aws_region=$(AWS_REGION)" \
		-var "cluster_name=$(CLUSTER_NAME)"
	# Capture the kubeconfig command into a variable so `set -e` aborts on a
	# failed `terraform output` — `eval "$$(...)"` would otherwise mask the
	# substitution's exit status with eval's own (bash errexit doesn't
	# propagate into $$(...) without `shopt -s inherit_errexit`).
	cd $(TF_DIR) && kc_cmd="$$(terraform output -raw kubeconfig_cmd)" && eval "$$kc_cmd"

down: ## terraform destroy (full teardown)
	cd $(TF_DIR) && terraform destroy -auto-approve \
		-var "aws_region=$(AWS_REGION)" \
		-var "cluster_name=$(CLUSTER_NAME)"

push-upstream: ## Build and push the upstream image to ECR
	$(ROOT)/scripts/push-upstream.sh

render: ## Render Flex config + k6 script into $(RUN_DIR)
	mkdir -p $(RUN_DIR)
	N_APIS=$(N_APIS) POLICIES=$(POLICIES) \
	  UPSTREAM_HOST=upstream.default.svc.cluster.local UPSTREAM_PORT=80 \
	  $(ROOT)/scripts/render-flex-config.sh $(RUN_DIR)/flex-config.yaml
	$(ROOT)/scripts/render-k6-script.sh $(RUN_DIR)/scenario.js
	@echo "Rendered into $(RUN_DIR)"

deploy-upstream: ## Deploy bench-upstream (idempotent; skips if image+spec hash unchanged)
	$(ROOT)/scripts/deploy-upstream.sh $(RUN_DIR)/upstream-deployment.yaml

deploy-flex: render ## Deploy Flex (idempotent; skips if config+image hash unchanged)
	N_APIS=$(N_APIS) POLICIES=$(POLICIES) FLEX_VERSION=$(FLEX_VERSION) \
	  FLEX_IMAGE_REPOSITORY=$(FLEX_IMAGE_REPOSITORY) FLEX_IMAGE_TAG=$(FLEX_IMAGE_TAG) \
	  $(ROOT)/scripts/deploy-flex.sh $(RUN_DIR)

run: ## Per-run path: render scenario.js + apply k6 TestRun + wait + snapshot
	RUN_ID=$(RUN_ID) N_APIS=$(N_APIS) RPS=$(RPS) VUS=$(VUS) DURATION=$(DURATION) \
	  POLICIES=$(POLICIES) FLEX_VERSION=$(FLEX_VERSION) \
	  CLIENT_ID=$(CLIENT_ID) CLIENT_SECRET=$(CLIENT_SECRET) \
	  $(ROOT)/scripts/run-bench.sh

clean-deployment: ## Tear down Flex + upstream; cluster, observability, k6-operator stay
	$(ROOT)/scripts/clean-deployment.sh

benchmark: up deploy-upstream deploy-flex run ## Full run: up -> deploy* (skip if unchanged) -> k6 -> snapshot
	@if [ "$(TEARDOWN)" = "1" ]; then $(MAKE) down; fi
	@echo "Report at $(ROOT)/reports/$(RUN_ID)"

watch: ## Open Grafana port-forward + print live dashboard URLs (auto-refresh while a run is in flight)
	$(ROOT)/scripts/watch-grafana.sh

report: ## Export Grafana snapshots for the latest run
	@latest=$$(ls -1d $(ROOT)/.run/*/ 2>/dev/null | tail -n1); \
	if [ -z "$$latest" ]; then echo "no runs found"; exit 1; fi; \
	$(ROOT)/scripts/export-grafana-snapshot.sh "$(ROOT)/reports/$$(basename $$latest)"

test: ## Run renderer unit tests + shellcheck
	bash $(ROOT)/scripts/test/run.sh
	shellcheck $(ROOT)/scripts/*.sh $(ROOT)/scripts/test/*.sh
	terraform -chdir=$(ROOT)/assets/terraform fmt -check
	terraform -chdir=$(ROOT)/assets/terraform validate || (cd $(ROOT)/assets/terraform && terraform init -backend=false && terraform validate)
