.PHONY: dev api frontend collect test install

dev: ## バックエンドとフロントエンドを同時起動
	make -j2 api frontend

api: ## FastAPI サーバー起動 (port 8765)
	uv run uvicorn api.main:app --host 0.0.0.0 --port 8765 --reload

frontend: ## Vite dev server 起動 (port 5173, API proxy to 8765)
	cd frontend && npm run dev

collect: ## 手動でトランスクリプト全件を再収集
	uv run python collector.py --all

test: ## テスト実行
	uv run pytest tests/ -v

install: ## collect-stats コマンドを ~/.local/bin にインストール
	mkdir -p ~/.local/bin
	printf '#!/bin/bash\npython3 "%s/collector.py" "$$@"\n' "$(CURDIR)" > ~/.local/bin/collect-stats
	chmod +x ~/.local/bin/collect-stats
	@echo "installed: ~/.local/bin/collect-stats"
