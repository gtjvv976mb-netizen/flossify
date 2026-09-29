// Clinic tablets (the intake, 039; the spec §1.7(a)): a device the clinic keeps
// at the desk for patients to fill in and sign their forms. It holds no staff
// session: "Make this device a clinic tablet" gives THIS browser a secret
// (fl_ctab, httpOnly, only under /f/, 180 days; kept hashed in clinic_tablet)
// and signs it out of the workspace, then it rests on /f/t/, "Ready for the
// next patient". The desk sends forms to it from an intake's Check step.
// Needs settings.edit (the section's own `may`); audit tablet.add / tablet.remove
// / tablet.rename (src/lib/intake.ts).
import type { AstroCookies } from 'astro';
import { withClinic } from '../../../../../lib/db';
import { clearSession } from '../../../../../lib/auth';
import { Refused } from '../../../../../lib/refused';
import { listTablets, registerTablet, removeTablet, renameTablet, type Tablet } from '../../../../../lib/intake';
import { setTabletSecret } from '../../../../../lib/park';

export type { Tablet };
export interface TabletsRefused { problems: string[]; name: string; form: string }

export const loadTablets = (clinicId: string): Promise<Tablet[]> => withClinic(clinicId, (tx) => listTablets(tx));

export async function tabletsAction(o: { clinicId: string; staffId: string; base: string; form: FormData; cookies: AstroCookies }): Promise<Response | TabletsRefused> {
  const which = String(o.form.get('form') ?? '');
  const name = String(o.form.get('name') ?? '');
  const id = String(o.form.get('tablet') ?? '');
  try {
    if (which === 'tablet-add') {
      const made = await withClinic(o.clinicId, (tx) => registerTablet(tx, { clinicId: o.clinicId, staffId: o.staffId, name }));
      // This browser is the tablet now: its secret, and no staff session on it.
      setTabletSecret(o.cookies, made.secret);
      clearSession(o.cookies);
      return new Response(null, { status: 303, headers: { location: '/f/t/?new=1' } });
    }
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
