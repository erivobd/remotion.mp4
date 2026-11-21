const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'erivobd';
const REPO_NAME = 'remotion.mp4';

const renderProgress = new Map();

// RAM-এর বদলে /tmp ডিস্কে টেম্পোরারি ফাইল রাখা (৫০০ এমবি পর্যন্ত নিরাপদ)
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.use(express.json({ limit: '50mb' }));

// PWA Manifest
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Remotion MP4 Studio',
    short_name: 'Remotion MP4',
    start_url: '/',
    display: 'standalone',
    background_color: '#090e1a',
    theme_color: '#0284c7',
    icons: [
      {
        src: 'https://cdn-icons-png.flaticon.com/512/1179/1179120.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  });
});

app.get('/sw.js', (req, res) => {
  res.type('application/javascript').send(
    "self.addEventListener('install', () => self.skipWaiting());" +
    "self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));" +
    "self.addEventListener('fetch', () => {});"
  );
});

// মূল ওয়েব অ্যাপ ইন্টারফেস
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#0284c7" />
  <link rel="manifest" href="/manifest.json" />
  <title>Remotion MP4 Studio</title>
  <style>
    :root {
      --bg: #090e1a;
      --surface: rgba(20, 30, 50, 0.88);
      --surface-2: rgba(12, 19, 34, 0.92);
      --border: rgba(148, 163, 184, 0.16);
      --primary: #38bdf8;
      --success: #22c55e;
      --danger: #ef4444;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 15% 15%, rgba(56, 189, 248, 0.16), transparent 40%),
        radial-gradient(circle at 85% 85%, rgba(245, 158, 11, 0.12), transparent 42%),
        var(--bg);
      display: flex;
      justify-content: center;
      padding: 20px 14px 40px;
    }
    .app { width: 100%; max-width: 480px; }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding: 0 4px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 6px 18px rgba(2, 132, 199, 0.35);
    }
    .brand h1 { margin: 0; font-size: 18px; font-weight: 800; }
    .brand span { font-size: 12px; color: var(--muted); display: block; }
    .status-pill {
      font-size: 11px;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.14);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.28);
      font-weight: 600;
    }
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      background: var(--surface-2);
      padding: 6px;
      border-radius: 14px;
      border: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .tab-btn {
      border: none;
      background: transparent;
      color: var(--muted);
      padding: 11px 12px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .tab-btn.active {
      background: linear-gradient(135deg, #0284c7, #0ea5e9);
      color: #fff;
      box-shadow: 0 4px 14px rgba(14, 165, 233, 0.32);
    }
    .badge {
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 11px;
    }
    .card {
      background: var(--surface);
      backdrop-filter: blur(14px);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.36);
    }
    .panel { display: none; }
    .panel.active { display: block; }

    .dropzone {
      display: block;
      border: 1.8px dashed rgba(56, 189, 248, 0.45);
      background: rgba(15, 23, 42, 0.68);
      border-radius: 14px;
      padding: 20px 16px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 12px;
    }
    .dropzone:hover, .dropzone.has-file {
      border-color: var(--primary);
      background: rgba(14, 165, 233, 0.08);
    }
    .dropzone input { display: none; }
    .drop-icon { font-size: 26px; margin-bottom: 6px; }
    .drop-title { font-size: 15px; font-weight: 700; color: var(--text); }
    .drop-sub { font-size: 12px; color: var(--muted); margin-top: 4px; word-break: break-word; }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .field-label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin: 10px 0 6px;
      font-weight: 600;
    }
    .input {
      width: 100%;
      padding: 11px 13px;
      border-radius: 11px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .input:focus { border-color: var(--primary); }

    .primary-btn {
      width: 100%;
      margin-top: 16px;
      padding: 14px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #fff;
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(2, 132, 199, 0.35);
    }
    .primary-btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .status-box {
      display: none;
      margin-top: 18px;
      padding: 16px;
      border-radius: 14px;
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .progress-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .stage-label { font-size: 14px; font-weight: 700; color: var(--text); }
    .percent-badge { font-size: 19px; font-weight: 800; color: var(--primary); }
    .progress-track {
      width: 100%;
      height: 11px;
      background: #1e293b;
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, #0284c7, #38bdf8, #818cf8);
      transition: width 0.35s ease;
    }
    .progress-fill.done { background: linear-gradient(90deg, #16a34a, #4ade80); }
    .progress-fill.error { background: var(--danger); }
    .status-detail {
      margin-top: 10px;
      font-size: 13px;
      color: var(--muted);
      line-height: 1.55;
      word-break: break-word;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      background: linear-gradient(135deg, #16a34a, #22c55e);
      color: #fff;
      text-decoration: none;
      font-weight: 800;
      font-size: 15px;
    }
    .reset-link {
      display: inline-block;
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      text-decoration: underline;
      cursor: pointer;
    }

    /* History Panel */
    .history-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .history-head h3 { margin: 0; font-size: 15px; }
    .refresh-btn {
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--primary);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .filter-chip {
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--muted);
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .filter-chip.active {
      background: rgba(56, 189, 248, 0.2);
      color: #7dd3fc;
      border-color: rgba(56, 189, 248, 0.55);
    }
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 60vh;
      overflow-y: auto;
      padding-right: 2px;
    }
    .history-item {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
    }
    .h-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    .h-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      word-break: break-word;
    }
    .user-badge {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.16);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .h-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11.5px;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .h-chip {
      background: rgba(148, 163, 184, 0.12);
      padding: 3px 8px;
      border-radius: 6px;
    }
    .h-actions {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .h-dl {
      text-align: center;
      padding: 10px 12px;
      border-radius: 9px;
      background: linear-gradient(135deg, #16a34a, #22c55e);
      color: #fff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
    }
    .h-copy {
      padding: 10px 12px;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: #1e293b;
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .empty-state {
      text-align: center;
      padding: 32px 12px;
      color: var(--muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="brand">
        <div class="logo">🎬</div>
        <div>
          <h1>Remotion MP4 Studio</h1>
          <span>Cloud Video Renderer</span>
        </div>
      </div>
      <div class="status-pill">● অনলাইন</div>
    </div>

    <div class="tabs">
      <button id="tabRenderBtn" class="tab-btn active" onclick="switchTab('render')">⚡ নতুন রেন্ডার</button>
      <button id="tabHistoryBtn" class="tab-btn" onclick="switchTab('history')">
        📂 হিস্টরি <span id="historyCount" class="badge">0</span>
      </button>
    </div>

    <div class="card">
      <!-- Render Panel -->
      <div id="panelRender" class="panel active">
        <label id="dropzone" class="dropzone" for="zipFile">
          <input type="file" id="zipFile" accept=".zip" onchange="onFilePicked()" />
          <div class="drop-icon">📦</div>
          <div id="dropTitle" class="drop-title">প্রজেক্ট ZIP ফাইল সিলেক্ট করুন</div>
          <div id="dropSub" class="drop-sub">সর্বোচ্চ 500 MB পর্যন্ত সাপোর্টেড</div>
        </label>

        <div class="row-2">
          <div>
            <label class="field-label" for="userName">আপনার নাম</label>
            <input class="input" type="text" id="userName" placeholder="যেমন: আমি / ভাইয়া" />
          </div>
          <div>
            <label class="field-label" for="projectName">প্রজেক্টের নাম (ঐচ্ছিক)</label>
            <input class="input" type="text" id="projectName" placeholder="যেমন: ত্রিস্তান পর্ব-১" />
          </div>
        </div>

        <label class="field-label" for="directZipUrl">অথবা Direct ZIP লিংক (ঐচ্ছিক)</label>
        <input class="input" type="text" id="directZipUrl" placeholder="https://.../project.zip" />

        <label class="field-label" for="compId">Composition ID (ঐচ্ছিক)</label>
        <input class="input" type="text" id="compId" placeholder="ফাঁকা রাখলে অটোমেটিক Main নেবে" />

        <button id="renderBtn" class="primary-btn" onclick="startRender()">Render MP4 শুরু করুন</button>

        <div id="statusBox" class="status-box">
          <div class="progress-top">
            <span id="stageLabel" class="stage-label">প্রস্তুত হচ্ছে...</span>
            <span id="percentText" class="percent-badge">0%</span>
          </div>
          <div class="progress-track">
            <div id="progressFill" class="progress-fill"></div>
          </div>
          <div id="statusText" class="status-detail"></div>
        </div>
      </div>

      <!-- History Panel -->
      <div id="panelHistory" class="panel">
        <div class="history-head">
          <h3>রেন্ডার করা ভিডিওসমূহ</h3>
          <button class="refresh-btn" onclick="loadHistory(true)">↻ রিফ্রেশ</button>
        </div>
        <div id="filterBar" class="filter-bar"></div>
        <div id="historyList" class="history-list">
          <div class="empty-state">হিস্টরি লোড হচ্ছে...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    var pollTimer = null;
    var STORAGE_KEY = 'active_remotion_render_id';
    var USER_KEY = 'remotion_saved_user_name';
    var allHistoryItems = [];
    var activeUserFilter = 'ALL';

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function switchTab(tab) {
      document.getElementById('tabRenderBtn').classList.toggle('active', tab === 'render');
      document.getElementById('tabHistoryBtn').classList.toggle('active', tab === 'history');
      document.getElementById('panelRender').classList.toggle('active', tab === 'render');
      document.getElementById('panelHistory').classList.toggle('active', tab === 'history');
      if (tab === 'history') loadHistory(false);
    }

    function onFilePicked() {
      var input = document.getElementById('zipFile');
      var dz = document.getElementById('dropzone');
      var title = document.getElementById('dropTitle');
      var sub = document.getElementById('dropSub');
      var projInput = document.getElementById('projectName');
      if (input.files && input.files.length) {
        var f = input.files[0];
        var mb = (f.size / (1024 * 1024)).toFixed(1);
        dz.classList.add('has-file');
        title.textContent = f.name;
        sub.textContent = 'ফাইল সাইজ: ' + mb + ' MB • আপলোডের জন্য প্রস্তুত';
        if (!projInput.value.trim()) {
          projInput.placeholder = f.name.replace(/.zip$/i, '');
        }
      } else {
        dz.classList.remove('has-file');
        title.textContent = 'প্রজেক্ট ZIP ফাইল সিলেক্ট করুন';
        sub.textContent = 'সর্বোচ্চ 500 MB পর্যন্ত সাপোর্টেড';
      }
    }

    function setProgress(percent, stageLabel, detailHtml, mode) {
      var box = document.getElementById('statusBox');
      var fill = document.getElementById('progressFill');
      var pText = document.getElementById('percentText');
      var sLabel = document.getElementById('stageLabel');
      var sText = document.getElementById('statusText');

      var clamped = Math.max(0, Math.min(100, Math.round(percent)));
      box.style.display = 'block';
      fill.className = 'progress-fill' + (mode ? ' ' + mode : '');
      fill.style.width = clamped + '%';
      pText.textContent = clamped + '%';
      sLabel.textContent = stageLabel;
      sText.innerHTML = detailHtml;
    }

    function resetRenderState() {
      if (pollTimer) clearInterval(pollTimer);
      localStorage.removeItem(STORAGE_KEY);
      document.getElementById('renderBtn').disabled = false;
      document.getElementById('statusBox').style.display = 'none';
    }

    function startRender() {
      var fileInput = document.getElementById('zipFile');
      var directZipUrl = document.getElementById('directZipUrl').value.trim();
      var compId = document.getElementById('compId').value.trim();
      var userName = document.getElementById('userName').value.trim();
      var projectName = document.getElementById('projectName').value.trim();
      var btn = document.getElementById('renderBtn');

      if (!fileInput.files.length && !directZipUrl) {
        alert('অনুগ্রহ করে একটি ZIP ফাইল সিলেক্ট করুন অথবা Direct ZIP URL দিন!');
        return;
      }

      // প্রতিটি ফোনে নিজের নাম সেভ রাখা
      if (userName) {
        localStorage.setItem(USER_KEY, userName);
      }

      if (pollTimer) clearInterval(pollTimer);
      btn.disabled = true;

      var formData = new FormData();
      var sizeMB = '';
      if (fileInput.files.length) {
        var file = fileInput.files[0];
        sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        formData.append('projectZip', file);
        setProgress(1, 'ZIP আপলোড হচ্ছে...', 'ফাইল (' + sizeMB + ' MB) সার্ভারে পাঠানো হচ্ছে...', '');
      } else {
        formData.append('directZipUrl', directZipUrl);
        setProgress(5, 'রেন্ডার শুরু হচ্ছে...', 'লিংক থেকে রেন্ডার চালু করা হচ্ছে...', '');
      }
      if (compId) formData.append('compositionId', compId);
      if (userName) formData.append('userName', userName);
      if (projectName) formData.append('projectName', projectName);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/render', true);

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var upPct = Math.round((e.loaded / e.total) * 100);
          if (upPct < 100) {
            setProgress(upPct, 'ZIP আপলোড হচ্ছে', 'আপলোড সম্পন্ন: ' + upPct + '% (' + sizeMB + ' MB)', '');
          } else {
            setProgress(100, 'GitHub-এ ট্রান্সফার হচ্ছে...', 'ফাইলটি GitHub-এ পাঠিয়ে রেন্ডারিং শুরু করা হচ্ছে...', '');
          }
        }
      };

      xhr.onload = function () {
        var data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          setProgress(0, 'এরর হয়েছে', '❌ সার্ভার রেসপন্স এরর (' + xhr.status + ')। আবার চেষ্টা করুন।', 'error');
          btn.disabled = false;
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          setProgress(0, 'এরর হয়েছে', '❌ ' + escapeHtml(data.error || 'সমস্যা হয়েছে'), 'error');
          btn.disabled = false;
          return;
        }

        localStorage.setItem(STORAGE_KEY, data.renderId);
        setProgress(4, 'রেন্ডার কিউতে আছে', 'Render ID: ' + escapeHtml(data.renderId) + '<br>GitHub Actions শুরু হচ্ছে...', '');
        pollStatus(data.renderId);
      };

      xhr.onerror = function () {
        setProgress(0, 'সংযোগ বিচ্ছিন্ন', '❌ নেটওয়ার্ক সংযোগ বিচ্ছিন্ন হয়েছে। আবার চেষ্টা করুন।', 'error');
        btn.disabled = false;
      };

      xhr.send(formData);
    }

    function pollStatus(renderId) {
      var btn = document.getElementById('renderBtn');
      var resetHtml = '<br><span class="reset-link" onclick="resetRenderState()">নতুন কাজ শুরু করতে রিসেট করুন</span>';

      var checkNow = async function () {
        try {
          var res = await fetch('/api/status/' + encodeURIComponent(renderId));
          var data = await res.json();

          if (data.status === 'completed' && data.downloadUrl) {
            clearInterval(pollTimer);
            localStorage.removeItem(STORAGE_KEY);
            btn.disabled = false;
            setProgress(
              100,
              'রেন্ডার সম্পন্ন হয়েছে!',
              '✅ আপনার MP4 ভিডিও ডাউনলোডের জন্য প্রস্তুত!<a class="download-btn" href="' + escapeHtml(data.downloadUrl) + '">⬇ MP4 ডাউনলোড করুন</a>',
              'done'
            );
            loadHistory(true);
          } else if (data.status === 'failed') {
            clearInterval(pollTimer);
            localStorage.removeItem(STORAGE_KEY);
            btn.disabled = false;
            setProgress(data.percent || 0, 'রেন্ডার ব্যর্থ হয়েছে', '❌ ' + escapeHtml(data.message || 'রেন্ডার করতে গিয়ে ত্রুটি হয়েছে।'), 'error');
          } else {
            var pct = typeof data.percent === 'number' ? data.percent : 5;
            var stage = data.stage || 'রেন্ডারিং চলছে...';
            var detail = data.detail ? escapeHtml(data.detail) + '<br>' : '';
            setProgress(pct, stage, detail + 'Render ID: ' + escapeHtml(renderId) + resetHtml, '');
          }
        } catch (e) {}
      };

      checkNow();
      pollTimer = setInterval(checkNow, 5000);
    }

    function setFilter(userVal) {
      activeUserFilter = userVal;
      renderHistoryList();
    }

    function renderHistoryList() {
      var filterEl = document.getElementById('filterBar');
      var listEl = document.getElementById('historyList');

      // ইউনিক ব্যবহারকারীর তালিকা বের করে ফিল্টার চিপ বানানো
      var users = [];
      allHistoryItems.forEach(function (it) {
        if (it.userName && users.indexOf(it.userName) === -1) {
          users.push(it.userName);
        }
      });

      if (users.length > 0) {
        var chips = '<button class="filter-chip' + (activeUserFilter === 'ALL' ? ' active' : '') + '" onclick="setFilter(\\'ALL\\')">সবাই (' + allHistoryItems.length + ')</button>';
        users.forEach(function (u) {
          var cnt = allHistoryItems.filter(function (x) { return x.userName === u; }).length;
          chips += '<button class="filter-chip' + (activeUserFilter === u ? ' active' : '') + '" data-user="' + escapeHtml(u) + '" onclick="setFilter(this.getAttribute(\\'data-user\\'))">👤 ' + escapeHtml(u) + ' (' + cnt + ')</button>';
        });
        filterEl.innerHTML = chips;
      } else {
        filterEl.innerHTML = '';
      }

      var filtered = activeUserFilter === 'ALL'
        ? allHistoryItems
        : allHistoryItems.filter(function (it) { return it.userName === activeUserFilter; });

      if (!filtered.length) {
        listEl.innerHTML = '<div class="empty-state">কোনো রেন্ডার করা ভিডিও পাওয়া যায়নি।</div>';
        return;
      }

      listEl.innerHTML = filtered.map(function (item) {
        var dt = new Date(item.createdAt);
        var dateStr = isNaN(dt.getTime()) ? '' : dt.toLocaleString('bn-BD', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        var userBadge = item.userName
          ? '<span class="user-badge">👤 ' + escapeHtml(item.userName) + '</span>'
          : '';
        return (
          '<div class="history-item">' +
            '<div class="h-top">' +
              '<div class="h-title">🎞 ' + escapeHtml(item.title) + '</div>' +
              userBadge +
            '</div>' +
            '<div class="h-meta">' +
              '<span class="h-chip">💾 ' + escapeHtml(item.sizeMB) + ' MB</span>' +
              (dateStr ? '<span class="h-chip">🕒 ' + escapeHtml(dateStr) + '</span>' : '') +
            '</div>' +
            '<div class="h-actions">' +
              '<a class="h-dl" href="' + escapeHtml(item.downloadUrl) + '">⬇ MP4 ডাউনলোড</a>' +
              '<button class="h-copy" data-url="' + escapeHtml(item.downloadUrl) + '" onclick="copyLink(this)">লিংক কপি</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    async function loadHistory(showLoading) {
      var listEl = document.getElementById('historyList');
      var countEl = document.getElementById('historyCount');
      if (showLoading) {
        listEl.innerHTML = '<div class="empty-state">হিস্টরি আপডেট হচ্ছে...</div>';
      }
      try {
        var res = await fetch('/api/history');
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'লোড করা যায়নি');

        allHistoryItems = data.items || [];
        countEl.textContent = allHistoryItems.length;
        renderHistoryList();
      } catch (err) {
        listEl.innerHTML = '<div class="empty-state">❌ হিস্টরি লোড করতে সমস্যা হয়েছে: ' + escapeHtml(err.message) + '</div>';
      }
    }

    function copyLink(btn) {
      var url = btn.getAttribute('data-url');
      if (navigator.clipboard && url) {
        navigator.clipboard.writeText(url).then(function () {
          var old = btn.textContent;
          btn.textContent = '✓ কপি হয়েছে';
          setTimeout(function () { btn.textContent = old; }, 1600);
        });
      }
    }

    window.addEventListener('DOMContentLoaded', function () {
      var savedUser = localStorage.getItem(USER_KEY);
      if (savedUser) {
        document.getElementById('userName').value = savedUser;
      }
      loadHistory(false);
      var savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        document.getElementById('renderBtn').disabled = true;
        setProgress(5, 'স্ট্যাটাস রিস্টোর হচ্ছে...', 'চলমান রেন্ডার চেক করা হচ্ছে (ID: ' + escapeHtml(savedId) + ')...', '');
        pollStatus(savedId);
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      }
    });
  </script>
</body>
</html>`);
});

// GitHub Actions থেকে লাইভ প্রগ্রেস রিসিভ করার এন্ডপয়েন্ট
app.post('/api/progress/:renderId', (req, res) => {
  const { renderId } = req.params;
  const { percent, stage, detail, status } = req.body || {};
  const prev = renderProgress.get(renderId) || { startedAt: Date.now() };
  renderProgress.set(renderId, {
    ...prev,
    hasExactProgress: true,
    percent: typeof percent === 'number' ? Math.max(0, Math.min(99, Math.round(percent))) : (prev.percent || 5),
    stage: stage || prev.stage || 'ভিডিও রেন্ডার হচ্ছে...',
    detail: detail || prev.detail || '',
    status: status || 'processing',
    updatedAt: Date.now()
  });
  res.json({ ok: true });
});

// আগে রেন্ডার করা সব MP4 ভিডিওর হিস্টরি (প্রজেক্ট ও ব্যবহারকারীর নামসহ)
app.get('/api/history', async (req, res) => {
  try {
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ error: 'সার্ভারে GITHUB_TOKEN সেট করা নেই।' });
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=80`,
      {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json'
        }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `GitHub হিস্টরি পাওয়া যায়নি: ${errText}` });
    }

    const releases = await response.json();

    // src-rnd_... রিলিজ থেকে প্রজেক্ট ও ব্যবহারকারীর নাম বের করা
    const sourceMeta = new Map();
    for (const rel of releases) {
      if (rel.tag_name && rel.tag_name.startsWith('src-')) {
        const id = rel.tag_name.slice(4);
        const rawBody = (rel.body || '').trim();
        if (!rawBody) continue;
        try {
          const parsed = JSON.parse(rawBody);
          sourceMeta.set(id, {
            projectName: (parsed.projectName || parsed.fileName || '').replace(/\.zip$/i, '').trim(),
            userName: (parsed.userName || '').trim()
          });
        } catch (e) {
          sourceMeta.set(id, {
            projectName: rawBody.replace(/\.zip$/i, '').trim(),
            userName: ''
          });
        }
      }
    }

    // render-rnd_... রিলিজ থেকে সব MP4 ভিডিওর তালিকা তৈরি
    const items = [];
    for (const rel of releases) {
      if (!rel.tag_name || !rel.tag_name.startsWith('render-')) continue;
      const mp4Asset = (rel.assets || []).find(a => a.name && a.name.toLowerCase().endsWith('.mp4'));
      if (!mp4Asset) continue;

      const renderId = rel.tag_name.slice(7);
      const meta = sourceMeta.get(renderId) || {};
      items.push({
        renderId,
        title: meta.projectName || rel.name || renderId,
        userName: meta.userName || '',
        fileName: mp4Asset.name,
        sizeMB: (mp4Asset.size / (1024 * 1024)).toFixed(1),
        createdAt: rel.published_at || rel.created_at,
        downloadUrl: mp4Asset.browser_download_url
      });
    }

    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ডিস্ক থেকে সরাসরি GitHub Release-এ স্ট্রিম করে Workflow চালু করা
app.post('/api/render', upload.single('projectZip'), async (req, res) => {
  const tempFilePath = req.file ? req.file.path : null;
  try {
    const directZipUrl = (req.body.directZipUrl || '').trim();
    if (!req.file && !directZipUrl) {
      return res.status(400).json({ error: 'কোনো ZIP ফাইল বা লিংক পাওয়া যায়নি।' });
    }
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ error: 'সার্ভারে GITHUB_TOKEN সেট করা নেই।' });
    }

    const renderId = `rnd_${Date.now()}`;
    const compositionId = (req.body.compositionId || '').trim();
    const userName = (req.body.userName || '').trim().slice(0, 40);
    const projectName = (req.body.projectName || '').trim().slice(0, 100);
    const fallbackFileName = req.file ? req.file.originalname : '';
    const metaBody = JSON.stringify({
      projectName: projectName || fallbackFileName.replace(/\.zip$/i, '') || `Render ${renderId}`,
      userName,
      fileName: fallbackFileName
    });

    let zipUrl = directZipUrl;

    if (req.file) {
      const relRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tag_name: `src-${renderId}`,
          name: `Source ${renderId}`,
          body: metaBody,
          prerelease: true
        })
      });

      if (!relRes.ok) {
        const errText = await relRes.text();
        return res.status(relRes.status).json({ error: `Release তৈরি হয়নি: ${errText}` });
      }

      const relData = await relRes.json();
      const uploadUrl = relData.upload_url.replace('{?name,label}', '?name=project.zip');

      const webStream = Readable.toWeb(fs.createReadStream(req.file.path));
      const assetRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/zip',
          'Content-Length': String(req.file.size)
        },
        body: webStream,
        duplex: 'half'
      });

      if (!assetRes.ok) {
        const errText = await assetRes.text();
        return res.status(assetRes.status).json({ error: `ZIP আপলোড হয়নি: ${errText}` });
      }

      const assetData = await assetRes.json();
      zipUrl = assetData.browser_download_url;
    } else if (projectName || userName) {
      // Direct ZIP URL ব্যবহার করলেও হিস্টরিতে প্রজেক্ট ও ব্যবহারকারীর নাম সেভ রাখা
      await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tag_name: `src-${renderId}`,
          name: `Source ${renderId}`,
          body: metaBody,
          prerelease: true
        })
      }).catch(() => {});
    }

    const wfRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/render.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            zip_url: zipUrl,
            render_id: renderId,
            composition_id: compositionId
          }
        })
      }
    );

    if (!wfRes.ok) {
      const errText = await wfRes.text();
      return res.status(wfRes.status).json({ error: `Workflow চালু হয়নি: ${errText}` });
    }

    renderProgress.set(renderId, {
      startedAt: Date.now(),
      hasExactProgress: false,
      percent: 4,
      stage: 'রেন্ডার কিউতে আছে...',
      detail: 'GitHub সার্ভার প্রস্তুত হচ্ছে'
    });

    res.json({ success: true, renderId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (tempFilePath) {
      fs.promises.unlink(tempFilePath).catch(() => {});
    }
  }
});

// রেন্ডার স্ট্যাটাস ও ডাউনলোড লিংক চেক করা
app.get('/api/status/:renderId', async (req, res) => {
  try {
    const { renderId } = req.params;
    const headers = {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    };

    const relRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/render-${renderId}`,
      { headers }
    );

    if (relRes.ok) {
      const releaseData = await relRes.json();
      const mp4Asset = releaseData.assets?.find(a => a.name.endsWith('.mp4'));
      if (mp4Asset) {
        renderProgress.delete(renderId);
        return res.json({
          status: 'completed',
          percent: 100,
          stage: 'রেন্ডার সম্পন্ন!',
          downloadUrl: mp4Asset.browser_download_url
        });
      }
    }

    const tracked = renderProgress.get(renderId);
    if (tracked && tracked.hasExactProgress) {
      if (tracked.status === 'failed') {
        return res.json({ status: 'failed', percent: tracked.percent, message: tracked.detail || 'রেন্ডার ব্যর্থ হয়েছে' });
      }
      return res.json({
        status: 'processing',
        percent: tracked.percent,
        stage: tracked.stage,
        detail: tracked.detail
      });
    }

    const runsRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/render.yml/runs?per_page=5`,
      { headers }
    );

    if (runsRes.ok) {
      const runsData = await runsRes.json();
      const startedAt = tracked ? tracked.startedAt : 0;
      const matchedRun = (runsData.workflow_runs || []).find(r => {
        const createdMs = new Date(r.created_at).getTime();
        return startedAt === 0 || createdMs >= startedAt - 20000;
      });

      if (matchedRun) {
        if (matchedRun.status === 'completed' && matchedRun.conclusion !== 'success') {
          return res.json({
            status: 'failed',
            percent: 0,
            message: `GitHub Workflow ব্যর্থ হয়েছে (${matchedRun.conclusion})।`
          });
        }
        if (matchedRun.status === 'queued') {
          return res.json({ status: 'processing', percent: 5, stage: 'সার্ভার কিউতে আছে...', detail: 'GitHub রানার চালু হচ্ছে' });
        }

        const jobsRes = await fetch(matchedRun.jobs_url, { headers });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          const job = (jobsData.jobs || [])[0];
          if (job && Array.isArray(job.steps) && job.steps.length > 0) {
            const total = job.steps.length;
            const done = job.steps.filter(s => s.status === 'completed').length;
            const active = job.steps.find(s => s.status === 'in_progress');
            const pct = Math.min(94, Math.max(8, Math.round((done / total) * 90)));
            return res.json({
              status: 'processing',
              percent: pct,
              stage: active ? `চলছে: ${active.name}` : 'রেন্ডারিং চলছে...',
              detail: `ধাপ ${Math.min(done + 1, total)} / ${total}`
            });
          }
        }
      }
    }

    res.json({
      status: 'processing',
      percent: tracked ? tracked.percent : 5,
      stage: tracked ? tracked.stage : 'রেন্ডারিং চলছে...',
      detail: 'অপেক্ষা করুন...'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.requestTimeout = 20 * 60 * 1000;
server.headersTimeout = 20 * 60 * 1000;