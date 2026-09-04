.PHONY: help install dev seed test lint build check tf-validate clean

help:
	@echo "install       Install backend and frontend dependencies"
	@echo "seed          Create the local DynamoDB table and load demo data"
	@echo "dev           Run the API (:4000) and the app (:5173) together"
	@echo "test          Run the backend unit tests"
	@echo "lint          Lint backend, frontend and terraform"
	@echo "build         Bundle the Lambda artifacts and the frontend"
	@echo "check         Everything CI runs, locally"
	@echo "clean         Remove build output and dependencies"

install:
	cd backend && npm install
	cd frontend && npm install

seed:
	cd backend && npm run seed

dev:
	@echo "API on :4000, app on :5173 — Ctrl-C stops both"
	@trap 'kill 0' INT TERM; \
	(cd backend && npm run dev) & \
	(cd frontend && npm run dev) & \
	wait

test:
	cd backend && npm test

lint:
	cd backend && npm run lint
	cd frontend && npm run lint
	cd infra && terraform fmt -check -recursive

build:
	cd backend && npm run build
	cd frontend && npm run build

# Mirrors the CI workflow so a failure is caught before pushing.
check: lint test build tf-validate

tf-validate:
	mkdir -p backend/artifacts/api
	test -f backend/artifacts/api/index.mjs || echo 'export const handler = async () => ({})' > backend/artifacts/api/index.mjs
	cd infra && terraform init -backend=false -input=false >/dev/null && terraform validate

clean:
	rm -rf backend/node_modules backend/artifacts frontend/node_modules frontend/dist infra/.build
