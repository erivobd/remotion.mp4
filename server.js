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

// রেন্ডার প্রগ্রেস মেমোরিতে ট্র্যাক করার জন্য
const renderProgress = new Map();

// RAM-এর বদলে /tmp ডিস্কে সেভ হবে (৫০০ এমবি পর্যন্ত নিরাপদ)
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.use(express.json({ limit: '50mb' }));

// ওয়েব অ্যাপের মূল ইন্টারফেস (লাইভ প্রগ্রেস বারসহ)
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remotion MP4 Renderer</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #1e293b; padding: 24px; border-radius: 12px; width: 100%; max-width: 430px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); text-align: center; }
    h2 { margin-top: 0; color: #38bdf8; }
    input[type="file"], input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 8px; }
    button:disabled { background: #475569; cursor: not-allowed; }
    #statusBox { margin-top: 16px; padding: 14px; border-radius: 8px; background: #0f172a; font-size: 14px; display: none; word-break: break-word; }
    .progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: bold; }
    .percent-badge { color: #38bdf8; font-size: 18px; }
    .progress-track { width: 100%; height: 12px; background: #1e293b; border-radius: 999px; overflow: hidden; border: 1px solid #334155; }
    .progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #0284c7, #38bdf8); border-radius: 999px; transition: width 0.4s ease; }
    .progress-fill.done { background: linear-gradient(90deg, #16a34a, #4ade80); }
    .progress-fill.error { background: #dc2626; }
    #statusText { margin-top: 10px; color: #cbd5e1; line-height: 1.5; }
    a.download-btn { display: inline-block; margin-top: 12px; padding: 10px 18px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .hint { font-size: 12px; color: #94a3b8; margin: 4px 0 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Remotion MP4 Renderer</h2>
    <input type="file" id="zipFile" accept=".zip" />
    <div class="hint">অথবা বড় ফাইলের সরাসরি ডাউনলোড লিংক দিন (ঐচ্ছিক):</div>
    <input type="text" id="directZipUrl" placeholder="Direct ZIP URL (ঐচ্ছিক)" />
    <input type="text" id="compId" placeholder="Composition ID (ঐচ্ছিক, ফাঁকা রাখতে পারেন)" />
    <button id="renderBtn" onclick="startRender()">Render MP4 শুরু করুন</button>

    <div id="statusBox">
      <div class="progress-header">
        <span id="stageLabel">প্রস্তুত হচ্ছে...</span>
        <span id="percentText" class="percent-badge">0%</span>
      </div>
      <div class="progress-track">
        <div id="progressFill" class="progress-fill"></div>
      </div>
      <div id="statusText"></div>
    </div>
  </div>

  <script>
    let pollTimer = null;

    function setProgress(percent, stageLabel, detailHtml, mode = '') {
      const box = document.getElementById('statusBox');
      const fill = document.getElementById('progressFill');
      const pText = document.getElementById('percentText');
      const sLabel = document.getElementById('stageLabel');
      const sText = document.getElementById('statusText');

      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      box.style.display = 'block';
      fill.className = 'progress-fill' + (mode ? ' ' + mode : '');
      fill.style.width = clamped + '%';
      pText.textContent = clamped + '%';
      sLabel.textContent = stageLabel;
      sText.innerHTML = detailHtml;
    }

    function startRender() {
      const fileInput = document.getElementById('zipFile');
      const directZipUrl = document.getElementById('directZipUrl').value.trim();
      const compId = document.getElementById('compId').value.trim();
      const btn = document.getElementById('renderBtn');

      if (!fileInput.files.length && !directZipUrl) {
        alert('অনুগ্রহ করে একটি ZIP ফাইল সিলেক্ট করুন অথবা Direct ZIP URL দিন!');
        return;
      }

      if (pollTimer) clearInterval(pollTimer);
      btn.disabled = true;

      const formData = new FormData();
      let sizeMB = '';
      if (fileInput.files.length) {
        const file = fileInput.files[0];
        sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        formData.append('projectZip', file);
        setProgress(1, 'আপলোড হচ্ছে...', 'ZIP ফাইল (' + sizeMB + ' MB) সার্ভারে পাঠানো হচ্ছে...');
      } else {
        formData.append('directZipUrl', directZipUrl);
        setProgress(5, 'শুরু হচ্ছে...', 'লিংক থেকে রেন্ডার চালু করা হচ্ছে...');
      }
      if (compId) formData.append('compositionId', compId);

      // XMLHttpRequest দিয়ে রিয়েল-টাইম আপলোড পার্সেন্টেজ দেখানো
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/render', true);

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          const upPct = Math.round((e.loaded / e.total) * 100);
          if (upPct < 100) {
            setProgress(upPct, 'ZIP আপলোড হচ্ছে', 'ফাইল আপলোড (' + sizeMB + ' MB): ' + upPct + '% সম্পন্ন');
          } else {
            setProgress(100, 'GitHub-এ পাঠানো হচ্ছে...', 'সার্ভার ফাইলটি GitHub-এ ট্রান্সফার করে রেন্ডার চালু করছে...');
          }
        }
      };

      xhr.onload = function () {
        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          setProgress(0, 'এরর হয়েছে', '❌ সার্ভার রেসপন্স এরর (' + xhr.status + ')। আবার চেষ্টা করুন।', 'error');
          btn.disabled = false;
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          setProgress(0, 'এরর হয়েছে', '❌ ' + (data.error || 'সমস্যা হয়েছে'), 'error');
          btn.disabled = false;
          return;
        }

        setProgress(3, 'রেন্ডার কিউতে আছে', 'Render ID: ' + data.renderId + '<br>GitHub Actions রেন্ডার শুরু হচ্ছে...');
        pollStatus(data.renderId);
      };

      xhr.onerror = function () {
        setProgress(0, 'সংযোগ বিচ্ছিন্ন', '❌ নেটওয়ার্ক বা সার্ভার সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।', 'error');
        btn.disabled = false;
      };

      xhr.send(formData);
    }

    function pollStatus(renderId) {
      const btn = document.getElementById('renderBtn');

      pollTimer = setInterval(async () => {
        try {
          const res = await fetch('/api/status/' + encodeURIComponent(renderId));
          const data = await res.json();

          if (data.status === 'completed' && data.downloadUrl) {
            clearInterval(pollTimer);
            btn.disabled = false;
            setProgress(
              100,
              'রেন্ডার সম্পন্ন!',
              '✅ আপনার MP4 ভিডিও প্রস্তুত!<br><a class="download-btn" href="' + data.downloadUrl + '">MP4 ডাউনলোড করুন</a>',
              'done'
            );
          } else if (data.status === 'failed') {
            clearInterval(pollTimer);
            btn.disabled = false;
            setProgress(data.percent || 0, 'রেন্ডার ব্যর্থ হয়েছে', '❌ ' + (data.message || 'GitHub Actions-এ রেন্ডার করতে গিয়ে ত্রুটি হয়েছে।'), 'error');
          } else {
            const pct = typeof data.percent === 'number' ? data.percent : 5;
            const stage = data.stage || 'রেন্ডারিং চলছে...';
            const detail = data.detail ? data.detail + '<br>' : '';
            setProgress(pct, stage, detail + 'Render ID: ' + renderId);
          }
        } catch (e) {}
      }, 5000);
    }
  </script>
</body>
</html>
  `);
});

// GitHub Actions থেকে লাইভ রেন্ডার পার্সেন্টেজ রিসিভ করার এন্ডপয়েন্ট
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
    const compositionId = req.body.compositionId || '';
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
      percent: 3,
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

// রেন্ডার স্ট্যাটাস, লাইভ পার্সেন্টেজ ও ডাউনলোড লিংক চেক করা
app.get('/api/status/:renderId', async (req, res) => {
  try {
    const { renderId } = req.params;
    const headers = {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    };

    // ১. ফাইনাল MP4 Release তৈরি হয়ে গেছে কি না চেক করা
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

    // ২. যদি render.yml সরাসরি লাইভ ফ্রেম পার্সেন্টেজ পাঠিয়ে থাকে, সেটাই দেখানো
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

    // ৩. ফলব্যাক: GitHub Actions API থেকে বর্তমান রানের স্টেপ অনুযায়ী পার্সেন্টেজ বের করা
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

        // রানার চালু থাকলে কোন স্টেপ চলছে তা চেক করা
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

// ফাইল সাইজ বা Multer এরর ধরার মিডলওয়্যার
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// বড় ফাইল আপলোডে টাইমআউট এড়াতে ২০ মিনিট লিমিট
server.requestTimeout = 20 * 60 * 1000;
server.headersTimeout = 20 * 60 * 1000;