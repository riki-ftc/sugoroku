# CLAUDE.md - Claude Code 向けプロジェクト指示

## プロジェクト概要
すごろくクイズゲーム Web アプリ。先生がExcelで問題を管理し、生徒がゲームコードで参加してリアルタイム対戦する。

## 技術スタック
- **フロントエンド**: Next.js 15 (App Router) + React 19 + Tailwind CSS 3
- **バックエンド**: Supabase (PostgreSQL + Realtime + Auth)
- **デプロイ**: Cloudflare Workers (OpenNext adapter)
- **パッケージ管理**: npm

## 重要なコマンド
```bash
npm run dev        # ローカル開発（Next.js devサーバー）
npm run build      # Next.js ビルド
npm run preview    # Cloudflare Workers ランタイムでプレビュー
npm run deploy     # Cloudflare Workers にデプロイ
npm run lint       # ESLint
npm run typecheck  # TypeScript型チェック
```

## ディレクトリ構成
```
src/
├── app/           # Next.js App Router のページ
│   ├── admin/     # 管理画面（インポート・ゲームセット管理）
│   ├── host/      # ホスト画面（QRコード・参加待機）
│   ├── join/      # 参加画面（チーム登録）
│   ├── lobby/     # ロビー待機画面
│   ├── play/      # ゲーム進行画面
│   └── results/   # 結果画面
├── lib/
│   ├── supabase/  # Supabase クライアント設定
│   ├── game/      # ゲームロジック（エンジン・盤面・型定義）
│   └── excel/     # Excelパーサー・バリデーター・インポーター
└── components/    # 共通コンポーネント
```

## ブランチ戦略
- `main`: 本番用
- `develop`: 開発統合
- `feature/*`: 個別機能ブランチ
- 直接 push 禁止。必ず feature → Draft PR 経由。

## コミットメッセージ規約
`feat:`, `fix:`, `docs:`, `chore:`, `refactor:` 等のプレフィックスを使用。

## Supabase
- プロジェクトID: `nowgseppuovwfixrvtti`
- マイグレーション: `supabase/migrations/` に配置し `apply_migration` で適用
- Realtime: `game_sessions`, `teams`, `turn_events` テーブルで有効

## 注意点
- sessionStorage のキーは `team_${gameCode}` 形式
- クライアント側でのみ xlsx パッケージを使用（SSRでは動かない）
- 画像は `unoptimized: true` 設定（Cloudflare Images は未使用）
