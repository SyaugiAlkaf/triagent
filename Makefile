.PHONY: install cluster api engine warroom-dev warroom-build dev demo demo-legacy chaos eval clean fmt test

install:
	python -m pip install --upgrade pip
	pip install -r requirements.txt
	cd warroom && npm install

cluster:
	@if ! k3d cluster list | grep -q '^dc '; then \
		k3d cluster create dc --servers 1 --agents 1 -p "8080:80@loadbalancer"; \
	else \
		echo "k3d-dc already running"; \
	fi
	kubectl config use-context k3d-dc

api:
	SCENARIO_ENGINE_URL=http://localhost:8002 uvicorn app.main:app --reload --port 8000

engine:
	uvicorn scenario_engine.main:app --reload --port 8002

warroom-dev:
	cd warroom && npm run dev

warroom-build:
	cd warroom && npm run build

# Dev mode: honcho runs api + engine + warroom vite dev server.
# Open http://localhost:3000 (war room) and http://localhost:8002 (scenario control).
dev:
	SCENARIO_ENGINE_URL=http://localhost:8002 honcho start

# Production-ish demo: api + engine. War room must be pre-built (`make warroom-build`).
# Open http://localhost:8000/warroom/
demo:
	$(MAKE) warroom-build
	SCENARIO_ENGINE_URL=http://localhost:8002 honcho -f Procfile.prod start

# Legacy fallback: the original Streamlit UI parked at app/legacy_ui.py.
demo-legacy: cluster
	@echo "Start the API in a separate shell: make api"
	streamlit run app/legacy_ui.py --server.port 8501

chaos:
	CHAOS_MODE=interactive streamlit run app/legacy_ui.py --server.port 8501

eval:
	python -m eval.harness

fmt:
	ruff format app/ eval/ scenario_engine/
	ruff check --fix app/ eval/ scenario_engine/

test:
	pytest -v

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache
	rm -rf warroom-dist warroom/.vite
	rm -rf eval/results/
