CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_subject_created` ON `admin_audit_logs` (`subject`,`created_at`);--> statement-breakpoint
PRAGMA optimize;--> statement-breakpoint
CREATE TABLE `admin_login_limits` (
	`subject` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
