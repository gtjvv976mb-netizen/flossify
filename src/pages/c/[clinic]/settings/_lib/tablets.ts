// Clinic tablets (the intake, 039; the spec §1.7(a)): a device the clinic keeps
// at the desk for patients to fill in and sign their forms. It holds no staff
// session: "Make this device a clinic tablet" posts to /auth/tablet/, which
// gives THIS browser a secret (fl_ctab, httpOnly, only under /f/, 180 days;
// kept hashed in clinic_tablet) and signs it out of the workspace — under
// /auth/ so the service worker drops the kept record copy — then it rests on
// /f/t/, "Ready for the next patient". The desk sends forms to it from an
// intake's Check step. Rename and remove post here. Needs settings.edit (the
// section's own `may`); audit tablet.add / tablet.remove / tablet.rename
// (src/lib/intake.ts). A refused add comes back as ?tablet_refused=<code>.
import { withClinic } from '../../../../../lib/db';
import { Refused } from '../../../../../lib/refused';
import { listTablets, removeTablet, renameTablet, TABLET_REFUSED, type Tablet, type TabletRefusal } from '../../../../../lib/intake';

export type { Tablet };
export interface TabletsRefused { problems: string[]; name: string; form: string }

export const loadTablets = (clinicId: string): Promise<Tablet[]> => withClinic(clinicId, (tx) => listTablets(tx));

/** A refused "Make this device a clinic tablet", carried back by /auth/tablet/ in the address. */
export function tabletRefusedFrom(q: URLSearchParams): TabletsRefused | null {
  const code = q.get('tablet_refused') as TabletRefusal | null;
  if (!code || !(code in TABLET_REFUSED)) return null;
  return { problems: [TABLET_REFUSED[code]], name: (q.get('name') ?? '').slice(0, 60), form: 'tablet-add' };
}

export async function tabletsAction(o: { clinicId: string; staffId: string; base: string; form: FormData }): Promise<Response | TabletsRefused> {
  const which = String(o.form.get('form') ?? '');
  const name = String(o.form.get('name') ?? '');
  const id = String(o.form.get('tablet') ?? '');
  try {
    if (which === 'tablet-remove') {
      await withClinic(o.clinicId, (tx) => removeTablet(tx, { clinicId: o.clinicId, staffId: o.staffId, tabletId: id }));
      return new Response(null, { status: 303, headers: { location: `${o.base}?saved=tablets&tablet=removed#tablets` } });
    }
    await withClinic(o.clinicId, (tx) => renameTablet(tx, { clinicId: o.clinicId, staffId: o.staffId, tabletId: id, name }));
    return new Response(null, { status: 303, headers: { location: `${o.base}?saved=tablets&tablet=renamed#tablets` } });
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    return { problems: e.reasons, name, form: which };
  }
}
