(() => {
  const urlInput = document.getElementById('url-input');
  const startBtn = document.getElementById('start-btn');
  const inputBar = document.getElementById('input-bar');
  const progressSection = document.getElementById('progress-section');
  const stepsContainer = document.getElementById('steps');
  const logSection = document.getElementById('log-section');
  const terminalBody = document.getElementById('terminal-body');
  const downloadSection = document.getElementById('download-section');
  const downloadBtn = document.getElementById('download-btn');
  const codeViewer = document.getElementById('code-viewer');
  const codeTabs = document.getElementById('code-tabs');
  const codeContent = document.getElementById('code-content');
  const codeCopyBtn = document.getElementById('code-copy-btn');
  const previewSection = document.getElementById('preview-section');
  const previewIframe = document.getElementById('preview-iframe');

  const API_ENDPOINT = '/api/copy';

  const STEPS = [
    { id: 'html',  label: 'HTMLを解析中…',              done: 'HTML解析完了' },
    { id: 'css',   label: 'CSSを解析中…',              done: 'CSS解析完了' },
    { id: 'js',    label: 'JSを解析中…',               done: 'JS解析完了' },
    { id: 'ai',    label: 'AIが学習コンテンツを生成中…', done: 'AI学習コンテンツ生成完了' },
    { id: 'done',  label: '学習レポート完成！',         done: '学習レポート完成！' },
  ];

  // Staggered fade-in on load
  function initAnimations() {
    const items = document.querySelectorAll('.anim-item');
    items.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('anim-visible');
      }, i * 120);
    });
  }
  initAnimations();

  function timestamp() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, '0'))
      .join(':');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function addLog(type, text) {
    const line = document.createElement('div');
    line.className = 'log-line';
    const cls = { warn: 'log-warn', success: 'log-success', error: 'log-error' }[type] || 'log-info';
    const tag = { warn: 'WARN', success: 'DONE', error: 'ERR ' }[type] || 'INFO';
    line.innerHTML =
      `<span class="timestamp">${timestamp()}</span> ` +
      `<span class="${cls}">${tag}</span> ` +
      `<span class="log-text">${escapeHtml(text)}</span>`;
    terminalBody.appendChild(line);
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  function buildSteps() {
    stepsContainer.innerHTML = '';
    STEPS.forEach(s => {
      const el = document.createElement('div');
      el.className = 'step';
      el.id = `step-${s.id}`;
      el.innerHTML =
        `<span class="step-icon"></span>` +
        `<span class="step-label">${s.label}</span>`;
      stepsContainer.appendChild(el);
    });
  }

  function activateStep(i) {
    const el = document.getElementById(`step-${STEPS[i].id}`);
    el.classList.add('visible', 'active');
    el.querySelector('.step-icon').innerHTML = '<span class="spinner"></span>';
  }

  function completeStep(i) {
    const el = document.getElementById(`step-${STEPS[i].id}`);
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.step-icon').innerHTML = '<span class="step-check">&check;</span>';
    el.querySelector('.step-label').textContent = STEPS[i].done;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function showSection(el) {
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // Code viewer state
  let codeFiles = {};
  let activeTab = null;
  let currentDownloadUrl = null;

  function buildCodeTabs(files) {
    codeFiles = files;
    codeTabs.innerHTML = '';
    const keys = Object.keys(files);
    keys.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'code-tab';
      btn.textContent = name;
      btn.type = 'button';
      btn.addEventListener('click', () => switchTab(name));
      codeTabs.appendChild(btn);
    });
    if (keys.length > 0) switchTab(keys[0]);
  }

  function switchTab(name) {
    activeTab = name;
    codeContent.textContent = codeFiles[name] || '';
    codeTabs.querySelectorAll('.code-tab').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === name);
    });
  }

  function resetBtn() {
    startBtn.disabled = false;
    startBtn.querySelector('.btn-label').textContent = '解析スタート';
    startBtn.querySelector('.btn-arrow').style.display = '';
  }

  async function runCopy(url) {
    startBtn.disabled = true;
    startBtn.querySelector('.btn-label').textContent = '解析中…';
    startBtn.querySelector('.btn-arrow').style.display = 'none';
    terminalBody.innerHTML = '';
    buildSteps();
    currentDownloadUrl = null;
    codeFiles = {};

    [progressSection, logSection, codeViewer, previewSection, downloadSection].forEach(el => {
      el.classList.add('hidden');
      el.classList.remove('show');
    });

    await sleep(200);
    showSection(progressSection);
    await sleep(150);
    showSection(logSection);

    STEPS.forEach((_, i) => {
      const el = document.getElementById(`step-${STEPS[i].id}`);
      el.classList.add('visible');
    });
    activateStep(0);
    addLog('info', 'サイトを解析中...');

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!data.success) {
        addLog('error', `エラー: ${data.error || '不明なエラー'}`);
        resetBtn();
        return;
      }

      // Animate logs and steps
      const logsPerStep = Math.ceil(data.logs.length / STEPS.length);
      for (let i = 0; i < data.logs.length; i++) {
        const stepIndex = Math.min(Math.floor(i / logsPerStep), STEPS.length - 1);
        if (i === stepIndex * logsPerStep && stepIndex > 0) {
          completeStep(stepIndex - 1);
          activateStep(stepIndex);
        }
        const logText = data.logs[i];
        const type = logText.startsWith('WARN') || logText.includes('スキップ') ? 'warn'
          : logText.startsWith('ERROR') ? 'error'
          : logText.includes('完了') || logText.includes('ZIP') ? 'success'
          : 'info';
        await sleep(60 + Math.random() * 80);
        addLog(type, logText);
      }

      for (let i = 0; i < STEPS.length; i++) {
        completeStep(i);
      }

      await sleep(300);

      // Show code viewer with file tabs
      if (data.files && Object.keys(data.files).length > 0) {
        buildCodeTabs(data.files);
        showSection(codeViewer);
      }

      await sleep(200);

      // Show live preview
      if (data.sessionId) {
        previewIframe.src = `/preview/${data.sessionId}/index.html`;
        showSection(previewSection);
      }

      await sleep(200);

      if (data.downloadUrl) {
        currentDownloadUrl = data.downloadUrl;
        showSection(downloadSection);
      }

      // Show "Open Editor" button
      if (data.sessionId || data.downloadUrl) {
        const sid = data.sessionId || data.downloadUrl.split('/').pop();
        showEditorButton(sid, url);
      }

    } catch (e) {
      addLog('error', `通信エラー: ${e.message}`);
    }

    resetBtn();
  }

  startBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      urlInput.focus();
      inputBar.classList.add('shake');
      setTimeout(() => inputBar.classList.remove('shake'), 400);
      return;
    }
    runCopy(url);
  });

  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') startBtn.click();
  });

  downloadBtn.addEventListener('click', () => {
    if (currentDownloadUrl) {
      window.location.href = currentDownloadUrl;
    }
  });

  function showEditorButton(sessionId, url) {
    let editorSection = document.getElementById('editor-section');
    if (!editorSection) {
      editorSection = document.createElement('section');
      editorSection.id = 'editor-section';
      editorSection.className = 'download-section';
      editorSection.style.marginBottom = '16px';
      downloadSection.parentNode.insertBefore(editorSection, downloadSection);
    }
    editorSection.innerHTML = `
      <a href="/editor.html?id=${sessionId}&url=${encodeURIComponent(url)}" class="download-btn" style="text-decoration:none;background:transparent;color:var(--white);border:1px solid rgba(255,255,255,0.15)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        エディタで開く
      </a>`;
    editorSection.classList.remove('hidden');
    void editorSection.offsetWidth;
    editorSection.classList.add('show');
  }

  // Device preview toggle
  document.querySelectorAll('.preview-device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preview-device-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      previewIframe.style.maxWidth = btn.dataset.width;
    });
  });

  codeCopyBtn.addEventListener('click', () => {
    if (!activeTab) return;
    navigator.clipboard.writeText(codeFiles[activeTab] || '').then(() => {
      const span = codeCopyBtn.querySelector('span');
      span.textContent = 'コピー済み';
      setTimeout(() => { span.textContent = 'コピー'; }, 2000);
    });
  });
})();
