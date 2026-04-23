# 開発環境セットアップ

## 前提

- Node.js 20+ がインストール済み
- npm または pnpm が使える
- Supabase アカウントを作成済み

---

## 1. リポジトリをクローン

```bash
git clone https://github.com/riki-ftc/sugoroku.git
cd sugoroku
```

## 2. 依存関係をインストール

```bash
npm install
```

## 3. Supabase プロジェクトを用意

### 3.1 Supabase ダッシュボードで新規プロジェクト作成

1. https://supabase.com にログイン
2. New Project
3. プロジェクト名：`sugoroku`（または任意）
4. Region：`Northeast Asia (Tokyo)`
5. Plan：Free

### 3.2 マイグレーションを適用

Supabase ダッシュボードの **SQL Editor** を開き、
`supabase/migrations/20260422_001_initial_schema.sql` の中身を貼り付けて実行。

または Supabase CLI を使う場合：

```bash
# 初回のみ
npm install -g supabase

# プロジェクトとリンク
supabase link --project-ref <your-project-ref>

# マイグレーション適用
supabase db push
```

### 3.3 接続情報を取得

Supabase ダッシュボード → **Settings → API** から以下をコピー：
- Project URL
- anon public key
- service_role key（サーバーサイドでのみ使用）

## 4. 環境変数を設定

```bash
cp .env.example .env.local
```

`.env.local` を編集して Supabase の接続情報を入れる。

## 5. 開発サーバー起動

```bash
npm run dev
```

http://localhost:3000 にアクセスして動作確認。

---

## トラブルシューティング

### `Module not found: xlsx` が出る
```bash
npm install
```

### Supabase 接続エラー
`.env.local` の URL / anon key が正しいか、末尾に余計なスペースや改行がないか確認。

### 7日間触らずに Supabase が pause された
Supabase ダッシュボードで **Restore project** ボタンを押す（無料）。
