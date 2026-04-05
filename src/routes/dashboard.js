const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  
  // Redirect all roles to their specific dashboards
  if (user.role === 'PRINCIPAL') {
    return res.redirect('/principal');
  }
  
  if (user.role === 'TEACHER') {
    return res.redirect('/teacher');
  }
  
  if (user.role === 'ADMIN') {
    return res.redirect('/admin');
  }
  
  if (user.role === 'STUDENT') {
    return res.redirect('/student');
  }
  
  // Fallback (should not reach here)
  res.redirect('/login');
});

module.exports = router;
