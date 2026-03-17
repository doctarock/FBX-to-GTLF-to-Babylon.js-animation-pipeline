const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { spawn } = require("child_process");
const archiver = require("archiver");

const app = express();
const PORT = process.env.PORT || 3080;

const ROOT = __dirname;
const TEMP_DIR = path.join(ROOT, "temp");
const UPLOAD_DIR = path.join(TEMP_DIR, "uploads");
const OUTPUT_DIR = path.join(TEMP_DIR, "output");

for (const dir of [TEMP_DIR, UPLOAD_DIR, OUTPUT_DIR]) fs.mkdirSync(dir, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024), files: 100 }
});

app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(ROOT, "public")));

function sanitizeBaseName(name) {
  return path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function pickBinaryPath() {
  const explicit = process.env.FBX2GLTF_PATH;
  if (explicit) return explicit;

  const exe = process.platform === "win32" ? "FBX2glTF.exe" : "FBX2glTF";
  const candidates = [
    path.join(ROOT, "bin", exe),
    path.join(ROOT, "tools", exe),
    path.join(ROOT, exe),
    exe
  ];

  for (const candidate of candidates) {
    if (candidate === exe) return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return exe;
}

function runConverter({ inputPath, outputPath, binaryPath }) {
  return new Promise((resolve, reject) => {
    const args = ["-i", inputPath, "-o", outputPath, "--binary", "--embed"];
    const child = spawn(binaryPath, args, { windowsHide: true, shell: false });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });

    child.on("error", err => reject(new Error(`Failed to start ${binaryPath}: ${err.message}`)));
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(`FBX2glTF exited with code ${code}\n${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function safeUnlink(filePath) { try { await fsp.unlink(filePath); } catch {} }
async function safeRm(targetPath) { try { await fsp.rm(targetPath, { recursive: true, force: true }); } catch {} }

app.get("/api/health", (_req, res) => {
  const binaryPath = pickBinaryPath();
  let binaryFound = false;
  if (path.isAbsolute(binaryPath) || binaryPath.includes(path.sep)) {
    binaryFound = fs.existsSync(binaryPath);
  } else {
    binaryFound = true;
  }
  res.json({ ok: true, binaryPath, binaryConfigured: binaryFound, platform: process.platform });
});

app.post("/api/convert", upload.array("files"), async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    res.status(400).json({ ok: false, error: "No FBX files uploaded." });
    return;
  }

  const binaryPath = pickBinaryPath();
  const batchId = crypto.randomUUID();
  const batchDir = path.join(OUTPUT_DIR, batchId);
  await fsp.mkdir(batchDir, { recursive: true });

  const results = [];

  try {
    for (const file of files) {
      const original = file.originalname || "model.fbx";
      const ext = path.extname(original).toLowerCase();
      if (ext !== ".fbx") {
        results.push({ file: original, ok: false, error: "Skipped: not an .fbx file" });
        await safeUnlink(file.path);
        continue;
      }

      const outName = sanitizeBaseName(original) + ".glb";
      const outPath = path.join(batchDir, outName);

      try {
        await runConverter({ inputPath: file.path, outputPath: outPath, binaryPath });
        results.push({
          file: original,
          ok: true,
          output: outName,
          assetUrl: `/api/asset/${batchId}/${encodeURIComponent(outName)}`
        });
      } catch (err) {
        results.push({ file: original, ok: false, error: err.message });
      } finally {
        await safeUnlink(file.path);
      }
    }

    const successful = results.filter(r => r.ok);
    if (!successful.length) {
      await safeRm(batchDir);
      res.status(500).json({ ok: false, error: "No files converted successfully.", binaryPath, results });
      return;
    }

    res.json({ ok: true, batchId, binaryPath, results });
  } catch (err) {
    await safeRm(batchDir);
    for (const file of files) await safeUnlink(file.path);
    res.status(500).json({ ok: false, error: err.message, binaryPath, results });
  }
});

app.get("/api/asset/:batchId/:name", (req, res) => {
  const batchId = path.basename(req.params.batchId);
  const name = path.basename(req.params.name);
  const filePath = path.join(OUTPUT_DIR, batchId, name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: "Asset not found." });
    return;
  }
  res.sendFile(filePath);
});

app.post("/api/finalize/:batchId", async (req, res) => {
  const batchId = path.basename(req.params.batchId);
  const batchDir = path.join(OUTPUT_DIR, batchId);
  if (!fs.existsSync(batchDir)) {
    res.status(404).json({ ok: false, error: "Batch not found." });
    return;
  }

  const payload = req.body || {};
  const extracted = Array.isArray(payload.extracted) ? payload.extracted : [];
  const conversionResults = Array.isArray(payload.results) ? payload.results : [];

  const zipName = `babylon-animation-library-${batchId}.zip`;
  const zipPath = path.join(OUTPUT_DIR, zipName);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);

    archive.append(JSON.stringify({
      createdAt: new Date().toISOString(),
      batchId,
      conversionResults,
      extracted
    }, null, 2), { name: "manifest.json" });

    archive.append(`export async function loadAnimationGroupFromJson(url, scene) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`Failed to fetch animation JSON: \${url}\`);
  const data = await res.json();
  return BABYLON.AnimationGroup.Parse(data, scene);
}
`, { name: "runtime-helper.js" });

    archive.append("# Babylon animation library\n\nGenerated by the one-shot FBX pipeline.\n", { name: "README.md" });

    for (const item of extracted) {
      if (!item || !item.source || !Array.isArray(item.clips)) continue;
      const sourceBase = item.sourceBase || sanitizeBaseName(item.source);
      for (const clip of item.clips) {
        if (!clip || !clip.fileName || !clip.json) continue;
        archive.append(JSON.stringify(clip.json, null, 2), {
          name: `animations/${sourceBase}/${clip.fileName}`
        });
      }
    }

    for (const file of fs.readdirSync(batchDir)) {
      archive.file(path.join(batchDir, file), { name: `converted/${file}` });
    }

    archive.finalize();
  });

  res.json({ ok: true, downloadUrl: `/api/download/${path.basename(zipPath)}` });

  setTimeout(async () => { await safeRm(batchDir); }, 60000);
});

app.get("/api/download/:name", async (req, res) => {
  const name = path.basename(req.params.name);
  const filePath = path.join(OUTPUT_DIR, name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: "Download not found." });
    return;
  }

  res.download(filePath, name, async () => {
    setTimeout(() => safeUnlink(filePath), 60000);
  });
});

app.listen(PORT, () => {
  console.log(`One-shot FBX pipeline running at http://localhost:${PORT}`);
  console.log(`Using converter binary: ${pickBinaryPath()}`);
});
