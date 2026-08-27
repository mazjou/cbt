

// ── SDMS Webhook Integration (auto-patched) ──────────────────
const { verifySDMS: _sdmsVerify, handleWebhook: _sdmsHandle, setupTables: _sdmsSetup } = require('./sdms-webhook');
_sdmsSetup().catch(e => console.error('[SDMS] Setup tabel gagal:', e.message));
app.post('/api/webhooks/sdms', _sdmsVerify, _sdmsHandle);
app.get('/api/webhooks/sdms/status', (_req, _res) => _res.json({ status: 'ok', time: new Date().toISOString() }));
// ── End SDMS ──────────────────────────────────────────────────



// ── SDMS Manual Sync (auto-patched) ──────────────────────────
const _sdmsSyncRouter = require('./sdms-sync-endpoint');
app.use(_sdmsSyncRouter);
// ── End SDMS Manual Sync ──────────────────────────────────────

