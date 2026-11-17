CREATE TABLE `traffic_feeds` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`snapshot_at` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`error` text
);
