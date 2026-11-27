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
  color-scheme: dark;
  --bg: #05070d;
  --surface: rgba(17, 23, 38, .72);
  --surface-2: rgba(10, 15, 27, .78);
  --border: rgba(191, 210, 255, .13);
  --border-strong: rgba(105, 174, 255, .38);
  --primary: #8bd5ff;
  --primary-2: #8a9bff;
  --success: #55e3b0;
  --danger: #ff7189;
  --text: #f5f7ff;
  --muted: #929db4;
  --glass-shadow: 0 28px 90px rgba(0, 0, 0, .48);
}
* { box-sizing: border-box; }
html { min-height: 100%; background: var(--bg); }
body {
  margin: 0; min-height: 100vh; position: relative; isolation: isolate;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background:
    radial-gradient(ellipse at 14% 7%, rgba(36, 111, 219, .22), transparent 34%),
    radial-gradient(ellipse at 92% 19%, rgba(94, 76, 205, .19), transparent 32%),
    radial-gradient(ellipse at 52% 100%, rgba(20, 150, 180, .11), transparent 40%),
    linear-gradient(145deg, #070a12 0%, #090d18 48%, #05070d 100%);
  background-attachment: fixed;
  display: flex; justify-content: center;
  padding: 34px 18px 54px;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
body::before, body::after {
  content: ''; position: fixed; z-index: -1; pointer-events: none; border-radius: 50%;
  filter: blur(2px); opacity: .7;
}
body::before { width: 300px; height: 300px; top: 16%; left: -190px; background: radial-gradient(circle, rgba(35, 128, 255, .16), transparent 70%); }
body::after { width: 360px; height: 360px; right: -230px; bottom: 3%; background: radial-gradient(circle, rgba(105, 91, 255, .15), transparent 70%); }
button, input { font: inherit; }
button { -webkit-tap-highlight-color: transparent; }
.app { width: 100%; max-width: 570px; position: relative; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; padding: 0 3px; }
.brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
.logo {
  width: 50px; height: 50px; flex: 0 0 50px; border-radius: 17px;
  background: linear-gradient(145deg, rgba(95, 190, 255, .26), rgba(106, 112, 255, .18));
  display: flex; align-items: center; justify-content: center; font-size: 22px;
  border: 1px solid rgba(194, 225, 255, .28);
  box-shadow: 0 10px 34px rgba(45, 127, 255, .19), inset 0 1px 0 rgba(255,255,255,.34), inset 0 -12px 24px rgba(50, 104, 220, .10);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
}
.brand h1 { margin: 0; font-size: 19px; letter-spacing: -.55px; font-weight: 850; }
.brand span { font-size: 10px; color: #9ba9c3; display: block; margin-top: 4px; letter-spacing: 1.45px; text-transform: uppercase; font-weight: 700; }
.status-pill {
  flex: 0 0 auto; font-size: 10px; padding: 8px 12px; border-radius: 999px;
  background: linear-gradient(145deg, rgba(39, 190, 139, .13), rgba(18, 102, 87, .10)); color: #8af0c7;
  border: 1px solid rgba(99, 235, 184, .22); font-weight: 800; letter-spacing: .35px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.09), 0 6px 22px rgba(13, 143, 106, .08);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.tabs {
  display: grid; grid-template-columns: 1fr 1fr; gap: 7px;
  background: linear-gradient(135deg, rgba(255,255,255,.075), rgba(255,255,255,.025));
  padding: 6px; border-radius: 19px; border: 1px solid rgba(205, 220, 255, .12); margin-bottom: 15px;
  box-shadow: 0 12px 35px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.09);
  backdrop-filter: blur(24px) saturate(145%); -webkit-backdrop-filter: blur(24px) saturate(145%);
}
.tab-btn {
  border: 1px solid transparent; background: transparent; color: #929db4;
  padding: 13px 10px; border-radius: 14px; font-size: 13px; font-weight: 780;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease;
}
.tab-btn:active, .primary-btn:active, .refresh-btn:active, .filter-chip:active { transform: scale(.985); }
.tab-btn.active {
  background: linear-gradient(135deg, rgba(91, 181, 255, .20), rgba(111, 112, 255, .17));
  color: #f4f9ff; border-color: rgba(151, 205, 255, .22);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 5px 20px rgba(40, 117, 218, .13);
}
.badge { background: rgba(255,255,255,.13); padding: 2px 7px; border-radius: 999px; font-size: 10px; }
.card {
  position: relative; overflow: hidden;
  background: linear-gradient(145deg, rgba(27, 36, 57, .78), rgba(11, 16, 29, .82) 62%, rgba(16, 22, 39, .76));
  border: 1px solid rgba(202, 220, 255, .16); border-radius: 27px; padding: 24px;
  box-shadow: var(--glass-shadow), inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(255,255,255,.025);
  backdrop-filter: blur(28px) saturate(150%); -webkit-backdrop-filter: blur(28px) saturate(150%);
}
.card::before { content: ''; position: absolute; inset: 0 0 auto; height: 1px; background: linear-gradient(90deg, transparent, rgba(211,235,255,.58), rgba(132,159,255,.34), transparent); pointer-events: none; }
.card::after { content: ''; position: absolute; width: 240px; height: 240px; right: -155px; top: -170px; border-radius: 50%; background: radial-gradient(circle, rgba(92, 157, 255, .12), transparent 70%); pointer-events: none; }
.panel { display: none; position: relative; z-index: 1; }
.panel.active { display: block; }
.dropzone {
  display: block; position: relative; border: 1px dashed rgba(126, 190, 255, .48);
  background: linear-gradient(145deg, rgba(63, 133, 208, .15), rgba(104, 93, 205, .10));
  border-radius: 21px; padding: 31px 16px; text-align: center; cursor: pointer;
  transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
  margin-bottom: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,.10), inset 0 -20px 40px rgba(44, 91, 169, .045);
}
.dropzone:hover, .dropzone.has-file { border-color: rgba(139, 213, 255, .88); background: linear-gradient(145deg, rgba(55, 151, 221, .22), rgba(108, 100, 222, .16)); box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 10px 30px rgba(40, 118, 215, .10); }
.dropzone:active { transform: scale(.993); }
.dropzone input { display: none; }
.drop-icon { font-size: 32px; margin-bottom: 10px; filter: drop-shadow(0 7px 15px rgba(77, 174, 255, .32)); }
.drop-title { font-size: 14px; font-weight: 800; color: var(--text); }
.drop-sub { font-size: 11px; color: #9ba9c3; margin-top: 6px; word-break: break-word; }
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-label { display: block; font-size: 11px; color: #b7c3d9; margin: 15px 0 8px; font-weight: 750; letter-spacing: .12px; }
.input {
  width: 100%; padding: 13px 14px; border-radius: 14px;
  border: 1px solid rgba(183, 204, 242, .15); background: rgba(4, 9, 19, .48);
  color: var(--text); font-size: 13px; outline: none;
  box-shadow: inset 0 1px 3px rgba(0,0,0,.16);
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}
.input::placeholder { color: #66758f; }
.input:focus { border-color: rgba(117, 195, 255, .72); box-shadow: 0 0 0 3px rgba(68, 151, 236, .12), inset 0 1px 3px rgba(0,0,0,.12); background: rgba(7, 15, 29, .72); }
.primary-btn {
  width: 100%; margin-top: 20px; padding: 15px 16px; border: 1px solid rgba(202, 232, 255, .30);
  border-radius: 15px; background: linear-gradient(110deg, #238fd6 0%, #477be9 52%, #7774ee 100%);
  color: #fff; font-size: 14px; font-weight: 850; letter-spacing: .1px; cursor: pointer;
  box-shadow: 0 10px 30px rgba(47, 119, 224, .25), inset 0 1px 0 rgba(255,255,255,.32), inset 0 -1px 0 rgba(0,0,0,.10);
  transition: transform .18s ease, filter .18s ease, box-shadow .18s ease;
}
.primary-btn:hover { filter: brightness(1.08); box-shadow: 0 13px 34px rgba(47, 119, 224, .32), inset 0 1px 0 rgba(255,255,255,.32); }
.primary-btn:disabled { opacity: .52; cursor: not-allowed; box-shadow: none; }
.status-box { display: none; margin-top: 19px; padding: 17px; border-radius: 18px; background: linear-gradient(145deg, rgba(5, 13, 26, .70), rgba(17, 25, 43, .58)); border: 1px solid rgba(180, 205, 245, .15); box-shadow: inset 0 1px 0 rgba(255,255,255,.07); }
.progress-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 11px; gap: 10px; }
.stage-label { font-size: 13px; font-weight: 800; color: var(--text); }
.percent-badge { font-size: 20px; font-weight: 900; color: var(--primary); font-variant-numeric: tabular-nums; letter-spacing: -.5px; }
.progress-track { width: 100%; height: 9px; background: rgba(130, 157, 199, .15); border-radius: 999px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,.3); }
.progress-fill { height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #36b8f4, #7a91ff, #8de6ff); box-shadow: 0 0 15px rgba(91, 184, 255, .35); transition: width .22s linear; }
.progress-fill.done { background: linear-gradient(90deg, #16b981, #55e6ad); box-shadow: 0 0 14px rgba(85, 230, 173, .25); }
.progress-fill.error { background: var(--danger); }
.status-detail { margin-top: 11px; font-size: 12px; color: var(--muted); line-height: 1.6; word-break: break-word; }
.download-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 13px; padding: 13px 16px; border-radius: 13px; background: linear-gradient(110deg, #0c9b70, #25c58c); color: #fff; text-decoration: none; font-weight: 850; font-size: 14px; box-shadow: 0 8px 23px rgba(18, 174, 124, .18), inset 0 1px 0 rgba(255,255,255,.22); }
.reset-link { display: inline-block; margin-top: 11px; color: #a8b5cc; font-size: 12px; text-decoration: underline; cursor: pointer; }
.history-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px; }
.history-head h3 { margin: 0; font-size: 15px; letter-spacing: -.2px; }
.refresh-btn { border: 1px solid rgba(180, 205, 245, .17); background: rgba(17, 28, 49, .65); color: var(--primary); padding: 8px 12px; border-radius: 11px; font-size: 11px; font-weight: 800; cursor: pointer; transition: transform .18s ease, background .18s ease; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
.filter-chip { border: 1px solid rgba(180, 205, 245, .15); background: rgba(8, 17, 33, .62); color: var(--muted); padding: 7px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; cursor: pointer; transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease; }
.filter-chip.active { background: rgba(74, 157, 235, .17); color: #b6e7ff; border-color: rgba(113, 193, 255, .38); }
.history-list { display: flex; flex-direction: column; gap: 11px; max-height: 60vh; overflow-y: auto; overscroll-behavior: contain; padding: 1px 3px 1px 0; scrollbar-width: thin; scrollbar-color: rgba(113, 159, 220, .35) transparent; }
.history-item { background: linear-gradient(145deg, rgba(25, 36, 58, .76), rgba(8, 15, 29, .76)); border: 1px solid rgba(174, 198, 239, .14); border-radius: 17px; padding: 15px; box-shadow: inset 0 1px 0 rgba(255,255,255,.055); }
.h-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 9px; }
.h-title { font-size: 13px; font-weight: 800; color: var(--text); word-break: break-word; }
.user-badge { flex-shrink: 0; font-size: 10px; font-weight: 800; padding: 5px 9px; border-radius: 999px; background: rgba(246, 177, 75, .1); color: #ffd18a; border: 1px solid rgba(246, 177, 75, .22); }
.h-meta { display: flex; flex-wrap: wrap; gap: 7px; font-size: 10px; color: var(--muted); margin-bottom: 13px; }
.h-chip { background: rgba(132, 159, 200, .11); padding: 5px 8px; border-radius: 8px; }
.h-actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.h-dl { text-align: center; padding: 11px 12px; border-radius: 11px; background: linear-gradient(110deg, #0c9b70, #25c58c); color: #fff; text-decoration: none; font-size: 12px; font-weight: 800; }
.h-copy { padding: 10px 12px; border-radius: 11px; border: 1px solid rgba(180, 205, 245, .16); background: rgba(21, 38, 67, .7); color: var(--text); font-size: 12px; font-weight: 700; cursor: pointer; }
.empty-state { text-align: center; padding: 38px 12px; color: var(--muted); font-size: 13px; }
:focus-visible { outline: 2px solid rgba(139, 213, 255, .9); outline-offset: 3px; }
@media (max-width: 520px) { body { padding: 23px 13px 36px; } .app { max-width: 460px; } .card { padding: 20px; border-radius: 24px; } }
@media (max-width: 380px) { body { padding: 17px 10px 28px; } .card { padding: 16px; border-radius: 20px; } .brand h1 { font-size: 16px; } .logo { width: 43px; height: 43px; flex-basis: 43px; } .row-2 { grid-template-columns: 1fr; gap: 0; } .tab-btn { font-size: 12px; padding: 11px 7px; } .status-pill { padding: 7px 9px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
@media (hover: none) { .dropzone:hover, .primary-btn:hover { filter: none; } }
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