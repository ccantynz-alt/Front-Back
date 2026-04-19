-- BLK-023 Self-hosted DNS — authoritative zone + record storage.
-- `dns_zones` holds SOA parameters + NS delegation for each zone Crontech
-- serves. `dns_records` holds the individual resource records. The DNS
-- engine (services/dns-server) reads these tables on every query, so the
-- composite (zone_id, name, type) index is the hot path. `name, type` is
-- the cross-zone fallback for queries that arrive without zone context.
-- Serial on dns_zones is bumped whenever any record in the zone mutates.
-- Additive-only: no existing tables are touched or dropped.
--
-- See packages/db/src/schema.ts (dnsZones, dnsRecords) for the Drizzle shape
-- and packages/db/src/dns-store.ts for the read-side ZoneStore contract.

CREATE TABLE IF NOT EXISTS `dns_zones` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `admin_email` text NOT NULL,
  `primary_ns` text NOT NULL,
  `secondary_ns` text,
  `refresh_seconds` integer DEFAULT 3600 NOT NULL,
  `retry_seconds` integer DEFAULT 600 NOT NULL,
  `expire_seconds` integer DEFAULT 604800 NOT NULL,
  `minimum_ttl` integer DEFAULT 300 NOT NULL,
  `serial` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `dns_zones_name_unique` ON `dns_zones` (`name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dns_zones_name_idx` ON `dns_zones` (`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dns_records` (
  `id` text PRIMARY KEY NOT NULL,
  `zone_id` text NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `content` text NOT NULL,
  `ttl` integer DEFAULT 300 NOT NULL,
  `priority` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`zone_id`) REFERENCES `dns_zones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dns_records_zone_name_type_idx` ON `dns_records` (`zone_id`,`name`,`type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dns_records_name_type_idx` ON `dns_records` (`name`,`type`);
