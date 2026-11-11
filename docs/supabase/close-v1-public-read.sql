-- Code Compass v1 (Supabase) — close the public-read leak
-- ---------------------------------------------------------------------------
-- WHAT IT FIXES
--   v1 created these policies:
--     "Users can view all profiles"  ON public.profiles FOR SELECT USING (true)
--     "Users can view all teams"     ON public.teams    FOR SELECT USING (true)
--   The anon key ships in the v1 JavaScript bundle, so anyone can read every row —
--   including WhatsApp numbers and X handles the owner marked as hidden (the
--   *_visible flags were only respected by the v1 frontend), and team WhatsApp
--   group links.
--
-- WHEN TO RUN
--   Right after v2 is live and code-compass-mu.vercel.app redirects to v2.
--   It breaks v1's Browse/Teams pages (they read other people's rows), so don't
--   run it while v1 is still the live app.
--
-- HOW
--   Supabase dashboard → SQL Editor → paste → Run. One transaction; nothing is
--   deleted. The project, tables and data stay exactly as they are.
-- ---------------------------------------------------------------------------

BEGIN;

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all teams"    ON public.teams;

-- Owners can still read their own rows (keeps v1 "My profile" working for anyone who lands there).
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view their own teams" ON public.teams
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;

-- VERIFY (should list only *own* SELECT policies, none with qual = 'true')
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('profiles', 'teams')
ORDER BY tablename, cmd;

-- Then, signed out, in a terminal (replace the two placeholders with the values from
-- the v1 app; the anon key is public anyway). Expect [] — an empty array:
--   curl "https://<project-ref>.supabase.co/rest/v1/profiles?select=id&limit=1" \
--        -H "apikey: <anon key>"

-- ROLLBACK (re-opens the leak — only if you must bring v1 back temporarily):
--   CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
--   CREATE POLICY "Users can view all teams"    ON public.teams    FOR SELECT USING (true);
