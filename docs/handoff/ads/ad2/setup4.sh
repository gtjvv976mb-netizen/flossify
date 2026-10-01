set -e
rm -rf a2 && mkdir -p a2/media a2/renders && cd a2
curl -sf -o media/g1.mp4 https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180122_78e13813-8ece-4464-ba7e-52a7ca84ed0b.mp4 &
curl -sf -o media/g2.mp4 https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180121_a27eadcc-7071-484d-aae5-d5cde7782217.mp4 &
curl -sf -o media/g3.mp4 https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180121_fe8c559e-9949-4cb8-b1b7-32a57f4a64da.mp4 &
curl -sf -o media/g5.mp4 https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180121_946c59d4-2239-4015-bdcf-db6a0276bb99.mp4 &
curl -sf -o media/g6.mp4 https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180121_58873e17-3a4f-4763-ad63-3b0e8ccea68a.mp4 &
curl -sf -o media/g7.mp4 https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180121_bc782722-8ed2-42b1-a56f-fd7473cc2d1b.mp4 &
curl -sf -o media/g3.png https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_175959_3ae42295-dc27-4989-854d-45b097faa92f.png &
curl -sf -o media/cal.png https://d2ol7oe51mr4n9.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/de1fd0b4-aefa-413a-a110-4fb2e787c890.png &
curl -sf -o media/chart.png https://d2ol7oe51mr4n9.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/eb66ad48-1d66-4372-b95c-a8f902971a37.png &
curl -sf -o media/book.png https://d2ol7oe51mr4n9.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/4f97efdf-662d-4921-bf7c-41c9759538dd.png &
curl -sf -o media/vo1.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180022_89216ac8-da60-462e-abbe-46843423aa16.wav &
curl -sf -o media/vo2.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180021_1d81ec49-ecf9-46e9-a35c-418a585a707a.wav &
curl -sf -o media/vo3.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180021_63fcfbfa-21f6-4cef-924f-6e7e812d337f.wav &
curl -sf -o media/vo4.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180022_7b5760a0-5575-4653-9fd5-1455ee0dd058.wav &
curl -sf -o media/vo5.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180022_6a735781-8220-4026-8c1d-849a2ef83845.wav &
curl -sf -o media/vo6.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180021_cce0ef7d-3c8c-45a0-9b27-134bb2ee6da4.wav &
curl -sf -o media/vo7.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180021_d18fdcf5-a811-446a-97e8-7bd7a885f76f.wav &
curl -sf -o media/vo8.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180021_353cad35-f0bc-40b7-ade9-fe02040d9e71.wav &
curl -sf -o media/vo9.wav https://d8j0ntlcm91z4.cloudfront.net/user_3JZSMzfLba5srJNn6vNI9xpZHJd/hf_20260930_180021_e1442316-6555-4938-a078-329097fa9bb0.wav &
wait
for i in 1 2 3 4 5 6 7 8 9; do ffmpeg -v error -y -i media/vo$i.wav -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,atempo=1.1" media/t$i.wav && mv media/t$i.wav media/vo$i.wav; done
for n in g1 g2 g3 g5 g6 g7; do ffmpeg -v error -y -sseof -0.1 -i media/$n.mp4 -frames:v 1 -update 1 media/$n-last.png; done
convert media/g3.png -resize 1080x1920^ -gravity center -extent 1080x1920 -blur 0x28 media/bgblur.png
cat > edit.jsx <<'JSX'
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

JSX
VO=$(for i in 1 2 3 4 5 6 7 8 9; do ffprobe -v error -show_entries format=duration -of csv=p=0 media/vo$i.wav; done | paste -sd, | sed 's/^/[/;s/$/]/')
echo VO=$VO > log.txt
higgsedit build edit.jsx > b1.log 2>&1 || true
higgsedit fonts add . Inter > /dev/null 2>&1
VO=$VO PRINT_TIMES=1 AD_RENDER=1 higgsedit build edit.jsx > b2.log 2>&1
grep TIMES b2.log >> log.txt
node -e '
const t=JSON.parse(require("fs").readFileSync("b2.log","utf8").match(/TIMES (.*)/)[1]);
const ins=t.map((_,i)=>`-i media/vo${i+1}.wav`).join(" ");
const f=t.map((s,i)=>`[${i}:a]aresample=48000,adelay=${Math.round((s[1]+0.12)*1000)}:all=1[v${i}]`).join(";");
const mix=t.map((_,i)=>`[v${i}]`).join("")+`amix=inputs=${t.length}:normalize=0[vo]`;
require("fs").writeFileSync("vo.sh",`ffmpeg -v error -y ${ins} -filter_complex "${f};${mix}" -map "[vo]" -ac 2 renders/vo.wav`);
'
bash vo.sh
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 renders/raw.mp4 | awk '{print $1-1.2}')
ffmpeg -v error -y -i renders/raw.mp4 -i renders/vo.wav -filter_complex "[0:a]volume=0.32,aresample=48000[amb];[1:a]volume=1.35[v];[amb][v]amix=inputs=2:normalize=0,afade=t=in:d=0.2,afade=t=out:st=$D:d=1.2,alimiter=limit=0.95[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart renders/final.mp4
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of compact renders/final.mp4 >> log.txt
ffmpeg -v error -y -i renders/final.mp4 -vf "fps=1/2.5,scale=216:-1,tile=12x1" -frames:v 1 check.jpg
curl -s -o /dev/null -w 'check %{http_code}\n' -X PUT -H 'Content-Type: image/jpeg' --upload-file check.jpg '<PRESIGNED_UPLOAD_URL>' >> log.txt
curl -s -o /dev/null -w 'video %{http_code}\n' -X PUT -H 'Content-Type: video/mp4' --upload-file renders/final.mp4 '<PRESIGNED_UPLOAD_URL>' >> log.txt
echo DONE >> log.txt
