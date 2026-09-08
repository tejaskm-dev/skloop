-- ============================================================================
-- Skloop migration 008: Loopy conversations, messages, and artifacts
-- ============================================================================
-- Loopy chat lived entirely in localStorage, so history was per-browser, could
-- not be shared, and vanished on a device change or a cleared cache.
--
-- Artifacts in particular need a server home: versioning, "update the artifact"
-- across turns, and letting the model reference an artifact's content later
-- without replaying the whole thing through the context window. This is how
-- Claude and ChatGPT store theirs.
--
-- Every table is owner-scoped by RLS: a row is readable and writable only by
-- the user whose id is on it.
-- ============================================================================

-- ── Conversations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loopy_conversations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       text NOT NULL DEFAULT 'New chat',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loopy_convos_user_updated
    ON public.loopy_conversations (user_id, updated_at DESC);

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loopy_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.loopy_conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content         text NOT NULL DEFAULT '',
    mood            text,
    -- Tool calls the assistant made on this turn, and their results. Kept so a
    -- reloaded conversation can be replayed to the model faithfully.
    tool_calls      jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loopy_messages_convo
    ON public.loopy_messages (conversation_id, created_at);

-- ── Artifacts ───────────────────────────────────────────────────────────────
-- current_version is denormalised so the panel can render without a join.
CREATE TABLE IF NOT EXISTS public.loopy_artifacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid REFERENCES public.loopy_conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Stable handle the model uses to address an artifact across turns
    -- ("update the sorting demo"), distinct from the surrogate uuid.
    slug            text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('code', 'markdown', 'html', 'svg', 'mermaid')),
    title           text NOT NULL DEFAULT 'Untitled',
    language        text,
    content         text NOT NULL DEFAULT '',
    current_version integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_loopy_artifacts_user
    ON public.loopy_artifacts (user_id, updated_at DESC);

-- ── Artifact versions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loopy_artifact_versions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id  uuid NOT NULL REFERENCES public.loopy_artifacts(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version      integer NOT NULL,
    content      text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (artifact_id, version)
);

CREATE INDEX IF NOT EXISTS idx_loopy_versions_artifact
    ON public.loopy_artifact_versions (artifact_id, version DESC);

-- ── RLS: strictly owner-scoped ──────────────────────────────────────────────
ALTER TABLE public.loopy_conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loopy_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loopy_artifacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loopy_artifact_versions  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'loopy_conversations', 'loopy_messages',
        'loopy_artifacts', 'loopy_artifact_versions'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
        EXECUTE format($f$
            CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (user_id = (SELECT auth.uid()))
                WITH CHECK (user_id = (SELECT auth.uid()))
        $f$, t || '_owner', t);
    END LOOP;
END $$;

REVOKE ALL ON public.loopy_conversations,
              public.loopy_messages,
              public.loopy_artifacts,
              public.loopy_artifact_versions
    FROM anon;

-- ── Atomic artifact upsert ──────────────────────────────────────────────────
-- Creating and updating an artifact are the same operation from the model's
-- point of view ("write this file"). Doing it in one statement keeps the
-- version counter correct when a turn writes the same artifact twice.
CREATE OR REPLACE FUNCTION public.upsert_loopy_artifact(
    p_conversation_id uuid,
    p_slug            text,
    p_kind            text,
    p_title           text,
    p_language        text,
    p_content         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id  uuid := auth.uid();
    v_id       uuid;
    v_version  integer;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- The conversation must belong to the caller.
    IF NOT EXISTS (
        SELECT 1 FROM loopy_conversations
        WHERE id = p_conversation_id AND user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Conversation not found');
    END IF;

    INSERT INTO loopy_artifacts (conversation_id, user_id, slug, kind, title, language, content)
    VALUES (p_conversation_id, v_user_id, p_slug, p_kind, p_title, p_language, p_content)
    ON CONFLICT (conversation_id, slug) DO UPDATE
        SET content         = EXCLUDED.content,
            title           = EXCLUDED.title,
            kind            = EXCLUDED.kind,
            language        = EXCLUDED.language,
            current_version = loopy_artifacts.current_version + 1,
            updated_at      = now()
    RETURNING id, current_version INTO v_id, v_version;

    INSERT INTO loopy_artifact_versions (artifact_id, user_id, version, content)
    VALUES (v_id, v_user_id, v_version, p_content)
    ON CONFLICT (artifact_id, version) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'id', v_id, 'version', v_version, 'slug', p_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_loopy_artifact(uuid, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_loopy_artifact(uuid, text, text, text, text, text) TO authenticated;
