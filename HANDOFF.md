# Claude への引き継ぎドキュメント

## プロジェクト概要

**サイト丸パクリくん（SiteScope）**
URLを入れるだけでサイトを丸ごとコピーするWebアプリ。

---

## 現在の完成状態 ✅

### バックエンド（server.js - 583行）
- **Node.js + Express** で構築済み
- **Anthropic SDK** インストール・設定済み（`.env`にAPIキーあり）
- 以下のAPIエンドポイントが実装済み：
  - `POST /api/copy` — URLを受け取ってサイトコピー処理
  - `GET /download/:id` — ZIPダウンロード
  - `GET /api/files/:id` — ファイル一覧取得
  - `POST /api/chat/:id` — チャット形式でコード編集
  - `GET /preview/:id/*path` — プレビュー表示
  - `POST /api/save/:id` — ファイル保存
  - `POST /api/analyze/:id` — サイト解析

### フロントエンド（public/）
- `index.html` — メインUI（SiteScope、ダーク + 星パーティクル）
- `style.css` — スタイル
- `script.js` — フロントロジック
- `editor.html` — エディタ画面
- `editor.css` / `editor.js` — エディタ用スタイル・ロジック

### 動作実績
- `output/` に7件のコピー済みサイト（ZIP含む）あり → 実際に動作確認済み

### 依存関係（インストール済み）
```json
{
  "@anthropic-ai/sdk": "^0.78.0",
  "archiver": "^7.0.1",
  "cheerio": "^1.2.0",
  "dotenv": "^17.3.1",
  "express": "^5.2.1"
}
```

---

## 起動方法

```bash
cd ~/projects/site-copy
node server.js
# → http://localhost:8081
```

---

## 課題・改善してほしいこと

オーナーから「デザインがダサい」とフィードバックあり。
具体的な参考サイトはまだもらえていないが、以下の方向性で改善希望：

- 現在のUIは「SiteScope」というタイトルでダーク系
- もっとハイエンド・洗練されたデザインにしたい
- 参考: Linear.app / Vercel / Google Gemini のような感じ

**デザイン改善の際の注意点：**
- `public/` 以下のファイルを編集する
- `server.js` は触らなくていい（バックエンドは完成）
- フォントはすでにInter + JetBrains Mono + Noto Sans JPを使用中

---

## ファイル構成

```
site-copy/
├── server.js          # バックエンド（完成）
├── package.json       # 依存関係
├── .env               # APIキー（ANTHROPIC_API_KEY）
├── .gitignore
├── README.md
├── HANDOFF.md         # このファイル
├── public/            # フロントエンド
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── editor.html
│   ├── editor.css
│   └── editor.js
└── output/            # コピー済みサイト（実行時に生成）
    ├── {id}/
    └── {id}.zip
```

---

## 次にやること（優先順）

1. **UIリデザイン** — デザインの参考サイトをオーナーから確認してから着手
2. **エラーハンドリング強化** — 失敗時のメッセージ改善
3. **進捗のリアルタイム表示** — SSEかWebSocketで実装
4. **モバイル対応** — レスポンシブ確認

---

*作成: 2026-03-12*
