# デプロイ手順

すごろくアプリを Cloudflare Workers にデプロイする手順です。

## 前提条件

- Node.js 20+
- npm
- Cloudflare アカウント（無料プランでOK）
- Supabase プロジェクト（作成済み）

---

## 1. Cloudflare アカウントの準備

1. https://dash.cloudflare.com にログイン（なければ新規登録）
2. Workers & Pages が利用可能であることを確認

## 2. Wrangler のセットアップ

```bash
# プロジェクトルートで
npm install

# Cloudflare にログイン（ブラウザが開きます）
npx wrangler login
```

## 3. 環境変数の設定

### 方法A: Cloudflare ダッシュボードから設定（推奨）

デプロイ後、Workers & Pages → sugoroku → Settings → Variables and Secrets で以下を設定：

| 変数名 | 値 | 種別 |
|--------|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nowgseppuovwfixrvtti.supabase.co` | 変数 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon key | シークレット |

### 方法B: wrangler.toml に直接記載

`wrangler.toml` の `[vars]` セクションに記載できますが、anon key は Secrets として設定することを推奨します。

```bash
# シークレットとして設定
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## 4. ビルド & デプロイ

```bash
# ビルド + デプロイ（一括）
npm run deploy
```

これで `sugoroku.<your-subdomain>.workers.dev` にデプロイされます。

## 5. ローカルプレビュー（本番環境に近い動作確認）

```bash
# Cloudflare Workers ランタイムでローカル実行
npm run preview
```

## 6. カスタムドメインの設定（任意）

1. Cloudflare ダッシュボード → Workers & Pages → sugoroku
2. Settings → Domains & Routes
3. カスタムドメインを追加（Cloudflare の DNS で管理しているドメインが必要）

---

## CI/CD（Workers Builds）を使う場合

Cloudflare Workers Builds を使えば、GitHub にプッシュするたびに自動デプロイできます。

1. Cloudflare ダッシュボード → Workers & Pages → Create
2. 「Connect to Git」を選択
3. `riki-ftc/sugoroku` リポジトリを接続
4. ビルド設定：
   - Framework preset: なし（カスタム）
   - Build command: `npm run deploy`
   - Build output: `.open-next`
5. 環境変数を「Build Variables and secrets」に設定

---

## Supabase の本番設定

### RLS（Row Level Security）の確認

本番デプロイ前に、Supabase ダッシュボードで以下を確認：

- すべてのテーブルで RLS が有効であること
- ポリシーが適切に設定されていること

### Realtime の確認

- `game_sessions`、`teams`、`turn_events` テーブルの Realtime が有効であること
- Supabase ダッシュボード → Database → Replication で確認

---

## トラブルシューティング

### ビルドが失敗する場合

```bash
# 依存関係を再インストール
rm -rf node_modules .next .open-next
npm install
npm run deploy
```

### 環境変数が読み取れない場合

- `NEXT_PUBLIC_` プレフィックスの変数はビルド時に埋め込まれるため、Workers Builds の「Build Variables and secrets」に設定する必要がある
- ランタイムのみの変数は Secrets に設定

### Supabase との接続が失敗する場合

- Supabase プロジェクトが一時停止されていないか確認
- anon key が正しいか確認
- URL に `/rest/v1/` 等のサフィックスが付いていないか確認
