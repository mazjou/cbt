const pool = require('../db/pool');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.user) {
      req.flash('error', 'Silakan login terlebih dahulu.');
      return res.redirect('/login');
    }
    // Refresh role dari DB agar perubahan role langsung berlaku tanpa logout
    try {
      const result = await pool.query('SELECT role FROM users WHERE id=$1 LIMIT 1', [req.session.user.id]);
      const dbRole = result[0]?.[0]?.role || result.rows?.[0]?.role;
      if (dbRole && dbRole !== req.session.user.role) {
        req.session.user.role = dbRole;
      }
    } catch (_) { /* abaikan error DB, lanjut dengan session role */ }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: 'Akses ditolak',
        message: 'Anda tidak memiliki akses ke halaman ini.',
        user: req.session.user
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
