const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const fs = require('fs/promises');
const os = require('os');
const http = require('http');
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const flash = require('connect-flash');
const morgan = require('morgan');
const helmet = require('helmet');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');
const principalRoutes = require('./routes/principal');
const notificationRoutes = require('./routes/notifications');
const liveClassesRoutes = require('./routes/live-classes');
const quizApiRoutes = require('./routes/quiz-api');
const questionBankRoutes = require('./routes/question_bank');
const profileRoutes = require('./routes/profile');

const pool = require('./db/pool');
const { autoSubmitMiddleware, autoSubmitAllExpired } = require('./middleware/auto-submit');

const app = express();

const APP_NAME = process.env.APP_NAME || os.hostname();
const APP_IP = process.env.APP_IP || 'unknown';
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const RUN_SCHEDULER = process.env.RUN_SCHEDULER === '1';
const SESSION_NAME = process.env.SESSION_NAME || 'connect.sid';
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(__dirname, 'public', 'uploads');
const AUTO_SUBMIT_MIDDLEWARE_ENABLED = process.env.AUTO_SUBMIT_MIDDLEWARE_ENABLED !== '0';
const ONLINE_ZSET_KEY = process.env.ONLINE_ZSET_KEY || 'online_users_zset';
const ONLINE_USER_KEY_PREFIX = process.env.ONLINE_USER_KEY_PREFIX || 'online_user:';
const ONLINE_TTL_SECONDS = Number(process.env.ONLINE_TTL_SECONDS || 180);

let redisClient = null;
let isRedisConnected = false;
let autoSubmitJob = null;
let server = null;
let sessionMiddleware = null;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.locals.pool = pool;

function getClientIp(req) {
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];

  if (typeof xRealIp === 'string' && xRealIp.trim()) return xRealIp.trim();
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) return xForwardedFor.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function resolveOnlineIdentity(sessionUser, sessionId) {
  if (!sessionUser) return null;

  const rawId =
    sessionUser.id ??
    sessionUser.user_id ??
    sessionUser.student_id ??
    sessionUser.teacher_id ??
    sessionUser.nisn ??
    sessionUser.nis ??
    sessionUser.username ??
    sessionId;

  if (rawId === undefined || rawId === null || rawId === '') return null;

  const role = sessionUser.role || sessionUser.level || sessionUser.user_type || 'user';

  return {
    userKey: `${role}:${String(rawId)}`,
    id: String(rawId),
    role,
    username: sessionUser.username || null,
    displayName: sessionUser.full_name || sessionUser.name || sessionUser.username || null
  };
}

async function trackOnlineUser(req) {
  if (!redisClient || !isRedisConnected || !req.session?.user) return;

  const identity = resolveOnlineIdentity(req.session.user, req.sessionID);
  if (!identity) return;

  const now = Math.floor(Date.now() / 1000);
  const metaKey = `${ONLINE_USER_KEY_PREFIX}${identity.userKey}`;
  const payload = JSON.stringify({
    id: identity.id,
    role: identity.role,
    username: identity.username,
    displayName: identity.displayName,
    sessionId: req.sessionID || null,
    server: APP_NAME,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || null,
    lastSeen: now
  });

  await redisClient.multi()
    .zAdd(ONLINE_ZSET_KEY, [{ score: now, value: identity.userKey }])
    .setEx(metaKey, ONLINE_TTL_SECONDS + 30, payload)
    .zRemRangeByScore(ONLINE_ZSET_KEY, 0, now - ONLINE_TTL_SECONDS - 1)
    .exec();
}

async function getRuntimeStats() {
  let online180 = null;
  let activeExams = null;

  try {
    if (redisClient && isRedisConnected) {
      const now = Math.floor(Date.now() / 1000);
      online180 = await redisClient.zCount(ONLINE_ZSET_KEY, now - ONLINE_TTL_SECONDS, now);
    }
  } catch {
    online180 = null;
  }

  try {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM attempts
       WHERE status = 'IN_PROGRESS'
         AND (submission_status IS NULL OR submission_status <> 'SUBMITTED')`
    );
    activeExams = Number(row?.c || 0);
  } catch {
    activeExams = null;
  }

  return { online180, activeExams };
}

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    if (redisClient) {
      await redisClient.ping();
    }

    await fs.access(UPLOAD_ROOT);

    return res.status(200).json({
      ok: true,
      server: APP_NAME,
      ip: APP_IP,
      redis: !!redisClient && isRedisConnected,
      uploadRoot: UPLOAD_ROOT,
      time: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      server: APP_NAME,
      ip: APP_IP,
      error: error.message,
      time: new Date().toISOString()
    });
  }
});

const compression = require('compression');

app.use(compression({ level: 6, threshold: 1024 })); // Gzip semua response > 1KB
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(IS_PROD ? 'combined' : 'dev'));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/public/uploads', express.static(UPLOAD_ROOT, {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

// ── Rate limiting untuk endpoint ujian ──────────────────────────────────────
// Pakai Redis jika tersedia, fallback ke memory
const answerRateMap = new Map();
app.use('/student/attempts', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const userId = req.session?.user?.id;
  if (!userId) return next();

  // Gunakan Redis jika tersedia (scalable untuk PM2 cluster)
  if (redisClient && isRedisConnected) {
    const key = `rate:answer:${userId}`;
    redisClient.multi()
      .incr(key)
      .expire(key, 10)
      .exec()
      .then(([count]) => {
        if (count > 30) return res.status(429).json({ ok: false, message: 'Terlalu banyak request.' });
        next();
      })
      .catch(() => next()); // Jika Redis error, lanjutkan saja
    return;
  }

  // Fallback: memory rate limiting
  const now = Date.now();
  const entry = answerRateMap.get(userId) || { count: 0, resetAt: now + 10000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 10000; }
  entry.count++;
  answerRateMap.set(userId, entry);
  if (entry.count > 30) return res.status(429).json({ ok: false, message: 'Terlalu banyak request.' });
  next();
});
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of answerRateMap) {
    if (now > v.resetAt + 60000) answerRateMap.delete(k);
  }
}, 300000);

async function ensureUploadDirectories() {
  const dirs = ['questions', 'materials', 'profiles', 'assignments', 'imports'];
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  await Promise.all(dirs.map((dir) => fs.mkdir(path.join(UPLOAD_ROOT, dir), { recursive: true })));
}

async function initRedis() {
  if (!process.env.REDIS_HOST) {
    console.log('⚠️ REDIS_HOST tidak diset. Session akan memakai memory store.');
    return null;
  }

  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
      connectTimeout: 10000,
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 200, 3000);
        if (retries > 20) {
          console.error('❌ Redis reconnect berhenti: terlalu banyak retry');
          return new Error('Too many redis reconnect attempts');
        }
        return delay;
      }
    },
    password: process.env.REDIS_PASSWORD || undefined,
    disableOfflineQueue: true
  });

  client.on('error', (err) => {
    isRedisConnected = false;
    console.error('❌ Redis error:', err.message);
  });

  client.on('ready', () => {
    isRedisConnected = true;
    console.log('✅ Redis ready');
  });

  client.on('end', () => {
    isRedisConnected = false;
    console.log('⚠️ Redis connection ended');
  });

  await client.connect();
  redisClient = client;
  return client;
}

function buildSessionMiddleware() {
  const config = {
    name: SESSION_NAME,
    secret: process.env.SESSION_SECRET || 'ganti-session-secret-production',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 8
    }
  };

  if (redisClient) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: 'lms:sess:',
      ttl: 60 * 60 * 8
    });
    console.log('✅ Session store: Redis');
  } else {
    console.log('⚠️ Session store: memory (tidak disarankan untuk production multi-node)');
  }

  sessionMiddleware = session(config);
  return sessionMiddleware;
}

function registerRoutes() {
  app.use(sessionMiddleware);
  app.use(flash());

  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.flash = {
      error: req.flash('error'),
      success: req.flash('success'),
      info: req.flash('info')
    };
    next();
  });

  app.use((req, res, next) => {
    res.setHeader('X-App-Server', APP_NAME);
    res.setHeader('X-App-IP', APP_IP);
    next();
  });

  app.use(async (req, res, next) => {
    try {
      await trackOnlineUser(req);
    } catch (error) {
      console.error('[ONLINE-TRACKER] error:', error.message);
    }
    next();
  });

  app.get('/whoami', async (req, res) => {
    const runtime = await getRuntimeStats();
    res.status(200).json({
      server: APP_NAME,
      ip: APP_IP,
      hostname: os.hostname(),
      sessionId: req.sessionID || null,
      user: req.session?.user?.username || null,
      onlineTracked180s: runtime.online180,
      activeExams: runtime.activeExams
    });
  });

  app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    return res.redirect('/dashboard');
  });

  app.use(authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/profile', profileRoutes);
  app.use('/admin', adminRoutes);
  app.use('/teacher', teacherRoutes);
  app.use('/teacher/question-bank', questionBankRoutes);
  app.use('/api/question-bank', questionBankRoutes);
  app.use('/notifications', notificationRoutes);

  app.use('/api/subjects', async (req, res) => {
    try {
      const [subjects] = await pool.query('SELECT id, name FROM subjects ORDER BY name ASC');
      res.json(subjects);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  if (AUTO_SUBMIT_MIDDLEWARE_ENABLED) {
    app.use(autoSubmitMiddleware);
  }

  app.use('/student', studentRoutes);
  app.use('/principal', principalRoutes);
  app.use(liveClassesRoutes);
  app.use(quizApiRoutes);

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Halaman tidak ditemukan',
      message: 'URL yang Anda tuju tidak tersedia.',
      user: req.session.user
    });
  });
}

async function acquireRedisLock(key, value, ttlSeconds) {
  if (!redisClient) return true;

  const locked = await redisClient.set(key, value, {
    NX: true,
    EX: ttlSeconds
  });

  return !!locked;
}

async function releaseRedisLock(key, value) {
  if (!redisClient) return;

  try {
    const current = await redisClient.get(key);
    if (current === value) {
      await redisClient.del(key);
    }
  } catch (error) {
    console.error(`❌ Gagal release lock ${key}:`, error.message);
  }
}

function startAutoSubmitCron() {
  if (!RUN_SCHEDULER) {
    console.log('⏸️ Auto-submit cron dinonaktifkan di node ini');
    return;
  }

  autoSubmitJob = cron.schedule('*/5 * * * *', async () => {
    const lockValue = `${APP_NAME}-${Date.now()}`;

    try {
      const hasLock = await acquireRedisLock('lock:auto-submit', lockValue, 240);
      if (!hasLock) return;

      const result = await autoSubmitAllExpired();
      if (result?.processed > 0) {
        console.log(`[AUTO-SUBMIT] ✅ ${result.processed} attempt diproses oleh ${APP_NAME}`);
      }
    } catch (error) {
      console.error('[AUTO-SUBMIT] ❌ Error:', error.message);
    } finally {
      await releaseRedisLock('lock:auto-submit', lockValue);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Jakarta'
  });

  console.log(`⏰ Auto-submit cron aktif di ${APP_NAME}`);
}

async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} diterima. Shutdown graceful...`);

  try {
    if (autoSubmitJob) {
      autoSubmitJob.stop();
      console.log('✅ Auto-submit cron stopped');
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('✅ HTTP server closed');
    }

    if (redisClient) {
      await redisClient.quit();
      console.log('✅ Redis closed');
    }
  } catch (error) {
    console.error('❌ Error saat shutdown:', error.message);
  } finally {
    process.exit(0);
  }
}

async function bootstrap() {
  try {
    await ensureUploadDirectories();

    try {
      await initRedis();
      console.log('✅ Redis connected');
    } catch (error) {
      console.error('❌ Redis gagal connect:', error.message);
      console.log('⚠️ Melanjutkan dengan memory session store');
      redisClient = null;
      isRedisConnected = false;
    }

    buildSessionMiddleware();
    registerRoutes();

    server = http.createServer(app);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 120000;

    const { initializeSocket } = require('./socket');
    await initializeSocket(server, {
      redisClient,
      sessionMiddleware
    });

    server.listen(PORT, () => {
      console.log(`✅ ${APP_NAME} listening on ${PORT}`);
      console.log(`📡 APP_IP: ${APP_IP}`);
      console.log(`🗂️ UPLOAD_ROOT: ${UPLOAD_ROOT}`);
    });

    startAutoSubmitCron();
  } catch (error) {
    console.error('❌ Bootstrap gagal:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

bootstrap();
