CREATE TABLE IF NOT EXISTS `ui_components` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `category` text NOT NULL,
  `description` text NOT NULL,
  `descriptor_json` text NOT NULL,
  `registered_by` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ui_components_name_idx` ON `ui_components` (`name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ui_components_category_idx` ON `ui_components` (`category`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ui_components_active_idx` ON `ui_components` (`is_active`);
