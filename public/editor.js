(() => {
  const params = new URLSearchParams(location.search);
  const sessionId = params.get('id');
  const siteUrl = params.get('url') || '';

  if (!sessionId) {
    location.href = '/';
    return;
  }

  const siteName = document.getElementById('site-name');
  const fileList = document.getElementById('file-list');
  const editorTabBar = document.getElementById('editor-tab-bar');
  const editorTextarea = document.getElementById('editor-textarea');
  const previewIframe = document.getElementById('preview-iframe');
  const saveBtn = document.getElementById('save-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const analysisOverlay = document.getElementById('analysis-overlay');
  const analysisPanel = document.getElementById('analysis-panel');
  const analysisClose = document.getElementById('analysis-close');
  const analysisBody = document.getElementById('analysis-body');
  const analysisLoading = document.getElementById('analysis-loading');
  const analysisContent = document.getElementById('analysis-content');
  const deviceSelect = document.getElementById('device-select');
  const resizeHandle = document.getElementById('resize-handle');
  const editorPane = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const editorLayout = document.querySelector('.editor-layout');
  const mobileToggle = document.getElementById('mobile-toggle');

  // State
  let files = {};
  let activeFile = null;
  let dirty = {};
  let chatHistory = [];

  siteName.textContent = siteUrl ? new URL(siteUrl).hostname : sessionId;

  // Load files from API
  async function loadFiles() {
    try {
      const res = await fetch(`/api/files/${sessionId}`);
      const data = await res.json();
      if (data.files) {
        files = data.files;
        renderFileList();
        const first = Object.keys(files)[0];
        if (first) openFile(first);
        refreshPreview();
      }
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  }

  function renderFileList() {
    fileList.innerHTML = '';
    for (const name of Object.keys(files)) {
      const btn = document.createElement('button');
      btn.className = 'file-item';
      btn.textContent = name;
      btn.type = 'button';
      btn.addEventListener('click', () => openFile(name));
      fileList.appendChild(btn);
    }
  }

  function openFile(name) {
    if (activeFile && editorTextarea.value !== files[activeFile]) {
      files[activeFile] = editorTextarea.value;
      dirty[activeFile] = true;
    }

    activeFile = name;
    editorTextarea.value = files[name] || '';

    fileList.querySelectorAll('.file-item').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === name);
    });

    editorTabBar.innerHTML = '';
    const tab = document.createElement('button');
    tab.className = 'editor-tab active';
    tab.textContent = name;
    tab.type = 'button';
    editorTabBar.appendChild(tab);
  }

  // Save file
  async function saveFile() {
    if (!activeFile) return;
    files[activeFile] = editorTextarea.value;

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
      await fetch(`/api/save/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: activeFile, content: files[activeFile] }),
      });
      dirty[activeFile] = false;
      refreshPreview();
    } catch (e) {
      console.error('Save failed:', e);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }

  function refreshPreview() {
    previewIframe.src = `/preview/${sessionId}/index.html?t=${Date.now()}`;
  }

  // Auto-save & preview on typing (debounced)
  let saveTimer = null;
  editorTextarea.addEventListener('input', () => {
    if (activeFile) {
      files[activeFile] = editorTextarea.value;
      dirty[activeFile] = true;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (activeFile && dirty[activeFile]) {
        await fetch(`/api/save/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: activeFile, content: files[activeFile] }),
        });
        dirty[activeFile] = false;
        refreshPreview();
      }
    }, 800);
  });

  // Tab key support
  editorTextarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editorTextarea.selectionStart;
      const end = editorTextarea.selectionEnd;
      editorTextarea.value = editorTextarea.value.substring(0, start) + '  ' + editorTextarea.value.substring(end);
      editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 2;
      editorTextarea.dispatchEvent(new Event('input'));
    }
    // Cmd/Ctrl+S
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
  });

  saveBtn.addEventListener('click', saveFile);

  // Device select
  deviceSelect.addEventListener('change', () => {
    previewIframe.style.maxWidth = deviceSelect.value;
  });

  // Resize handle
  let isResizing = false;
  resizeHandle.addEventListener('mousedown', e => {
    isResizing = true;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const layoutRect = editorLayout.getBoundingClientRect();
    const sidebarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'));
    const x = e.clientX - layoutRect.left - sidebarW;
    const total = layoutRect.width - sidebarW;
    const pct = Math.max(20, Math.min(80, (x / total) * 100));
    editorPane.style.flex = `0 0 ${pct}%`;
    previewPane.style.flex = `0 0 ${100 - pct}%`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // Mobile toggle
  mobileToggle.addEventListener('click', e => {
    const btn = e.target.closest('.mobile-toggle-btn');
    if (!btn) return;
    const view = btn.dataset.view;
    editorLayout.dataset.view = view;
    mobileToggle.querySelectorAll('.mobile-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
  });
  editorLayout.dataset.view = 'code';

  // AI Analysis
  function renderMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  async function runAnalysis() {
    analysisOverlay.classList.remove('hidden');
    analysisLoading.classList.remove('hidden');
    analysisContent.innerHTML = '';
    analyzeBtn.disabled = true;
    chatHistory = [];

    try {
      const res = await fetch(`/api/analyze/${sessionId}`, { method: 'POST' });
      const data = await res.json();
      if (data.analysis) {
        analysisContent.innerHTML = renderMarkdown(data.analysis);
        chatHistory.push({ role: 'assistant', content: data.analysis });
      } else {
        analysisContent.textContent = 'エラー: ' + (data.error || '分析に失敗しました');
      }
    } catch (e) {
      analysisContent.textContent = '通信エラー: ' + e.message;
    }

    analysisLoading.classList.add('hidden');
    analyzeBtn.disabled = false;
    ensureChatInput();
  }

  function ensureChatInput() {
    if (document.getElementById('analysis-chat')) return;
    const chatDiv = document.createElement('div');
    chatDiv.className = 'analysis-chat';
    chatDiv.id = 'analysis-chat';
    chatDiv.innerHTML = `
      <input class="analysis-chat-input" id="chat-input" placeholder="この部分ってどんな技術？" />
      <button class="analysis-chat-send" id="chat-send" type="button">送信</button>
    `;
    analysisPanel.appendChild(chatDiv);

    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    chatSend.addEventListener('click', () => sendChat(chatInput));
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendChat(chatInput);
    });
  }

  async function sendChat(input) {
    const question = input.value.trim();
    if (!question) return;
    input.value = '';

    const userMsg = document.createElement('p');
    userMsg.innerHTML = `<strong style="color:#fff">Q: ${escapeHtml(question)}</strong>`;
    analysisContent.appendChild(userMsg);
    analysisBody.scrollTop = analysisBody.scrollHeight;

    const loadingEl = document.createElement('p');
    loadingEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span> 回答中...';
    analysisContent.appendChild(loadingEl);

    chatHistory.push({ role: 'user', content: question });

    try {
      const res = await fetch(`/api/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: chatHistory }),
      });
      const data = await res.json();
      loadingEl.remove();

      if (data.answer) {
        const answerEl = document.createElement('p');
        answerEl.innerHTML = renderMarkdown(data.answer);
        analysisContent.appendChild(answerEl);
        chatHistory.push({ role: 'assistant', content: data.answer });
      }
    } catch (e) {
      loadingEl.innerHTML = 'エラー: ' + e.message;
    }

    analysisBody.scrollTop = analysisBody.scrollHeight;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  analyzeBtn.addEventListener('click', runAnalysis);
  analysisClose.addEventListener('click', () => {
    analysisOverlay.classList.add('hidden');
  });
  analysisOverlay.addEventListener('click', e => {
    if (e.target === analysisOverlay) {
      analysisOverlay.classList.add('hidden');
    }
  });

  // Init
  loadFiles();
})();
