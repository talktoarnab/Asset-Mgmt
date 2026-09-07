.PHONY: help install dev seed test lint build check tf-validate clean

help:
	@echo "install       Install backend test dependencies"
	@echo "seed          Create the local DynamoDB table and load demo data"
	@echo "dev           Run the API (:4000) and the desk app (:5173) together"
	@echo "test          Run the backend unit tests"
	@echo "lint          Compile-check Python and check terraform formatting"
	@echo "build         Copy the Lambda source into artifacts/api"
	@echo "check         Everything CI runs, locally"
	@echo "clean         Remove build output"

install:
	python3 -m pip install -r backend/requirements-dev.txt

seed:
	python3 backend/src/local/setup.py

dev:
	@echo "API on :4000, app on :5173 — Ctrl-C stops both"
	@trap 'kill 0' INT TERM; \
	python3 backend/src/local/server.py & \
	(cd frontend && node serve.mjs) & \
	wait

test:
	cd backend && python3 -m pytest

lint:
	python3 -m compileall -q backend/src
	cd infra && terraform fmt -check -recursive

build:
	bash backend/scripts/build.sh

# Mirrors the CI workflow so a failure is caught before pushing.
check: lint test build tf-validate

tf-validate:
	mkdir -p backend/artifacts/api
	test -f backend/artifacts/api/handler.py || printf '%s\n' 'def handler(event, context=None):' '    return {"statusCode": 200, "body": "{}"}' > backend/artifacts/api/handler.py
	cd infra && terraform init -backend=false -input=false >/dev/null && terraform validate

clean:
	rm -rf backend/artifacts backend/.pytest_cache infra/.build
	find backend -type d -name '__pycache__' -exec rm -rf {} +
