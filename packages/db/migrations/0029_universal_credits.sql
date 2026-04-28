CREATE TABLE IF NOT EXISTS `credit_balances` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `balance_cents` integer NOT NULL DEFAULT 0,
  `lifetime_earned_cents` integer NOT NULL DEFAULT 0,
  `lifetime_spent_cents` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `credit_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `amount_cents` integer NOT NULL,
  `kind` text NOT NULL,
  `description` text NOT NULL,
  `reference_id` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_transactions_user_id_idx` ON `credit_transactions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_transactions_created_at_idx` ON `credit_transactions` (`created_at`);
