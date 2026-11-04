/*
 * ============================================================
 * SCHOOLNET
 * Notifications métier - Bulletins scolaires
 *
 * Événement :
 * - publication d'un bulletin
 *
 * Destinataires :
 * - élève concerné
 * - parent(s) rattaché(s) à l'élève
 *
 * Caractéristiques :
 * - compatible Realtime
 * - idempotent
 * - aucun doublon grâce à event_key
 * ============================================================
 */


/*
 * ============================================================
 * 1. PRODUCTEUR DE NOTIFICATIONS
 * ============================================================
 */

create or replace function public.notify_report_card_published()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_event_key text;
    v_student_name text;
    v_period_name text;
begin

    /*
     * --------------------------------------------------------
     * Nous ne faisons quelque chose que lorsque le bulletin
     * devient réellement publié.
     * --------------------------------------------------------
     */

    if new.status <> 'published' then
        return new;
    end if;


    /*
     * --------------------------------------------------------
     * UPDATE :
     * ne pas recréer une notification si le bulletin était
     * déjà publié avant cette modification.
     * --------------------------------------------------------
     */

    if tg_op = 'UPDATE'
       and old.status = 'published' then
        return new;
    end if;


    /*
     * --------------------------------------------------------
     * Données de présentation
     * --------------------------------------------------------
     */

    v_event_key :=
        'report_card_published:' || new.id::text;

    v_student_name :=
        coalesce(
            nullif(trim(new.student_name_snapshot), ''),
            'l''élève'
        );

    v_period_name :=
        coalesce(
            nullif(trim(new.period_name_snapshot), ''),
            'la période scolaire'
        );


    /*
     * ========================================================
     * 2. NOTIFICATION DE L'ÉLÈVE
     * ========================================================
     */

    insert into public.notifications (
        user_id,
        title,
        body,
        type,
        is_read,
        created_at,
        action_url,
        event_key,
        related_id,
        read_at
    )
    values (
        new.student_id,

        'Nouveau bulletin disponible',

        format(
            'Votre bulletin pour %s est maintenant disponible.',
            v_period_name
        ),

        'success'::public.notification_type,

        false,

        now(),

        '/app/student/report-cards',

        v_event_key,

        new.id,

        null
    )
    on conflict do nothing;


    /*
     * ========================================================
     * 3. NOTIFICATION DES PARENTS / TUTEURS
     * ========================================================
     */

    insert into public.notifications (
        user_id,
        title,
        body,
        type,
        is_read,
        created_at,
        action_url,
        event_key,
        related_id,
        read_at
    )
    select
        p.id,

        'Bulletin scolaire publié',

        format(
            'Le bulletin de %s pour %s est maintenant disponible.',
            v_student_name,
            v_period_name
        ),

        'success'::public.notification_type,

        false,

        now(),

        '/app/parent/report-cards',

        v_event_key,

        new.id,

        null

    from public.profiles p

    where p.role::text = 'parent'

      and new.student_id = any(
          coalesce(
              p.child_ids,
              '{}'::uuid[]
          )
      )

    on conflict do nothing;


    return new;

end;
$function$;


/*
 * ============================================================
 * 4. TRIGGER
 * ============================================================
 */

drop trigger if exists
    trg_notify_report_card_published
on public.report_cards;


create trigger trg_notify_report_card_published
after insert or update
on public.report_cards
for each row
execute function public.notify_report_card_published();


/*
 * ============================================================
 * 5. DROITS
 * ============================================================
 */

revoke all
on function public.notify_report_card_published()
from public;

revoke all
on function public.notify_report_card_published()
from anon;

revoke all
on function public.notify_report_card_published()
from authenticated;