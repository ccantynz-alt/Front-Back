CREATE TABLE IF NOT EXISTS `tenants` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `plan` text DEFAULT 'free' NOT NULL,
  `owner_email` text NOT NULL,
  `custom_domain` text,
  `status` text DEFAULT 'provisioning' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tenants_slug_unique` ON `tenants` (`slug`);
