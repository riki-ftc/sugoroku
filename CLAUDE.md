# CLAUDE.md — sugoroku プロジェクト向け Claude 指示書

Claude Code や Claude.ai でこのリポジトリを扱うときの前提・規約をまとめる。

---

## プロジェクト概要

クラスルーム向けクイズすごろくWebアプリ。先生が Excel で問題・マス・アクションを管理し、生徒はゲームコードを入れるだけで各自のデバイスから参加し、チームで対戦する。

詳細は `DESIGN.md` を参照。

---

## 技術スタック

- **フロントエンド**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **バックエンド**: Supabase (Postgres + Realtime + Auth)
- **Excel解析**: `xlsx` (SheetJS) — クライアントサイドで実行
- **ホスティング**: Cloudflare Pages

---

## 開発ルール（必須）

### ブランチ運用
- `main` / `develop` に **直接 push しない**
- 作業は必ず `feature/*` ブランチを切り、**Draft PR** を `develop` に対して作成
- PR のタイトルは `feat:` `fix:` `docs:` `chore:` `refactor:` のいずれかで始める

### ファイル配置
- Next.js のページ：`src/app/`（App Router）
- 再利用可能な React コンポーネント：`src/components/`
- ロジック層：`src/lib/`（`supabase/`, `game/`, `excel/` のサブディレクトリ）
- 型定義：`src/types/` および `src/lib/supabase/types.ts`（自動生成）
- Supabase マイグレーション：`supabase/migrations/YYYYMMDD_NNN_説明.sql`

### マイグレーション
- 新しいスキーマ変更は必ず新規マイグレーションファイルとして追加する
- 既存のマイグレーションファイルは**絶対に書き換えない**
- マイグレーション名は `YYYYMMDD_連番_説明.sql` 形式
- 適用は Supabase MCP の `apply_migration` を使う

### コミット
- 1PRにつき1つの目的に絞る（大きな変更は分割する）
- コミットメッセージは日本語・英語どちらでも可、プレフィックスは必須

---

## Supabase 環境

- プロジェクト名：`sugoroku`（Supabaseダッシュボード上は `Sugoroku`）
- リージョン：`ap-northeast-1`（東京）
- プロジェクトID：`nowgseppuovwfixrvtti`
- Project URL：`https://nowgseppuovwfixrvtti.supabase.co`
- 組織：`Riki_Sugoroku`（SchoolWorks用とは別のGoogleアカウントで作成した組織）
- 開発・本番は **同一プロジェクト**（小規模のため）。将来分ける場合は別途マイグレーション戦略を検討

※ SchoolWorks（`riki-ftc/schoolworks`）とは独立した別組織・別プロジェクトのため、あちらのルールや Supabase project_id は参照しない

---

## Excel マスター管理

- 公式テンプレート：`public/template/すごろくマスター管理テンプレート.xlsx`
- 取り込み対象シート：`ゲーム設定`, `マス設定`, `問題`, `アクション`
- `はじめに` シートは説明用で取り込み対象外
- シート名は**厳密一致**。揺らぎはエラーとして拒否する
- 取り込みはクライアントサイドで `xlsx` パッケージを使って JSON化 →バリデーション → Supabase に一括 INSERT

---

## 運用上の注意

### データ安全性
- `cells.cell_number` は 0 から連番（0 = スタート）
- 問題ID・アクションID はテキストキー（`Q001`, `ACT_ADVANCE_2` など）
- 外部キーは quiz_code / action_code から解決してインポート時に UUID に変換する

### リアルタイム同期
- ターン制御は `game_sessions.current_turn_team_id` で表現
- 書き込みの競合は Supabase の条件付き UPDATE + クライアント側 UI 制御で二重防御
- `turn_events` は append-only（UPDATE/DELETE しない）

### 無料枠の配慮
- Supabase Free は 7日間未使用で一時停止される
- 授業で使わない期間は pause されるのを許容（使う直前に再開）

---

## 次に進めるべきタスク（セッション3以降）

1. Excelインポート機能の実装（`src/app/admin/import/page.tsx`）
2. Excelパーサー・バリデータ（`src/lib/excel/`）
3. ゲームセット一覧画面
4. ゲーム作成フロー（コード発行、QR表示、ホスト画面）
5. 生徒参加フロー（コード入力、チーム名登録、ロビー）
6. ゲーム進行コア（盤面描画、サイコロ、クイズ、アクション、Realtime同期）
7. 結果画面
8. Cloudflare Pages へのデプロイ

詳細は `DESIGN.md` のセクション9「実装ロードマップ」を参照。
