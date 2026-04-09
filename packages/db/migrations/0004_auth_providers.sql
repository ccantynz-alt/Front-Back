-- Add Google OAuth and password authentication columns to users table
ALTER TABLE `users` ADD COLUMN `password_hash` text;
ALTER TABLE `users` ADD COLUMN `auth_provider` text;
ALTER TABLE `users` ADD COLUMN `google_id` text;
ALTER TABLE `users` ADD COLUMN `avatar_url` text;
