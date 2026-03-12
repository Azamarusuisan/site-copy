# AIコード道場 🥋

自社サイトのURLを入力すると、AIがサイトを分析し、コーディング学習コンテンツを生成するツール。

---

## 概要

URLを入力すると、Claude AIが以下を自動実行してサイトを解析・学習コンテンツを生成する：

1. HTMLを解析（DOM構造・セマンティクス）
2. CSS（外部・インライン）を解析・デザインパターンを抽出
3. 画像・SVGの使い方を分析
4. フォント（Google Fonts / カスタム）の活用法を解説
5. JSのインタラクション・設計パターンを解析
6. AIが学習レポートを生成

---

## 現在の状態

- **フロントエンド**: 完成（index.html / style.css / script.js）
- **バックエンド**: 実装済み（server.js）
- **APIエンドポイント**: `/api/copy` に向けてある（POSTでURLを送る想定）

### フロントエンドの動作

- URLを入力して「解析スタート」を押すと解析が開始される
- 解析結果を学習レポートとして閲覧可能

---

## ディレクトリ構成

```
site-copy/
├── server.js        # バックエンド
├── public/
│   ├── index.html   # メインUI
│   ├── style.css    # スタイル
│   ├── script.js    # フロントエンドロジック（API呼び出し含む）
│   ├── editor.html  # エディタ画面
│   ├── editor.css   # エディタ用スタイル
│   └── editor.js    # エディタ用ロジック
├── README.md        # このファイル
└── HANDOFF.md       # 引き継ぎドキュメント
```

---

## 使用技術

- **フロントエンド**: HTML / CSS / Vanilla JS
- **バックエンド**: Node.js (Express)
- **AI**: Claude API（Anthropic）

---

## ローカル起動

```bash
cd ~/projects/site-copy
node server.js
# → http://localhost:8081
```

---

## メモ

- `ANTHROPIC_API_KEY` は `.env` に入れる（コミットしない）
- 学習目的のツール
