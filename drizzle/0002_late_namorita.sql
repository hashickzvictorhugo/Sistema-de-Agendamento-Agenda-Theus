CREATE TABLE `admin_sessions` (
	`nonce` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_subject_expires` ON `admin_sessions` (`subject`,`expires_at`);