create type "public"."publication_status" as enum ('published', 'unpublished');

create table "public"."publications" (
    "id" bigint generated by default as identity not null,
    "editor_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "file_url" text,
    "task_name" text,
    "labels_name" text,
    "author" text,
    "contact" text,
    "status" publication_status
);


alter table "public"."publications" enable row level security;

alter table "public"."assignments" add column "annotator_number" bigint not null default '0'::bigint;

CREATE INDEX assignments_temp_annotator_idx ON public.assignments USING btree (annotator_number);

CREATE INDEX publications_editor_id_idx ON public.publications USING btree (editor_id);

CREATE UNIQUE INDEX publications_pkey ON public.publications USING btree (id);

alter table "public"."publications" add constraint "publications_pkey" PRIMARY KEY using index "publications_pkey";

alter table "public"."publications" add constraint "publications_editor_id_fkey" FOREIGN KEY (editor_id) REFERENCES users(id) not valid;

alter table "public"."publications" validate constraint "publications_editor_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_all_annotators_from_task(t_id numeric)
 RETURNS TABLE(id uuid, email text, role user_roles, annotator_number integer)
 LANGUAGE sql
AS $function$
  SELECT u.*, a.annotator_number
  FROM tasks as t
  INNER JOIN assignments as a
  ON (t.id = a.task_id and t.id = t_id)
  LEFT JOIN users as u
  ON (a.annotator_id = u.id)
  GROUP BY u.id, a.annotator_number
  ORDER BY annotator_number
$function$
;

CREATE OR REPLACE FUNCTION public.get_all_docs_from_task(t_id integer)
 RETURNS SETOF documents
 LANGUAGE sql
AS $function$
  SELECT DISTINCT d.*
  FROM documents as d
  INNER JOIN assignments as a ON (a.document_id = d.id)
  WHERE a.task_id = t_id
  GROUP BY d.id
  ORDER BY d.id
$function$
;

CREATE OR REPLACE FUNCTION public.get_unannotated_documents(task_id_param bigint)
 RETURNS TABLE(document_id bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT a.document_id
    FROM assignments a
    JOIN tasks t ON a.task_id = t.id
    WHERE t.id = task_id_param
    AND NOT EXISTS (
        SELECT 1
        FROM annotations an
        WHERE an.assignment_id = a.id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$function$
;

grant delete on table "public"."publications" to "anon";

grant insert on table "public"."publications" to "anon";

grant references on table "public"."publications" to "anon";

grant select on table "public"."publications" to "anon";

grant trigger on table "public"."publications" to "anon";

grant truncate on table "public"."publications" to "anon";

grant update on table "public"."publications" to "anon";

grant delete on table "public"."publications" to "authenticated";

grant insert on table "public"."publications" to "authenticated";

grant references on table "public"."publications" to "authenticated";

grant select on table "public"."publications" to "authenticated";

grant trigger on table "public"."publications" to "authenticated";

grant truncate on table "public"."publications" to "authenticated";

grant update on table "public"."publications" to "authenticated";

grant delete on table "public"."publications" to "service_role";

grant insert on table "public"."publications" to "service_role";

grant references on table "public"."publications" to "service_role";

grant select on table "public"."publications" to "service_role";

grant trigger on table "public"."publications" to "service_role";

grant truncate on table "public"."publications" to "service_role";

grant update on table "public"."publications" to "service_role";

create policy "Enable insert for everyone"
on "public"."publications"
as permissive
for insert
to public
with check (true);


create policy "Enable read access for all users"
on "public"."publications"
as permissive
for select
to public
using (true);


create policy "Enable update for users based on email"
on "public"."tasks"
as permissive
for update
to public
using (true)
with check (true);



