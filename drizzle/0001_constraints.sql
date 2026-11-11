-- Defence-in-depth constraints. The API validates first; these stop bad data from any other writer.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_name_len" CHECK (char_length(name) BETWEEN 1 AND 80);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_bio_len" CHECK (bio IS NULL OR char_length(bio) <= 500);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tags_card" CHECK (cardinality(skills) <= 20 AND cardinality(interests) <= 12 AND cardinality(roles) <= 5 AND cardinality(hackathon_interests) <= 10);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_keys_match" CHECK (cardinality(skills) = cardinality(skills_key) AND cardinality(interests) = cardinality(interests_key));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_grad_year" CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1990 AND 2100);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_projects_array" CHECK (jsonb_typeof(projects) = 'array' AND jsonb_array_length(projects) <= 5);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_links_https" CHECK ((linkedin_url IS NULL OR linkedin_url LIKE 'https://www.linkedin.com/in/%') AND (website_url IS NULL OR website_url ~ '^https?://'));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_name_len" CHECK (char_length(name) BETWEEN 1 AND 80);--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_description_len" CHECK (char_length(description) <= 1500);--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_max_members" CHECK (max_members BETWEEN 2 AND 12);--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_contact_https" CHECK (contact_link IS NULL OR contact_link LIKE 'https://%');--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_size" CHECK (byte_size <= 307200 AND mime_type IN ('image/webp', 'image/jpeg', 'image/png'));--> statement-breakpoint
-- exactly one owner row per team
CREATE UNIQUE INDEX "team_members_one_owner_uidx" ON "team_members" ("team_id") WHERE role = 'owner';
