# Setout: the only interface anyone needs.
#
# Every target works from a clean checkout on Linux and macOS. Targets print a
# clear error when a required tool is missing, rather than failing obscurely.

# Windows ships two programs called bash: the one from Git for Windows, and
# C:\Windows\System32\bash.exe, which starts WSL. Running the build under WSL
# installs a Linux node_modules that Windows tools cannot execute, so pin bash
# to Git's. This lets make run the same way from cmd.exe, Cmder and Git Bash.
# The 8.3 names avoid the space in "Program Files".
ifeq ($(OS),Windows_NT)
BASH := $(firstword $(wildcard \
	C:/PROGRA~1/Git/bin/bash.exe \
	C:/PROGRA~2/Git/bin/bash.exe))
ifeq ($(BASH),)
$(error Git for Windows was not found. Install it, or run make from Git Bash)
endif
else
BASH := /bin/bash
endif

SHELL := $(BASH)
.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web
SDK_DIR := packages/api-client
OPENAPI_JSON := $(SDK_DIR)/openapi.json

# name is an optional argument to `make migration`.
name ?=

PYTEST_WORKERS ?= auto
ifeq ($(PYTEST_WORKERS),1)
PYTEST_PARALLEL :=
else
# loadfile keeps a file's tests on one worker, so the contract test starts its
# server once rather than once per test.
PYTEST_PARALLEL := -n $(PYTEST_WORKERS) --dist loadfile
endif

.PHONY: help setup dev api web watch-sdk lint format test test-unit test-int test-contract \
	sdk migration migrate downgrade seed backup restore check check-parallel run-check \
	build docker-build kill clean require-uv require-yarn require-docker

# file is the archive argument to `make restore`.
file ?=

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

require-uv:
	@command -v uv >/dev/null 2>&1 || { \
		echo "Error: uv is not installed. See https://docs.astral.sh/uv/"; exit 1; }

require-yarn:
	@command -v yarn >/dev/null 2>&1 || { \
		echo "Error: yarn is not installed. Run: corepack enable"; exit 1; }
	@# Windows yarn writes .cmd shims into node_modules/.bin; Linux yarn writes
	@# symlinks. Sharing one checkout between Git Bash and WSL leaves shims the
	@# other cannot run, so say so plainly instead of failing later on a
	@# "not recognized as an internal or external command" from cmd.exe.
	@if [ -d node_modules/.bin ]; then \
		case "$$(uname -s)" in \
		MINGW*|MSYS*|CYGWIN*) \
			if [ ! -f node_modules/.bin/prettier.cmd ]; then \
				echo "Error: node_modules was installed by a Linux yarn, probably WSL."; \
				echo "Run 'yarn install' from Git Bash, then retry."; exit 1; \
			fi ;; \
		*) \
			if grep -qi microsoft /proc/version 2>/dev/null \
				&& [ -f node_modules/.bin/prettier.cmd ]; then \
				echo "Error: node_modules was installed by Windows yarn."; \
				echo "Run make from Git Bash, or use a separate checkout inside WSL."; exit 1; \
			fi ;; \
		esac; \
	fi

require-docker:
	@command -v docker >/dev/null 2>&1 || { \
		echo "Error: docker is not installed. See https://docs.docker.com/"; exit 1; }

setup: require-uv require-yarn ## Install everything, backend and frontend.
	cd $(API_DIR) && uv sync
	@# Workspace dependencies install once at the root. Installing from inside a
	@# workspace member re-links the shared node_modules/.bin and breaks it.
	yarn install --frozen-lockfile || yarn install

dev: ## Run API and web together with reload.
	@echo "Starting API and web. Press Ctrl-C to stop both."
	@# kill 0 signals the whole process group. Without it the reloader and
	@# its child survive Ctrl-C and keep holding the port. When one gets away
	@# regardless, `make kill` frees the ports.
	@trap 'trap - INT TERM EXIT; kill 0' INT TERM EXIT; \
	$(MAKE) api & \
	$(MAKE) web & \
	$(MAKE) watch-sdk & \
	wait

watch-sdk: require-uv ## Regenerate the SDK when the API source changes.
	cd $(API_DIR) && uv run watchfiles --filter python "$(MAKE) -C $(CURDIR) sdk" src

api: require-uv ## Run the API alone with reload.
	cd $(API_DIR) && uv run uvicorn setout.main:app --reload --reload-dir src --host 0.0.0.0 --port $${SETOUT_PORT:-8474}

web: require-yarn ## Run the web app alone.
	cd $(WEB_DIR) && yarn start

lint: require-uv require-yarn ## ruff, mypy, eslint, prettier, all in check mode.
	cd $(API_DIR) && uv run ruff check .
	cd $(API_DIR) && uv run ruff format --check .
	cd $(API_DIR) && uv run mypy
	cd $(WEB_DIR) && yarn lint
	cd $(WEB_DIR) && yarn prettier --check .

format: require-uv require-yarn ## Write mode for the same tools.
	cd $(API_DIR) && uv run ruff check --fix .
	cd $(API_DIR) && uv run ruff format .
	cd $(WEB_DIR) && yarn lint --fix || true
	cd $(WEB_DIR) && yarn prettier --write .

test: test-unit test-int test-contract ## All backend tests and the frontend unit tests.
	cd $(WEB_DIR) && yarn test --watch=false

test-unit: require-uv ## Unit tests only, fast.
	cd $(API_DIR) && uv run pytest tests/unit -m unit

test-int: require-uv ## Integration tests against a real database.
	cd $(API_DIR) && uv run pytest tests/integration -m integration $(PYTEST_PARALLEL)

test-contract: require-uv sdk ## Schema and SDK contract tests.
	cd $(API_DIR) && uv run pytest tests/contract -m contract

sdk: require-uv require-yarn ## Regenerate the API client.
	$(BASH) scripts/generate_sdk.sh

migration: require-uv ## tortoise makemigrations, accepting an optional name.
	cd $(API_DIR) && uv run tortoise makemigrations $(if $(name),-n $(name),)

migrate: require-uv ## tortoise migrate.
	cd $(API_DIR) && uv run tortoise migrate

downgrade: require-uv ## Roll back one migration.
	cd $(API_DIR) && uv run python -m setout.migrate_tools

seed: require-uv ## Load the sample data.
	cd $(API_DIR) && uv run python ../../scripts/seed.py

backup: ## Write the database and uploaded files into one dated archive.
	$(BASH) scripts/backup.sh

restore: ## Read a backup archive back, after asking. Pass file=<archive>.
	$(BASH) scripts/restore.sh $(file)

check: ## Lint, typecheck, all tests, coverage floor.
	@$(MAKE) run-check PYTEST_WORKERS=1

check-parallel: ## The same gate, with the backend suite spread across the cores.
	@$(MAKE) run-check PYTEST_WORKERS=$(PYTEST_WORKERS)

run-check: sdk
	$(MAKE) lint
	cd $(API_DIR) && uv run pytest $(PYTEST_PARALLEL) \
		--cov=setout --cov-report=term-missing --cov-fail-under=80
	cd $(WEB_DIR) && yarn test --watch=false

build: require-uv require-yarn sdk ## Production build of both apps.
	cd $(API_DIR) && uv build
	cd $(WEB_DIR) && yarn build

docker-build: require-docker ## Build the single deployment image.
	docker build -f docker/Dockerfile -t setout:latest .

kill: ## Stop anything left holding the dev ports.
	@for port in $${SETOUT_PORT:-8474} $${WEB_PORT:-4200}; do \
		case "$$(uname -s)" in \
		MINGW*|MSYS*|CYGWIN*) \
			pids=$$(netstat -ano \
				| awk -v want=":$$port$$" \
					'$$1 == "TCP" && $$2 ~ want && $$4 == "LISTENING" { print $$5 }' \
				| sort -u) ;; \
		*) \
			pids=$$(lsof -ti tcp:$$port 2>/dev/null | sort -u) ;; \
		esac; \
		if [ -z "$$pids" ]; then \
			echo "$$port: nothing listening"; \
			continue; \
		fi; \
		for pid in $$pids; do \
			case "$$(uname -s)" in \
			MINGW*|MSYS*|CYGWIN*) taskkill //F //T //PID $$pid >/dev/null 2>&1 ;; \
			*) kill $$pid 2>/dev/null || true ;; \
			esac; \
			echo "$$port: stopped $$pid"; \
		done; \
	done
	@# watch-sdk holds no port of its own, so it is named rather than found.
	@pkill -f "watchfiles --filter python" 2>/dev/null \
		&& echo "stopped the SDK watcher" || true

clean: ## Remove build artefacts and caches.
	rm -rf $(API_DIR)/dist $(API_DIR)/.venv $(API_DIR)/.pytest_cache \
		$(API_DIR)/.mypy_cache $(API_DIR)/.ruff_cache $(API_DIR)/htmlcov \
		$(API_DIR)/.coverage $(WEB_DIR)/dist $(WEB_DIR)/.angular \
		$(WEB_DIR)/node_modules
	find . -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
