<div# QB FORECAST AI | Strategic Cockpit

AI駆動のビジネスインテリジェンスプラットフォーム - QB HOUSE 売上予測・分析ダッシュボード

## ✨ 特徴

- **📊 高度な予測分析**: AI/機械学習による売上・顧客数予測
- **📱 PWA対応**: オフライン動作、インストール可能、プッシュ通知対応
- **🎨 プレミアムデザイン**: QB HOUSEブランドカラーを使用した洗練されたUI
- **⚡ 高速パフォーマンス**: Vite + React 19による最適化
- **🔒 セキュリティ**: 環境変数によるAPI Key管理、セキュリティヘッダー設定
- **🌐 レスポンシブ**: デスクトップ・タブレット・モバイル完全対応

## 🚀 PWA機能

このアプリケーションは完全なProgressive Web Appとして動作します：

- **オフライン対応**: ネットワークなしでも基本機能が利用可能
- **インストール可能**: ホーム画面に追加してネイティブアプリのように使用
- **高速キャッシング**: Service Workerによる賢いキャッシュ戦略
- **自動更新**: 新バージョンの自動検出と通知
- **バックグラウンド同期**: オフライン時のデータ同期

## 📦 セットアップ

### 前提条件

- Node.js 18以上
- Gemini API Key（[Google AI Studio](https://makersuite.google.com/app/apikey)から取得）

### インストール

```bash
# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env.local
# .env.localを編集してGEMINI_API_KEYを設定

# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# ビルドプレビュー
npm run preview
```

## 🌐 デプロイ

詳細なデプロイ手順は[DEPLOYMENT.md](./DEPLOYMENT.md)を参照してください。

### クイックデプロイ

#### Vercel（推奨）
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo)

#### Netlify
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/your-repo)

## 📱 インストール方法

### デスクトップ（Chrome/Edge）
1. アドレスバーのインストールアイコンをクリック
2. 「インストール」を選択

### iOS（Safari）
1. 共有ボタン（□↑）をタップ
2. 「ホーム画面に追加」を選択

### Android（Chrome）
1. 自動的にインストールプロンプトが表示
2. または、メニュー → 「アプリをインストール」

## 🛠️ 技術スタック

- **フロントエンド**: React 19, TypeScript
- **ビルドツール**: Vite 6
- **チャート**: Recharts
- **AI**: Google Gemini API
- **スタイリング**: Tailwind CSS
- **PWA**: Custom Service Worker

## 📊 主要機能

- **ダッシュボード**: 全体概要と主要KPI
- **AI分析**: Gemini APIによる高度な分析とインサイト
- **店舗分析**: 個別店舗の詳細分析
- **地域戦略**: エリア別の戦略分析
- **予算管理**: 予算作成と比較
- **シミュレーション**: What-if分析
- **モデル検証**: 予測精度の検証

## 🔒 セキュリティ

- 環境変数によるAPI Key管理
- セキュリティヘッダーの設定
- HTTPS必須（PWA要件）
- XSS/CSRF対策

## 📄 ライセンス

Proprietary - QB HOUSE Internal Use Only

## 🆘 サポート

問題が発生した場合は、[DEPLOYMENT.md](./DEPLOYMENT.md)のトラブルシューティングセクションを参照してください。
