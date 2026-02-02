# Cloudflare Pages ビルドエラー修正ガイド

## 🔧 修正内容

### 1. vite.config.ts の修正
**問題**: ESモジュールで`__dirname`が使用できない
**解決**: `import.meta.url`を使用して`__dirname`を生成

### 2. package.json の修正
**問題**: 型定義が不足
**解決**: `@types/papaparse`を追加

## 📝 GitHubに修正をプッシュ

```powershell
cd c:\Users\masayuki.fujikawa\Downloads\qb-forecast-ai

# 変更を確認
git status

# 変更をステージング
git add .

# コミット
git commit -m "Fix: Cloudflare Pages ビルドエラー修正 - __dirname問題と型定義追加"

# GitHubにプッシュ
git push
```

## 🚀 Cloudflare Pagesで再デプロイ

プッシュ後、Cloudflare Pagesが自動的に再ビルドを開始します。

### 手動で再デプロイする場合

1. https://dash.cloudflare.com にアクセス
2. Pages → プロジェクト選択
3. "Deployments" タブ
4. "Retry deployment" をクリック

## ✅ ビルド成功の確認

ビルドログで以下を確認：
- ✅ `npm install` 成功
- ✅ `npm run build` 成功
- ✅ `dist/` フォルダ生成
- ✅ デプロイ完了

## 🆘 それでもエラーが出る場合

### エラー: "Cannot find module"
→ `package.json`の依存関係を確認

### エラー: "Build failed"
→ Cloudflare Pagesのビルドログを確認して、具体的なエラーメッセージを教えてください

### Node.jsバージョンの問題
Cloudflare Pagesの設定で環境変数を追加：
```
NODE_VERSION = 18
```

## 📊 ビルド設定の確認

Cloudflare Pagesの設定が以下になっているか確認：

| 項目 | 値 |
|------|-----|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 18 (環境変数) |

## 🔑 環境変数

必ず設定：
```
GEMINI_API_KEY = あなたのAPIキー
```
