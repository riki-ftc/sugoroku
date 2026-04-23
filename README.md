# sugoroku

> クラスルーム向け・クイズすごろくWebアプリ

複数チームがリアルタイム対戦できるクイズすごろくをブラウザで遊ぶためのWebアプリです。先生が Excelファイルで問題・マス・アクションを管理し、生徒はゲームコードを入れるだけで各自のデバイスから参加できます。

**現在の状態**: 開発中（設計完了、基盤構築フェーズ）

---

## 主な特徴

- 🎲 サイコロを振って進むすごろく形式
- ❓ マスに止まるとクイズが出題、正解／不正解でアクション発動
- 👥 1人プレイ、チーム協力プレイの両対応
- 🔄 Supabase Realtime による即時同期（数十チームの同時プレイに対応）
- 📊 Excelファイルをアップロードするだけで問題セットを登録
- 💴 無料で運用可能（Supabase Free + Cloudflare Pages Free）

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| バックエンド | Supabase (Postgres + Realtime + Auth) |
| ホスティング | Cloudflare Pages |
| Excel解析 | xlsx (SheetJS) |

---

## 使い方（先生向け）

1. `public/template/すごろくマスター管理テンプレート.xlsx` をダウンロード
2. マス・問題・アクションを記入して保存
3. `/admin/import` にアップロード → ゲームセットとしてDBに登録
4. `/admin/create-game` でゲームコードを発行
5. 生徒にコードと QR コードを共有

## 使い方（生徒向け）

1. トップページでゲームコードを入力（または QR スキャン）
2. チーム名・アバターを選ぶ
3. みんなでサイコロを振ってクイズに答えながらゴールを目指す

---

## ドキュメント

- [DESIGN.md](./DESIGN.md) — 全体設計書
- [docs/SETUP.md](./docs/SETUP.md) — 開発環境のセットアップ
- [docs/TEACHER_GUIDE.md](./docs/TEACHER_GUIDE.md) — 先生向けマニュアル（準備中）

---

## 開発ルール

- ブランチ：`main`（本番） / `develop`（統合先） / `feature/*`（作業）
- `main`・`develop` への直接pushは禁止。必ず Draft PR 経由
- コミットプレフィックス：`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- マイグレーション：`supabase/migrations/` に SQL ファイルを配置

---

## ライセンス

MIT License（予定）
