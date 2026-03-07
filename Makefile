.PHONY: dev frontend collect test install deploy

dev: ## フロントエンドを起動（Supabase に直接接続）
	cd frontend && npm run dev

frontend: ## Vite dev server 起動 (port 5173)
	cd frontend && npm run dev

collect: ## 手動でトランスクリプト全件を Supabase に再収集
	uv run python collector.py --all

test: ## テスト実行
	uv run pytest tests/ -v

install: ## Stop hook 用にプロジェクトパスと認証情報を登録
	mkdir -p ~/.config/claude-stats
	echo "$(CURDIR)" > ~/.config/claude-stats/project-path
	@echo "registered: $(CURDIR) -> ~/.config/claude-stats/project-path"
	@if [ ! -f ~/.config/claude-stats/env ]; then \
		echo ""; \
		echo "次に ~/.config/claude-stats/env を作成してください:"; \
		echo "  SUPABASE_URL=https://xxx.supabase.co"; \
		echo "  SUPABASE_SERVICE_KEY=eyJ..."; \
	else \
		echo "credentials: ~/.config/claude-stats/env (exists)"; \
	fi

deploy: ## Vercel にデプロイ（vercel CLI が必要）
	vercel --prod
