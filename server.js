const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'erivobd';
const REPO_NAME = 'remotion.mp4';

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));

// জিপ ফাইল আপলোড ও গিটহাব ওয়ার্কফ্লো ট্রিগার করার এন্ডপয়েন্ট
app.post('/api/render', upload.single('projectZip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'কোনো ZIP ফাইল পাওয়া যায়নি।' });
    }
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ error: 'সার্ভারে GITHUB_TOKEN সেট করা নেই।' });
    }

    const renderId = `rnd_${Date.now()}`;
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const zipUrl = `${hostUrl}/uploads/${req.file.filename}`;
    const compositionId = req.body.compositionId || '';

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/render.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
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

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `GitHub API Error: ${errText}` });
    }

    res.json({
      success: true,
      renderId,
      message: 'রেন্ডারিং শুরু হয়েছে! কিছুক্ষণ পর ডাউনলোড লিংক চেক করুন।'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// রেন্ডার স্ট্যাটাস ও ডাউনলোড লিংক চেক করার এন্ডপয়েন্ট
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});