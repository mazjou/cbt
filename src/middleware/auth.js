function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash('error', 'Silakan login terlebih dahulu.');
      return res.redirect('/login');
    }
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
