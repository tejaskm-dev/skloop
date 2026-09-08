-- ============================================================================
-- Skloop security migration 003: server-authoritative mentor status
-- ============================================================================
-- is_mentor is an AUTHORIZATION column — mentorship-actions.ts gates
-- "Only mentors can publish sessions" and "Only mentors can generate vouch
-- codes" on it. It was writable from the browser, and /mentorship/test both
-- graded its own quiz client-side and granted the status client-side.
--
-- Migration 001 revoked that write. These RPCs are the sanctioned paths back,
-- and each one enforces its OWN precondition internally, so exposing them to
-- `authenticated` is safe: calling one directly still can't skip the check.
--
-- Run after 001.
-- ============================================================================

-- Shared tail: flip the flag and ensure a mentor_profiles row exists.
CREATE OR REPLACE FUNCTION public._grant_mentor(p_user_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE profiles SET is_mentor = true, role = 'Mentor' WHERE id = p_user_id;

    INSERT INTO mentor_profiles (id, path)
    VALUES (p_user_id, p_path)
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Internal helper only — never callable by a client.
REVOKE ALL ON FUNCTION public._grant_mentor(uuid, text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Veteran path: requires level >= 10, read from the database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_mentor_via_veteran()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_level   integer;
    v_xp      integer;
    v_mentor  boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not logged in');
    END IF;

    SELECT level, COALESCE(xp, 0), COALESCE(is_mentor, false)
      INTO v_level, v_xp, v_mentor
      FROM profiles WHERE id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    IF v_mentor THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are already a mentor');
    END IF;

    v_level := COALESCE(v_level, FLOOR(v_xp / 500.0) + 1);

    IF v_level < 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('You need to be level 10 to apply. You are level %s.', v_level)
        );
    END IF;

    PERFORM _grant_mentor(v_user_id, 'veteran');
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Vouch path: validates AND consumes the code in one atomic statement, so the
-- same code cannot be redeemed twice by concurrent callers. The previous
-- server action did a separate SELECT-then-UPDATE, which raced.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_mentor_via_vouch(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_code_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not logged in');
    END IF;

    IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid code');
    END IF;

    UPDATE mentor_vouch_codes
       SET used_by = v_user_id, used_at = now()
     WHERE code = upper(trim(p_code))
       AND used_by IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     RETURNING id INTO v_code_id;

    IF v_code_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'That code is invalid, expired, or already used'
        );
    END IF;

    PERFORM _grant_mentor(v_user_id, 'vouch');
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Test path: the answer key lives here, server-side. The quiz used to be
-- graded in the browser against a key shipped in the client bundle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_mentor_via_test(p_answers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid    := auth.uid();
    v_key     integer[] := ARRAY[1, 0, 2, 1];
    v_score   integer := 0;
    i         integer;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not logged in');
    END IF;

    IF p_answers IS NULL OR array_length(p_answers, 1) IS DISTINCT FROM array_length(v_key, 1) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid submission');
    END IF;

    FOR i IN 1 .. array_length(v_key, 1) LOOP
        IF p_answers[i] = v_key[i] THEN
            v_score := v_score + 1;
        END IF;
    END LOOP;

    IF v_score < 3 THEN
        RETURN jsonb_build_object('success', false, 'passed', false, 'score', v_score);
    END IF;

    PERFORM _grant_mentor(v_user_id, 'test');
    RETURN jsonb_build_object('success', true, 'passed', true, 'score', v_score);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_mentor_via_veteran()          FROM public, anon;
REVOKE ALL ON FUNCTION public.grant_mentor_via_vouch(text)        FROM public, anon;
REVOKE ALL ON FUNCTION public.grant_mentor_via_test(integer[])    FROM public, anon;

GRANT EXECUTE ON FUNCTION public.grant_mentor_via_veteran()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_mentor_via_vouch(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_mentor_via_test(integer[]) TO authenticated;
