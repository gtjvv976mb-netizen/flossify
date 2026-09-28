// Aftercare (post-operative) instruction sheets: what a patient does, avoids and watches for after
// each kind of treatment, in English and in Filipino, and the one evening text that goes with it.
//
// Drafted from standard dental aftercare guidance (the kind ADA, AAOMS and NHS leaflets give). It is
// general guidance only: no dosages beyond "the pain reliever your dentist named", no brand names,
// no diagnosis. A DENTIST REVIEWS THESE WORDS BEFORE A CLINIC SHIPS THEM TO PATIENTS — the same rule
// as the sample site's health copy (CLAUDE.md, "Sample client sites").
//
// No Node or database imports: a browser script may import this file. The printable sheet is
// src/pages/c/[clinic]/patients/[patient]/aftercare/[kind].astro; the texts are queued by the
// main record code through aftercareText().

export type AftercareKind =
  | 'extraction'
  | 'surgical_extraction'
  | 'root_canal'
  | 'filling'
  | 'cleaning'
  | 'crown'
  | 'denture'
  | 'braces_adjustment'
  | 'whitening';

export interface AftercareSheet {
  kind: AftercareKind;
  title: string;
  /** How many hours after the visit the check-in text goes: 4 after anything that bleeds or aches, 0 = that evening. */
  hours: number;
  en: { do: string[]; avoid: string[]; call: string[] };
  /** The same sheet in Filipino: plain and warm, medical terms left recognisable. */
  fil: { do: string[]; avoid: string[]; call: string[] };
}

export const AFTERCARE: Record<AftercareKind, AftercareSheet> = {
  extraction: {
    kind: 'extraction',
    title: 'After a tooth extraction',
    hours: 4,
    en: {
      do: [
        'Bite firmly on the gauze for 30 to 45 minutes, then take it out. If the socket still oozes, fold a fresh piece and bite for another 30 minutes.',
        'Rest today. Keep your head up on a pillow when you lie down.',
        'Take the pain reliever your dentist named before the numbness wears off, and as the label says.',
        'From tomorrow, rinse gently with warm salt water after meals (half a teaspoon of salt in a glass of warm water).',
        'Eat soft, cool food today: lugaw, soup that is not hot, yogurt, mashed banana.',
        'Brush your other teeth as usual; go gently near the socket.',
        'Keep your follow-up visit. If the dentist placed stitches, they come out or dissolve as they said.',
      ],
      avoid: [
        'Do not rinse, spit or drink through a straw for 24 hours. The suction can pull the clot out and start the bleeding again.',
        'Do not smoke or vape for at least 3 days, and no alcohol for 24 hours.',
        'Do not touch the socket with your tongue or finger, and do not poke it with a toothpick.',
        'No hot drinks or hot soup today.',
        'Do not chew on that side until it feels comfortable.',
        'Do not do heavy work or exercise today: it raises the blood pressure in the socket.',
      ],
      call: [
        'Bleeding that still soaks the gauze after 30 minutes of firm biting.',
        'Pain that gets worse after 2 to 3 days instead of better, or a bad taste or smell from the socket (this may be dry socket).',
        'Swelling that keeps growing after the second day, or trouble opening the mouth or swallowing.',
        'Fever, or numbness that has not gone by the next day.',
        'A rash, itching or trouble breathing from any medicine you were given (call, or go to the nearest emergency room).',
      ],
    },
    fil: {
      do: [
        'Kagatin nang mahigpit ang gauze sa loob ng 30 hanggang 45 minuto, saka tanggalin. Kung may dugo pa rin, tupiin ang bagong gauze at kagatin ulit ng 30 minuto.',
        'Magpahinga ngayong araw. Iunan ang ulo nang mas mataas kapag nakahiga.',
        'Inumin ang pain reliever na sinabi ng dentista bago mawala ang pamamanhid, at sundin ang nakasulat sa label.',
        'Simula bukas, magmumog nang dahan-dahan ng maligamgam na tubig na may asin pagkatapos kumain (kalahating kutsarita ng asin sa isang basong maligamgam na tubig).',
        'Malambot at malamig na pagkain ngayong araw: lugaw, sabaw na hindi mainit, yogurt, minasang saging.',
        'Magsipilyo gaya ng dati sa ibang ngipin; dahan-dahan lang malapit sa binunutan.',
        'Bumalik sa follow-up. Kung may tahi, tatanggalin o matutunaw ito ayon sa sinabi ng dentista.',
      ],
      avoid: [
        'Huwag magmumog, dumura o uminom gamit ang straw sa loob ng 24 oras. Maaaring matanggal ang clot at dumugo ulit.',
        'Huwag manigarilyo o mag-vape sa loob ng 3 araw, at walang alak sa loob ng 24 oras.',
        'Huwag hawakan ng dila o daliri ang binunutan, at huwag sundutin ng toothpick.',
        'Walang mainit na inumin o sabaw ngayong araw.',
        'Huwag ngumuya sa gilid na iyon hangga’t hindi pa komportable.',
        'Huwag magbuhat ng mabigat o mag-ehersisyo ngayong araw: tumataas ang presyon ng dugo sa binunutan.',
      ],
      call: [
        'Dugong tumatagos pa rin sa gauze pagkatapos ng 30 minutong mahigpit na pagkagat.',
        'Sakit na lumalala pagkatapos ng 2 hanggang 3 araw sa halip na humupa, o masamang lasa o amoy mula sa binunutan (maaaring dry socket ito).',
        'Pamamagang patuloy na lumalaki pagkalipas ng ikalawang araw, o hirap buksan ang bibig o lumunok.',
        'Lagnat, o pamamanhid na hindi pa nawawala kinabukasan.',
        'Pantal, pangangati o hirap huminga mula sa gamot na ibinigay (tumawag, o pumunta sa pinakamalapit na emergency room).',
      ],
    },
  },

  surgical_extraction: {
    kind: 'surgical_extraction',
    title: 'After a surgical extraction or wisdom tooth removal',
    hours: 4,
    en: {
      do: [
        'Bite firmly on the gauze for 30 to 45 minutes, and change it if the wound still oozes. A little pink in your saliva for a day is normal.',
        'Put an ice pack (or ice in a towel) on the cheek: 20 minutes on, 20 minutes off, for the first 24 hours. Swelling is largest on day 2 or 3, then goes down.',
        'Take the pain reliever your dentist named before the numbness wears off, and as the label says. Finish any antibiotic to the last capsule.',
        'Sleep with your head raised on two pillows the first night.',
        'Soft, cool food for 2 to 3 days: lugaw, mashed potato, yogurt, scrambled egg, soup that is not hot.',
        'From the second day, rinse gently with warm salt water after every meal, and brush your other teeth as usual.',
        'Some stiffness in the jaw and a small bruise on the cheek are normal for up to a week.',
        'Keep the check-up visit; stitches come out or dissolve as the dentist said.',
      ],
      avoid: [
        'No rinsing, spitting or straws for 24 hours, so the clot stays in.',
        'No smoking or vaping for at least a week, and no alcohol while on any medicine.',
        'Do not drive or sign papers today if you were sedated.',
        'Nothing hot, hard, crunchy or with small seeds (chips, nuts, rice crackers) this week.',
        'Do not touch the wound with your tongue, a finger or a toothpick.',
        'Do not do heavy work, sport or long bending over for 2 to 3 days.',
      ],
      call: [
        'Bleeding that soaks the gauze after 30 minutes of firm biting, or bright red bleeding that starts again after the first day.',
        'Pain that gets worse from day 3, or a bad smell or taste from the wound (dry socket, which the clinic can dress).',
        'Swelling that keeps growing after day 3, is hard and hot, or makes it hard to open the mouth, swallow or breathe (if breathing: go straight to the emergency room).',
        'Fever of 38 °C or higher, or pus from the wound.',
        'Numbness of the lip, chin or tongue that is still there the next day.',
        'A rash, itching or trouble breathing from any medicine.',
      ],
    },
    fil: {
      do: [
        'Kagatin nang mahigpit ang gauze sa loob ng 30 hanggang 45 minuto, at palitan kung may dugo pa rin. Normal ang bahagyang pulang laway sa loob ng isang araw.',
        'Maglagay ng ice pack (o yelong nakabalot sa tuwalya) sa pisngi: 20 minutong nakalagay, 20 minutong tanggal, sa unang 24 oras. Pinakamalaki ang pamamaga sa ika-2 o ika-3 araw, saka humuhupa.',
        'Inumin ang pain reliever na sinabi ng dentista bago mawala ang pamamanhid, at ayon sa label. Ubusin ang antibiotic hanggang sa huling kapsula.',
        'Matulog na nakataas ang ulo sa dalawang unan sa unang gabi.',
        'Malambot at malamig na pagkain sa loob ng 2 hanggang 3 araw: lugaw, minasang patatas, yogurt, scrambled egg, sabaw na hindi mainit.',
        'Simula sa ikalawang araw, magmumog nang dahan-dahan ng maligamgam na tubig na may asin pagkatapos ng bawat kain, at magsipilyo gaya ng dati sa ibang ngipin.',
        'Normal ang paninigas ng panga at kaunting pasa sa pisngi hanggang isang linggo.',
        'Bumalik sa check-up; tatanggalin o matutunaw ang tahi ayon sa sinabi ng dentista.',
      ],
      avoid: [
        'Walang pagmumumog, pagdura o straw sa loob ng 24 oras, para hindi matanggal ang clot.',
        'Huwag manigarilyo o mag-vape sa loob ng isang linggo, at walang alak habang umiinom ng gamot.',
        'Huwag magmaneho o pumirma ng mga papeles ngayong araw kung binigyan ka ng sedation.',
        'Walang mainit, matigas, malutong o may maliliit na buto (chips, mani, rice crackers) ngayong linggo.',
        'Huwag hawakan ang sugat ng dila, daliri o toothpick.',
        'Huwag magbuhat ng mabigat, mag-sports o yumuko nang matagal sa loob ng 2 hanggang 3 araw.',
      ],
      call: [
        'Dugong tumatagos sa gauze pagkatapos ng 30 minutong mahigpit na pagkagat, o matingkad na pulang dugong bumalik pagkalipas ng unang araw.',
        'Sakit na lumalala mula sa ika-3 araw, o masamang amoy o lasa mula sa sugat (dry socket, na malalagyan ng gamot sa clinic).',
        'Pamamagang patuloy na lumalaki pagkalipas ng ika-3 araw, matigas at mainit, o nagpapahirap sa pagbuka ng bibig, paglunok o paghinga (kung hirap huminga: pumunta agad sa emergency room).',
        'Lagnat na 38 °C pataas, o nana mula sa sugat.',
        'Pamamanhid ng labi, baba o dila na naroon pa rin kinabukasan.',
        'Pantal, pangangati o hirap huminga mula sa alinmang gamot.',
      ],
    },
  },

  root_canal: {
    kind: 'root_canal',
    title: 'After root canal treatment',
    hours: 4,
    en: {
      do: [
        'Wait until the numbness wears off before eating, so you do not bite your cheek or tongue.',
        'Expect the tooth to be tender for a few days, especially when you bite. Take the pain reliever your dentist named, as the label says.',
        'Chew on the other side until the tooth has its final filling or crown. A tooth with a temporary filling breaks easily.',
        'Brush and floss as usual, including this tooth; go gently at the gum.',
        'Keep the next visit. The treatment is not finished until the tooth is sealed with its final filling or crown.',
        'If the dentist gave an antibiotic, take every dose to the end.',
      ],
      avoid: [
        'No hard, sticky or chewy food on that tooth (nuts, ice, chewing gum, chicharon, hard candy) until it has its final filling or crown.',
        'Do not chew on that side at all while the temporary filling is in.',
        'Do not skip the follow-up: an open or unsealed tooth can get infected again.',
        'Do not push on the tooth with your tongue to test it.',
      ],
      call: [
        'Pain or swelling that gets worse after 2 to 3 days instead of better, or pain that the pain reliever does not touch.',
        'The temporary filling falls out or feels broken, or the bite feels high and you cannot close your teeth together.',
        'Swelling of the face or gum, fever, or a bad taste from the tooth.',
        'A rash, itching or trouble breathing from any medicine.',
      ],
    },
    fil: {
      do: [
        'Hintaying mawala ang pamamanhid bago kumain, para hindi makagat ang pisngi o dila.',
        'Asahang masakit-sakit ang ngipin sa loob ng ilang araw, lalo na kapag kumakagat. Inumin ang pain reliever na sinabi ng dentista ayon sa label.',
        'Ngumuya sa kabilang gilid hanggang malagyan ang ngipin ng pangwakas na pasta o crown. Madaling mabasag ang ngiping may temporary filling.',
        'Magsipilyo at mag-floss gaya ng dati, kasama ang ngiping ito; dahan-dahan lang sa gilagid.',
        'Bumalik sa susunod na appointment. Hindi pa tapos ang gamutan hangga’t hindi naseselyuhan ang ngipin ng pangwakas na pasta o crown.',
        'Kung binigyan ka ng antibiotic, ubusin ang lahat ng dosis.',
      ],
      avoid: [
        'Walang matigas, malagkit o makunat na pagkain sa ngiping iyon (mani, yelo, chewing gum, chicharon, matigas na kendi) hangga’t wala pa ang pangwakas na pasta o crown.',
        'Huwag ngumuya sa gilid na iyon habang nakalagay ang temporary filling.',
        'Huwag liktawan ang follow-up: maaaring ma-impeksyon ulit ang ngiping bukas o hindi naseselyuhan.',
        'Huwag itulak ng dila ang ngipin para subukin ito.',
      ],
      call: [
        'Sakit o pamamagang lumalala pagkatapos ng 2 hanggang 3 araw sa halip na humupa, o sakit na hindi kayang ibsan ng pain reliever.',
        'Natanggal o nabasag ang temporary filling, o parang mataas ang kagat at hindi mo maipagdikit ang mga ngipin.',
        'Pamamaga ng mukha o gilagid, lagnat, o masamang lasa mula sa ngipin.',
        'Pantal, pangangati o hirap huminga mula sa alinmang gamot.',
      ],
    },
  },

  filling: {
    kind: 'filling',
    title: 'After a filling',
    hours: 0,
    en: {
      do: [
        'Wait until the numbness wears off (1 to 3 hours) before eating, so you do not bite your cheek, lip or tongue. Children need watching for this.',
        'A tooth-coloured (composite) filling is set at once; a silver (amalgam) filling needs 24 hours before you chew on it.',
        'Some sensitivity to cold, sweet or pressure for a few days to a few weeks is normal and should fade.',
        'Brush and floss as usual, including the filled tooth.',
        'If the bite feels high once the numbness is gone, come back: a small adjustment fixes it.',
      ],
      avoid: [
        'Do not eat or drink anything hot while numb: you can burn your mouth without feeling it.',
        'No very hard or sticky food (ice, hard candy, chewing gum) on the filled tooth for a day.',
        'Do not chew on the side of a silver filling for 24 hours.',
        'Do not grind or clench on it to test it.',
      ],
      call: [
        'Pain that gets worse over days, a throbbing ache, or pain that wakes you at night.',
        'The bite still feels high or uneven after two days, or the filling feels rough, chipped or has fallen out.',
        'Sensitivity that is getting worse instead of better after two weeks.',
        'Swelling of the gum or face around the tooth.',
      ],
    },
    fil: {
      do: [
        'Hintaying mawala ang pamamanhid (1 hanggang 3 oras) bago kumain, para hindi makagat ang pisngi, labi o dila. Bantayan ang mga bata dito.',
        'Ang kulay-ngiping pasta (composite) ay matigas na agad; ang pilak na pasta (amalgam) ay kailangan ng 24 oras bago ngumuya rito.',
        'Normal ang pagiging sensitibo sa lamig, matamis o pagdiin sa loob ng ilang araw hanggang ilang linggo, at dapat itong humupa.',
        'Magsipilyo at mag-floss gaya ng dati, kasama ang ngiping pinastahan.',
        'Kung parang mataas ang kagat pagkawala ng pamamanhid, bumalik: maliit na pag-aayos lang ang kailangan.',
      ],
      avoid: [
        'Huwag kumain o uminom ng mainit habang manhid: maaari kang mapaso nang hindi mo nararamdaman.',
        'Walang napakatigas o malagkit na pagkain (yelo, matigas na kendi, chewing gum) sa ngiping pinastahan sa loob ng isang araw.',
        'Huwag ngumuya sa gilid ng pilak na pasta sa loob ng 24 oras.',
        'Huwag ipagngalit o idiin ang mga ngipin para subukin ito.',
      ],
      call: [
        'Sakit na lumalala sa paglipas ng mga araw, kumikirot, o sakit na gumigising sa iyo sa gabi.',
        'Mataas o hindi pantay pa rin ang kagat pagkalipas ng dalawang araw, o magaspang, may tipak o natanggal ang pasta.',
        'Sensitibidad na lumalala sa halip na humupa pagkalipas ng dalawang linggo.',
        'Pamamaga ng gilagid o mukha sa paligid ng ngipin.',
      ],
    },
  },

  cleaning: {
    kind: 'cleaning',
    title: 'After a cleaning',
    hours: 0,
    en: {
      do: [
        'Your gums may be a little sore and may bleed a bit when you brush for a day or two. That is normal and settles as the gums heal.',
        'Brush twice a day with a soft brush, and floss or use interdental brushes once a day: keep it up and the next cleaning is easier.',
        'Rinse with warm salt water if the gums feel tender.',
        'Teeth may feel sensitive to cold for a few days now that the tartar is off; a toothpaste for sensitive teeth helps.',
        'If fluoride was applied, wait 30 minutes before eating or drinking.',
        'Book your next cleaning as the dentist advised, usually every 6 months.',
      ],
      avoid: [
        'Do not skip brushing because the gums bleed a little: gentle brushing is what stops the bleeding.',
        'No smoking today: it slows gum healing.',
        'Avoid very hot, very cold or very sweet food and drinks today if your teeth feel sensitive.',
        'Avoid strongly coloured food and drinks (coffee, tea, soy sauce, red wine) for a few hours if the teeth were polished or stains removed.',
      ],
      call: [
        'Bleeding from the gums that does not stop, or is more than a little pink when you spit.',
        'Gums that get more swollen, red or painful over the next days instead of better.',
        'Sensitivity that is severe or lasts more than two weeks.',
        'A tooth or filling that feels loose or has chipped.',
      ],
    },
    fil: {
      do: [
        'Maaaring masakit-sakit ang gilagid at bahagyang dumugo kapag nagsisipilyo sa loob ng isa o dalawang araw. Normal ito at humuhupa habang gumagaling ang gilagid.',
        'Magsipilyo dalawang beses sa isang araw gamit ang malambot na sipilyo, at mag-floss o gumamit ng interdental brush isang beses sa isang araw: ipagpatuloy at mas magaan ang susunod na paglilinis.',
        'Magmumog ng maligamgam na tubig na may asin kung masakit-sakit ang gilagid.',
        'Maaaring maging sensitibo sa lamig ang ngipin sa loob ng ilang araw ngayong tanggal na ang tartar; makakatulong ang toothpaste para sa sensitibong ngipin.',
        'Kung nilagyan ng fluoride, maghintay ng 30 minuto bago kumain o uminom.',
        'Magpa-book ng susunod na paglilinis ayon sa payo ng dentista, karaniwang tuwing 6 na buwan.',
      ],
      avoid: [
        'Huwag liktawan ang pagsisipilyo dahil bahagyang dumudugo ang gilagid: ang marahang pagsisipilyo ang tumitigil sa pagdurugo.',
        'Walang sigarilyo ngayong araw: pinapabagal nito ang paggaling ng gilagid.',
        'Iwasan ang napakainit, napakalamig o napakatamis na pagkain at inumin ngayong araw kung sensitibo ang ngipin.',
        'Iwasan ang matitingkad ang kulay na pagkain at inumin (kape, tsaa, toyo, red wine) sa loob ng ilang oras kung pinakintab o tinanggalan ng mantsa ang ngipin.',
      ],
      call: [
        'Pagdurugo ng gilagid na hindi tumitigil, o higit pa sa bahagyang kulay-rosas kapag dumudura.',
        'Gilagid na lalong namamaga, namumula o sumasakit sa susunod na mga araw sa halip na gumaling.',
        'Sensitibidad na matindi o tumatagal nang higit sa dalawang linggo.',
        'Ngipin o pastang parang maluwag o natipak.',
      ],
    },
  },

  crown: {
    kind: 'crown',
    title: 'After a crown, bridge or veneer',
    hours: 0,
    en: {
      do: [
        'With a temporary crown: chew on the other side, and floss by pulling the floss out sideways rather than up, so it does not lift the temporary off.',
        'With the final crown: wait until the numbness is gone, then eat normally; avoid the hardest food for 24 hours while the cement sets fully.',
        'Some sensitivity to hot and cold and a little gum soreness for a few days is normal.',
        'Brush and floss the crown like a natural tooth, especially at the gum line, where decay can start under a crown.',
        'If the bite feels high once the numbness has gone, come back for a small adjustment.',
        'Keep the visit for the final crown: a temporary is not made to last more than a few weeks.',
      ],
      avoid: [
        'Nothing sticky or chewy (chewing gum, caramel, dried mango, toffee) or very hard (ice, nuts, bones) on a temporary crown.',
        'Do not chew on the crown side while numb.',
        'Do not use the crown to open packets or bite nails.',
        'Do not skip the follow-up: a temporary left too long can let decay in.',
      ],
      call: [
        'The temporary or the crown comes off: keep it, do not glue it yourself, and call to have it put back.',
        'Pain when you bite that does not settle in a few days, or a bite that feels high.',
        'Sensitivity that gets worse or lasts more than a few weeks.',
        'A crack, chip or rough edge on the crown or veneer, or swelling of the gum around it.',
      ],
    },
    fil: {
      do: [
        'Kung temporary crown: ngumuya sa kabilang gilid, at kapag nagfa-floss, hilahin ang floss pagilid sa halip na paitaas, para hindi maangat ang temporary.',
        'Kung pangwakas na crown: hintaying mawala ang pamamanhid, saka kumain nang normal; iwasan muna ang pinakamatitigas na pagkain sa loob ng 24 oras habang lubusang tumitigas ang cement.',
        'Normal ang bahagyang sensitibidad sa init at lamig at kaunting sakit ng gilagid sa loob ng ilang araw.',
        'Sipilyuhin at i-floss ang crown tulad ng tunay na ngipin, lalo na sa may gilagid, kung saan maaaring magsimula ang sira sa ilalim ng crown.',
        'Kung parang mataas ang kagat pagkawala ng pamamanhid, bumalik para sa maliit na pag-aayos.',
        'Bumalik sa appointment para sa pangwakas na crown: hindi ginawa ang temporary para tumagal nang higit sa ilang linggo.',
      ],
      avoid: [
        'Walang malagkit o makunat (chewing gum, caramel, dried mango, toffee) o napakatigas (yelo, mani, buto) sa temporary crown.',
        'Huwag ngumuya sa gilid ng crown habang manhid.',
        'Huwag gamitin ang crown sa pagbukas ng mga pakete o pagkagat ng kuko.',
        'Huwag liktawan ang follow-up: ang temporary na naiwan nang matagal ay maaaring pasukin ng sira.',
      ],
      call: [
        'Natanggal ang temporary o ang crown: itago ito, huwag idikit nang mag-isa, at tumawag para maibalik.',
        'Sakit kapag kumakagat na hindi humuhupa sa loob ng ilang araw, o parang mataas ang kagat.',
        'Sensitibidad na lumalala o tumatagal nang higit sa ilang linggo.',
        'Bitak, tipak o magaspang na gilid sa crown o veneer, o pamamaga ng gilagid sa paligid nito.',
      ],
    },
  },

  denture: {
    kind: 'denture',
    title: 'Your new dentures',
    hours: 0,
    en: {
      do: [
        'Wear them as much as you can in the first days: a new denture takes a week or two to get used to. Start with soft food cut small, chewing on both sides.',
        'Take them out at night to let the gums rest, and keep them in water (or a denture solution) so they do not dry out and warp.',
        'Clean them every day over a basin of water with a soft brush and mild soap or denture cleanser, and brush your gums, tongue and any remaining teeth.',
        'Read aloud to get used to speaking with them; it comes quickly.',
        'Sore spots are common at first: come back so the dentist can adjust them. Wear the denture for a few hours before that visit so the sore spot shows.',
        'Come for a check-up every 6 months: as the gums change, a denture needs relining or adjusting.',
      ],
      avoid: [
        'Do not use toothpaste, bleach or hot water on the denture: they scratch, discolour or warp it.',
        'Do not sleep with the denture in.',
        'Do not adjust or file it yourself, and do not use glue on a broken denture.',
        'No sticky, hard or very chewy food in the first weeks.',
        'Do not keep wearing a denture that hurts: an ulcer forms under it.',
      ],
      call: [
        'A sore spot that has not settled after a day or two, or an ulcer under the denture.',
        'The denture cracks, a tooth comes off it, or it becomes loose and drops when you speak or eat.',
        'Bleeding, swelling or pain in the gums that gets worse.',
        'You still cannot eat or speak with it after two weeks.',
      ],
    },
    fil: {
      do: [
        'Isuot ito hangga’t maaari sa unang mga araw: isa hanggang dalawang linggo bago masanay sa bagong pustiso. Magsimula sa malambot na pagkaing hiniwa nang maliliit, at ngumuya sa magkabilang gilid.',
        'Tanggalin sa gabi para makapagpahinga ang gilagid, at ibabad sa tubig (o denture solution) para hindi matuyo at mabaluktot.',
        'Linisin araw-araw sa ibabaw ng palanggana ng tubig gamit ang malambot na sipilyo at banayad na sabon o denture cleanser, at sipilyuhin ang gilagid, dila at natitirang ngipin.',
        'Magbasa nang malakas para masanay sa pagsasalita; mabilis itong masasanay.',
        'Karaniwan ang masakit na bahagi sa umpisa: bumalik para maayos ito ng dentista. Isuot ang pustiso ng ilang oras bago ang pagbisita para makita ang masakit na bahagi.',
        'Magpa-check-up tuwing 6 na buwan: habang nagbabago ang gilagid, kailangang i-reline o ayusin ang pustiso.',
      ],
      avoid: [
        'Huwag gumamit ng toothpaste, bleach o mainit na tubig sa pustiso: nagagasgas, nangingitim o nababaluktot ito.',
        'Huwag matulog na nakasuot ang pustiso.',
        'Huwag ayusin o kikilin ito nang mag-isa, at huwag lagyan ng glue ang sirang pustiso.',
        'Walang malagkit, matigas o napakakunat na pagkain sa unang mga linggo.',
        'Huwag ipagpatuloy ang pagsuot ng pustisong masakit: nagkakaroon ng sugat sa ilalim nito.',
      ],
      call: [
        'Masakit na bahaging hindi humuhupa pagkalipas ng isa o dalawang araw, o sugat sa ilalim ng pustiso.',
        'Nabitak ang pustiso, natanggal ang isang ngipin nito, o lumuwag at nahuhulog kapag nagsasalita o kumakain.',
        'Pagdurugo, pamamaga o sakit ng gilagid na lumalala.',
        'Hindi ka pa rin makakain o makapagsalita nang maayos pagkalipas ng dalawang linggo.',
      ],
    },
  },

  braces_adjustment: {
    kind: 'braces_adjustment',
    title: 'After a braces adjustment',
    hours: 0,
    en: {
      do: [
        'Expect the teeth to be tender for 2 to 4 days after each adjustment. Soft food (lugaw, soup, pasta, mashed banana) helps, and the pain reliever your dentist named if needed.',
        'Use orthodontic wax on any bracket or wire that rubs the cheek or lip; rinse with warm salt water if a sore forms.',
        'Brush after every meal, angling the brush above and below each bracket, and clean between the teeth with floss threaders or interdental brushes.',
        'Wear the elastics (rubber bands) exactly as instructed: they only work when worn all the time.',
        'Keep every adjustment visit; a missed one adds months to the treatment.',
        'Use a fluoride toothpaste, and a mouthwash if the dentist recommended one, to prevent white spots around the brackets.',
      ],
      avoid: [
        'No hard, sticky or chewy food: ice, nuts, popcorn, chicharon, hard candy, caramel, chewing gum, corn on the cob.',
        'Do not bite into whole apples or corn; cut them small.',
        'Do not chew pens, nails or ice.',
        'No fizzy drinks and sweets between meals: sugar around the brackets causes white spots and decay.',
        'Do not try to fix a loose bracket or bend a wire yourself.',
      ],
      call: [
        'A bracket, band or wire has come loose or broken (call so it can be fixed; in the meantime cover it with wax).',
        'A wire is poking the cheek and wax does not help.',
        'Pain that lasts more than a week, or a tooth that feels very loose.',
        'Swelling, or a sore in the mouth that is not healing.',
      ],
    },
    fil: {
      do: [
        'Asahang masakit-sakit ang mga ngipin sa loob ng 2 hanggang 4 na araw pagkatapos ng bawat adjustment. Nakakatulong ang malambot na pagkain (lugaw, sabaw, pasta, minasang saging), at ang pain reliever na sinabi ng dentista kung kailangan.',
        'Gumamit ng orthodontic wax sa bracket o wire na kumakaskas sa pisngi o labi; magmumog ng maligamgam na tubig na may asin kung may sugat.',
        'Magsipilyo pagkatapos ng bawat kain, nakahilig ang sipilyo sa itaas at ibaba ng bawat bracket, at linisin ang pagitan ng mga ngipin gamit ang floss threader o interdental brush.',
        'Isuot ang elastics (rubber bands) ayon mismo sa bilin: gumagana lang ang mga ito kapag palaging nakasuot.',
        'Dumalo sa bawat adjustment; ang isang naliktawan ay nagdaragdag ng mga buwan sa gamutan.',
        'Gumamit ng fluoride toothpaste, at mouthwash kung inirekomenda ng dentista, para maiwasan ang puting mantsa sa paligid ng bracket.',
      ],
      avoid: [
        'Walang matigas, malagkit o makunat na pagkain: yelo, mani, popcorn, chicharon, matigas na kendi, caramel, chewing gum, mais sa busal.',
        'Huwag kagatin nang buo ang mansanas o mais; hiwain nang maliliit.',
        'Huwag ngatngatin ang ballpen, kuko o yelo.',
        'Walang softdrinks at matatamis sa pagitan ng mga kain: ang asukal sa paligid ng bracket ay nagdudulot ng puting mantsa at sira.',
        'Huwag subukang ayusin ang maluwag na bracket o baluktutin ang wire nang mag-isa.',
      ],
      call: [
        'Lumuwag o nasira ang bracket, band o wire (tumawag para maayos; samantala, takpan ito ng wax).',
        'May wire na tumutusok sa pisngi at hindi nakakatulong ang wax.',
        'Sakit na tumatagal nang higit sa isang linggo, o ngiping parang napakaluwag.',
        'Pamamaga, o sugat sa bibig na hindi gumagaling.',
      ],
    },
  },

  whitening: {
    kind: 'whitening',
    title: 'After teeth whitening',
    hours: 0,
    en: {
      do: [
        'For 48 hours eat and drink only pale or white food and drinks (rice, chicken, fish, milk, water, white bread): the enamel is open and stains easily.',
        'Expect some sensitivity to cold for a day or two; a toothpaste for sensitive teeth helps.',
        'Brush gently with a soft brush and a fluoride toothpaste.',
        'Use a straw for cold drinks if the teeth are sensitive.',
        'Keep the shade with good brushing, and ask the dentist about touch-up trays if you have them.',
      ],
      avoid: [
        'No coffee, tea, cola, red wine, soy sauce, adobo, curry, tomato sauce, berries or dark chocolate for 48 hours.',
        'No smoking or vaping for 48 hours (better still, longer: it is the main cause of stains).',
        'No coloured mouthwash or coloured toothpaste for 48 hours.',
        'Nothing very hot or very cold if the teeth are sensitive.',
        'Do not whiten again sooner than the dentist advised.',
      ],
      call: [
        'Sensitivity that is severe or still there after a few days.',
        'Gums that are white, sore or burning and not better by the next day.',
        'Uneven or patchy colour that worries you.',
        'A rash or swelling of the lips or gums.',
      ],
    },
    fil: {
      do: [
        'Sa loob ng 48 oras, kumain at uminom lang ng maputi o mapusyaw na pagkain at inumin (kanin, manok, isda, gatas, tubig, puting tinapay): bukas ang enamel at madaling mamantsa.',
        'Asahang bahagyang sensitibo sa lamig sa loob ng isa o dalawang araw; makakatulong ang toothpaste para sa sensitibong ngipin.',
        'Magsipilyo nang marahan gamit ang malambot na sipilyo at fluoride toothpaste.',
        'Gumamit ng straw sa malalamig na inumin kung sensitibo ang ngipin.',
        'Panatilihin ang kulay sa mabuting pagsisipilyo, at itanong sa dentista ang tungkol sa touch-up tray kung mayroon ka.',
      ],
      avoid: [
        'Walang kape, tsaa, cola, red wine, toyo, adobo, curry, tomato sauce, berries o dark chocolate sa loob ng 48 oras.',
        'Walang sigarilyo o vape sa loob ng 48 oras (mas mabuti kung mas matagal: ito ang pangunahing sanhi ng mantsa).',
        'Walang may kulay na mouthwash o may kulay na toothpaste sa loob ng 48 oras.',
        'Walang napakainit o napakalamig kung sensitibo ang ngipin.',
        'Huwag magpa-whitening ulit nang mas maaga kaysa sa ipinayo ng dentista.',
      ],
      call: [
        'Sensitibidad na matindi o naroon pa rin pagkalipas ng ilang araw.',
        'Gilagid na pumuti, masakit o mahapdi, at hindi bumubuti kinabukasan.',
        'Hindi pantay o batik-batik na kulay na nakababahala sa iyo.',
        'Pantal o pamamaga ng labi o gilagid.',
      ],
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Which sheet a fee-guide row gets
// ---------------------------------------------------------------------------------------------

/**
 * The codes of the default fee guide (src/data/directory.ts, signup_clinic() in 006, the seed).
 * Consultation, X-ray, fluoride and sealant have no sheet: nothing to look after.
 */
const BY_CODE: Record<string, AftercareKind> = {
  extraction: 'extraction',
  wisdom: 'surgical_extraction',
  rootcanal: 'root_canal',
  restoration: 'filling',
  prophylaxis: 'cleaning',
  crown: 'crown',
  bridge: 'crown',
  veneers: 'crown',
  dentures: 'denture',
  braces: 'braces_adjustment',
  whitening: 'whitening',
};

/**
 * Words in a procedure's name (a clinic renames and adds rows), most specific first, so "Wisdom tooth
 * removal" is surgical before it is an extraction, "Denture cleaning" is about the denture, and
 * "Composite veneer" is a crown-type sheet before it is a filling.
 */
const BY_WORD: [RegExp, AftercareKind][] = [
  [/wisdom|surgical|impacted|odontectomy|third molar/, 'surgical_extraction'],
  [/extract|bunot|exodont/, 'extraction'],
  [/root canal|endo|\brct\b|pulp/, 'root_canal'],
  [/denture|pustiso/, 'denture'],
  [/crown|bridge|veneer|onlay|inlay|jacket/, 'crown'],
  [/brace|orthodont/, 'braces_adjustment'],
  [/whiten|bleach/, 'whitening'],
  [/filling|restor|pasta|composite|amalgam/, 'filling'],
  [/clean|prophy|scaling|linis|polish/, 'cleaning'],
];

/** Maps a procedure_catalog row (code, name, category) to a sheet: the code first, then words in the name, then the category for orthodontics alone. Null when nothing fits. */
export function kindForCatalog(code: string | null, name: string | null, category: string | null): AftercareKind | null {
  const c = (code ?? '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BY_CODE, c)) return BY_CODE[c];
  const words = ` ${(name ?? '').toLowerCase()} ${c.replace(/[_-]+/g, ' ')} `;
  for (const [re, kind] of BY_WORD) if (re.test(words)) return kind;
  // A category alone is too broad to guess a sheet from ("restore" is fillings, root canals and crowns;
  // "surgery" holds more than extractions), except orthodontics, where every visit is an adjustment.
  if ((category ?? '').trim().toLowerCase() === 'ortho') return 'braces_adjustment';
  return null;
}

// ---------------------------------------------------------------------------------------------
// The evening text
// ---------------------------------------------------------------------------------------------

/**
 * The GSM 03.38 basic character set. A text made only of these fits 160 characters a segment; one
 * character outside it (a curly quote, an en dash, ₱, an emoji) turns the whole text into UCS-2 and
 * halves what fits. The extension table (^ { } \ [ ] ~ | €) is left out too: each of those costs two.
 */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** True when every character of `s` is in the GSM 03.38 basic set, so `s.length` is what the network counts. */
export function isGsm(s: string): boolean {
  for (const ch of s) if (!GSM_BASIC.includes(ch)) return false;
  return true;
}

/** The characters a clinic's name or number often carries that are not GSM, turned into their plain twins; anything else non-GSM is dropped. */
function plainGsm(s: string): string {
  const swapped = s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  -​ 　]/g, ' ')
    .replace(/₱/g, 'PHP ');
  let out = '';
  for (const ch of swapped) if (GSM_BASIC.includes(ch)) out += ch;
  return out.replace(/\s+/g, ' ').trim();
}

/** "09171234567" → "0917 123 4567"; anything else as it is. */
function plainPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  const local = digits.startsWith('+63') ? `0${digits.slice(3)}` : digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
  return /^09\d{9}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : plainGsm(phone);
}

/**
 * The body of each kind's text: the two or three instructions that matter most tonight, then the
 * red flags and "call". Written to stay under 300 characters with a 30-character clinic name and
 * "0917 000 0000" (measured: 279 to 294, the denture one longest). No link, no domain, no reply asked
 * for — the sender is one-way — and GSM characters only.
 */
const TEXT_BODY: Record<AftercareKind, string> = {
  extraction:
    'after your extraction today, bite on the gauze for 30 min, then no rinsing, spitting, straws or smoking for 24 hours; soft cool food, and rest. If bleeding still soaks the gauze after 30 min, or the pain gets worse after day 2, call',
  surgical_extraction:
    'after your surgery today, bite on gauze 30 min, ice the cheek 20 min on and off, no rinsing, spitting, straws or smoking, soft food, finish any antibiotic. If bleeding soaks the gauze after 30 min, or swelling or pain gets worse from day 3, call',
  root_canal:
    'after your root canal today, chew on the other side, nothing hard or sticky on that tooth, and take the pain reliever your dentist named as the label says. If pain or swelling gets worse after 2 to 3 days, or the temporary filling comes out, call',
  filling:
    'after your filling today, wait for the numbness to go before eating, nothing hot while numb, nothing hard or sticky on it for a day. Cold sensitivity is normal. If the bite feels high, the filling chips or falls out, or pain gets worse, call',
  cleaning:
    'after your cleaning today, the gums may be a little sore and the teeth sensitive to cold for a day or two; keep brushing gently twice a day and flossing. If the gums keep bleeding, get more swollen or painful, or the sensitivity is severe, call',
  crown:
    'after your crown today, nothing sticky or very hard on it, chew on the other side while a temporary is in, and floss by pulling the floss out sideways. If the crown or temporary comes off (keep it, do not glue it) or the bite feels high, call',
  denture:
    'with your new dentures, wear them as much as you can, soft food cut small, take them out at night into water, and clean them daily with a soft brush and mild soap, not toothpaste. If a sore spot or ulcer forms, or the denture cracks or drops, call',
  braces_adjustment:
    'after your braces adjustment today, expect tenderness for 2 to 4 days, use wax on anything that rubs, brush after every meal, and no hard, sticky or chewy food. If a bracket or wire comes loose, or pokes the cheek and wax does not help, call',
  whitening:
    'after your whitening today, only pale food and drinks for 48 hours (no coffee, tea, cola, soy sauce, red wine or smoking); cold sensitivity for a day or two is normal. If it is severe, or the gums are white, sore or burning by tomorrow, call',
};

/**
 * The one evening text for a kind: "<Clinic name>: " + the instructions that matter most tonight +
 * the red flags + "call <phone>." ("call the clinic." with no number on file). At most 300 GSM
 * characters with a clinic name of 30; a longer name adds to it, so the network may send two parts.
 */
export function aftercareText(kind: AftercareKind, clinic: { name: string; phone: string | null }): string {
  const name = plainGsm(clinic.name) || 'Your dental clinic';
  const phone = clinic.phone ? plainPhone(clinic.phone) : '';
  return `${name}: ${TEXT_BODY[kind]} ${phone ? phone : 'the clinic'}.`;
}
