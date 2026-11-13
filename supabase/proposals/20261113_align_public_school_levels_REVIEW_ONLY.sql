-- SCHOOLNET | Alignment of academic levels with the existing public catalog.
-- REVIEW ONLY. This script has NOT been run on production or sandbox.
-- Explicit production authorization, backup and preflight required before execution.
-- Source of truth: public.public_levels. Destination: public.levels (BIGINT PK).
-- Never changes public.public_levels, public.classes or any enrollment.
-- Preserves every existing level ID, including academic 6e ID 4.
-- Aligns order_index with public_levels.sort_order for predictable school ordering.
-- Safe to rerun if the catalog is unchanged; aborts on a conflicting or custom mapping.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Stabilize the source snapshot against concurrent catalog edits.
LOCK TABLE public.public_levels IN SHARE MODE;
LOCK TABLE public.levels IN SHARE ROW EXCLUSIVE MODE;

DO $schoolnet_level_align$
DECLARE
  v_existing_sixth_id BIGINT;
  v_classes_before BIGINT;
BEGIN
  SELECT id INTO v_existing_sixth_id
    FROM public.levels WHERE lower(btrim(name)) = '6e';
  SELECT count(*) INTO v_classes_before FROM public.classes;

  IF NOT EXISTS (SELECT 1 FROM public.public_levels WHERE is_visible) THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: empty public catalog';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.public_levels p
    WHERE p.is_visible AND (
      nullif(btrim(p.short_label),'') IS NULL
      OR p.short_label !~ '^[[:alnum:]]+$'
      OR p.sort_order IS NULL OR p.sort_order < 0
    )
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: invalid label or sort order';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.public_levels p WHERE p.is_visible
    GROUP BY lower(btrim(p.short_label)) HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.public_levels p WHERE p.is_visible
    GROUP BY p.sort_order HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: ambiguous public catalog';
  END IF;

  -- Do not overwrite any academic-only/custom level without a verified mapping.
  IF EXISTS (
    SELECT 1 FROM public.levels l
    WHERE NOT EXISTS (
      SELECT 1 FROM public.public_levels p
      WHERE p.is_visible AND lower(btrim(p.short_label)) = lower(btrim(l.name))
    )
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: unrecognized academic level';
  END IF;

  -- No target sort order may already belong to another academic level.
  IF EXISTS (
    SELECT 1
    FROM public.levels l
    JOIN public.public_levels p ON p.is_visible
      AND p.sort_order = l.order_index
    WHERE lower(btrim(p.short_label)) <> lower(btrim(l.name))
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: academic ordering conflict';
  END IF;

  -- Existing IDs remain unchanged. In current data 6e stays ID 4, and its
  -- order_index changes from 1 to 100; only missing labels are inserted.
  UPDATE public.levels l SET order_index = p.sort_order
    FROM public.public_levels p
    WHERE p.is_visible
      AND lower(btrim(l.name)) = lower(btrim(p.short_label))
      AND l.order_index IS DISTINCT FROM p.sort_order;

  INSERT INTO public.levels (name,order_index)
  SELECT btrim(p.short_label),p.sort_order
  FROM public.public_levels p
  WHERE p.is_visible
    AND NOT EXISTS (
      SELECT 1 FROM public.levels l
      WHERE lower(btrim(l.name)) = lower(btrim(p.short_label))
    )
  ORDER BY p.sort_order;

  IF EXISTS (
    SELECT 1 FROM public.public_levels p WHERE p.is_visible
      AND NOT EXISTS (
        SELECT 1 FROM public.levels l
        WHERE lower(btrim(l.name)) = lower(btrim(p.short_label))
          AND l.order_index = p.sort_order
      )
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: sync result incomplete';
  END IF;
  IF v_existing_sixth_id IS NOT NULL AND
     (SELECT id FROM public.levels WHERE lower(btrim(name))='6e')
        IS DISTINCT FROM v_existing_sixth_id THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: existing 6e ID changed';
  END IF;
  IF (SELECT count(*) FROM public.classes) <> v_classes_before THEN
    RAISE EXCEPTION 'SCHOOLNET_LEVELS_STOP: class count unexpectedly changed';
  END IF;
END;
$schoolnet_level_align$;
COMMIT;