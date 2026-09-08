-- ============================================================================
-- Skloop security migration 007: revoke client writes to protected columns
-- ============================================================================
-- RUN THIS LAST — after migrations 001-006 AND after the new application code
-- is deployed.
--
-- This is the statement that actually closes the critical hole. Until it runs,
-- any authenticated user can still do:
--
--   supabase.from('profiles')
--     .update({ coins: 999999999, plan: 'pro', is_mentor: true })
--     .eq('id', myUserId)
--
-- It is split out from 001 so the rollout is zero-downtime: the additive
-- migrations and the new code can go out first, and this flips the switch once
-- nothing is writing these columns from the browser any more.
--
-- Rollback, if something was missed:
--   GRANT UPDATE ON public.profiles TO authenticated;
-- ============================================================================

REVOKE UPDATE ON public.profiles FROM authenticated, anon;

-- Only the cosmetic / preference columns the UI legitimately edits.
GRANT UPDATE (
    full_name,
    username,
    bio,
    avatar_url,
    banner_url,
    location,
    website,
    tracks,
    notification_preferences,
    ai_context_memory,
    updated_at
) ON public.profiles TO authenticated;

-- Columns deliberately NOT granted — server-only, reachable through the
-- SECURITY DEFINER RPCs in migrations 002 and 003:
--
--   coins, xp, level, streak, streak_shields   -- the economy
--   inventory, active_powers, equipped_*       -- items, boosts, cosmetics
--   is_mentor, role                            -- authorization
--   plan, plan_expires_at                      -- billing entitlement
--   last_seen                                  -- presence (was spoofable)
--   id, created_at                             -- identity

-- anon should never write profiles at all.
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO anon;

-- Privilege columns must not be settable at INSERT time either.
REVOKE INSERT ON public.profiles FROM authenticated, anon;
GRANT INSERT (id, full_name, username, avatar_url, tracks) ON public.profiles TO authenticated;
