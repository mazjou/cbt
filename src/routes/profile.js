const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Upload config for profile photos
const profileDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
fs.mkdirSync(profileDir, { recursive: true });

const storage = multer.memoryStorage(); // Use memory storage for compression

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// GET /profile - View profile
router.get('/', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.profile_photo, u.is_active, u.created_at, c.name AS class_name
       FROM users u
       LEFT JOIN classes c ON c.id = u.class_id
       WHERE u.id = :id
       LIMIT 1;`,
      { id: userId }
    );
    
    const user = rows && rows[0];
    if (!user) {
      req.flash('error', 'Pengguna tidak ditemukan.');
      return res.redirect('/dashboard');
    }
    
    // Update session with latest profile_photo if not present
    if (user.profile_photo && !req.session.user.profile_photo) {
      req.session.user.profile_photo = user.profile_photo;
    }
    
    res.render('profile/index', { 
      title: 'Profil Saya',
      profileUser: user
    });
  } catch (e) {
    console.error('Profile GET error:', e);
    req.flash('error', 'Gagal memuat profil.');
    res.redirect('/dashboard');
  }
});

// POST /profile/update - Update profile
router.post('/update', upload.single('profile_photo'), async (req, res) => {
  const { full_name, new_password, confirm_password } = req.body;
  const userId = req.session.user.id;
  
  try {
    const [rows] = await pool.query(
      `SELECT id, profile_photo FROM users WHERE id = :id LIMIT 1;`,
      { id: userId }
    );
    
    const user = rows && rows[0];
    if (!user) {
      req.flash('error', 'Pengguna tidak ditemukan.');
      return res.redirect('/profile');
    }
    
    let profile_photo = user.profile_photo;
    
    // Handle photo upload with compression
    if (req.file) {
      try {
        // Delete old photo if exists
        if (user.profile_photo) {
          const oldPhotoPath = path.join(profileDir, path.basename(user.profile_photo));
          if (fs.existsSync(oldPhotoPath)) {
            fs.unlinkSync(oldPhotoPath);
          }
        }
        
        // Generate unique filename
        const filename = `profile_${userId}_${Date.now()}.webp`;
        const filepath = path.join(profileDir, filename);
        
        // Compress and resize image using sharp
        await sharp(req.file.buffer)
          .resize(400, 400, {
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: 80 })
          .toFile(filepath);
        
        profile_photo = `/public/uploads/profiles/${filename}`;
      } catch (err) {
        console.error('Error processing image:', err);
        req.flash('error', 'Gagal memproses foto profil.');
        return res.redirect('/profile');
      }
    }
    
    // Validate password if provided
    if (new_password) {
      if (new_password !== confirm_password) {
        req.flash('error', 'Password baru dan konfirmasi password tidak cocok.');
        return res.redirect('/profile');
      }
      
      if (new_password.length < 6) {
        req.flash('error', 'Password minimal 6 karakter.');
        return res.redirect('/profile');
      }
      
      const password_hash = await bcrypt.hash(new_password, 10);
      
      await pool.query(
        `UPDATE users SET full_name = :full_name, profile_photo = :photo, password_hash = :hash WHERE id = :id;`,
        { full_name, photo: profile_photo, hash: password_hash, id: userId }
      );
    } else {
      await pool.query(
        `UPDATE users SET full_name = :full_name, profile_photo = :photo WHERE id = :id;`,
        { full_name, photo: profile_photo, id: userId }
      );
    }
    
    // Update session with new data
    req.session.user.full_name = full_name;
    req.session.user.profile_photo = profile_photo;
    
    req.flash('success', 'Profil berhasil diperbarui.');
    res.redirect('/profile');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui profil.');
    res.redirect('/profile');
  }
});

// POST /profile/delete-photo - Delete profile photo
router.post('/delete-photo', async (req, res) => {
  const userId = req.session.user.id;
  
  try {
    const [rows] = await pool.query(
      `SELECT id, profile_photo FROM users WHERE id = :id LIMIT 1;`,
      { id: userId }
    );
    
    const user = rows && rows[0];
    if (!user) {
      req.flash('error', 'Pengguna tidak ditemukan.');
      return res.redirect('/profile');
    }
    
    // Delete photo file if exists
    if (user.profile_photo) {
      const photoPath = path.join(profileDir, path.basename(user.profile_photo));
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }
    
    // Update database
    await pool.query(
      `UPDATE users SET profile_photo = NULL WHERE id = :id;`,
      { id: userId }
    );
    
    // Update session
    req.session.user.profile_photo = null;
    
    req.flash('success', 'Foto profil berhasil dihapus.');
    res.redirect('/profile');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus foto profil.');
    res.redirect('/profile');
  }
});

module.exports = router;
