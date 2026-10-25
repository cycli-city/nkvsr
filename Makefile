# WindScope UK - developer commands. `make help` lists them.
SHELL := /bin/bash
PY ?= python3
VENV := backend/.venv
BIN := $(VENV)/bin

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-frontend api web dev test test-backend test-frontend e2e lint format typecheck \
        check openapi ingest verify-upstream synthetic up down up-synthetic clean

help: ## show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---- setup ---------------------------------------------------------------------------------------
setup: setup-backend setup-frontend ## install backend + frontend dependencies
setup-backend: ## create backend/.venv and install the API with dev tools
	$(PY) -m venv $(VENV)
	$(BIN)/pip install -q -e "backend[dev]"
setup-frontend: ## npm ci
	cd frontend && npm ci

# ---- run ------------------------------------------------------------------------------------------
api: ## run the API on :8000 using data/ (needs a snapshot: make ingest | make synthetic)
	cd backend && ../$(BIN)/python -m uvicorn app.main:create_app --factory --reload --port 8000
web: ## run the Vite dev server on :5173 (proxies /api -> :8000)
	cd frontend && npm run dev
synthetic: ## write a clearly-labelled SYNTHETIC dev snapshot to data/dev (NOT Elexon data)
	cd backend && ../$(BIN)/python -m app.cli generate-synthetic-dev --data-dir ../data/dev
dev: synthetic ## offline dev: API on synthetic data (run `make web` in a second terminal)
	cd backend && DATA_DIR=../data/dev APP_ENV=development ../$(BIN)/python -m uvicorn app.main:create_app --factory --reload --port 8000

# ---- data (needs internet access to data.elexon.co.uk) -----------------------------------------
verify-upstream: ## probe the live Elexon API; writes docs/generated/ + real response samples
	cd backend && ../$(BIN)/python -m app.cli verify-upstream
ingest: ## fetch real FUELHH/WINDFOR data into data/snapshots/current
	cd backend && ../$(BIN)/python -m app.cli ingest

# ---- quality --------------------------------------------------------------------------------------
test: test-backend test-frontend ## run unit + integration tests
test-backend:
	cd backend && ../$(BIN)/python -m pytest -q
test-frontend:
	cd frontend && npm test
e2e: ## Playwright end-to-end + accessibility suite (starts API on synthetic data + production build)
	cd frontend && E2E_PYTHON=$(abspath $(BIN)/python) npx playwright test
lint: ## ruff + mypy + eslint + prettier check
	cd backend && ../$(BIN)/ruff check . && ../$(BIN)/ruff format --check . && ../$(BIN)/mypy app
	cd frontend && npm run lint && npm run format:check
format: ## auto-format both codebases
	cd backend && ../$(BIN)/ruff format . && ../$(BIN)/ruff check --fix .
	cd frontend && npm run format
typecheck:
	cd frontend && npm run typecheck
check: lint typecheck test ## everything CI runs except e2e + docker
openapi: ## regenerate frontend/openapi.json and the generated TypeScript API types
	cd backend && ../$(BIN)/python -m app.cli export-openapi --out ../frontend/openapi.json
	cd frontend && npm run gen:api

# ---- docker ---------------------------------------------------------------------------------------
up: ## docker compose: API + web on http://localhost:8080
	docker compose up --build
down:
	docker compose down
up-synthetic: ## docker compose on SYNTHETIC data (offline demo)
	docker compose -f docker-compose.yml -f docker-compose.synthetic.yml up --build

clean: ## remove build artefacts and caches
	rm -rf frontend/dist frontend/playwright-report frontend/test-results backend/.pytest_cache backend/.mypy_cache backend/.ruff_cache
	find backend -name __pycache__ -type d -prune -exec rm -rf {} +
