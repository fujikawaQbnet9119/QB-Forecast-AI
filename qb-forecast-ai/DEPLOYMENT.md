# QB HOUSE Dashboard - デプロイガイド

## 🚀 デプロイ準備完了

このアプリケーションはPWA（Progressive Web App）として完全に構成されており、以下の機能を備えています：

### ✅ PWA機能
- オフラインサポート
- インストール可能
- プッシュ通知対応
- バックグラウンド同期
- 高速キャッシング

---

## 📦 必要な準備

### 1. 依存関係のインストール

```bash
npm install
```

### 2. PWAプラグインの追加

```bash
npm install -D vite-plugin-pwa
```

### 3. アイコンの準備

`public/icons/` ディレクトリに以下のサイズのアイコンを配置：
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

**簡易作成方法**:
```bash
# 1つの大きな画像（512x512以上）から自動生成
# オンラインツール: https://www.pwabuilder.com/imageGenerator
```

---

## 🏗️ ビルド

### 開発ビルド
```bash
npm run dev
```

### 本番ビルド
```bash
npm run build
```

### ビルドのプレビュー
```bash
npm run preview
```

---

## 🌐 デプロイ先

### 1. Vercel（推奨）

**特徴**:
- 自動デプロイ
- グローバルCDN
- 無料プラン充実

**手順**:
```bash
# Vercel CLIインストール
npm install -g vercel

# デプロイ
vercel

# 本番デプロイ
vercel --prod
```

**または**:
1. https://vercel.com にアクセス
2. GitHubリポジトリを接続
3. 自動デプロイ設定

### 2. Netlify

**特徴**:
- 簡単デプロイ
- フォーム処理
- 無料SSL

**手順**:
```bash
# Netlify CLIインストール
npm install -g netlify-cli

# デプロイ
netlify deploy

# 本番デプロイ
netlify deploy --prod
```

**設定ファイル** (`netlify.toml`):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 3. Cloudflare Pages

**特徴**:
- 超高速CDN
- 無制限帯域幅
- Workers統合

**手順**:
1. https://pages.cloudflare.com にアクセス
2. GitHubリポジトリを接続
3. ビルド設定:
   - Build command: `npm run build`
   - Build output: `dist`

### 4. GitHub Pages

**手順**:
```bash
# gh-pagesパッケージインストール
npm install -D gh-pages

# package.jsonにスクリプト追加
"scripts": {
  "deploy": "npm run build && gh-pages -d dist"
}

# デプロイ
npm run deploy
```

**vite.config.ts更新**:
```typescript
export default defineConfig({
  base: '/リポジトリ名/',
  // ...
});
```

---

## ⚙️ 環境変数

`.env.production` ファイルを作成：

```env
VITE_API_URL=https://api.example.com
VITE_APP_NAME=QB HOUSE Dashboard
VITE_ENABLE_ANALYTICS=true
```

---

## 🔒 セキュリティ設定

### Content Security Policy

`index.html` に追加：
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline'; 
               img-src 'self' data: https:;">
```

### robots.txt

`public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml
```

---

## 📊 パフォーマンス最適化

### 1. コード分割
✅ 既に実装済み（vite.config.ts）

### 2. 画像最適化
```bash
# WebP変換
npm install -D vite-plugin-imagemin
```

### 3. Lighthouse スコア目標
- Performance: 90+
- Accessibility: 90+
- Best Practices: 90+
- SEO: 90+
- PWA: 100

---

## 🧪 テスト

### PWAテスト
1. Chrome DevTools → Application → Service Workers
2. Lighthouse → PWA監査
3. オフラインモードテスト

### デプロイ前チェックリスト
- [ ] `npm run build` が成功
- [ ] すべてのアイコンが配置済み
- [ ] manifest.json が正しい
- [ ] Service Worker が動作
- [ ] オフラインで動作確認
- [ ] レスポンシブデザイン確認
- [ ] Lighthouseスコア確認

---

## 📱 インストール方法（ユーザー向け）

### iOS (Safari)
1. Safariでサイトを開く
2. 共有ボタンをタップ
3. 「ホーム画面に追加」を選択

### Android (Chrome)
1. Chromeでサイトを開く
2. メニュー → 「ホーム画面に追加」
3. または自動的にインストールプロンプト表示

### Desktop (Chrome/Edge)
1. アドレスバーのインストールアイコンをクリック
2. または設定 → 「インストール」

---

## 🔧 トラブルシューティング

### Service Workerが更新されない
```javascript
// ハードリフレッシュ
Ctrl + Shift + R (Windows)
Cmd + Shift + R (Mac)

// または
navigator.serviceWorker.getRegistrations()
  .then(registrations => {
    registrations.forEach(r => r.unregister());
  });
```

### キャッシュクリア
```javascript
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});
```

---

## 📞 サポート

問題が発生した場合：
1. ブラウザのコンソールを確認
2. Network タブでリクエストを確認
3. Application タブで Service Worker を確認

---

**デプロイ準備完了！** 🎉

このガイドに従って、最強のWebアプリをデプロイしてください。
