-- 043 — the intake, fixed after its review (039 is not edited: it is in the round's pull request, and a
-- change is a new file).
--
--   1. intake_device(token, device): which kind of device a link was made for (phone, tablet or desk),
--      told only to that device, for any status but open (intake_view names it when open). A clinic
--      tablet or the desk's handed-over device then says "Please hand the device back to the desk", never
--      "ask the desk for a new code", and the desk's device offers "For the clinic" on every closed page.
--   2. intake_decide: a photos form may be left for later ("Decide later"), unsigned, like any other form:
--      a minor's parent or guardian may not be there, and only they may say yes or no. 039 answered
--      'invalid', so the forms could never be sent. After Send the form is To sign on the record.
--   3. consent_attestation_check: what the patient said is required while their age is not known yet (a
--      new patient before page 1), unless the desk said they are 18 or over — the rule the app asks by
--      (attestDocument, ExplainForm). 039 let a null age through, and the app stored no answer it had asked.
--   4. The words' fingerprints (npm run consent:hash): a parent or guardian's sentence for the general
--      consent ("agree for Ana to be examined, and to have treatment …") and the photos ("… the photos
--      and records of Ana"), and "as described above" in every "do not agree" sentence. Set only on
--      versions no consent form uses yet (none, until 039's forms are used); a version already on a form
--      keeps 039's fingerprint and stops being offered (templatesInForce) — new words are a new version.
--
-- Nothing is dropped; grants on replaced functions stay as 039 set them.

-- ---------------------------------------------------------------------------
-- 1. Which device a link was for
-- ---------------------------------------------------------------------------
create or replace function intake_device(p_token text, p_device text)
returns text
language sql security definer stable set search_path = public as $$
  select l.device from intake_link l
   where p_token ~ '^[a-hjkmnp-z2-9]{26}$' and p_device ~ '^[0-9a-f]{64}$'
     and l.token = p_token and l.device_sha256 = p_device
$$;
revoke all on function intake_device(text, text) from public;
grant execute on function intake_device(text, text) to flossify_app;

-- ---------------------------------------------------------------------------
-- 2. A photos form may be left for later (039's intake_decide, without its photos exception)
-- ---------------------------------------------------------------------------
create or replace function intake_decide(p_token text, p_device text, p_document uuid, p_rev integer, p_decision text, p_page jsonb, p_snapshot text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare
  g record; i intake; l intake_link; d consent_document; v consent_version; a consent_attestation; pt patient;
  v_name text; v_as text; v_method text; v_rel text; v_auth text; v_ground text; v_note text; v_expl text; v_read text; v_init text;
  v_answers jsonb; v_strokes jsonb; v_over21 boolean; birth date; y integer; patient_name text; snap jsonb;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status <> 'open' then return g.status; end if;
  select * into i from intake where id = g.intake_id;
  select * into l from intake_link where intake_id = i.id and retired_at is null;
  select * into d from consent_document where id = p_document and intake_id = i.id and cancelled_at is null for update;
  if not found or p_decision is null or p_decision not in ('agreed', 'refused', 'later') then return 'invalid'; end if;
  select * into v from consent_version where id = d.version_id;
  if not consent_in_force(d.version_id) or p_rev is distinct from d.rev then return 'changed'; end if;
  if i.target = 'new' and i.page1_done_at is null then return 'order'; end if;
  select * into a from consent_attestation where document_id = d.id;
  if v.kind = 'document' and v.code <> 'photos' and a.id is null then return 'not_ready'; end if;

  begin
    if p_decision = 'later' then
      insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, opened_at, decided_at)
      values (i.id, d.id, i.clinic_id, 'later', d.rev, now(), now())
      on conflict (intake_id, document_id) do update set state = 'later', doc_rev = d.rev, answers = null, signed_by_name = null, signed_as = null,
        method = null, relation = null, authority = null, authority_ground = null, authority_note = null, explained_in = null, read_by = null,
        initials = null, strokes = null, snapshot = null, decided_at = now();
      insert into intake_event (clinic_id, intake_id, kind, document_id, detail) values (i.clinic_id, i.id, 'decided', d.id, 'later');
      return 'saved';
    end if;

    if p_page is null or jsonb_typeof(p_page) <> 'object' then return 'invalid'; end if;
    v_name := btrim(p_page ->> 'signed_by_name');
    v_as := p_page ->> 'signed_as';
    v_method := coalesce(p_page ->> 'method', 'sign');
    v_rel := nullif(btrim(coalesce(p_page ->> 'relation', '')), '');
    v_auth := p_page ->> 'authority';
    v_ground := p_page ->> 'authority_ground';
    v_note := p_page ->> 'authority_note';
    v_expl := nullif(btrim(coalesce(p_page ->> 'explained_in', '')), '');
    v_read := nullif(btrim(coalesce(p_page ->> 'read_by', '')), '');
    v_init := p_page ->> 'initials';
    v_answers := p_page -> 'answers';
    v_strokes := p_page -> 'strokes';
    if jsonb_typeof(v_strokes) = 'null' then v_strokes := null; end if;
    if jsonb_typeof(v_answers) = 'null' then v_answers := null; end if;
    v_over21 := coalesce((p_page ->> 'over21')::boolean, false);

    -- The patient: the name the server holds, and the age.
    if i.target = 'existing' then
      select * into pt from patient where id = i.patient_id;
      patient_name := person_name(pt.first_name, pt.middle_name, pt.last_name, pt.suffix);
      birth := pt.birth_date;
    else
      patient_name := person_name(i.answers ->> 'first_name', i.answers ->> 'middle_name', i.answers ->> 'last_name', i.answers ->> 'suffix');
      birth := consent_birth_date(null, i.id);
    end if;
    y := years_on(birth, (now() at time zone 'Asia/Manila')::date);
    if y is null then return 'invalid'; end if;
    if v.code = 'whitening' and y < 18 then return 'invalid'; end if;
    if v_name is null or char_length(v_name) not between 2 and 120 then return 'invalid'; end if;
    if v_as = 'patient' and v_name is distinct from patient_name then return 'invalid'; end if;
    if v_as = 'guardian' and (v_rel is null or char_length(v_rel) > 60) then return 'invalid'; end if;
    if consent_signer_problem(y < 18, l.device, v_as, v_method, v_auth, v_ground, v_note, i.patient_id, i.clinic_id) is not null then return 'invalid'; end if;
    if v_auth = 'substitute' and v_note in ('sibling_21', 'custodian_21') and not v_over21 then return 'invalid'; end if;
    if v.kind = 'document' and v.code <> 'photos' and v_expl is null then return 'invalid'; end if;
    if v_strokes is null then
      if not (v.code = 'photos' and p_decision = 'refused') then return 'invalid'; end if;
    elsif not consent_strokes_ok(v_strokes) then
      return 'invalid';
    end if;
    if p_snapshot is null or octet_length(p_snapshot) > 65536 then return 'invalid'; end if;
    snap := p_snapshot::jsonb;
    if jsonb_typeof(snap) <> 'object' or snap ->> 'document' is distinct from d.id::text or snap ->> 'version' is distinct from d.version_id
       or snap ->> 'decision' is distinct from p_decision or (snap -> 'fields') is distinct from d.fields
       or snap -> 'signer' ->> 'name' is distinct from v_name
       or (a.id is not null and (snap -> 'attested' ->> 'at') is distinct from to_char(a.attested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
      return 'invalid';
    end if;

    insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, answers, signed_by_name, signed_as, method, relation, authority,
                             authority_ground, authority_note, explained_in, read_by, initials, strokes, snapshot, opened_at, decided_at)
    values (i.id, d.id, i.clinic_id, p_decision, d.rev, v_answers, v_name, v_as, v_method, case when v_as = 'guardian' then v_rel end, v_auth,
            v_ground, v_note, v_expl, v_read, v_init, v_strokes, p_snapshot, null, now())
    on conflict (intake_id, document_id) do update set state = excluded.state, doc_rev = excluded.doc_rev, answers = excluded.answers,
      signed_by_name = excluded.signed_by_name, signed_as = excluded.signed_as, method = excluded.method, relation = excluded.relation,
      authority = excluded.authority, authority_ground = excluded.authority_ground, authority_note = excluded.authority_note,
      explained_in = excluded.explained_in, read_by = excluded.read_by, initials = excluded.initials, strokes = excluded.strokes,
      snapshot = excluded.snapshot, decided_at = excluded.decided_at;
    insert into intake_event (clinic_id, intake_id, kind, document_id, detail) values (i.clinic_id, i.id, 'decided', d.id, p_decision);
  exception when others then
    return 'invalid';
  end;
  return 'saved';
end $$;

-- ---------------------------------------------------------------------------
-- 3. What the patient said, while their age is not known yet (039's check, with that rule)
-- ---------------------------------------------------------------------------
create or replace function consent_attestation_check() returns trigger
language plpgsql set search_path = public as $$
declare d consent_document; v consent_version; who record; y integer; dm text;
begin
  select * into d from consent_document where id = new.document_id and clinic_id = new.clinic_id for update;
  if not found then raise exception 'consent_attestation: not this clinic''s form' using errcode = 'check_violation'; end if;
  select * into v from consent_version where id = d.version_id;
  if v.kind <> 'document' or v.code = 'photos' then
    raise exception 'consent_attestation: this form is not explained and confirmed by a dentist' using errcode = 'check_violation';
  end if;
  if d.cancelled_at is not null then raise exception 'consent_attestation: the form was cancelled' using errcode = 'check_violation'; end if;
  if d.paper_printed_at is not null or exists (select 1 from consent_signing s where s.document_id = d.id) then
    raise exception 'consent_attestation: the form was already signed or printed' using errcode = 'check_violation';
  end if;
  if new.dentist_id is distinct from d.dentist_id then
    raise exception 'consent_attestation: only the dentist named on the form confirms it' using errcode = 'insufficient_privilege';
  end if;
  select * into who from treating_dentist(new.dentist_id, new.clinic_id);
  if not found or who.prc is null then
    raise exception 'consent_attestation: a treating dentist here with a PRC licence confirms it' using errcode = 'insufficient_privilege';
  end if;
  y := years_on(consent_birth_date(d.patient_id, d.intake_id), (now() at time zone 'Asia/Manila')::date);
  if y is null then
    select i.desk_minor into dm from intake i where i.id = d.intake_id;
  end if;
  if new.assent is null and (y between 7 and 17 or (y is null and coalesce(dm, 'unsure') <> 'no')) then
    raise exception 'consent_attestation: say what the patient said (7 to 17, or the age not known yet)' using errcode = 'check_violation';
  end if;
  new.dentist_name := who.full_name;
  new.dentist_prc := who.prc;
  new.fields_sha256 := encode(sha256(convert_to(d.fields::text, 'UTF8')), 'hex');
  new.attested_at := date_trunc('milliseconds', now());
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The words' fingerprints
-- ---------------------------------------------------------------------------
do $$
declare want constant jsonb := '{
  "treatment-2026-09": "38af8e19b6ec81ff99ac77d0208c13f8ace2ef64f6d7827fd77f52b67f055e0f", "anaesthesia-2026-10": "8430620514d7d3a09f2ca391b890d17f3be80da6f14a31b86540282b5e3fdb5d",
  "extraction-2026-10": "769c27f7cf5a77ca87eaa993d7262d812a58d38afde2d1361e86c6a9570607ec", "root-canal-2026-10": "be47d164ef70dc21c246b859c9c1428fdf0ea734c04805eed0dce8ea9e01ede9",
  "restoration-2026-10": "bb4d10a22176f623e2725974219e8d26e21f90e711d03b467407b764c0105f3a", "periodontal-2026-10": "5349c8fcbe45cb6a1c4921d06105f69fec82d0723d9c9f682fa8d10ca4bb329e",
  "denture-2026-10": "cfa29d6c11b43bc1a27be8c49bbad0011d40a57c0362d0eaa1a2cd0ca404cf03", "implant-2026-10": "8833584fb3882b77810a32e2ad717107d9497e68736c6b665145a43dce457752",
  "ortho-2026-10": "d7bebf490151b61c88462b5814d07b3253e33afdf39ca3a36afbff508da748fd", "whitening-2026-10": "6a11c5e5b38dc27bb707f640a25f5932d05a27565398a4099d2b13fa57d794db",
  "photos-2026-10": "ede2cb1245956763860cae58062cfe1f100db54699cc03fe02bec2a20f6a1a07"}';
  k text;
begin
  for k in select jsonb_object_keys(want) loop
    if (want ->> k) !~ '^[0-9a-f]{64}$' then
      raise exception '043: the fingerprint of % is not filled in (npm run consent:hash)', k;
    end if;
    if not exists (select 1 from consent_version where id = k) then
      raise exception '043: consent_version % is missing', k;
    end if;
    if exists (select 1 from consent_document d where d.version_id = k) then
      if not exists (select 1 from consent_version where id = k and body_sha256 = want ->> k) then
        raise notice '043: % is on consent forms already; it keeps the words 039 pinned', k;
      end if;
    else
      update consent_version set body_sha256 = want ->> k where id = k;
    end if;
  end loop;
end $$;
