# Claude への引き継ぎドキュメント

## プロジェクト概要

**AIコード道場 🥋**
自社サイトのURLを入力すると、AIがサイトを分析し、コーディング学習コンテンツを生成するツール。

---

## 現在の完成状態 ✅

### バックエンド（server.js - 583行）
- **Node.js + Express** で構築済み
- **Anthropic SDK** インストール・設定済み（`.env`にAPIキーあり）
- 以下のAPIエンドポイントが実装済み：
  - `POST /api/copy` — URLを受け取ってサイト解析処理
  - `GET /download/:id` — ZIPダウンロード
  - `GET /api/files/:id` — ファイル一覧取得
  - `POST /api/chat/:id` — チャット形式でコード編集
  - `GET /preview/:id/*path` — プレビュー表示
  - `POST /api/save/:id` — ファイル保存
  - `POST /api/analyze/:id` — サイト解析

### フロントエンド（public/）
- `index.html` — メインUI（AIコード道場、ダークテーマ）
- `style.css` — スタイル
- `script.js` — フロントロジック
- `editor.html` — エディタ画面
- `editor.css` / `editor.js` — エディタ用スタイル・ロジック

### 動作実績
- `output/` に7件の解析済みサイト（ZIP含む）あり → 実際に動作確認済み

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
└── output/            # 解析済みサイト（実行時に生成）
    ├── {id}/
    └── {id}.zip
```

---

## 次にやること（優先順）

1. **学習コンテンツの充実** — AI解説の精度向上
2. **エラーハンドリング強化** — 失敗時のメッセージ改善
3. **進捗のリアルタイム表示** — SSEかWebSocketで実装
4. **モバイル対応** — レスポンシブ確認

---

*作成: 2026-03-12*
