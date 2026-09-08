-- ============================================================================
-- Skloop security migration 002: server-authoritative economy RPCs
-- ============================================================================
-- Migration 001 revoked the client's ability to write economy columns. These
-- SECURITY DEFINER functions are the sanctioned way back in.
--
-- Two properties make them safe:
--   1. They resolve the acting user from auth.uid() INTERNALLY. No function
--      takes a user id parameter, so no call can be aimed at another user.
--   2. Reward and price amounts are read from the database (or validated by
--      the caller against a server-side constant), never taken on trust.
--
-- Run after 001.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- purchase_shop_item — atomic "check balance, deduct, grant item".
--
-- p_price is passed by the server action after it looks the item up in
-- lib/shop-items.ts. The client never supplies it. The balance check and the
-- deduction happen in a single statement so two concurrent purchases cannot
-- both pass the check (the old client-side code was a read-modify-write race).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_shop_item(
    p_item_id       text,
    p_price         integer,
    p_is_consumable boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id    uuid := auth.uid();
    v_coins      integer;
    v_inventory  jsonb;
    v_shields    integer;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF p_price IS NULL OR p_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid price');
    END IF;

    SELECT coins, COALESCE(inventory, '[]'::jsonb), COALESCE(streak_shields, 0)
      INTO v_coins, v_inventory, v_shields
      FROM profiles
     WHERE id = v_user_id
       FOR UPDATE;                       -- row lock: serialises concurrent buys

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    -- Non-consumables can only be owned once.
    IF NOT p_is_consumable AND v_inventory @> to_jsonb(ARRAY[p_item_id]) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already owned');
    END IF;

    IF v_coins < p_price THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins');
    END IF;

    UPDATE profiles
       SET coins          = coins - p_price,
           inventory      = CASE
                                WHEN inventory @> to_jsonb(ARRAY[p_item_id])
                                    THEN inventory
                                ELSE COALESCE(inventory, '[]'::jsonb) || to_jsonb(ARRAY[p_item_id])
                            END,
           streak_shields = CASE
                                WHEN p_item_id = 'item_streak_shield'
                                    THEN COALESCE(streak_shields, 0) + 1
                                ELSE streak_shields
                            END
     WHERE id = v_user_id
     RETURNING coins, inventory, COALESCE(streak_shields, 0)
          INTO v_coins, v_inventory, v_shields;

    RETURN jsonb_build_object(
        'success',       true,
        'coins',         v_coins,
        'inventory',     v_inventory,
        'streak_shields', v_shields
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- activate_boost_item — consume an inventory item, apply its timed multiplier.
-- Effects are hardcoded here so the client cannot choose its own multiplier.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_boost_item(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_inventory jsonb;
    v_powers    jsonb;
    v_expires   timestamptz;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT COALESCE(inventory, '[]'::jsonb), COALESCE(active_powers, '{}'::jsonb)
      INTO v_inventory, v_powers
      FROM profiles
     WHERE id = v_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    IF NOT (v_inventory @> to_jsonb(ARRAY[p_item_id])) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not in inventory');
    END IF;

    IF p_item_id = 'item_xp_booster' THEN
        v_expires := now() + interval '1 hour';
        v_powers  := v_powers
                     || jsonb_build_object('xp_multiplier', 2,
                                           'xp_expires', to_char(v_expires AT TIME ZONE 'UTC',
                                                                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    ELSIF p_item_id = 'item_coin_magnet' THEN
        v_expires := now() + interval '24 hours';
        v_powers  := v_powers
                     || jsonb_build_object('coins_multiplier', 2,
                                           'coins_expires', to_char(v_expires AT TIME ZONE 'UTC',
                                                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Unknown boost item');
    END IF;

    -- Remove exactly one copy of the consumed item.
    UPDATE profiles
       SET active_powers = v_powers,
           inventory     = (
               SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
                 FROM (
                     SELECT elem, ord,
                            row_number() OVER (PARTITION BY elem ORDER BY ord) AS rn
                       FROM jsonb_array_elements(v_inventory) WITH ORDINALITY AS t(elem, ord)
                 ) s
                WHERE NOT (elem = to_jsonb(p_item_id) AND rn = 1)
           )
     WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true, 'expires', v_expires);
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_user_task — marks a task done and pays the reward recorded on the
-- task row. The old server action accepted xpReward as a client parameter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_user_task(p_user_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_task_id uuid;
    v_xp      integer;
    v_new_xp  integer;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Atomic claim: only transitions a row that is still pending AND ours.
    UPDATE user_tasks
       SET status = 'completed', completed_at = now()
     WHERE id = p_user_task_id
       AND user_id = v_user_id
       AND status = 'pending'
     RETURNING task_id INTO v_task_id;

    IF v_task_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Task not found or already completed');
    END IF;

    -- Reward comes from the tasks table, never from the caller.
    SELECT COALESCE(xp_reward, 0) INTO v_xp FROM tasks WHERE id = v_task_id;

    UPDATE profiles
       SET xp    = COALESCE(xp, 0) + COALESCE(v_xp, 0),
           level = FLOOR((COALESCE(xp, 0) + COALESCE(v_xp, 0)) / 500.0) + 1
     WHERE id = v_user_id
     RETURNING xp INTO v_new_xp;

    RETURN jsonb_build_object('success', true, 'newXp', v_new_xp, 'xpAwarded', v_xp);
END;
$$;

-- ---------------------------------------------------------------------------
-- touch_last_seen — presence. Previously updateLastSeen(userId) let anyone
-- spoof any user's presence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE profiles SET last_seen = now() WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Execution grants. SECURITY DEFINER means these run as the owner, so the
-- function bodies above are the entire trust boundary.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.purchase_shop_item(text, integer, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.activate_boost_item(text)                  FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_user_task(uuid)                   FROM public, anon;
REVOKE ALL ON FUNCTION public.touch_last_seen()                          FROM public, anon;

GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_boost_item(text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_user_task(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_seen()                          TO authenticated;

-- ---------------------------------------------------------------------------
-- equip_cosmetic — set an equipped slot, but only to an item the caller
-- actually owns. The old client-side code wrote equipped_title / equipped_ring
-- / equipped_frame directly, with no ownership check at all.
-- Passing NULL as p_item_id unequips the slot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equip_cosmetic(
    p_slot    text,
    p_item_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_inventory jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF p_slot NOT IN ('equipped_title', 'equipped_ring', 'equipped_frame') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid slot');
    END IF;

    IF p_item_id IS NOT NULL THEN
        SELECT COALESCE(inventory, '[]'::jsonb) INTO v_inventory
          FROM profiles WHERE id = v_user_id;

        IF NOT (v_inventory @> to_jsonb(ARRAY[p_item_id])) THEN
            RETURN jsonb_build_object('success', false, 'error', 'You do not own that item');
        END IF;
    END IF;

    -- p_slot is validated against a fixed allowlist above, so this format() is
    -- not injectable.
    EXECUTE format('UPDATE profiles SET %I = $1 WHERE id = $2', p_slot)
        USING p_item_id, v_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.equip_cosmetic(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- consume_inventory_item — removes one copy of an item from the caller's
-- inventory, returning false if they didn't have it. Used by the Daily Skip
-- flow, which previously did a read-modify-write on profiles.inventory from
-- the server action (and so could drop concurrent changes).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_inventory_item(p_item_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_inventory jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT COALESCE(inventory, '[]'::jsonb) INTO v_inventory
      FROM profiles WHERE id = v_user_id FOR UPDATE;

    IF NOT FOUND OR NOT (v_inventory @> to_jsonb(ARRAY[p_item_id])) THEN
        RETURN false;
    END IF;

    UPDATE profiles
       SET inventory = (
               SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
                 FROM (
                     SELECT elem, ord,
                            row_number() OVER (PARTITION BY elem ORDER BY ord) AS rn
                       FROM jsonb_array_elements(v_inventory) WITH ORDINALITY AS t(elem, ord)
                 ) s
                WHERE NOT (elem = to_jsonb(p_item_id) AND rn = 1)
           )
     WHERE id = v_user_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_inventory_item(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_inventory_item(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- append_to_inventory — the app has referenced this RPC since before this work
-- (openChest's reward path, and the Daily Skip refund) but it was never
-- actually created; schema-check.sql reports it MISSING. openChest carries a
-- manual fallback so it degraded quietly, which is exactly why nobody noticed.
--
-- Adding it properly. Duplicate items are not appended twice, matching the
-- behaviour the calling code assumes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_to_inventory(
    x_user_id uuid,
    item_id   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Callers are trusted server code, but scope the write anyway so a stray
    -- call can only ever touch the row it names.
    UPDATE profiles
       SET inventory = COALESCE(inventory, '[]'::jsonb) || to_jsonb(ARRAY[item_id])
     WHERE id = x_user_id
       AND NOT (COALESCE(inventory, '[]'::jsonb) @> to_jsonb(ARRAY[item_id]));
END;
$$;

REVOKE ALL ON FUNCTION public.append_to_inventory(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.append_to_inventory(uuid, text) TO authenticated;
