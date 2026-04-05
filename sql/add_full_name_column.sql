-- Add full_name column to users table
ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL AFTER username;

-- Optional: Update existing data (copy from username if needed)
-- UPDATE users SET full_name = username WHERE full_name IS NULL;
