const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'erivobd';
const REPO_NAME = 'remotion.mp4';

// ১০০ এমবি পর্যন্ত ফাইল মেমোরিতে নেওয়ার অনুমতি
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

app.use(express.json({ limit: '100mb' }));

// ওয়েব অ্যাপের মূল ইন্টারফেস
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
    .card { background: #1e293b; padding: 24px; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); text-align: center; }
    h2 { margin-top: 0; color: #38bdf8; }
    input[type="file"], input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 8px; }
    button:disabled { background: #475569; cursor: not-allowed; }
    #status { margin-top: 16px; padding: 12px; border-radius: 8px; background: #0f172a; font-size: 14px; display: none; word-break: break-word; }
    a.download-btn { display: inline-block; margin-top: 10px; padding: 10px 16px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Remotion MP4 Renderer</h2>
    <input type="file" id="zipFile" accept=".zip" />
    <input type="text" id="compId" placeholder="Composition ID (ঐচ্ছিক, ফাঁকা রাখতে পারেন)" />
    <button id="renderBtn" onclick="startRender()">Render MP4 শুরু করুন</button>
    <div id="status"></div>
  </div>

  <script>
    async function startRender() {
      const fileInput = document.getElementById('zipFile');
      const compId = document.getElementById('compId').value.trim();
      const btn = document.getElementById('renderBtn');
      const statusDiv = document.getElementById('status');

      if (!fileInput.files.length) {
        alert('অনুগ্রহ করে একটি ZIP ফাইল সিলেক্ট করুন!');
        return;
      }

      const file = fileInput.files[0];
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

      const formData = new FormData();
      formData.append('projectZip', file);
      if (compId) formData.append('compositionId', compId);

      btn.disabled = true;
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = 'ZIP ফাইল (' + sizeMB + ' MB) আপলোড হচ্ছে... বড় ফাইল হলে একটু সময় লাগতে পারে।';

      try {
        const res = await fetch('/api/render', { method: 'POST', body: formData });
        const rawText = await res.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (parseErr) {
          throw new Error('সার্ভার রেসপন্স এরর (' + res.status + '): ফাইলটি অনেক বড় হওয়ায় বা সার্ভার রিস্টার্ট হওয়ায় সংযোগ বিচ্ছিন্ন হয়েছে। আবার চেষ্টা করুন।');
        }

        if (!res.ok) throw new Error(data.error || 'সমস্যা হয়েছে');

        statusDiv.innerHTML = 'রেন্ডারিং চলছে (Render ID: ' + data.renderId + ')... <br>২-৪ মিনিট অপেক্ষা করুন, অটোমেটিক ডাউনলোড লিংক চলে আসবে।';
        pollStatus(data.renderId);
      } catch (err) {
        statusDiv.innerHTML = '❌ এরর: ' + err.message;
        btn.disabled = false;
      }
    }

    function pollStatus(renderId) {
      const statusDiv = document.getElementById('status');
      const btn = document.getElementById('renderBtn');

      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/status/' + renderId);
          const data = await res.json();

          if (data.status === 'completed' && data.downloadUrl) {
            clearInterval(interval);
            btn.disabled = false;
            statusDiv.innerHTML = '✅ রেন্ডার সম্পন্ন হয়েছে!<br><a class="download-btn" href="' + data.downloadUrl + '">MP4 ডাউনলোড করুন</a>';
          }
        } catch (e) {}
      }, 10000);
    }
  </script>
</body>
</html>
  `);
});

// সরাসরি GitHub Release-এ ZIP আপলোড করে Workflow চালু করা
app.post('/api/render', upload.single('projectZip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'কোনো ZIP ফাইল পাওয়া যায়নি।' });
    }
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ error: 'সার্ভারে GITHUB_TOKEN সেট করা নেই।' });
    }

    const renderId = `rnd_${Date.now()}`;
    const compositionId = req.body.compositionId || '';

    // ১. GitHub-এ অস্থায়ী Release তৈরি করা
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
    const uploadUrl = relData.upload_url.replace('{?name,label}', `?name=project.zip`);

    // ২. ZIP ফাইলটি GitHub-এ আপলোড করা
    const assetRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/zip'
      },
      body: req.file.buffer
    });

    if (!assetRes.ok) {
      const errText = await assetRes.text();
      return res.status(assetRes.status).json({ error: `ZIP আপলোড হয়নি: ${errText}` });
    }

    const assetData = await assetRes.json();
    const zipUrl = assetData.browser_download_url;

    // ৩. GitHub Actions Workflow ট্রিগার করা
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

    res.json({ success: true, renderId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// রেন্ডার স্ট্যাটাস ও ডাউনলোড লিংক চেক করা
app.get('/api/status/:renderId', async (req, res) => {
  try {
    const { renderId } = req.params;
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/render-${renderId}`,
      {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json'
        }
      }
    );

    if (response.status === 404) {
      return res.json({ status: 'processing' });
    }

    const releaseData = await response.json();
    const mp4Asset = releaseData.assets?.find(a => a.name.endsWith('.mp4'));

    if (mp4Asset) {
      return res.json({
        status: 'completed',
        downloadUrl: mp4Asset.browser_download_url
      });
    }

    res.json({ status: 'processing' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ফাইল সাইজ বা Multer এরর ধরার মিডলওয়্যার
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});