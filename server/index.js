const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── 인메모리 저장소 ──────────────────────────────────────
const users = new Set();          // 닉네임 Set
const livePosts = new Map();      // id → 공개 피드용 post 객체
const archivedPosts = new Map();  // username → Map<id, postSnapshot>

function getUserArchive(username) {
  if (!archivedPosts.has(username)) {
    archivedPosts.set(username, new Map());
  }
  return archivedPosts.get(username);
}

// ── 서버 TTL 관리 (1초마다 감소) ─────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, post] of livePosts.entries()) {
    const elapsed = (now - post.lastSync) / 1000;
    post.ttl -= elapsed;
    post.lastSync = now;
    const archive = getUserArchive(post.author);
    const archived = archive.get(id);
    if (archived) {
      archived.ttl = Math.max(0, post.ttl);
      archived.isExpired = false;
      archived.expiredAt = null;
    }
    if (post.ttl <= 0) {
      livePosts.delete(id);
      if (archived) {
        archived.ttl = 0;
        archived.isExpired = true;
        archived.expiredAt = now;
      }
    }
  }
}, 1000);

// ── 헬퍼: 클라이언트용 포스트 직렬화 ─────────────────────
function serializePost(post) {
  return {
    id: post.id,
    author: post.author,
    text: post.text,
    imageData: post.imageData,
    likes: post.likes,
    likedBy: Array.from(post.likedBy),
    ttl: Math.max(0, post.ttl),
    createdAt: post.createdAt,
    isExpired: Boolean(post.isExpired),
    expiredAt: post.expiredAt || null,
  };
}

function getLiveFeed() {
  return Array.from(livePosts.values())
    .filter(p => p.ttl > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializePost);
}

function getMyPosts(username) {
  if (!username || !users.has(username)) {
    return [];
  }

  return Array.from(getUserArchive(username).values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializePost);
}

function getFeedPayload(username) {
  return {
    livePosts: getLiveFeed(),
    myPosts: getMyPosts(username),
  };
}

// ── Auth ──────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ ok: false, message: '닉네임을 입력해주세요.' });
  }
  const name = username.trim();
  users.add(name);
  res.json({ ok: true, username: name });
});

// ── Posts ─────────────────────────────────────────────────
app.get('/api/posts', (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  res.json(getFeedPayload(username));
});

app.post('/api/posts', (req, res) => {
  const { username, text, imageData } = req.body;
  if (!username || !users.has(username)) {
    return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
  }
  if (!text && !imageData) {
    return res.status(400).json({ ok: false, message: '내용을 입력해주세요.' });
  }
  const post = {
    id: uuidv4(),
    author: username,
    text: text || '',
    imageData: imageData || null,
    likes: 0,
    likedBy: new Set(),
    ttl: 10,
    lastSync: Date.now(),
    createdAt: Date.now(),
    isExpired: false,
    expiredAt: null,
  };
  livePosts.set(post.id, post);
  getUserArchive(username).set(post.id, {
    ...post,
    likedBy: new Set(post.likedBy),
  });
  res.json({ ok: true, ...getFeedPayload(username) });
});

app.post('/api/posts/:id/like', (req, res) => {
  const { username } = req.body;
  const post = livePosts.get(req.params.id);

  if (!post) return res.status(404).json({ ok: false, message: '포스트를 찾을 수 없습니다.' });
  if (!username || !users.has(username)) {
    return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
  }
  if (post.likedBy.has(username)) {
    return res.status(400).json({ ok: false, message: '이미 좋아요를 눌렀습니다.' });
  }

  post.likedBy.add(username);
  post.likes += 1;
  post.ttl += 3;
  const archived = getUserArchive(post.author).get(post.id);
  if (archived) {
    archived.likedBy = new Set(post.likedBy);
    archived.likes = post.likes;
    archived.ttl = post.ttl;
  }

  res.json({ ok: true, ...getFeedPayload(username) });
});

// ── Static 파일 서빙 ───────────────────────────────────────
app.use('/src', express.static(path.join(__dirname, '../src')));
app.use(express.static(path.join(__dirname, '../public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🔥 Flicker 서버 실행 중: http://localhost:${PORT}\n`);
});
