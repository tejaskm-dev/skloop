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

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Conversations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loopy_conversations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       text NOT NULL DEFAULT 'New chat',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);


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



-- ── Reconcile shape ─────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS is a no-op when the table already exists, even if
-- its shape is wrong. An aborted earlier run can therefore leave a table with
-- some columns missing, and every later statement that references one fails
-- with a bare "column does not exist".
--
-- These ALTERs bring an existing table up to the expected shape, so this
-- migration is safe to re-run over partial state rather than requiring a clean
-- slate. On a fresh database they are all no-ops.
DO $$
BEGIN
    IF to_regclass('public.loopy_conversations') IS NOT NULL THEN
        ALTER TABLE public.loopy_conversations
            ADD COLUMN IF NOT EXISTS user_id    uuid,
            ADD COLUMN IF NOT EXISTS title      text NOT NULL DEFAULT 'New chat',
            ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
            ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    END IF;

    IF to_regclass('public.loopy_messages') IS NOT NULL THEN
        ALTER TABLE public.loopy_messages
            ADD COLUMN IF NOT EXISTS conversation_id uuid,
            ADD COLUMN IF NOT EXISTS user_id         uuid,
            ADD COLUMN IF NOT EXISTS role            text,
            ADD COLUMN IF NOT EXISTS content         text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS mood            text,
            ADD COLUMN IF NOT EXISTS tool_calls      jsonb,
            ADD COLUMN IF NOT EXISTS created_at      timestamptz NOT NULL DEFAULT now();
    END IF;

    IF to_regclass('public.loopy_artifacts') IS NOT NULL THEN
        ALTER TABLE public.loopy_artifacts
            ADD COLUMN IF NOT EXISTS conversation_id uuid,
            ADD COLUMN IF NOT EXISTS user_id         uuid,
            ADD COLUMN IF NOT EXISTS slug            text,
            ADD COLUMN IF NOT EXISTS kind            text,
            ADD COLUMN IF NOT EXISTS title           text NOT NULL DEFAULT 'Untitled',
            ADD COLUMN IF NOT EXISTS language        text,
            ADD COLUMN IF NOT EXISTS content         text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS created_at      timestamptz NOT NULL DEFAULT now(),
            ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();
    END IF;

    IF to_regclass('public.loopy_artifact_versions') IS NOT NULL THEN
        ALTER TABLE public.loopy_artifact_versions
            ADD COLUMN IF NOT EXISTS artifact_id uuid,
            ADD COLUMN IF NOT EXISTS user_id     uuid,
            ADD COLUMN IF NOT EXISTS version     integer,
            ADD COLUMN IF NOT EXISTS content     text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();
    END IF;
END $$;

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Guarded the same way as migration 006. If a CREATE TABLE above was skipped
-- because the table already existed in a different shape, an unguarded
-- CREATE INDEX here would fail with a bare "column does not exist" and abort
-- the whole migration — which is precisely what happened on the first run.
DO $$
DECLARE
    specs text[][] := ARRAY[
        ARRAY['idx_loopy_convos_user_updated', 'loopy_conversations', 'user_id,updated_at',
              'CREATE INDEX IF NOT EXISTS idx_loopy_convos_user_updated ON public.loopy_conversations (user_id, updated_at DESC)'],
        ARRAY['idx_loopy_messages_convo', 'loopy_messages', 'conversation_id,created_at',
              'CREATE INDEX IF NOT EXISTS idx_loopy_messages_convo ON public.loopy_messages (conversation_id, created_at)'],
        ARRAY['idx_loopy_artifacts_user', 'loopy_artifacts', 'user_id,updated_at',
              'CREATE INDEX IF NOT EXISTS idx_loopy_artifacts_user ON public.loopy_artifacts (user_id, updated_at DESC)'],
        ARRAY['idx_loopy_versions_artifact', 'loopy_artifact_versions', 'artifact_id,version',
              'CREATE INDEX IF NOT EXISTS idx_loopy_versions_artifact ON public.loopy_artifact_versions (artifact_id, version DESC)']
    ];
    spec text[]; idx_name text; tbl text; cols text[]; ddl text; col text;
    missing text[];
BEGIN
    FOREACH spec SLICE 1 IN ARRAY specs LOOP
        idx_name := spec[1]; tbl := spec[2];
        cols := string_to_array(spec[3], ','); ddl := spec[4];
        missing := ARRAY[]::text[];

        IF to_regclass('public.' || tbl) IS NULL THEN
            RAISE NOTICE 'SKIP % — table public.% does not exist', idx_name, tbl;
            CONTINUE;
        END IF;

        FOREACH col IN ARRAY cols LOOP
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=tbl AND column_name=col
            ) THEN missing := missing || col; END IF;
        END LOOP;

        IF array_length(missing, 1) > 0 THEN
            RAISE NOTICE 'SKIP % — public.% missing: %', idx_name, tbl, array_to_string(missing, ', ');
            CONTINUE;
        END IF;

        BEGIN
            EXECUTE ddl;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'SKIP % — %', idx_name, SQLERRM;
        END;
    END LOOP;
END $$;

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
        -- Every policy keys off user_id, so skip rather than abort if a table
        -- is somehow still without it.
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'SKIP policy on % — table does not exist', t;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
        ) THEN
            RAISE NOTICE 'SKIP policy on % — no user_id column; the table is in an unexpected shape', t;
            CONTINUE;
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
        EXECUTE format($f$
            CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (user_id = (SELECT auth.uid()))
                WITH CHECK (user_id = (SELECT auth.uid()))
        $f$, t || '_owner', t);
        RAISE NOTICE 'policy ready on %', t;
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
