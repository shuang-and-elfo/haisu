const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = Number(process.env.PORT || 8820);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'docs');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media');
const DATA_FILE = path.join(PUBLIC_DIR, 'data', 'site-content.json');
const NOTES_FILE = path.join(ROOT_DIR, 'content-notes.md');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.m4a': 'audio/mp4'
};

const VALID_FOLDERS = new Set(['cover', 'orange-juice', 'big-brother', 'soccer']);

function readSiteContent() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeSiteContent(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  syncContentNotesMarkdown(data);
}

function findSlotById(data, slotId) {
  if (data.coverSlot && data.coverSlot.id === slotId) {
    return data.coverSlot;
  }
  for (const story of data.stories || []) {
    for (const slot of story.mediaSlots || []) {
      if (slot.id === slotId) return slot;
    }
  }
  return null;
}

function scanMediaFiles() {
  const result = {};
  for (const folder of VALID_FOLDERS) {
    const dir = path.join(MEDIA_DIR, folder);
    if (!fs.existsSync(dir)) {
      result[folder] = [];
      continue;
    }
    const files = fs.readdirSync(dir)
      .filter((f) => !f.startsWith('.') && !f.endsWith('-poster.jpg') && !f.endsWith('.vtt'))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return {
          name: f,
          url: `/media/${folder}/${encodeURIComponent(f)}`,
          sizeBytes: stat.size,
           updatedAt: stat.mtime.toISOString()
        };
      });
    result[folder] = files;
  }
  return result;
}

function syncContentNotesMarkdown(data) {
  const lines = [
    '# Haisu 的小世界 · 故事、原话与素材说明 (content-notes.md)',
    '',
    '> 本文件由系统与网页「素材整理模式 (Parent Prep Mode)」实时同步。',
    '> 每份素材记录五项信息：文件名、背景、发生了什么、原话与时间点、使用备注。',
    '',
    '---',
    '',
    '## 00 首页封面 (`public/media/cover/`)',
    `- **英文标题**: ${data.meta.titleEn}`,
    `- **中文标题**: ${data.meta.titleZh}`,
    `- **英文导语**: ${data.meta.subtitleEn}`,
    `- **中文导语**: ${data.meta.subtitleZh}`,
    '',
    '### 封面素材记录',
    formatSlotMarkdown(data.coverSlot),
    ''
  ];

  for (const story of data.stories || []) {
    lines.push('---', '');
    lines.push(`## ${story.number} ${story.titleZh} (${story.titleEn})`);
    lines.push('');
    lines.push('### 网站文案');
    lines.push(`- **EN**: ${(story.bodyEn || []).join(' ')}`);
    lines.push(`- **ZH**: ${(story.bodyZh || []).join(' ')}`);
    if (story.quote) {
      lines.push('');
      lines.push('### 保留原话');
      lines.push(`- **中文原话**: ${story.quote.zh}`);
      lines.push(`- **英文翻译**: ${story.quote.en}`);
      lines.push(`- **记录说明**: ${story.quote.attributionZh}`);
    }
    if (story.pendingChecks && story.pendingChecks.length > 0) {
      lines.push('');
      lines.push('### 待补充核实项 (`[待补充]`)');
      for (const check of story.pendingChecks) {
        const status = check.value && check.value.trim() ? `[x] 已记录: ${check.value.trim()}` : '[ ] 待补充';
        lines.push(`- ${status} — ${check.labelZh}`);
      }
    }
    lines.push('');
    lines.push(`### 素材清单 (\`public/media/${story.id}/\`)`);
    for (const slot of story.mediaSlots || []) {
      lines.push(formatSlotMarkdown(slot));
    }
    lines.push('');
  }

  fs.writeFileSync(NOTES_FILE, lines.join('\n'), 'utf8');
}

function formatSlotMarkdown(slot) {
  const n = slot.notes || {};
  const hasFile = Boolean(slot.src);
  return [
    `#### [${hasFile ? 'x' : ' '}] ${slot.labelZh} (\`${slot.id}\`)`,
    `- **文件名**: ${n.filename || (slot.src ? path.basename(slot.src) : '（待上传）')}`,
    `- **背景**: ${n.context || '（待补充）'}`,
    `- **发生了什么**: ${n.whatHappened || '（待补充具体动作）'}`,
    `- **原话与时间点**: ${n.quoteAndTimestamp || '（无或待补充）'}`,
    `- **使用备注**: ${n.usageNotes || '（无）'}`
  ].join('\n');
}

function sanitizeFilename(name) {
  const parsed = path.parse(name || 'media');
  const safeBase = parsed.name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'media';
  const safeExt = (parsed.ext || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  return { safeBase, safeExt, fullName: `${safeBase}${safeExt}` };
}

function processUploadedMedia(folder, savedFilePath, safeBase, safeExt) {
  const folderDir = path.join(MEDIA_DIR, folder);
  let webUrl = `/media/${folder}/${encodeURIComponent(path.basename(savedFilePath))}`;
  let posterUrl = '';
  let mediaType = 'image';

  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
  const videoExts = new Set(['.mp4', '.mov', '.m4v', '.webm']);

  if (safeExt === '.heic' || safeExt === '.heif') {
    const convertedName = `${safeBase}-web.jpg`;
    const convertedPath = path.join(folderDir, convertedName);
    try {
      execFileSync('/usr/bin/convert', [savedFilePath, '-auto-orient', '-quality', '90', convertedPath], { stdio: 'ignore' });
      if (fs.existsSync(convertedPath)) {
        webUrl = `/media/${folder}/${encodeURIComponent(convertedName)}`;
      }
    } catch (err) {
      console.error('HEIC conversion warning:', err.message);
    }
    mediaType = 'image';
  } else if (videoExts.has(safeExt)) {
    mediaType = 'video';
    // Short clips (e.g. iPhone Live Photos, < 4s) are presented as silent looping "live" frames
    try {
      const dur = parseFloat(execFileSync('/usr/bin/ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', savedFilePath
      ]).toString().trim());
      if (!Number.isNaN(dur) && dur > 0 && dur < 4) {
        mediaType = 'live';
      }
    } catch (err) {
      console.error('ffprobe duration warning:', err.message);
    }
    // Extract poster frame at 0.5s or 0s
    const posterName = `${safeBase}-poster.jpg`;
    const posterPath = path.join(folderDir, posterName);
    try {
      execFileSync('/usr/bin/ffmpeg', [
        '-y', '-ss', '00:00:00.500', '-i', savedFilePath,
        '-frames:v', '1', '-q:v', '3', posterPath
      ], { stdio: 'ignore' });
      if (!fs.existsSync(posterPath)) {
        execFileSync('/usr/bin/ffmpeg', [
          '-y', '-i', savedFilePath,
          '-frames:v', '1', '-q:v', '3', posterPath
        ], { stdio: 'ignore' });
      }
      if (fs.existsSync(posterPath)) {
        posterUrl = `/media/${folder}/${encodeURIComponent(posterName)}`;
      }
    } catch (err) {
      console.error('Poster extraction warning:', err.message);
    }

    // If .mov, transcode a browser-friendly H.264/AAC mp4 while preserving original .mov
    if (safeExt === '.mov') {
      const webMp4Name = `${safeBase}-web.mp4`;
      const webMp4Path = path.join(folderDir, webMp4Name);
      try {
        execFileSync('/usr/bin/ffmpeg', [
          '-y', '-i', savedFilePath,
          '-vf', "scale='min(1280,iw)':-2",
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          webMp4Path
        ], { stdio: 'ignore' });
        if (fs.existsSync(webMp4Path)) {
          webUrl = `/media/${folder}/${encodeURIComponent(webMp4Name)}`;
        }
      } catch (err) {
        console.error('MOV web transcode warning:', err.message);
      }
    }
  } else if (imageExts.has(safeExt)) {
    mediaType = 'image';
  }

  return { webUrl, posterUrl, mediaType };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function collectRequestBody(req, maxBytes = 500 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('File exceeds maximum allowed size (500MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (req.method === 'GET' && pathname === '/api/content') {
      const content = readSiteContent();
      const filesOnDisk = scanMediaFiles();
      return sendJson(res, 200, { content, filesOnDisk });
    }

    if (req.method === 'POST' && pathname === '/api/upload') {
      const slotId = parsedUrl.searchParams.get('slotId') || '';
      const rawFolder = parsedUrl.searchParams.get('folder') || 'cover';
      const folder = VALID_FOLDERS.has(rawFolder) ? rawFolder : 'cover';
      const origFilename = parsedUrl.searchParams.get('filename') || 'upload.jpg';

      const buffer = await collectRequestBody(req);
      if (!buffer || buffer.length === 0) {
        return sendJson(res, 400, { error: 'Empty upload payload' });
      }

      const { safeBase, safeExt, fullName } = sanitizeFilename(origFilename);
      const folderDir = path.join(MEDIA_DIR, folder);
      fs.mkdirSync(folderDir, { recursive: true });

      const savedFilePath = path.join(folderDir, fullName);
      fs.writeFileSync(savedFilePath, buffer);

      const { webUrl, posterUrl, mediaType } = processUploadedMedia(folder, savedFilePath, safeBase, safeExt);

      const data = readSiteContent();
      const slot = findSlotById(data, slotId);
      if (slot) {
        slot.src = webUrl;
        slot.type = mediaType;
        if (posterUrl) {
          slot.poster = posterUrl;
        }
        slot.notes = slot.notes || {};
        slot.notes.filename = fullName;
        writeSiteContent(data);
      }

      return sendJson(res, 200, {
        ok: true,
        slotId,
        savedAs: fullName,
        src: webUrl,
        poster: posterUrl,
        mediaType,
        content: data,
        filesOnDisk: scanMediaFiles()
      });
    }

    if (req.method === 'POST' && pathname === '/api/slot-update') {
      const bodyBuf = await collectRequestBody(req, 5 * 1024 * 1024);
      const payload = JSON.parse(bodyBuf.toString('utf8'));
      const data = readSiteContent();
      const slot = findSlotById(data, payload.slotId);
      if (!slot) {
        return sendJson(res, 404, { error: 'Slot not found' });
      }

      if (typeof payload.src === 'string') {
        slot.src = payload.src;
      }
      if (typeof payload.poster === 'string') {
        slot.poster = payload.poster;
      }
      if (payload.notes && typeof payload.notes === 'object') {
        slot.notes = {
          ...(slot.notes || {}),
          ...payload.notes
        };
      }
      if (typeof payload.subtitlesText === 'string') {
        const vttContent = payload.subtitlesText.trim();
        if (vttContent) {
          const vttBody = vttContent.startsWith('WEBVTT') ? vttContent : `WEBVTT\n\n${vttContent}`;
          const vttFilename = `${slot.id}.vtt`;
          const vttPath = path.join(MEDIA_DIR, slot.folder, vttFilename);
          fs.mkdirSync(path.dirname(vttPath), { recursive: true });
          fs.writeFileSync(vttPath, vttBody + '\n', 'utf8');
          slot.subtitlesVtt = `/media/${slot.folder}/${vttFilename}`;
          slot.subtitlesRaw = vttContent;
        } else {
          slot.subtitlesVtt = '';
          slot.subtitlesRaw = '';
        }
      }

      writeSiteContent(data);
      return sendJson(res, 200, { ok: true, content: data, filesOnDisk: scanMediaFiles() });
    }

    if (req.method === 'POST' && pathname === '/api/music') {
      const bodyBuf = await collectRequestBody(req, 64 * 1024);
      const payload = JSON.parse(bodyBuf.toString('utf8'));
      const track = String(payload.track || '').replace(/[^a-z0-9-]/g, '');
      const data = readSiteContent();
      const story = (data.stories || []).find((st) => st.id === payload.storyId);
      if (!story || !track) return sendJson(res, 400, { error: 'Bad request' });
      story.music = `/media/music/candidates/${track}.m4a`;
      writeSiteContent(data);
      return sendJson(res, 200, { ok: true, music: story.music });
    }

    if (req.method === 'POST' && pathname === '/api/content-update') {
      const bodyBuf = await collectRequestBody(req, 5 * 1024 * 1024);
      const payload = JSON.parse(bodyBuf.toString('utf8'));
      const data = readSiteContent();

      if (payload.storyId && payload.pendingCheckId !== undefined) {
        const story = (data.stories || []).find((s) => s.id === payload.storyId);
        if (story && story.pendingChecks) {
          const check = story.pendingChecks.find((c) => c.id === payload.pendingCheckId);
          if (check) {
            check.value = payload.value || '';
          }
        }
      }

      if (payload.storyId && payload.bodyEn && Array.isArray(payload.bodyEn)) {
        const story = (data.stories || []).find((s) => s.id === payload.storyId);
        if (story) {
          story.bodyEn = payload.bodyEn;
        }
      }

      if (payload.storyId && payload.bodyZh && Array.isArray(payload.bodyZh)) {
        const story = (data.stories || []).find((s) => s.id === payload.storyId);
        if (story) {
          story.bodyZh = payload.bodyZh;
        }
      }

      writeSiteContent(data);
      return sendJson(res, 200, { ok: true, content: data });
    }

    // Serve static files from PUBLIC_DIR
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Cache-Control': ['.html', '.json', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Haisu's World server listening on http://0.0.0.0:${PORT}`);
});
