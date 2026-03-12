const express = require('express');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const archiver = require('archiver');
const cheerio = require('cheerio');
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 8081;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '5mb' }));

// dotfilesへのアクセスをブロック
app.use((req, res, next) => {
  if (req.path.split('/').some(part => part.startsWith('.'))) {
    return res.status(403).end();
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
function ensureDirs(outputDir) {
  for (const sub of ['css', 'js', 'img', 'fonts']) {
    fs.mkdirSync(path.join(outputDir, sub), { recursive: true });
  }
}

// Fetch a URL and return buffer
async function fetchUrl(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...headers,
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// Resolve relative URLs
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

// Extract filename from URL
function urlToFilename(urlStr) {
  try {
    const u = new URL(urlStr);
    let name = path.basename(u.pathname);
    if (!name || name === '/') name = 'index';
    // Remove query strings from filename
    name = name.split('?')[0];
    return name;
  } catch {
    return 'unknown';
  }
}

// POST /api/copy
app.post('/api/copy', async (req, res) => {
  const { url: targetUrl } = req.body;
  if (!targetUrl) {
    return res.status(400).json({ success: false, error: 'URLが必要です' });
  }

  const logs = [];
  const log = (msg) => logs.push(msg);

  const sessionId = Date.now().toString(36);
  const outputDir = path.join(__dirname, 'output', sessionId);
  ensureDirs(outputDir);

  try {
    // 1. Fetch HTML
    log('ターゲットURLに接続中...');
    const htmlRes = await fetchUrl(targetUrl);
    const html = await htmlRes.text();
    log(`HTTP ${htmlRes.status} - ページ取得成功`);

    const $ = cheerio.load(html);
    const nodeCount = $('*').length;
    log(`DOM解析中... ${nodeCount}ノード検出`);

    // Track all downloaded assets for path rewriting
    const assetMap = new Map(); // original URL -> local path

    // 2. CSS (Google Fontsは別で処理するので除外)
    const cssLinks = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('fonts.googleapis.com')) {
        cssLinks.push(resolveUrl(targetUrl, href));
      }
    });
    // Inline <style> with @import
    $('style').each((_, el) => {
      const text = $(el).html() || '';
      const imports = text.match(/@import\s+url\(['"]?([^'")]+)['"]?\)/g) || [];
      imports.forEach(imp => {
        const m = imp.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (m) cssLinks.push(resolveUrl(targetUrl, m[1]));
      });
    });

    log(`スタイルシートを検出: ${cssLinks.filter(Boolean).length}件`);

    for (const cssUrl of cssLinks) {
      if (!cssUrl) continue;
      try {
        const cssRes = await fetchUrl(cssUrl);
        let cssText = await cssRes.text();
        const cssFilename = urlToFilename(cssUrl);
        const localPath = `css/${cssFilename}`;

        // Extract URLs from CSS (images, fonts)
        const cssUrls = cssText.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];
        for (const match of cssUrls) {
          const m = match.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (!m || m[1].startsWith('data:')) continue;
          const assetUrl = resolveUrl(cssUrl, m[1]);
          if (!assetUrl) continue;

          try {
            const assetRes = await fetchUrl(assetUrl);
            const assetBuf = Buffer.from(await assetRes.arrayBuffer());
            const assetFilename = urlToFilename(assetUrl);
            const ext = path.extname(assetFilename).toLowerCase();
            const isFont = ['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext);
            const subDir = isFont ? 'fonts' : 'img';
            fs.writeFileSync(path.join(outputDir, subDir, assetFilename), assetBuf);
            assetMap.set(assetUrl, `../${subDir}/${assetFilename}`);
            // Rewrite URL in CSS
            cssText = cssText.replaceAll(m[1], `../${subDir}/${assetFilename}`);
            log(`${assetFilename} を保存 (${(assetBuf.length / 1024).toFixed(1)} KB)`);
          } catch (e) {
            log(`WARN: ${assetUrl} - スキップ (${e.message})`);
          }
        }

        fs.writeFileSync(path.join(outputDir, localPath), cssText);
        assetMap.set(cssUrl, localPath);
        log(`${cssFilename} を保存`);
      } catch (e) {
        log(`WARN: ${cssUrl} - スキップ (${e.message})`);
      }
    }

    // 3. Google Fonts
    const googleFontsLinks = [];
    $('link[href*="fonts.googleapis.com"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) googleFontsLinks.push(href);
    });
    for (const gfUrl of googleFontsLinks) {
      try {
        const gfRes = await fetchUrl(gfUrl, {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        });
        let gfCss = await gfRes.text();

        // Download font files
        const fontUrls = gfCss.match(/https:\/\/fonts\.gstatic\.com[^\s)'"]+/g) || [];
        for (const fontUrl of fontUrls) {
          try {
            const fontRes = await fetchUrl(fontUrl);
            const fontBuf = Buffer.from(await fontRes.arrayBuffer());
            const fontFilename = urlToFilename(fontUrl);
            fs.writeFileSync(path.join(outputDir, 'fonts', fontFilename), fontBuf);
            gfCss = gfCss.replaceAll(fontUrl, `../fonts/${fontFilename}`);
            log(`${fontFilename} を保存 (${(fontBuf.length / 1024).toFixed(1)} KB)`);
          } catch (e) {
            log(`WARN: font ${fontUrl} - スキップ`);
          }
        }

        fs.writeFileSync(path.join(outputDir, 'css', 'google-fonts.css'), gfCss);
        assetMap.set(gfUrl, 'css/google-fonts.css');
        log('Google Fontsを保存');
      } catch (e) {
        log(`WARN: Google Fonts - スキップ (${e.message})`);
      }
    }

    // 4. Images
    const imgUrls = new Set();
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src) imgUrls.add(resolveUrl(targetUrl, src));
    });
    $('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const matches = style.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];
      matches.forEach(m => {
        const mm = m.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (mm && !mm[1].startsWith('data:')) imgUrls.add(resolveUrl(targetUrl, mm[1]));
      });
    });
    // srcset
    $('[srcset]').each((_, el) => {
      const srcset = $(el).attr('srcset') || '';
      srcset.split(',').forEach(s => {
        const url = s.trim().split(/\s+/)[0];
        if (url) imgUrls.add(resolveUrl(targetUrl, url));
      });
    });
    // og:image, favicon etc.
    $('link[rel*="icon"][href], meta[property="og:image"][content]').each((_, el) => {
      const url = $(el).attr('href') || $(el).attr('content');
      if (url) imgUrls.add(resolveUrl(targetUrl, url));
    });

    log(`画像アセットを検出: ${imgUrls.size}件`);

    for (const imgUrl of imgUrls) {
      if (!imgUrl) continue;
      try {
        const imgRes = await fetchUrl(imgUrl);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const imgFilename = urlToFilename(imgUrl);
        fs.writeFileSync(path.join(outputDir, 'img', imgFilename), imgBuf);
        assetMap.set(imgUrl, `img/${imgFilename}`);
        log(`${imgFilename} を保存 (${(imgBuf.length / 1024).toFixed(1)} KB)`);
      } catch (e) {
        log(`WARN: ${imgUrl} - スキップ (${e.message})`);
      }
    }

    // 5. JavaScript
    const jsUrls = [];
    $('script[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        // Skip analytics/tracking
        if (/googletagmanager|google-analytics|gtag|fbevents|hotjar/i.test(src)) {
          log(`スキップ (トラッキング): ${src}`);
          $(el).remove();
          return;
        }
        jsUrls.push(resolveUrl(targetUrl, src));
      }
    });

    log(`JavaScriptを検出: ${jsUrls.length}件`);

    for (const jsUrl of jsUrls) {
      if (!jsUrl) continue;
      try {
        const jsRes = await fetchUrl(jsUrl);
        const jsText = await jsRes.text();
        const jsFilename = urlToFilename(jsUrl);
        fs.writeFileSync(path.join(outputDir, 'js', jsFilename), jsText);
        assetMap.set(jsUrl, `js/${jsFilename}`);
        log(`${jsFilename} を保存 (${(jsText.length / 1024).toFixed(1)} KB)`);
      } catch (e) {
        log(`WARN: ${jsUrl} - スキップ (${e.message})`);
      }
    }

    // Remove CSP meta tags (prevents preview from loading)
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    // Remove tracking inline scripts
    $('script:not([src])').each((_, el) => {
      const text = $(el).html() || '';
      if (/googletagmanager|google-analytics|gtag|fbevents|hotjar/i.test(text)) {
        $(el).remove();
        log('インラインのトラッキングスクリプトを除去');
      }
    });

    // 6. Rewrite paths in HTML
    log('パスを書き換え中...');

    // Rewrite all known asset URLs in HTML
    let outputHtml = $.html();
    for (const [originalUrl, localPath] of assetMap) {
      outputHtml = outputHtml.replaceAll(originalUrl, localPath);
      // Also try without protocol
      try {
        const u = new URL(originalUrl);
        const noProto = originalUrl.replace(u.protocol + '//', '');
        outputHtml = outputHtml.replaceAll('//' + noProto, localPath);
      } catch {}
    }

    // Also rewrite relative paths that were in the original HTML
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('http')) {
        const fullUrl = resolveUrl(targetUrl, href);
        if (fullUrl && assetMap.has(fullUrl)) {
          outputHtml = outputHtml.replaceAll(href, assetMap.get(fullUrl));
        }
      }
    });

    const rewriteCount = assetMap.size;
    log(`パス書き換え完了: ${rewriteCount}箇所`);

    // Save HTML
    fs.writeFileSync(path.join(outputDir, 'index.html'), outputHtml);
    log('index.html を保存');

    // 7. Create ZIP
    const zipPath = path.join(__dirname, 'output', `${sessionId}.zip`);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(outputDir, 'site-copy');
      archive.finalize();
    });

    const zipSize = fs.statSync(zipPath).size;
    log(`ZIPパッケージング完了 - site-copy.zip (${(zipSize / 1024 / 1024).toFixed(1)} MB)`);

    // Collect text files for code viewer (truncate large files)
    const MAX_FILE_SIZE = 200 * 1024; // 200KB
    const files = {};
    files['index.html'] = outputHtml.length > MAX_FILE_SIZE
      ? outputHtml.slice(0, MAX_FILE_SIZE) + '\n\n/* ... truncated ... */'
      : outputHtml;

    // CSS files
    const cssDir = path.join(outputDir, 'css');
    if (fs.existsSync(cssDir)) {
      for (const f of fs.readdirSync(cssDir)) {
        const content = fs.readFileSync(path.join(cssDir, f), 'utf-8');
        files[`css/${f}`] = content.length > MAX_FILE_SIZE
          ? content.slice(0, MAX_FILE_SIZE) + '\n\n/* ... truncated ... */'
          : content;
      }
    }

    // JS files
    const jsDir = path.join(outputDir, 'js');
    if (fs.existsSync(jsDir)) {
      for (const f of fs.readdirSync(jsDir)) {
        const content = fs.readFileSync(path.join(jsDir, f), 'utf-8');
        files[`js/${f}`] = content.length > MAX_FILE_SIZE
          ? content.slice(0, MAX_FILE_SIZE) + '\n\n/* ... truncated ... */'
          : content;
      }
    }

    res.json({
      success: true,
      logs,
      files,
      sessionId,
      downloadUrl: `/download/${sessionId}`,
    });
  } catch (e) {
    log(`ERROR: ${e.message}`);
    res.status(500).json({ success: false, logs, error: e.message });
  }
});

// Download ZIP
app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  // パストラバーサル対策
  if (!/^[a-z0-9]+$/.test(id)) {
    return res.status(400).json({ error: '無効なIDです' });
  }
  const zipPath = path.join(__dirname, 'output', `${id}.zip`);
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'ファイルが見つかりません' });
  }
  res.download(zipPath, 'site-copy.zip');
});

// Get files for editor
app.get('/api/files/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9]+$/.test(id)) return res.status(400).json({ error: '無効なID' });
  const outputDir = path.join(__dirname, 'output', id);
  if (!fs.existsSync(outputDir)) return res.status(404).json({ error: '見つかりません' });

  const MAX = 200 * 1024;
  const files = {};

  // HTML
  const htmlPath = path.join(outputDir, 'index.html');
  if (fs.existsSync(htmlPath)) {
    const c = fs.readFileSync(htmlPath, 'utf-8');
    files['index.html'] = c.length > MAX ? c.slice(0, MAX) + '\n<!-- truncated -->' : c;
  }

  // CSS
  const cssDir = path.join(outputDir, 'css');
  if (fs.existsSync(cssDir)) {
    for (const f of fs.readdirSync(cssDir)) {
      const c = fs.readFileSync(path.join(cssDir, f), 'utf-8');
      files[`css/${f}`] = c.length > MAX ? c.slice(0, MAX) + '\n/* truncated */' : c;
    }
  }

  // JS
  const jsDir = path.join(outputDir, 'js');
  if (fs.existsSync(jsDir)) {
    for (const f of fs.readdirSync(jsDir)) {
      const c = fs.readFileSync(path.join(jsDir, f), 'utf-8');
      files[`js/${f}`] = c.length > MAX ? c.slice(0, MAX) + '\n/* truncated */' : c;
    }
  }

  res.json({ files });
});

// Chat: ask follow-up questions about the site
app.post('/api/chat/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9]+$/.test(id)) return res.status(400).json({ error: '無効なID' });

  const { question, history = [] } = req.body;
  if (!question) return res.status(400).json({ error: '質問が必要です' });

  const htmlPath = path.join(__dirname, 'output', id, 'index.html');
  let htmlSnippet = '';
  if (fs.existsSync(htmlPath)) {
    htmlSnippet = fs.readFileSync(htmlPath, 'utf-8').slice(0, 4000);
  }

  const cssDir = path.join(__dirname, 'output', id, 'css');
  let cssSnippet = '';
  if (fs.existsSync(cssDir)) {
    for (const f of fs.readdirSync(cssDir).slice(0, 2)) {
      cssSnippet += fs.readFileSync(path.join(cssDir, f), 'utf-8').slice(0, 1500);
    }
  }

  const messages = [
    {
      role: 'user',
      content: `あなたはWebエンジニアリング教育の先生です。ユーザーが自社サイトの構造について質問しています。
以下のHTML/CSSを参考に、初心者にもわかりやすく日本語で簡潔に答えてください（3-5行程度）。

HTML（一部）:
\`\`\`
${htmlSnippet}
\`\`\`

CSS（一部）:
\`\`\`
${cssSnippet}
\`\`\``,
    },
    // Include prior conversation
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages,
    });
    res.json({ success: true, answer: message.content[0].text });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Preview: serve copied site files
app.get('/preview/:id/*path', (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9]+$/.test(id)) return res.status(400).end();
  const rawPath = req.params.path;
  const filePath = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath || 'index.html');
  const fullPath = path.join(__dirname, 'output', id, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.join(__dirname, 'output', id))) {
    return res.status(403).end();
  }
  if (!fs.existsSync(resolved)) return res.status(404).end();

  // HTMLファイルの場合、CSPメタタグを除去してプレビュー可能にする
  if (resolved.endsWith('.html') || resolved.endsWith('.htm')) {
    let html = fs.readFileSync(resolved, 'utf-8');
    html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
    res.type('html').send(html);
  } else {
    res.sendFile(resolved);
  }
});

// Save edited file
app.post('/api/save/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9]+$/.test(id)) return res.status(400).json({ error: '無効なID' });
  const { filename, content } = req.body;
  if (!filename || typeof content !== 'string') {
    return res.status(400).json({ error: 'filename と content が必要です' });
  }
  // Prevent path traversal
  const safeName = path.normalize(filename).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(__dirname, 'output', id, safeName);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.join(__dirname, 'output', id))) {
    return res.status(403).json({ error: '不正なパスです' });
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content);
  res.json({ success: true });
});

// AI structure analysis
app.post('/api/analyze/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9]+$/.test(id)) return res.status(400).json({ error: '無効なID' });
  const htmlPath = path.join(__dirname, 'output', id, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).json({ error: 'ファイルが見つかりません' });
  }

  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  // Truncate to ~8000 chars to keep costs low
  if (htmlContent.length > 8000) {
    htmlContent = htmlContent.slice(0, 8000) + '\n<!-- ... truncated ... -->';
  }

  // Collect CSS filenames
  const cssDir = path.join(__dirname, 'output', id, 'css');
  let cssSnippet = '';
  if (fs.existsSync(cssDir)) {
    for (const f of fs.readdirSync(cssDir).slice(0, 3)) {
      const c = fs.readFileSync(path.join(cssDir, f), 'utf-8');
      cssSnippet += `\n/* --- ${f} --- */\n` + c.slice(0, 2000);
    }
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `あなたはWebエンジニアリング教育の専門家です。以下のサイトのHTML/CSSを分析して、初心者にもわかるように日本語で解説してください。

以下の項目を簡潔に（各2-3行）：
1. **使用フレームワーク/ライブラリの推定**（React, Next.js, Astro, WordPress等）
2. **レイアウト手法**（Flexbox, Grid, float等）
3. **デザインパターン**（カード型, ヒーロー, ハンバーガーメニュー等）
4. **レスポンシブ対応**（メディアクエリの有無、モバイル対応状況）
5. **学習ポイント**（このサイトから学べる技術的なこと）

HTML:
\`\`\`html
${htmlContent}
\`\`\`

CSS (一部):
\`\`\`css
${cssSnippet}
\`\`\``,
      }],
    });

    const analysis = message.content[0].text;
    res.json({ success: true, analysis });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`SiteScope サーバー起動: http://localhost:${PORT}`);
});
