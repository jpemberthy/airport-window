CREATE TABLE `route_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`credits` integer NOT NULL,
	`reserved` integer NOT NULL,
	`settled` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credits_time` ON `route_credits` (`created_at`);--> statement-breakpoint
CREATE TABLE `route_metrics` (
	`day` text PRIMARY KEY NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`cache_hits` integer DEFAULT 0 NOT NULL,
	`covered` integer DEFAULT 0 NOT NULL,
	`denied` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`provider_calls` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL
);
