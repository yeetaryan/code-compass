CREATE TYPE "public"."recovery_status" AS ENUM('pending', 'restored', 'dismissed', 'claimed', 'empty');--> statement-breakpoint
CREATE TABLE "legacy_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"source_email" text NOT NULL,
	"has_profile" boolean NOT NULL,
	"data" jsonb,
	"raw" jsonb,
	"source" text NOT NULL,
	"source_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "recovery_status" DEFAULT 'pending' NOT NULL,
	"restored_to" text,
	"restored_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"restored_via" text,
	"restored_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"legacy_user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_recovery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"legacy_user_id" text,
	"event" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_profiles" ADD CONSTRAINT "legacy_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_profiles" ADD CONSTRAINT "legacy_profiles_restored_to_users_id_fk" FOREIGN KEY ("restored_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_recovery_codes" ADD CONSTRAINT "profile_recovery_codes_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_recovery_codes" ADD CONSTRAINT "profile_recovery_codes_legacy_user_id_legacy_profiles_user_id_fk" FOREIGN KEY ("legacy_user_id") REFERENCES "public"."legacy_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_recovery_events" ADD CONSTRAINT "profile_recovery_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_profiles_source_email_uidx" ON "legacy_profiles" USING btree ("source_email");--> statement-breakpoint
CREATE INDEX "legacy_profiles_restored_to_idx" ON "legacy_profiles" USING btree ("restored_to");--> statement-breakpoint
CREATE INDEX "profile_recovery_codes_requester_idx" ON "profile_recovery_codes" USING btree ("requester_id","created_at");--> statement-breakpoint
CREATE INDEX "profile_recovery_events_user_idx" ON "profile_recovery_events" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "legacy";