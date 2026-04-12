CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `from_email` text NOT NULL,
  `subject` text NOT NULL,
  `category` text DEFAULT 'other' NOT NULL,
  `status` text DEFAULT 'new' NOT NULL,
  `ai_confidence` integer,
  `ai_draft` text,
  `final_response` text,
  `thread_id` text,
  `priority` text DEFAULT 'medium' NOT NULL,
  `assigned_to` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `resolved_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `support_tickets_status_idx` ON `support_tickets` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `support_tickets_from_email_idx` ON `support_tickets` (`from_email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `support_tickets_thread_id_idx` ON `support_tickets` (`thread_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `ticket_id` text NOT NULL,
  `direction` text NOT NULL,
  `from_address` text NOT NULL,
  `to_address` text NOT NULL,
  `body` text NOT NULL,
  `body_html` text,
  `sent_by_ai` integer DEFAULT 0 NOT NULL,
  `sent_at` integer NOT NULL,
  FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `support_messages_ticket_id_idx` ON `support_messages` (`ticket_id`);
