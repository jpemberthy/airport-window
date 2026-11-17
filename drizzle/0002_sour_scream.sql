CREATE TABLE `route_observations` (
	`flight_leg_id` text PRIMARY KEY NOT NULL,
	`callsign` text NOT NULL,
	`flight_number` text NOT NULL,
	`origin_icao` text NOT NULL,
	`destination_icao` text NOT NULL,
	`verified_date` text NOT NULL,
	`first_received_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `route_observations_callsign_expiry` ON `route_observations` (`callsign`,`expires_at`);--> statement-breakpoint
CREATE INDEX `route_observations_expiry` ON `route_observations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `route_provider_state` (
	`key` text PRIMARY KEY NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`status` integer,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `exact_cache_hits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `learned_hits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `provider_successes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `provider_misses` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `pacing_denials` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `daily_denials` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `period_denials` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `rate_denials` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `upstream_429s` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_metrics` ADD `other_failures` integer DEFAULT 0 NOT NULL;