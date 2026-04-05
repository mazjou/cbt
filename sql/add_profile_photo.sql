-- Add profile_photo column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) DEFAULT NULL AFTER full_name;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_profile_photo ON users(profile_photo);
