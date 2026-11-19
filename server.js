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

// ফোল্ডার তৈরি (যদি না থাকে)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

app.use('/outputs', express.static(OUTPUTS_DIR));

const upload = multer({ dest: UPLOADS_DIR });
const jobs = {};

// ব্রাউজার UI (হোমপেজ)
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
    body { background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #1e293b; padding: 28px; border-radius: 16px; width: 100%; max-width: 440px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    h2 { margin-top: 0; font-size: 22px; text-align: center; color: #38bdf8; }
    .upload-box { border: 2px dashed #475569; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0; cursor: pointer; transition: 0.2s; }
    .upload-box:hover { border-color: #38bdf8; background: #0f172a; }
    input[type="file"] { display: none; }
    .file-name { font-size: 14px; color: #94a3b8; margin-top: 8px; word-break: break-all; }
    button { width: 100%; padding: 14px; border: none; border-radius: 10px; background: #0284c7; color: white; font-size: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; }
    button:hover { background: #0369a1; }
    button:disabled { background: #475569; cursor: not-allowed; }
    .status-box { margin-top: 20px; padding: 16px; border-radius: 10px; background: #0f172a; display: none; text-align: center; }
    .loader { border: 4px solid #334155; border-top: 4px solid #38bdf8; border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .download-btn { display: inline-block; margin-top: 12px; padding: 12px 20px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
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

  <script>
    const zipInput = document.getElementById('zipFile');
    const fileName = document.getElementById('fileName');
    const renderBtn = document.getElementById('renderBtn');
    const statusBox = document.getElementById('statusBox');
    const statusText = document.getElementById('statusText');
    const loader = document.getElementById('loader');
    const downloadLink = document.getElementById('downloadLink');

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

        statusText.textContent = 'রেন্ডারিং চলছে... (কিছুক্ষণ সময় লাগতে পারে)';
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

          if (data.status === 'completed') {
            clearInterval(interval);
            loader.style.display = 'none';
            statusText.textContent = '✅ ভিডিও রেন্ডার সম্পন্ন হয়েছে!';
            downloadLink.href = data.outputUrl;
            downloadLink.style.display = 'inline-block';
            renderBtn.disabled = false;
          } else if (data.status === 'failed') {
            clearInterval(interval);
            loader.style.display = 'none';
            statusText.textContent = '❌ রেন্ডার ব্যর্থ হয়েছে: ' + (data.error || 'অজানা ত্রুটি');
            renderBtn.disabled = false;
          } else {
            statusText.textContent = '⏳ প্রসেসিং চলছে: ' + data.status;
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

// এন্ট্রি পয়েন্ট খোঁজার ফাংশন
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

// রেন্ডার API
app.post('/render', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'কোনো ZIP ফাইল পাওয়া যায়নি' });

  const jobId = uuidv4();
  const extractDir = path.join(UPLOADS_DIR, jobId);
  jobs[jobId] = { status: 'extracting' };

  res.json({ id: jobId, message: 'Rendering started' });

  // ব্যাকগ্রাউন্ডে রেন্ডার প্রসেস
  (async () => {
    try {
      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(extractDir, true);
      fs.unlinkSync(req.file.path);

      // যদি ZIP এর ভেতরে একটি মেইন ফোল্ডার থাকে তবে সেটি হ্যান্ডেল করা
      let projectRoot = extractDir;
      const items = fs.readdirSync(extractDir);
      if (items.length === 1 && fs.statSync(path.join(extractDir, items[0])).isDirectory()) {
        projectRoot = path.join(extractDir, items[0]);
      }

      const entryPoint = findEntryPoint(projectRoot);
      if (!entryPoint) {
        throw new Error('প্রজেক্টে src/index.ts বা index.tsx ফাইল পাওয়া যায়নি');
      }

      jobs[jobId].status = 'bundling';
      const bundleLocation = await bundle({ entryPoint });

      jobs[jobId].status = 'selecting composition';
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'Main', // ডিফল্ট কম্পোজিশন আইডি না মিললে প্রথমটি নেওয়া হবে নিচে
      }).catch(async () => {
        const { getCompositions } = require('@remotion/renderer');
        const comps = await getCompositions(bundleLocation);
        if (!comps.length) throw new Error('কোনো Remotion Composition পাওয়া যায়নি');
        return comps[0];
      });

      jobs[jobId].status = 'rendering video';
      const outputFileName = `${jobId}.mp4`;
      const outputPath = path.join(OUTPUTS_DIR, outputFileName);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        chromiumOptions: {
          executablePath: process.env.REMOTION_CHROME_EXECUTABLE || '/usr/bin/google-chrome-stable',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });

      jobs[jobId] = {
        status: 'completed',
        outputUrl: `/outputs/${outputFileName}`,
      };
    } catch (err) {
      console.error('Render error:', err);
      jobs[jobId] = { status: 'failed', error: err.message };
    }
  })();
});

// স্ট্যাটাস চেক API
app.get('/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job পাওয়া যায়নি' });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});