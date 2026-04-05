CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `role` text DEFAULT 'viewer' NOT NULL,
  `passkey_credential_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE TABLE `credentials` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `credential_id` text NOT NULL,
  `public_key` blob NOT NULL,
  `counter` integer DEFAULT 0 NOT NULL,
  `device_type` text NOT NULL,
  `backed_up` integer DEFAULT false NOT NULL,
  `transports` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);

CREATE UNIQUE INDEX `credentials_credential_id_unique` ON `credentials` (`credential_id`);

CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);

CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);

CREATE TABLE `plans` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `stripe_price_id` text NOT NULL,
  `price` integer NOT NULL,
  `interval` text NOT NULL,
  `features` text,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `plans_stripe_price_id_unique` ON `plans` (`stripe_price_id`);

CREATE TABLE `subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `stripe_customer_id` text NOT NULL,
  `stripe_subscription_id` text NOT NULL,
  `stripe_price_id` text NOT NULL,
  `status` text NOT NULL,
  `current_period_start` integer NOT NULL,
  `current_period_end` integer NOT NULL,
  `cancel_at_period_end` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);

CREATE UNIQUE INDEX `subscriptions_stripe_subscription_id_unique` ON `subscriptions` (`stripe_subscription_id`);

CREATE TABLE `payments` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `stripe_payment_intent_id` text NOT NULL,
  `amount` integer NOT NULL,
  `currency` text DEFAULT 'usd' NOT NULL,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);

CREATE UNIQUE INDEX `payments_stripe_payment_intent_id_unique` ON `payments` (`stripe_payment_intent_id`);

CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `timestamp` text NOT NULL,
  `actor_id` text NOT NULL,
  `actor_ip` text,
  `actor_device` text,
  `action` text NOT NULL,
  `resource_type` text NOT NULL,
  `resource_id` text NOT NULL,
  `detail` text,
  `result` text NOT NULL,
  `session_id` text,
  `previous_hash` text,
  `entry_hash` text NOT NULL,
  `signature` text
);
