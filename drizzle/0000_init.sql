CREATE TABLE `offers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `rc_offer_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `comp_type` text,
  `book_by_date` text,
  `terms` text,
  `raw_json` text NOT NULL,
  `synced_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offers_rc_offer_id_uq` ON `offers` (`rc_offer_id`);
--> statement-breakpoint
CREATE INDEX `idx_offers_book_by` ON `offers` (`book_by_date`);
--> statement-breakpoint
CREATE TABLE `sailings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `offer_id` integer NOT NULL,
  `rc_sailing_id` text NOT NULL,
  `ship` text NOT NULL,
  `sail_date` text NOT NULL,
  `return_date` text,
  `nights` integer NOT NULL,
  `itinerary_name` text,
  `region` text,
  `departure_port` text,
  `ports_of_call` text,
  `stateroom_category` text,
  `price_after_offer` real,
  `taxes_fees` real,
  `raw_json` text NOT NULL,
  FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sailings_offer_rc_sailing_uq` ON `sailings` (`offer_id`,`rc_sailing_id`);
--> statement-breakpoint
CREATE INDEX `idx_sailings_sail_date` ON `sailings` (`sail_date`);
--> statement-breakpoint
CREATE INDEX `idx_sailings_ship` ON `sailings` (`ship`);
--> statement-breakpoint
CREATE INDEX `idx_sailings_region` ON `sailings` (`region`);
--> statement-breakpoint
CREATE INDEX `idx_sailings_nights` ON `sailings` (`nights`);
