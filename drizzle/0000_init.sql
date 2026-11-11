CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('looking', 'open', 'busy');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('email', 'whatsapp', 'linkedin', 'x', 'github', 'website');--> statement-breakpoint
CREATE TYPE "public"."team_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('recruiting', 'full', 'closed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"college" text,
	"degree" text,
	"graduation_year" integer,
	"year_of_study" text,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"skills_key" text[] DEFAULT '{}'::text[] NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"interests_key" text[] DEFAULT '{}'::text[] NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"hackathon_interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"availability" "availability" DEFAULT 'open' NOT NULL,
	"projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_contact" "contact_channel",
	"whatsapp" text,
	"linkedin_url" text,
	"x_handle" text,
	"github_username" text,
	"website_url" text,
	"email_visible" boolean DEFAULT false NOT NULL,
	"whatsapp_visible" boolean DEFAULT false NOT NULL,
	"linkedin_visible" boolean DEFAULT true NOT NULL,
	"x_visible" boolean DEFAULT true NOT NULL,
	"github_visible" boolean DEFAULT true NOT NULL,
	"website_visible" boolean DEFAULT true NOT NULL,
	"discoverable" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp with time zone,
	"avatar_version" integer DEFAULT 0 NOT NULL,
	"legacy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"message" text,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"hackathon_name" text,
	"description" text NOT NULL,
	"needed_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"needed_skills_key" text[] DEFAULT '{}'::text[] NOT NULL,
	"needed_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"timeline" text,
	"max_members" integer DEFAULT 4 NOT NULL,
	"contact_link" text,
	"status" "team_status" DEFAULT 'recruiting' NOT NULL,
	"legacy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_uidx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "profiles_discovery_idx" ON "profiles" USING btree ("onboarded_at","discoverable");--> statement-breakpoint
CREATE INDEX "profiles_skills_key_gin" ON "profiles" USING gin ("skills_key");--> statement-breakpoint
CREATE INDEX "profiles_interests_key_gin" ON "profiles" USING gin ("interests_key");--> statement-breakpoint
CREATE INDEX "profiles_roles_gin" ON "profiles" USING gin ("roles");--> statement-breakpoint
CREATE INDEX "profiles_graduation_year_idx" ON "profiles" USING btree ("graduation_year");--> statement-breakpoint
CREATE INDEX "profiles_name_trgm" ON "profiles" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "profiles_created_at_idx" ON "profiles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_join_requests_one_pending_uidx" ON "team_join_requests" USING btree ("team_id","user_id") WHERE "team_join_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "team_join_requests_user_idx" ON "team_join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_owner_idx" ON "teams" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "teams_status_created_idx" ON "teams" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "teams_needed_skills_key_gin" ON "teams" USING gin ("needed_skills_key");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");