
SHELL = /bin/bash
.SHELLFLAGS = -o pipefail -c

.PHONY: help
help: ## Print info about all commands
	@echo "Helper Commands:"
	@echo
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "    \033[01;32m%-20s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "NOTE: dependencies between commands are not automatic. Eg, you must run 'deps' and 'build' first, and after any changes"

.PHONY: build
build: codegen ## Compile all modules
	pnpm build

.PHONY: test
test: ## Run all tests
	pnpm test

.PHONY: restart-dev-env
restart-dev-env: ## Kill any stale dev-env process, ensure db_test/redis_test are healthy, and relaunch with pretty logs
	bash ./scripts/restart-dev.sh

.PHONY: run-dev-env
run-dev-env: ## Run a "development environment" shell (incl. matrix-bridge on :3001)
	NODE_ENV=development ./scripts/with-matrix-bridge.sh pnpm --filter @atproto/dev-env run start

.PHONY: run-dev-env-logged
run-dev-env-logged: ## Run a "development environment" shell (with logging)
	cd packages/dev-env; LOG_ENABLED=true NODE_ENV=development pnpm run start | pnpm exec pino-pretty

.PHONY: matrix-smoke
matrix-smoke: ## Boot Synapse+bridge and smoke-test the appservice paths
	./scripts/matrix-smoke.sh

# The Matrix stack mounts its config by relative path, so starting compose from
# the wrong directory silently creates empty mounts and boots a broken Synapse
# and MAS. These targets always resolve the repo root from the script location.

.PHONY: matrix-up
matrix-up: ## Start the Matrix stack (Synapse, MAS, para-idp, Element) from the repo root
	./scripts/matrix-stack.sh up

.PHONY: matrix-up-with-bridge
matrix-up-with-bridge: ## Start the Matrix stack including the containerized bridge (stop the host bridge first)
	./scripts/matrix-stack.sh up --with-bridge

.PHONY: matrix-down
matrix-down: ## Stop the Matrix stack (volumes preserved)
	./scripts/matrix-stack.sh down

.PHONY: matrix-status
matrix-status: ## Container status plus a reachability probe of every Matrix endpoint
	./scripts/matrix-stack.sh status

.PHONY: matrix-doctor
matrix-doctor: ## Report how far the community -> space -> event pipeline has actually got
	./scripts/matrix-stack.sh doctor

.PHONY: matrix-logs
matrix-logs: ## Tail the Matrix stack logs (make matrix-logs SERVICE=synapse)
	./scripts/matrix-stack.sh logs $(SERVICE)

.PHONY: run-dev-env-persistent
run-dev-env-persistent: ## Run a persistent development environment shell
	mkdir -p $${DEV_ENV_PDS_DATA_DIRECTORY:-$${HOME}/.paramx-demo/pds} $${DEV_ENV_PDS_BLOBSTORE_DIRECTORY:-$${HOME}/.paramx-demo/blobstore} $${DEV_ENV_PLC_DIRECTORY:-$${HOME}/.paramx-demo/plc}
	cd packages/dev-env; \
	ENV=shared-demo \
	NODE_ENV=development \
	DEV_ENV_PDS_DATA_DIRECTORY=$${DEV_ENV_PDS_DATA_DIRECTORY:-$${HOME}/.paramx-demo/pds} \
	DEV_ENV_PDS_BLOBSTORE_DIRECTORY=$${DEV_ENV_PDS_BLOBSTORE_DIRECTORY:-$${HOME}/.paramx-demo/blobstore} \
	DEV_ENV_PLC_DIRECTORY=$${DEV_ENV_PLC_DIRECTORY:-$${HOME}/.paramx-demo/plc} \
	DEV_ENV_M8_URL=$${DEV_ENV_M8_URL:-http://localhost:8787/v1} \
	DEV_ENV_M8_RESOLVER_SECRET=$${DEV_ENV_M8_RESOLVER_SECRET:-$$(sed -n 's/^CIVIC_DELEGATION_RESOLVER_SECRET=//p' $${MUBEZ_DIR:-../../../mubEZ}/.env 2>/dev/null)} \
	../dev-infra/with-redis-and-db.sh node --enable-source-maps dist/bin.js

.PHONY: run-dev-env-persistent-logged
run-dev-env-persistent-logged: ## Run a persistent development environment shell (with logging)
	mkdir -p $${DEV_ENV_PDS_DATA_DIRECTORY:-$${HOME}/.paramx-demo/pds} $${DEV_ENV_PDS_BLOBSTORE_DIRECTORY:-$${HOME}/.paramx-demo/blobstore} $${DEV_ENV_PLC_DIRECTORY:-$${HOME}/.paramx-demo/plc}
	cd packages/dev-env; \
	ENV=shared-demo \
	LOG_ENABLED=true \
	NODE_ENV=development \
	DEV_ENV_PDS_DATA_DIRECTORY=$${DEV_ENV_PDS_DATA_DIRECTORY:-$${HOME}/.paramx-demo/pds} \
	DEV_ENV_PDS_BLOBSTORE_DIRECTORY=$${DEV_ENV_PDS_BLOBSTORE_DIRECTORY:-$${HOME}/.paramx-demo/blobstore} \
	DEV_ENV_PLC_DIRECTORY=$${DEV_ENV_PLC_DIRECTORY:-$${HOME}/.paramx-demo/plc} \
	DEV_ENV_M8_URL=$${DEV_ENV_M8_URL:-http://localhost:8787/v1} \
	DEV_ENV_M8_RESOLVER_SECRET=$${DEV_ENV_M8_RESOLVER_SECRET:-$$(sed -n 's/^CIVIC_DELEGATION_RESOLVER_SECRET=//p' $${MUBEZ_DIR:-../../../mubEZ}/.env 2>/dev/null)} \
	../dev-infra/with-redis-and-db.sh node --enable-source-maps dist/bin.js | pnpm exec pino-pretty

.PHONY: codegen
codegen: ## Re-generate packages from lexicon/ files
	pnpm codegen

.PHONY: lint
lint: ## Run style checks and verify syntax
	pnpm verify

.PHONY: fmt
fmt: ## Run syntax re-formatting
	pnpm format

.PHONY: fmt-lexicons
fmt-lexicons: ## Run syntax re-formatting, just on .json files
	npx prettier --write "./lexicons/**/*.json"

.PHONY: deps
deps: ## Installs dependent libs using 'pnpm install'
	pnpm install --frozen-lockfile

.PHONY: clean
clean: clean-deps clean-build clean-prebuild

.PHONY: clean-gen
clean-gen: clean-build clean-prebuild

.PHONY: clean-deps
clean-deps: ## Deletes all installed dependencies (node_modules) in all packages
	find . -type d -name "node_modules" -prune -exec rm -rf {} +;

.PHONY: clean-build
clean-build: ## Deletes all build artifacts (dist, tsbuildinfo) in all packages
	find . -type d -name "dist" -not -path "*/node_modules/*" -prune -exec rm -rf {} +;
	find . -type f -name "*.tsbuildinfo" -not -path "*/node_modules/*" -exec rm {} +;

.PHONY: clean-prebuild
clean-prebuild: ## Deletes all prebuild artifacts (codegen, lingui, etc.) in all packages
	for f in packages/*/src/proto packages/*/src/lexicons packages/lex/*/src/lexicons packages/lex/*/tests/lexicons packages/oauth/*/src/lexicons packages/oauth/*/src/locales/*/messages.ts packages/api/src/client packages/api/src/moderation/const/labels.ts; do rm -r "$$f"; done || true;

.PHONY: nvm-setup
nvm-setup: ## Use NVM to install and activate node+pnpm
	nvm install
	nvm use
	corepack enable
	corepack install

# =============================================================================
# Service Doctors (Diagnostics)
# =============================================================================

.PHONY: doctor
doctor: ## Run all health checks on the full stack
	./scripts/doctor.sh all

.PHONY: pds-doctor
pds-doctor: ## Check PDS health, DID resolution, and blobstore
	./scripts/doctor.sh pds

.PHONY: bsky-doctor
bsky-doctor: ## Check AppView health and dataplane connectivity
	./scripts/doctor.sh bsky

.PHONY: dataplane-doctor
dataplane-doctor: ## Check dataplane database connectivity
	./scripts/doctor.sh dataplane

.PHONY: bsync-doctor
bsync-doctor: ## Check bsync health and database pool
	./scripts/doctor.sh bsync

.PHONY: ozone-doctor
ozone-doctor: ## Check Ozone health and admin configuration
	./scripts/doctor.sh ozone

.PHONY: postgres-doctor
postgres-doctor: ## Check Postgres connections, disk, and slow queries
	./scripts/doctor.sh postgres

.PHONY: redis-doctor
redis-doctor: ## Check Redis memory, hit rate, and connections
	./scripts/doctor.sh redis

.PHONY: caddy-doctor
caddy-doctor: ## Check Caddy config validity and SSL certificates
	./scripts/doctor.sh caddy

.PHONY: index-doctor
index-doctor: ## Verify production indexes exist in Postgres
	./scripts/doctor.sh indexes

.PHONY: pre-deploy
pre-deploy: ## Check if everything is ready for production deploy
	../scripts/pre-deploy-check.sh

.PHONY: smoke-test
smoke-test: ## Run end-to-end smoke tests against production
	../scripts/smoke-test-production.sh
