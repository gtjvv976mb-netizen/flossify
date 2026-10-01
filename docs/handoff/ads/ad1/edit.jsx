// Flossify — 20 s vertical ad for clinic owners. Soft template: white cards, slate words, one teal action.
const INK = "#1f2937", INK2 = "#475467", TEAL = "#0e7471", TEAL_INK = "#0d706d";
const W = 1080, H = 1920, SHOT = 4;
const LINES = [
  { title: "Still running your clinic on paper?", sub: null },
  { title: "Your whole clinic, in the web.", sub: "Calendar, patients and billing in one place." },
  { title: "Charts and treatment records save as you work.", sub: null },
  { title: "Patients book online.", sub: "Reminders go out by text." },
];
const EXT = process.env.AD_EXT || "mp4";

function card({ title, sub }) {
  const titleH = 150, subH = sub ? 110 : 0, pad = 48, gap = sub ? 12 : 0;
  const h = pad * 2 + titleH + subH + gap;
  return (
    <frame width={W} height={H} layout="none">
      <frame x={64} y={H - 300 - h} width={W - 128} height={h} background="#ffffff" radius={32}
        padding={{ top: pad, right: 52, bottom: pad, left: 52 }} gap={gap}
        shadow={{ y: 16, blur: 48, color: "rgba(15,23,42,0.22)" }}
        motion={{ enter: { from: { y: 36, opacity: 0 }, duration: 0.5 }, exit: { to: { opacity: 0 }, duration: 0.3, anchor: "end" } }}>
        <text width={W - 232} height={titleH} fontFamily="Inter" fontWeight={700} fontSize={60} lineHeight={1.2} color={INK}>{title}</text>
        {sub ? <text width={W - 232} height={subH} fontFamily="Inter" fontWeight={500} fontSize={40} lineHeight={1.3} color={INK2}>{sub}</text> : null}
      </frame>
    </frame>
  );
}

function endCard() {
  const cw = W - 128, ch = 620;
  return (
    <frame width={W} height={H} layout="none">
      <rect width={W} height={H} fill="#0f172a" animate={[{ property: "opacity", from: 0, to: 0.35, duration: 0.6 }]} />
      <frame x={64} y={(H - ch) / 2} width={cw} height={ch} background="#ffffff" radius={36}
        padding={{ top: 64, right: 56, bottom: 64, left: 56 }} gap={20} align="center" justify="center"
        shadow={{ y: 20, blur: 60, color: "rgba(15,23,42,0.28)" }}
        motion={{ enter: { from: { y: 40, scale: 0.96, opacity: 0 }, duration: 0.6 } }}>
        <text width={cw - 112} height={120} align="center" fontFamily="Inter" fontWeight={800} fontSize={104} color={TEAL_INK}>Flossify</text>
        <text width={cw - 112} height={120} align="center" fontFamily="Inter" fontWeight={500} fontSize={42} lineHeight={1.3} color={INK2}>Paperless records for dental clinics in the Philippines.</text>
        <frame width={cw - 112} height={112} background={TEAL} radius={24} align="center" justify="center">
          <text width={cw - 160} height={60} align="center" fontFamily="Inter" fontWeight={700} fontSize={44} color="#ffffff">Open your clinic at flossify.ph</text>
        </frame>
      </frame>
    </frame>
  );
}

export default async ({ project }) => {
  const p = await project({ size: `${W}x${H}`, fps: 30, background: "#15191e" });
  const clips = [];
  for (let i = 1; i <= 5; i++) clips.push(await p.add(`media/c${i}.${EXT}`));
  clips.forEach((c, i) => p.cut(c, { from: 0, dur: SHOT, at: i * SHOT, fit: "cover" }));
  LINES.forEach((l, i) => p.compose(card(l), { at: i * SHOT + 0.3, dur: SHOT - 0.4, name: `line-${i + 1}` }));
  p.compose(endCard(), { at: 4 * SHOT + 0.2, dur: SHOT - 0.2, name: "end" });
  if (process.env.AD_FRAMES) {
    await p.frame(2.0, "renders/f1.png");
    await p.frame(6.0, "renders/f2.png");
    await p.frame(18.5, "renders/f5.png");
  }
  if (!process.env.AD_NORENDER) await p.render("renders/flossify-ad.mp4");
};
