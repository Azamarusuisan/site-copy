# サイト丸パクリくん

URLを入れるだけで、サイトを丸ごとコピーするWebアプリ。

---

## 概要

URLを入力すると、Claude AIが以下を自動実行してサイトを完全コピーする：

1. HTMLを取得
2. CSS（外部・インライン）を解析・取得
3. 画像・SVGを取得
4. フォント（Google Fonts / カスタム）を取得
5. JSを取得
6. すべてのパスをローカルに書き換え
7. GTM・アナリティクス等の不要スクリプトを除去
8. ZIPで出力

---

## 現在の状態

- **フロントエンド**: 完成（index.html / style.css / script.js）
- **バックエンド**: 未実装（APIキー待ち）
- **APIエンドポイント**: `/api/copy` に向けてある（POSTでURLを送る想定）

### フロントエンドの動作

- URLを入力して「コピー開始」を押すとデモアニメーションが流れる
- 実際の処理はバックエンド実装後に繋ぐ

---

## ディレクトリ構成

```
site-copy/
├── index.html       # メインUI
├── style.css        # スタイル
├── script.js        # フロントエンドロジック（API呼び出し含む）
├── reference/       # （実行時）取得した元サイトのHTML等を保存
└── README.md        # このファイル
```

---

## バックエンド実装指示（Claude への引き継ぎ）

### やること

Node.js（Express）か Python（FastAPI）でAPIサーバーを作る。

### エンドポイント

```
POST /api/copy
Body: { "url": "https://example.com" }
```

### 処理フロー

```bash
# 1. HTMLを取得
curl -sL "{url}" -o reference/original.html

# 2. CSSを取得
grep -E "stylesheet|\.css" reference/original.html
# → 見つかったURL全部をダウンロード

# 3. 画像を取得
grep -oE '"https?://[^"]+\.(png|jpg|jpeg|svg|webp|gif)"' reference/original.html \
  | tr -d '"' | sort -u
# → 各URLをダウンロード

# 4. CSS内の画像も取得
grep -oE 'url\([^)]+\)' style.css | grep -v "data:"

# 5. フォントを取得（Google Fonts）
curl -sL "{google_fonts_url}" -H "User-Agent: Mozilla/5.0" -o fonts.css
grep -oE 'https://fonts.gstatic.com[^)]+' fonts.css

# 6. JSを取得
grep -oE 'src="https?://[^"]+\.js"' original.html

# 7. パスを書き換え
sed -i '' 's|https://example.com/_astro/|/assets/|g' original.html

# 8. 不要スクリプトを削除
sed -i '' '/googletagmanager/d' original.html
sed -i '' '/google-analytics/d' original.html
```

### レスポンス形式

```json
{
  "success": true,
  "logs": ["HTMLを取得しました", "CSSを3件取得しました", ...],
  "downloadUrl": "/download/output.zip"
}
```

### フロントエンドとの繋ぎ方

`script.js` の `callAPI(url)` 関数を実装済み。
バックエンド起動後、`/api/copy` にPOSTするだけで動く。

---

## 使用技術

- **フロントエンド**: HTML / CSS / Vanilla JS
- **バックエンド（予定）**: Node.js (Express) または Python (FastAPI)
- **AI**: Claude API（Anthropic）
- **その他**: curl, sed, grep（シェルスクリプト）

---

## ローカル起動

```bash
# フロントエンドのみ
cd ~/projects/site-copy
python3 -m http.server 8081
# → http://localhost:8081

# バックエンド（実装後）
node server.js
# または
uvicorn main:app --reload
```

---

## TODO

- [ ] バックエンドAPI実装（Claude APIキーを受け取ったら）
- [ ] ZIPダウンロード機能
- [ ] エラーハンドリング
- [ ] レート制限（1リクエスト/秒）
- [ ] UIのデザイン改善（参考サイト未定）
- [ ] プログレスのリアルタイム更新（SSEまたはWebSocket）

---

## メモ

- `ANTHROPIC_API_KEY` は `.env` に入れる（コミットしない）
- Claudeへのプロンプトは `prompts/copy_prompt.txt` に切り出す予定
- 著作権に注意：個人利用・学習目的のみ
