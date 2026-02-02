# Cloudflare Pages デプロイコマンド修正

## 🎯 問題

ビルドは成功していますが、デプロイコマンドの設定が間違っています。

## ✅ 解決方法

Cloudflare Pagesの設定を以下のように変更してください：

### 1. Cloudflare Pagesダッシュボードにアクセス

1. https://dash.cloudflare.com にアクセス
2. **Pages** → **QB-Forecastai** を選択
3. **Settings** タブをクリック
4. **Builds & deployments** セクションを開く

### 2. ビルド設定を修正

**重要**: 以下の設定に変更してください：

| 項目 | 現在の値 | 正しい値 |
|------|---------|---------|
| Framework preset | Framework preset | **None** または **Vite** |
| Build command | `npm run build` | `npm run build` ✅ |
| Build output directory | (空白?) | `dist` |
| **Deploy command** | `npx wrangler deploy` ❌ | **削除（空白にする）** |

### 3. 設定手順

1. **Framework preset**: `Vite` を選択
2. **Build command**: `npm run build`
3. **Build output directory**: `dist`
4. **Root directory**: (空白のまま)
5. **Environment variables**: 
   - `GEMINI_API_KEY` = あなたのAPIキー

### 4. 保存して再デプロイ

1. **Save** をクリック
2. **Deployments** タブに戻る
3. **Retry deployment** をクリック

## 📝 または：wrangler.jsonc を作成

プロジェクトルートに以下のファイルを作成してもOKです：

**wrangler.jsonc**
```json
{
  "name": "qb-forecast-ai",
  "compatibility_date": "2026-02-02",
  "assets": {
    "directory": "./dist"
  }
}
```

その後、GitHubにプッシュ：
```bash
git add wrangler.jsonc
git commit -m "Add wrangler.jsonc for Cloudflare Pages"
git push
```

## 🎉 期待される結果

設定後、ビルドログは以下のようになります：

```
✓ Building for production...
✓ Build completed successfully
✓ Deploying to Cloudflare Pages...
✓ Deployment complete!
✓ https://qb-forecast-ai.pages.dev
```
