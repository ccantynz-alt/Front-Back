-- BLK: URL acceleration onboarding path — non-developer entry to project creation.
-- Additive migration. All new columns are nullable so the existing GitHub/repo
-- flow is completely unaffected. Statement breakpoints are MANDATORY
-- (see CLAUDE.md §0.4.1 rule 6).

ALTER TABLE `projects` ADD COLUMN `source` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `origin_url` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `detected_stack` text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `projects_source_idx` ON `projects` (`source`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_origin_url_idx` ON `projects` (`origin_url`);
