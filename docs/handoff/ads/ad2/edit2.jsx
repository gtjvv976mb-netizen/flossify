const INK = "#1f2937", INK2 = "#475467", TEAL = "#0e7471", TEAL_INK = "#0d706d";
const W = 1080, H = 1920;
const VO = JSON.parse(process.env.VO || "[]");
const S = [
  { k: "clip", src: "g1", style: "hook", t: "Missed calls." },
  { k: "clip", src: "g2", style: "hook", t: "Lost folders. Double bookings." },
  { k: "clip", src: "g3", style: "hook", t: "There's a calmer way to run your clinic." },
  { k: "tablet", src: "cal", iw: 1478, ih: 1060, t: "Every chair and every dentist, on one calendar." },
  { k: "tablet", src: "chart", iw: 1408, ih: 930, t: "Tap a tooth. The chart saves as you go." },
  { k: "clip", src: "g5", style: "hook", t: "Patients book online, even at 10 pm." },
  { k: "phone", src: "book", iw: 1170, ih: 2020, t: "They only see times you can really take." },
  { k: "clip", src: "g6", style: "card", t: "Consent, signed right on the tablet." },
  { k: "end", src: "g7" },
];
S.forEach((s, i) => {
  const v = VO[i] || 1.5;
  s.dur = s.k === "end" ? Math.max(4.5, v + 1.6) : s.k === "clip" ? Math.max(2.0, v + 0.35) : Math.max(2.8, v + 0.5);
});
let t = 0; S.forEach((s) => { s.at = t; t += s.dur; });
if (process.env.PRINT_TIMES) console.log("TIMES " + JSON.stringify(S.map((s) => [s.src, +s.at.toFixed(3), +s.dur.toFixed(3)])));

const enter = (dy) => ({ enter: { from: { y: dy, opacity: 0 }, duration: 0.45 }, exit: { to: { opacity: 0 }, duration: 0.25, anchor: "end" } });

function hook(txt) {
  return (
    <frame width={W} height={H} layout="none">
      <rect width={W} height={H} fill={{ kind: "linear", angle: 180, stops: [{ offset: 0, color: "#0f172a", opacity: 0 }, { offset: 0.4, color: "#0f172a", opacity: 0 }, { offset: 0.72, color: "#0f172a", opacity: 0.55 }, { offset: 1, color: "#0f172a", opacity: 0.85 }] }} />
      <frame x={72} y={H - 620} width={W - 144} height={380} layout="column" justify="end" motion={enter(40)}>
        <text width={W - 144} height={380} fontFamily="Inter" fontWeight={800} fontSize={92} lineHeight={1.08} color="#ffffff" shadow={{ y: 4, blur: 24, color: "rgba(0,0,0,0.45)" }}>{txt}</text>
      </frame>
    </frame>
  );
}
function card(txt, y) {
  const h = 260;
  return (
    <frame x={64} y={y} width={W - 128} height={h} background="#ffffff" radius={32}
      padding={{ top: 44, right: 52, bottom: 44, left: 52 }} layout="column" justify="center"
      shadow={{ y: 16, blur: 48, color: "rgba(15,23,42,0.22)" }} motion={enter(-30)}>
      <text width={W - 232} height={h - 88} fontFamily="Inter" fontWeight={700} fontSize={58} lineHeight={1.18} color={INK}>{txt}</text>
    </frame>
  );
}
function device(p, s) {
  const phone = s.k === "phone";
  const sw = phone ? 640 : 1000, sh = Math.round(sw * s.ih / s.iw), pad = phone ? 16 : 18;
  const dw = sw + pad * 2, dh = sh + pad * 2;
  const top = 450 + Math.max(0, Math.round((1780 - 450 - dh) / 2)), x = (W - dw) / 2;
  return (
    <frame width={W} height={H} layout="none">
      <media file={p.bg} x={0} y={0} width={W} height={H} fit="cover" />
      <rect width={W} height={H} fill="#f8fafc" opacity={0.18} />
      {card(s.t, 150)}
      <frame x={x} y={top} width={dw} height={dh} background="#ffffff" radius={phone ? 56 : 40} padding={pad}
        shadow={{ y: 30, blur: 80, color: "rgba(15,23,42,0.30)" }}
        motion={{ enter: { from: { y: 90, scale: 0.94, opacity: 0 }, duration: 0.6 } }}>
        <media file={p.img[s.src]} width={sw} height={sh} fit="cover" radius={phone ? 40 : 24} />
      </frame>
    </frame>
  );
}
function endCard() {
  const cw = W - 128, ch = 640;
  return (
    <frame width={W} height={H} layout="none">
      <rect width={W} height={H} fill="#0f172a" animate={[{ property: "opacity", from: 0, to: 0.22, duration: 0.8 }]} />
      <frame x={64} y={H - 200 - ch} width={cw} height={ch} background="#ffffff" radius={36}
        padding={{ top: 56, right: 56, bottom: 56, left: 56 }} gap={18} align="center" justify="center"
        shadow={{ y: 20, blur: 60, color: "rgba(15,23,42,0.28)" }}
        motion={{ enter: { from: { y: 50, scale: 0.95, opacity: 0 }, duration: 0.7 } }}>
        <text width={cw - 112} height={124} align="center" fontFamily="Inter" fontWeight={800} fontSize={108} color={TEAL_INK}>Flossify</text>
        <text width={cw - 112} height={64} align="center" fontFamily="Inter" fontWeight={700} fontSize={50} color={INK}>Your whole clinic, in the web.</text>
        <text width={cw - 112} height={56} align="center" fontFamily="Inter" fontWeight={500} fontSize={38} color={INK2}>Clinic software made for the Philippines.</text>
        <frame width={cw - 112} height={116} background={TEAL} radius={26} align="center" justify="center">
          <text width={cw - 160} height={60} align="center" fontFamily="Inter" fontWeight={700} fontSize={44} color="#ffffff">Open your clinic at flossify.ph</text>
        </frame>
      </frame>
    </frame>
  );
}

export default async ({ project }) => {
  const p0 = await project({ size: `${W}x${H}`, fps: 30, background: "#15191e" });
  const p = { bg: await p0.add("media/bgblur.png"), img: {}, clip: {} };
  for (const n of ["cal", "chart", "book"]) p.img[n] = await p0.add(`media/${n}.png`);
  const still = {};
  for (const n of ["g1", "g2", "g3", "g5", "g6", "g7"]) { p.clip[n] = await p0.add(`media/${n}.mp4`); still[n] = await p0.add(`media/${n}-last.png`); }
  for (const s of S) {
    if (s.k === "clip" || s.k === "end") {
      const lim = s.k === "end" ? 5.0 : 3.0, d = Math.min(s.dur, lim);
      p0.cut(p.clip[s.src], { from: 0, dur: d, at: s.at, fit: "cover" });
      if (s.dur > lim + 0.01) p0.compose(<frame width={W} height={H} layout="none"><media file={still[s.src]} x={0} y={0} width={W} height={H} fit="cover" /></frame>, { at: s.at + d, dur: s.dur - d, name: `hold-${s.src}` });
    }
    else p0.compose(device(p, s), { at: s.at, dur: s.dur, name: `screen-${s.src}` });
    if (s.k === "clip") {
      if (s.style === "hook") p0.compose(hook(s.t), { at: s.at + 0.1, dur: s.dur - 0.1, name: `cap-${s.src}` });
      else p0.compose(<frame width={W} height={H} layout="none">{card(s.t, 170)}</frame>, { at: s.at + 0.1, dur: s.dur - 0.1, name: `cap-${s.src}` });
    }
    if (s.k === "end") p0.compose(endCard(), { at: s.at + 0.3, dur: s.dur - 0.3, name: "end" });
  }
  if (process.env.AD_FRAMES) for (const s of S) await p0.frame(+(s.at + s.dur * 0.7).toFixed(2), `renders/f-${s.src}.png`);
  if (process.env.AD_RENDER) await p0.render("renders/raw.mp4", { bitrate: 12000000 });
};
