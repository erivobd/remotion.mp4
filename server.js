const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const WORK_DIR = path.join(__dirname, 'workspaces');
const OUT_DIR = path.join(__dirname, 'outputs');

[UPLOAD_DIR, WORK_DIR, OUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use('/outputs', express.static(OUT_DIR));
const upload = multer({ dest: UPLOAD_DIR });
const jobs = {};

function findCompositionId(projectDir) {
  const srcDir = path.join(projectDir, 'src');
  if (!fs.existsSync(srcDir)) return 'Main';
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const match = content.match(/<Composition[^>]*id=["']([^"']+)["']/);
    if (match && match[1]) return match[1];
  }
  return 'Main';
}

function findProjectRoot(baseDir) {
  if (fs.existsSync(path.join(baseDir, 'package.json'))) return baseDir;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('__MACOSX')) {
      const subPath = path.join(baseDir, entry.name);
      if (fs.existsSync(path.join(subPath, 'package.json'))) return subPath;
    }
  }
  return baseDir;
}

app.get('/api/ping', (req, res) => res.json({ status: 'online' }));

app.post('/api/render', upload.single('projectZip'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ZIP ফাইল পাওয়া যায়নি' });

  const jobId = uuidv4();
  const extractPath = path.join(WORK_DIR, jobId);
  fs.mkdirSync(extractPath, { recursive: true });

  jobs[jobId] = {
    status: 'extracting',
    progress: 'ZIP ফাইল আনজিপ হচ্ছে...',
    downloadUrl: null,
    error: null,
  };

  res.json({ jobId });

  try {
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(extractPath, true);
    fs.unlinkSync(req.file.path);

    const projectRoot = findProjectRoot(extractPath);
    const compositionId = findCompositionId(projectRoot);
    const entryPoint = fs.existsSync(path.join(projectRoot, 'src/index.ts'))
      ? 'src/index.ts'
      : 'src/index.tsx';
    const outputFileName = `${compositionId}-${jobId.slice(0, 6)}.mp4`;
    const outputFilePath = path.join(OUT_DIR, outputFileName);

    jobs[jobId].status = 'installing';
    jobs[jobId].progress = `প্যাকেজ ইনস্টল হচ্ছে (${compositionId})...`;

    const cmd = `npm install --no-audit --no-fund && npx remotion render ${entryPoint} ${compositionId} "${outputFilePath}" --browser-executable="/usr/bin/chromium"`;

    exec(cmd, { cwd: projectRoot, maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        jobs[jobId].status = 'failed';
        jobs[jobId].error = stderr || error.message;
        return;
      }
      jobs[jobId].status = 'completed';
      jobs[jobId].progress = 'MP4 রেন্ডার সম্পন্ন হয়েছে!';
      jobs[jobId].downloadUrl = `/outputs/${outputFileName}`;
      jobs[jobId].fileName = outputFileName;
    });

    setTimeout(() => {
      if (jobs[jobId]?.status === 'installing') {
        jobs[jobId].status = 'rendering';
        jobs[jobId].progress = 'ভিডিও ফ্রেমগুলো MP4-এ রেন্ডার হচ্ছে...';
      }
    }, 10000);
  } catch (err) {
    jobs[jobId].status = 'failed';
    jobs[jobId].error = err.message;
  }
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job পাওয়া যায়নি' });
  res.json(job);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Cloud Render Server running on ${PORT}`));
