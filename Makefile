.PHONY: dev frontend collect test install deploy

dev: ## フロントエンドを起動（Supabase に直接接続）
	cd frontend && npm run dev

frontend: ## Vite dev server 起動 (port 5173)
	cd frontend && npm run dev

collect: ## 手動でトランスクリプト全件を Supabase に再収集
	uv run python collector.py --all

test: ## テスト実行
	uv run pytest tests/ -v

install: ## collect-stats コマンドを ~/.local/bin にインストール
	mkdir -p ~/.local/bin
	printf '#!/bin/bash\ncd "%s" && uv run python collector.py "$$@"\n' "$(CURDIR)" > ~/.local/bin/collect-stats
	chmod +x ~/.local/bin/collect-stats
	@echo "installed: ~/.local/bin/collect-stats"

deploy: ## Vercel にデプロイ（vercel CLI が必要）
	vercel --prod
