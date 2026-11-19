const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const HISTORY_FILE = path.join(__dirname, 'history.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));

app.use('/outputs', express.static(OUTPUTS_DIR));
app.use(express.json());

const upload = multer({ dest: UPLOADS_DIR });
const jobs = {};

function getHistory() {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const list = JSON.parse(data);
    return list.filter(item => fs.existsSync(path.join(OUTPUTS_DIR, item.fileName)));
  } catch (e) {
    return [];
  }
}

function addToHistory(entry) {
  const list = getHistory();
  list.unshift(entry);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2));
}

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remotion MP4 Renderer</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; min-height: 100vh; margin: 0; padding: 20px 16px; }
    .card { background: #1e293b; padding: 24px; border-radius: 16px; width: 100%; max-width: 460px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); margin-bottom: 20px; }
    h2 { margin-top: 0; font-size: 21px; text-align: center; color: #38bdf8; }
    h3 { margin-top: 0; font-size: 17px; color: #e2e8f0; border-bottom: 1px solid #334155; padding-bottom: 10px; }
    .upload-box { border: 2px dashed #475569; border-radius: 12px; padding: 22px; text-align: center; margin: 18px 0; cursor: pointer; transition: 0.2s; display: block; }
    .upload-box:hover { border-color: #38bdf8; background: #0f172a; }
    input[type="file"] { display: none; }
    .file-name { font-size: 14px; color: #94a3b8; margin-top: 8px; word-break: break-all; }
    button { width: 100%; padding: 14px; border: none; border-radius: 10px; background: #0284c7; color: white; font-size: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; }
    button:hover { background: #0369a1; }
    button:disabled { background: #475569; cursor: not-allowed; }
    .status-box { margin-top: 18px; padding: 16px; border-radius: 10px; background: #0f172a; display: none; text-align: center; }
    .loader { border: 4px solid #334155; border-top: 4px solid #38bdf8; border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .download-btn { display: inline-block; margin-top: 12px; padding: 10px 18px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .history-item { background: #0f172a; padding: 12px 14px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .history-info { overflow: hidden; }
    .history-title { font-size: 14px; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-time { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .mini-dl { padding: 8px 12px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap; }
    .empty-msg { text-align: center; color: #64748b; font-size: 14px; padding: 10px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🎬 Remotion MP4 Renderer</h2>
    <label class="upload-box" for="zipFile">
      <div>📁 Remotion প্রজেক্টের <b>.zip</b> ফাইল সিলেক্ট করুন</div>
      <div class="file-name" id="fileName">কোনো ফাইল সিলেক্ট করা হয়নি</div>
      <input type="file" id="zipFile" accept=".zip" />
    </label>
    <button id="renderBtn" disabled>Render MP4 শুরু করুন</button>
    <div class="status-box" id="statusBox">
      <div class="loader" id="loader"></div>
      <div id="statusText">আপলোড হচ্ছে...</div>
      <a id="downloadLink" class="download-btn" style="display:none;" download>⬇️ ভিডিও ডাউনলোড করুন</a>
    </div>
  </div>

  <div class="card">
    <h3>📜 রেন্ডার হিস্ট্রি (Render History)</h3>
    <div id="historyList">
      <div class="empty-msg">লোড হচ্ছে...</div>
    </div>
  </div>

  <script>
    const zipInput = document.getElementById('zipFile');
    const fileName = document.getElementById('fileName');
    const renderBtn = document.getElementById('renderBtn');
    const statusBox = document.getElementById('statusBox');
    const statusText = document.getElementById('statusText');
    const loader = document.getElementById('loader');
    const downloadLink = document.getElementById('downloadLink');
    const historyList = document.getElementById('historyList');

    async function loadHistory() {
      try {
        const res = await fetch('/history');
        const items = await res.json();
        if (!items || items.length === 0) {
          historyList.innerHTML = '<div class="empty-msg">এখনো কোনো ভিডিও রেন্ডার করা হয়নি</div>';
          return;
        }
        historyList.innerHTML = items.map(item => \`
          <div class="history-item">
            <div class="history-info">
              <div class="history-title">🎥 \${item.originalName}</div>
              <div class="history-time">\${item.createdAt}</div>
            </div>
            <a href="\${item.outputUrl}" class="mini-dl" download="\${item.downloadName}">⬇️ MP4</a>
          </div>
        \`).join('');
      } catch (e) {
        historyList.innerHTML = '<div class="empty-msg">হিস্ট্রি লোড করতে সমস্যা হয়েছে</div>';
      }
    }

    loadHistory();

    zipInput.addEventListener('change', () => {
      if (zipInput.files.length > 0) {
        fileName.textContent = zipInput.files[0].name;
        renderBtn.disabled = false;
      }
    });

    renderBtn.addEventListener('click', async () => {
      const file = zipInput.files[0];
      if (!file) return;

      renderBtn.disabled = true;
      statusBox.style.display = 'block';
      loader.style.display = 'block';
      downloadLink.style.display = 'none';
      statusText.textContent = 'ফাইল আপলোড হচ্ছে...';

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/render', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'আপলোড ব্যর্থ হয়েছে');

        statusText.textContent = 'রেন্ডারিং শুরু হয়েছে...';
        checkStatus(data.id);
      } catch (err) {
        loader.style.display = 'none';
        statusText.textContent = '❌ ত্রুটি: ' + err.message;
        renderBtn.disabled = false;
      }
    });

    function checkStatus(jobId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/status/' + jobId);
          const data = await res.json();

          if (!res.ok) {
            clearInterval(interval);
            loader.style.display = 'none';
            statusText.textContent = '❌ সার্ভার রিস্টার্ট হয়েছে (সম্ভবত মেমোরি লিমিট অতিক্রম করেছে)। আবার চেষ্টা করুন।';
            renderBtn.disabled = false;
            return;
          }

          if (data.status === 'completed') {
            clearInterval(interval);
            loader.style.display = 'none';
            statusText.textContent = '✅ ভিডিও রেন্ডার সম্পন্ন হয়েছে!';
            downloadLink.href = data.outputUrl;
            downloadLink.setAttribute('download', data.downloadName || 'video.mp4');
            downloadLink.style.display = 'inline-block';
            renderBtn.disabled = false;
            loadHistory();
          } else if (data.status === 'failed') {
            clearInterval(interval);
            loader.style.display = 'none';
            statusText.textContent = '❌ রেন্ডার ব্যর্থ হয়েছে: ' + (data.error || 'অজানা ত্রুটি');
            renderBtn.disabled = false;
          } else {
            statusText.textContent = '⏳ প্রসেসিং চলছে: ' + (data.status || 'অপেক্ষা করুন...');
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
  </script>
</body>
</html>
  `);
});

app.get('/history', (req, res) => {
  res.json(getHistory());
});

function findEntryPoint(dir) {
  const candidates = [
    path.join(dir, 'src', 'index.ts'),
    path.join(dir, 'src', 'index.tsx'),
    path.join(dir, 'src', 'index.js'),
    path.join(dir, 'index.ts'),
    path.join(dir, 'index.tsx'),
    path.join(dir, 'index.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

app.post('/render', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'কোনো ZIP ফাইল পাওয়া যায়নি' });

  const jobId = uuidv4();
  const originalName = req.file.originalname || 'project.zip';
  const baseName = originalName.replace(/\.zip$/i, '');
  const extractDir = path.join(UPLOADS_DIR, jobId);
  jobs[jobId] = { status: 'extracting' };

  res.json({ id: jobId, message: 'Rendering started' });

  (async () => {
    try {
      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(extractDir, true);
      fs.unlinkSync(req.file.path);

      let projectRoot = extractDir;
      const items = fs.readdirSync(extractDir);
      if (items.length === 1 && fs.statSync(path.join(extractDir, items[0])).isDirectory()) {
        projectRoot = path.join(extractDir, items[0]);
      }

      const entryPoint = findEntryPoint(projectRoot);
      if (!entryPoint) {
        throw new Error('প্রজেক্টে src/index.ts বা index.tsx ফাইল পাওয়া যায়নি');
      }

      jobs[jobId].status = 'bundling (মেমোরি সেভিং মোড)';
      const bundleLocation = await bundle({ entryPoint });

      jobs[jobId].status = 'selecting composition';
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'Main',
      }).catch(async () => {
        const { getCompositions } = require('@remotion/renderer');
        const comps = await getCompositions(bundleLocation);
        if (!comps.length) throw new Error('কোনো Remotion Composition পাওয়া যায়নি');
        return comps[0];
      });

      jobs[jobId].status = 'rendering video';
      const outputFileName = `${jobId}.mp4`;
      const outputPath = path.join(OUTPUTS_DIR, outputFileName);
      const outputUrl = `/outputs/${outputFileName}`;
      const downloadName = `${baseName}.mp4`;

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        concurrency: 1, // ফ্রি সার্ভারের 512MB RAM বাঁচানোর জন্য
        outputLocation: outputPath,
        chromiumOptions: {
          executablePath: process.env.REMOTION_CHROME_EXECUTABLE || '/usr/bin/google-chrome-stable',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      });

      const now = new Date().toLocaleString('en-BD', {
        timeZone: 'Asia/Dhaka',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      addToHistory({
        id: jobId,
        originalName,
        downloadName,
        fileName: outputFileName,
        outputUrl,
        createdAt: now,
      });

      jobs[jobId] = {
        status: 'completed',
        outputUrl,
        downloadName,
      };
    } catch (err) {
      console.error('Render error:', err);
      jobs[jobId] = { status: 'failed', error: err.message };
    }
  })();
});

app.get('/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job পাওয়া যায়নি' });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});