-- BLK-024 OpenSRS domain registrar integration — `domain_registrations`.
-- Stores every domain Crontech has sold on a customer's behalf via the Tucows
-- OpenSRS reseller API. We persist both wholesale cost and retail markup at
-- sale time (in microdollars) so revenue reporting never re-queries the
-- registrar. `opensrs_handle` is the OpenSRS order id returned from
-- SW_REGISTER and is required for follow-up renewals / transfers.
-- Additive only: no existing tables or columns are touched or dropped.
--
-- See packages/db/src/schema.ts (domainRegistrations) for the Drizzle shape
-- and apps/api/src/trpc/procedures/domains.ts for the router that writes
-- these rows.

CREATE TABLE IF NOT EXISTS `domain_registrations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `domain` text NOT NULL,
  `tld` text NOT NULL,
  `registered_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `auto_renew` integer DEFAULT false NOT NULL,
  `opensrs_handle` text,
  `cost_microdollars` integer DEFAULT 0 NOT NULL,
  `markup_microdollars` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `domain_registrations_domain_unique` ON `domain_registrations` (`domain`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `domain_registrations_user_idx` ON `domain_registrations` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `domain_registrations_expires_idx` ON `domain_registrations` (`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `domain_registrations_status_idx` ON `domain_registrations` (`status`);
