-- SCHOOLNET - read-only alignment inventory on the main schoolnet_2.0 database.
-- Safe to execute without modifying data. No Auth IDs or personal data returned.
SELECT p.slug,p.name AS catalogue_public,p.short_label AS code_scolaire,
       p.sort_order,l.id AS academic_level_id,l.order_index AS academic_sort_order,
       count(c.id) AS classes_existantes,
       CASE
         WHEN l.id IS NULL THEN 'niveau de gestion a synchroniser'
         WHEN count(c.id) = 0 THEN 'niveau configure, aucune classe creee'
         ELSE 'niveau configure, classe(s) existante(s)'
       END AS diagnostic
FROM public.public_levels p
LEFT JOIN public.levels l ON lower(btrim(l.name))=lower(btrim(p.short_label))
LEFT JOIN public.classes c ON c.level_id=l.id
WHERE p.is_visible
GROUP BY p.slug,p.name,p.short_label,p.sort_order,l.id,l.order_index
ORDER BY p.sort_order;