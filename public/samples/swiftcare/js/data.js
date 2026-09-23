/* SwiftCare Dental — site content.
   Prices and service names are taken from the live site (swiftcaredental.com).
   Keep this file as the single source of truth for services, pricing and patient guides. */

window.SC = window.SC || {};

SC.clinic = {
  name: 'SwiftCare Dental Clinic',
  phone: '0995 090 2633',
  phoneHref: 'tel:09950902633',
  email: 'info@swiftcaredental.com',
  facebook: 'https://www.facebook.com/swiftcaredentalclinic',
  messenger: 'https://m.me/swiftcaredentalclinic',
  address: '2nd Floor, Sicangco Building, MacArthur Highway, San Rafael, Tarlac City 2300',
  directions: 'https://www.google.com/maps/search/Sicangco+Building+MacArthur+Highway+San+Rafael+Tarlac+Philippines',
  // Swap to '/book' when this is merged into the Next.js app.
  bookUrl: 'https://swiftcaredental.com/book',
  timeZone: 'Asia/Manila',
  // 0 = Sunday. null = by appointment only.
  hours: { 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: [9, 18] }
};

SC.categories = [
  { id: 'all', label: 'All services' },
  { id: 'prevent', label: 'Check-ups & prevention' },
  { id: 'restore', label: 'Restorative' },
  { id: 'replace', label: 'Tooth replacement' },
  { id: 'surgery', label: 'Extractions' },
  { id: 'cosmetic', label: 'Cosmetic' },
  { id: 'ortho', label: 'Orthodontics' }
];

/* min/max in PHP. from:true = "Starting at". min:null = quoted at consultation.
   qty:true lets the estimator multiply by number of teeth/units. */
SC.services = [
  { id: 'consultation', name: 'Dental Consultation', local: 'Konsulta', cat: 'prevent', icon: 'consult', img: 'consultation.jpg',
    min: 300, from: true,
    short: 'Comprehensive oral examination, diagnosis and treatment recommendations from our licensed dentists.',
    expect: ['A full check of your teeth, gums and bite', 'Time to talk through any pain or concerns', 'X-rays if needed to see what the eye can’t', 'A clear treatment plan, with fees confirmed before work begins'] },

  { id: 'prophylaxis', name: 'Oral Prophylaxis', local: 'Linis', cat: 'prevent', icon: 'clean', img: 'oral-prophylaxis.jpg',
    min: 2000, from: true, care: 'cleaning',
    short: 'Professional dental cleaning to remove plaque, tartar, and surface stains — keeps gums healthy and teeth bright.',
    expect: ['Removal of plaque and hardened tartar', 'Polishing to lift surface stains', 'A gum check for signs of inflammation', 'Brushing and flossing tips for home'] },

  { id: 'xray', name: 'Dental X-ray', cat: 'prevent', icon: 'xray', img: 'xray.jpg',
    min: 500, max: 1500,
    short: 'Imaging that reveals cavities, bone levels and problems hidden between and below the teeth.',
    expect: ['Quick and painless — takes only a few minutes', 'Shows decay between teeth and under old fillings', 'Helps plan extractions, root canals and braces', 'Tell us if you are or might be pregnant'] },

  { id: 'fluoride', name: 'Fluoride Application', cat: 'prevent', icon: 'fluoride', img: 'fluoride.jpg',
    min: 800,
    short: 'A quick protective treatment that strengthens enamel and helps prevent cavities — especially helpful for children.',
    expect: ['Teeth are cleaned and dried', 'Fluoride is painted or placed on the teeth', 'Done in minutes, no numbing needed', 'We’ll tell you when you can eat and drink again'] },

  { id: 'sealant', name: 'Pit & Fissure Sealant', cat: 'prevent', icon: 'sealant', img: 'sealant.jpg',
    min: 1000, qty: true, unit: 'per tooth',
    short: 'A thin protective coating on the chewing surfaces of back teeth that keeps food and bacteria out of deep grooves.',
    expect: ['No drilling or numbing needed', 'Grooves are cleaned and the sealant is painted on', 'Hardened with a curing light in seconds', 'Ideal for newly erupted molars in kids and teens'] },

  { id: 'restoration', name: 'Tooth Restoration', local: 'Pasta', cat: 'restore', icon: 'filling', img: 'restoration.jpg',
    min: 2500, max: 4500, qty: true, unit: 'per tooth', care: 'filling',
    short: 'Composite/tooth-coloured fillings to restore cavities back to healthy function and natural appearance.',
    expect: ['Numbing if needed for comfort', 'Decay is removed and the tooth is cleaned', 'Tooth-coloured composite is layered and hardened with a curing light', 'Shaped and polished to match your bite'] },

  { id: 'rootcanal', name: 'Root Canal Treatment', cat: 'restore', icon: 'rootcanal', img: 'root-canal.jpg',
    min: 8000, max: 15000, qty: true, care: 'rootcanal',
    short: 'Removes infected or inflamed pulp from inside the tooth to relieve pain and save your natural tooth.',
    expect: ['The tooth is fully numbed', 'Infected pulp is removed and canals are cleaned', 'Canals are filled and sealed', 'A filling or crown protects the tooth afterward'] },

  { id: 'crown', name: 'Jacket Crowns', cat: 'restore', icon: 'crown', img: 'crown.jpg',
    min: 12000, max: 15000, qty: true,
    short: 'A full-coverage cap that protects and restores a weak, broken or root-canal-treated tooth.',
    expect: ['The tooth is shaped to make room for the crown', 'Impressions are taken for a custom fit', 'A temporary may protect the tooth in between', 'The final crown is cemented and your bite is checked'] },

  { id: 'dentures', name: 'Dentures', local: 'Pustiso', cat: 'replace', icon: 'dentures', img: 'dentures.jpg',
    min: 18000, max: 25000, care: 'dentures',
    short: 'Full or partial removable dentures, custom-fit for comfort, function and a confident smile.',
    expect: ['Impressions of your gums and remaining teeth', 'A try-in to check fit, bite and appearance', 'Final dentures fitted and adjusted', 'Follow-up adjustments for any sore spots'] },

  { id: 'bridge', name: 'Fixed Bridge', cat: 'replace', icon: 'bridge', img: 'fixed-bridge.jpg',
    min: 12000, qty: true, unit: 'per unit',
    note: 'Replacing one tooth usually takes 3 units — two anchor crowns plus the replacement tooth.',
    short: 'Permanent replacement for missing teeth anchored to adjacent teeth — natural-looking and durable.',
    expect: ['Neighbouring teeth are prepared as anchors', 'Impressions are taken for a custom bridge', 'A temporary may be placed while it’s made', 'The bridge is cemented and your bite is checked'] },

  { id: 'extraction', name: 'Tooth Extraction', local: 'Bunot', cat: 'surgery', icon: 'extraction', img: 'extraction.jpg',
    min: null, care: 'extraction',
    short: 'Simple and straightforward extraction of a damaged or problem tooth. Gentle technique, minimal downtime.',
    expect: ['Local anesthesia so the area is fully numb', 'Gentle loosening and removal of the tooth', 'Gauze placed to control bleeding', 'Aftercare guidance for smooth healing'] },

  { id: 'wisdom', name: 'Wisdom Tooth Removal', cat: 'surgery', icon: 'wisdom', img: 'wisdom-tooth.jpg',
    min: 8000, max: 12000, qty: true, unit: 'per tooth', care: 'extraction',
    short: 'Careful removal of impacted or problem wisdom teeth to prevent pain, crowding and infection.',
    expect: ['An X-ray to see the tooth’s position and roots', 'Local anesthesia for a comfortable procedure', 'Removal, sometimes in sections for less stress on the jaw', 'Clear aftercare so healing stays on track'] },

  { id: 'whitening', name: 'Teeth Whitening', cat: 'cosmetic', icon: 'whitening', img: 'teeth-whitening.jpg',
    min: 15000, qty: true, unit: 'per session', qtyLabel: 'sessions', care: 'whitening',
    short: 'In-clinic whitening that lifts deep stains for a noticeably brighter smile.',
    expect: ['A shade check before you start', 'Gums are protected before the gel is applied', 'Whitening gel is activated in timed cycles', 'Aftercare tips to keep your results longer'] },

  { id: 'veneers', name: 'Porcelain Veneers', cat: 'cosmetic', icon: 'veneers', img: 'veneers.jpg',
    min: 20000, from: true, qty: true,
    short: 'Thin porcelain shells bonded to the front of teeth to improve colour, shape and alignment.',
    expect: ['A smile consultation to plan shape and shade', 'A thin layer of enamel is prepared', 'Impressions are taken for custom veneers', 'Veneers are bonded and polished'] },

  { id: 'braces', name: 'Braces / Orthodontics', cat: 'ortho', icon: 'braces', img: 'orthodontics.jpg',
    min: 60000, max: 120000, care: 'braces',
    short: 'Braces that gradually move teeth into better alignment and correct your bite.',
    expect: ['An orthodontic assessment with X-rays and photos', 'A treatment plan with your expected timeline', 'Braces are placed — no needles needed', 'Regular adjustment visits until your smile is aligned'] }
];

/* Smile Finder — general guidance only, not a diagnosis. */
SC.urgency = {
  routine: { label: 'Book when convenient', tone: 'sage' },
  soon: { label: 'Book within a few days', tone: 'amber' },
  urgent: { label: 'Call the clinic now', tone: 'rose' }
};

SC.symptoms = [
  { id: 'toothache', label: 'Toothache', urgency: 'soon',
    title: 'Toothache or pain when biting',
    services: ['consultation', 'xray', 'restoration', 'rootcanal'],
    text: 'Pain often comes from a cavity, a cracked tooth or an irritated nerve. A consultation and X-ray show the cause so it can be treated early — often with a filling, sometimes a root canal.',
    tips: ['Rinse with warm water and gently floss to clear trapped food', 'Hold a cold compress on your cheek, 15 minutes at a time', 'Take over-the-counter pain relief as directed on the label', 'Don’t put aspirin or tablets on the gum — it can burn the tissue'] },
  { id: 'sensitive', label: 'Sensitive to cold or sweets', urgency: 'routine',
    title: 'Sensitivity to cold, heat or sweets',
    services: ['consultation', 'restoration', 'fluoride'],
    text: 'Sensitivity can signal early decay, worn enamel or receding gums. Many cases are fixed with a small filling or a protective fluoride treatment.',
    tips: ['Switch to a toothpaste made for sensitive teeth', 'Brush gently with a soft-bristled brush', 'Cut back on acidic drinks like soda and citrus juice'] },
  { id: 'gums', label: 'Bleeding or swollen gums', urgency: 'routine',
    title: 'Bleeding or swollen gums',
    services: ['prophylaxis', 'consultation'],
    text: 'Bleeding gums are often an early sign of gum inflammation caused by plaque and tartar. A professional cleaning usually helps gums recover.',
    tips: ['Keep brushing twice a day — gently, along the gumline', 'Floss daily, even if your gums bleed at first', 'Rinse with warm salt water to soothe sore gums'] },
  { id: 'cavity', label: 'Hole or dark spot', urgency: 'soon',
    title: 'A visible hole, dark spot or food trap',
    services: ['consultation', 'restoration'],
    text: 'Holes and dark spots are often cavities. Caught early, most can be restored with a tooth-coloured filling (Pasta) before they reach the nerve.',
    tips: ['Avoid sticky or very sweet foods on that side', 'Keep the area clean after meals', 'Small cavities are quicker and more affordable to fix — don’t wait'] },
  { id: 'chipped', label: 'Chipped or broken tooth', urgency: 'soon',
    title: 'Chipped or broken tooth',
    services: ['consultation', 'restoration', 'crown', 'veneers'],
    text: 'Depending on the size of the break, a tooth can be rebuilt with a filling, protected with a crown, or refined with a veneer.',
    tips: ['Save any broken pieces and bring them with you', 'Rinse with warm water; press gauze on any bleeding for 10 minutes', 'Use a cold compress to reduce swelling', 'Avoid chewing on that side until you’re seen'] },
  { id: 'missing', label: 'Missing teeth', urgency: 'routine',
    title: 'Missing one or more teeth',
    services: ['consultation', 'bridge', 'dentures'],
    text: 'Replacing missing teeth helps you chew comfortably and keeps nearby teeth from drifting. A fixed bridge or dentures are common options.',
    tips: ['Ask about fixed vs. removable options at your consultation', 'Bring any dentures you currently wear'] },
  { id: 'stains', label: 'Stained or yellow teeth', urgency: 'routine',
    title: 'Stains or yellowing',
    services: ['prophylaxis', 'whitening', 'veneers'],
    text: 'Many surface stains lift with a professional cleaning. For a brighter shade, whitening or veneers can help.',
    tips: ['Rinse with water after coffee, tea or dark sauces', 'A cleaning is usually recommended before whitening'] },
  { id: 'crooked', label: 'Crooked teeth or bite', urgency: 'routine',
    title: 'Crooked teeth or bite problems',
    services: ['consultation', 'braces'],
    text: 'Braces gradually move teeth into better alignment, making them easier to clean and improving how your teeth meet.',
    tips: ['An orthodontic assessment shows the treatment and timeline you need', 'Braces work for teens and adults alike'] },
  { id: 'wisdom', label: 'Pain at the back of the jaw', urgency: 'soon',
    title: 'Pain or swelling at the back of the jaw',
    services: ['consultation', 'xray', 'wisdom'],
    text: 'This is often a wisdom tooth coming in at an angle or partly covered by gum. An X-ray shows its position and whether removal is recommended.',
    tips: ['Rinse with warm salt water after meals', 'Keep the area clean with a soft brush', 'Get care right away if you have a fever or can’t open your mouth fully'] },
  { id: 'swelling', label: 'Face swelling or fever', urgency: 'urgent', emergency: 'swelling',
    title: 'Facial swelling, fever or pus',
    services: ['consultation'],
    text: 'Swelling with fever can mean a dental infection that is spreading. Please call us right away so we can see you as soon as possible.',
    tips: ['Call the clinic now', 'Call 911 or go to the nearest ER if you have trouble breathing or swallowing, or swelling spreading to your eye or neck'] },
  { id: 'knocked', label: 'Knocked-out tooth', urgency: 'urgent', emergency: 'knocked',
    title: 'Knocked-out tooth',
    services: ['consultation'],
    text: 'Time matters. A knocked-out adult tooth has the best chance of being saved if a dentist sees you within about 30–60 minutes.',
    tips: ['Pick it up by the crown (the white part), never the root', 'Rinse gently with milk or water — don’t scrub', 'Keep it in a cup of milk and call us right away'] },
  { id: 'checkup', label: 'Just a check-up', urgency: 'routine',
    title: 'Routine check-up & cleaning',
    services: ['consultation', 'prophylaxis', 'fluoride', 'sealant'],
    text: 'Regular check-ups catch problems early, when they’re simpler to treat. For kids, fluoride and sealants add extra cavity protection.',
    tips: ['Most people are advised to visit about every 6 months', 'Existing patients can rebook online in about 15 seconds'] }
];

/* Dental emergency first aid — general guidance. */
SC.emergencies = [
  { id: 'knocked', title: 'Knocked-out tooth', badge: 'Act within 30–60 min',
    steps: ['Find the tooth and pick it up by the crown (the chewing part). Never touch the root.', 'If it’s dirty, rinse it gently with milk or clean water for a few seconds. Don’t scrub or dry it.', 'If you can, ease it back into the socket and bite on clean gauze or cloth to hold it.', 'If it won’t go back in, keep it moist in a small cup of milk.', 'Call us and come in right away. The sooner you’re seen, the better the chance of saving it.'],
    note: 'Don’t put a baby tooth back in. Just bring your child in to be checked.' },
  { id: 'toothache', title: 'Severe toothache', badge: 'See us within 1–2 days',
    steps: ['Rinse your mouth with warm water.', 'Gently floss around the tooth to remove any trapped food.', 'Hold a cold compress on the outside of your cheek, 15 minutes at a time.', 'Take over-the-counter pain relief as directed on the label.', 'Call to book the earliest available appointment.'],
    note: 'Never place aspirin or painkillers directly on the gum. It can burn the tissue.' },
  { id: 'broken', title: 'Chipped or broken tooth', badge: 'See us soon',
    steps: ['Save any pieces of the tooth in milk or a clean container.', 'Rinse your mouth and the pieces with warm water.', 'Press gauze on any bleeding for about 10 minutes.', 'Use a cold compress to limit swelling and pain.', 'Call us. Sharp edges can be covered with sugar-free gum until you’re seen.'] },
  { id: 'swelling', title: 'Swelling or abscess', badge: 'Call today',
    steps: ['Call the clinic right away. Swelling often means infection.', 'Rinse gently with warm salt water (½ teaspoon salt in a glass of water) a few times a day.', 'Use a cold compress on the outside of your face, not heat.', 'Don’t try to pop or drain a bump on your gum.'],
    note: 'Go to the ER if the swelling spreads toward your eye or neck, or you have a fever with trouble swallowing.' },
  { id: 'bleeding', title: 'Bleeding after extraction', badge: 'Apply pressure',
    steps: ['Fold a fresh piece of gauze and place it over the socket.', 'Bite down firmly and steadily for 30–45 minutes without peeking.', 'Sit upright. Avoid spitting, rinsing or using a straw.', 'A damp black tea bag wrapped in gauze can also help the blood clot.', 'If heavy bleeding continues after a few hours of pressure, call us.'] },
  { id: 'lip', title: 'Bitten lip or tongue', badge: 'First aid',
    steps: ['Gently clean the area with water.', 'Press firmly with clean gauze or cloth.', 'Use a cold compress to reduce swelling.', 'If the bleeding hasn’t stopped after 15 minutes of pressure, go to the nearest ER.'] },
  { id: 'braces', title: 'Broken bracket or poking wire', badge: 'Not urgent',
    steps: ['Gently push a poking wire into a better spot with a cotton swab or pencil eraser.', 'Cover sharp ends or a loose bracket with orthodontic wax or a small cotton ball.', 'Don’t cut the wire yourself unless we tell you to.', 'Call or message us to schedule a repair.'] }
];

/* Aftercare guides. */
SC.aftercare = [
  { id: 'extraction', label: 'Extraction',
    do: ['Bite on gauze for 30–45 minutes after your visit', 'Use a cold compress on your cheek for the first day: 15 minutes on, 15 off', 'Eat soft, cool foods and chew on the other side', 'From the next day, rinse gently with warm salt water after meals', 'Take any medicines exactly as prescribed'],
    avoid: ['Spitting, rinsing hard or using a straw for 24 hours', 'Smoking or vaping for at least 72 hours if you can', 'Hot drinks, alcohol and crunchy food on the first day', 'Touching the area with your tongue or fingers'],
    call: ['Bleeding stays heavy after a few hours of pressure', 'Pain gets worse after 2–3 days (possible dry socket)', 'Fever, pus, or swelling that grows after day 3'] },
  { id: 'filling', label: 'Filling (Pasta)',
    do: ['Wait until the numbness wears off before eating', 'Brush and floss as usual, gently around the new filling', 'Expect mild sensitivity to hot or cold for a few days'],
    avoid: ['Chewing while numb, since it’s easy to bite your cheek or tongue', 'Very hot drinks while your mouth is still numb', 'Ice, bones or hard candy on the new filling for the first day'],
    call: ['Your bite feels high or uneven', 'Sensitivity lasts more than two weeks or gets worse', 'Sharp pain when you bite down'] },
  { id: 'cleaning', label: 'Cleaning (Linis)',
    do: ['Expect your gums to feel a little tender for a day or two', 'Rinse with warm salt water if your gums are sore', 'Brush twice a day with fluoride toothpaste and floss daily', 'If fluoride was applied, wait as advised before eating or drinking'],
    avoid: ['Very spicy or acidic food while your gums are tender', 'Skipping floss. Gums usually stop bleeding once flossing is a daily habit'],
    call: ['Bleeding that doesn’t settle after 2–3 days', 'Swelling or pain that is increasing'] },
  { id: 'rootcanal', label: 'Root canal',
    do: ['Wait for the numbness to wear off before eating', 'Expect some tenderness for a few days, which is normal', 'Take pain relief or antibiotics exactly as advised', 'Come back for your final filling or crown as scheduled'],
    avoid: ['Biting hard on the treated tooth until it’s fully restored', 'Delaying a recommended crown, because treated teeth can crack'],
    call: ['Severe pain or swelling after 2–3 days', 'Your temporary filling falls out', 'Rash, itching or hives after taking medicine'] },
  { id: 'whitening', label: 'Whitening',
    do: ['Stick to light-coloured foods for 48 hours: rice, chicken, fish, milk', 'Use toothpaste for sensitive teeth if you feel twinges', 'Rinse with water after coloured drinks from then on'],
    avoid: ['Coffee, tea, soft drinks and red wine for 48 hours', 'Dark sauces like soy sauce, adobo and bagoong for 48 hours', 'Smoking, which re-stains teeth quickly'],
    call: ['Sensitivity lasts more than a few days', 'Gum irritation that doesn’t settle within a day'] },
  { id: 'braces', label: 'Braces',
    do: ['Eat soft foods for the first few days: lugaw, sopas, eggs, pasta', 'Put orthodontic wax on brackets that rub your cheeks', 'Brush after every meal and use an interdental brush around brackets', 'Take over-the-counter pain relief as directed if your teeth feel sore'],
    avoid: ['Hard foods like chicharon, nuts, ice and hard candy', 'Sticky foods like chewing gum and caramel', 'Biting into corn on the cob or whole apples. Cut them up first'],
    call: ['A bracket comes loose or a wire is poking you', 'Soreness lasts more than a week after an adjustment'] },
  { id: 'dentures', label: 'Dentures',
    do: ['Wear them as instructed while your mouth adjusts', 'Start with soft foods cut into small pieces', 'Clean them daily with a soft brush and denture cleanser', 'Keep them in water or solution when not worn so they don’t dry out'],
    avoid: ['Regular toothpaste, which is abrasive and scratches dentures', 'Hot water, which can warp them', 'Bending or adjusting them yourself'],
    call: ['Sore spots that don’t improve after a few days', 'Dentures feel loose or rock when you chew', 'A crack or chip in the denture'] }
];

/* Coverage guide — PhilHealth's preventive dental benefit (PhilHealth Circular 2024-0034,
   in force since 28 Dec 2024) and how HMO dental cards work. General guidance: the clinic
   confirms its own accreditation and what your card covers. */
SC.coverage = {
  philhealth: {
    title: 'PhilHealth pays for preventive dental care',
    intro: 'Since December 2024, PhilHealth covers basic preventive dental services for every registered member and dependent — up to ₱1,000 a year. Most people don’t know this yet.',
    covered: [
      { what: 'Two check-up visits a year', detail: 'At least four months apart. Each visit covers an oral screening, a cleaning (prophylaxis) and fluoride varnish — ₱300 per visit.' },
      { what: 'Sealants or small fillings', detail: 'Pit & fissure sealants or Class V restorations, ₱200 per tooth, up to two teeth a year.' },
      { what: 'Emergency extraction', detail: 'When a tooth has to come out urgently.' }
    ],
    steps: [
      'Be registered with a YAKAP (formerly Konsulta) primary-care provider. If you’re not, register at any YAKAP clinic — it’s free.',
      'Ask your YAKAP clinic for a dental referral, or go straight to a PhilHealth-accredited dental clinic linked to one.',
      'Bring your PhilHealth number and a valid ID. The clinic files the claim; you don’t.',
      'Space your two visits at least four months apart so both are covered.'
    ],
    outOfPocket: 'At government facilities there is no co-payment. Private clinics may ask you to pay the difference, but PhilHealth caps it: ₱1,500 for the preventive package and ₱600 for an emergency extraction.',
    note: 'Ask us whether the clinic is PhilHealth-accredited for dental benefits before you rely on this. The benefit is delivered only through YAKAP clinics and accredited dental clinics.'
  },
  hmo: {
    title: 'Using your HMO card at the dentist',
    intro: 'Most company HMO plans include a dental benefit. It usually works differently from your hospital coverage, so a minute of preparation saves a wait at the desk.',
    covered: [
      { what: 'Usually covered', detail: 'Consultation, oral prophylaxis (cleaning) once or twice a year, simple extractions, temporary fillings and basic gum treatment.' },
      { what: 'Usually not covered', detail: 'Cosmetic work such as whitening and veneers, braces, implants, crowns and bridges, and most major restorations.' },
      { what: 'Often needs approval first', detail: 'Anything beyond a cleaning or consult may need a letter of authorization (LOA) or approval from your HMO before treatment.' }
    ],
    steps: [
      'Tell us your HMO when you book so we can check that the clinic is accredited with it.',
      'Bring your HMO card and a valid ID to the visit.',
      'For anything beyond a cleaning, we’ll tell you whether your HMO needs to approve it first and help you request it.',
      'Pay only the part your plan doesn’t cover — we’ll show you the breakdown before treatment.'
    ],
    outOfPocket: 'Your HMO decides what is covered, how often, and up to what amount. The same procedure can be fully covered on one plan and excluded on another.',
    note: 'Always confirm with your HMO. Coverage tables change, and accreditation is per clinic.'
  }
};

/* Patient stories as published on swiftcaredental.com/testimonials. */
SC.testimonials = [
  { quote: 'The staff is incredibly warm and professional. My kids used to be scared of the dentist, but now they actually look forward to visits! The modern equipment and gentle approach made all the difference.', name: 'Maria Santos', place: 'Tarlac City', tag: 'Pediatric Dentistry' },
  { quote: 'Best dental experience I’ve ever had. The clinic is clean, modern, and the dentist took time to explain everything clearly. No rushed consultation, no upselling — just honest, quality care.', name: 'Juan Dela Cruz', place: 'San Fernando, Pampanga', tag: 'Root Canal Treatment' },
  { quote: 'Had my braces done here and the results are amazing! Very affordable compared to other clinics in Tarlac. The orthodontist was patient and answered all my questions during every visit.', name: 'Ana Reyes', place: 'Tarlac City', tag: 'Orthodontics' },
  { quote: 'Went in for a teeth cleaning and was blown away by the attention to detail. The hygienist was thorough and the price was very reasonable. I will definitely be coming back for all my dental needs.', name: 'Roberto Lim', place: 'Capas, Tarlac', tag: 'Dental Cleaning' },
  { quote: 'My teeth whitening results exceeded my expectations! The team explained every step and made me feel comfortable throughout the procedure. Highly recommend SwiftCare for anyone wanting quality dental care.', name: 'Carmela Villanueva', place: 'Concepcion, Tarlac', tag: 'Teeth Whitening' },
  { quote: 'Needed a wisdom tooth extraction and was nervous, but the surgical team made it painless and efficient. Aftercare instructions were clear and follow-up was excellent. Truly professional service.', name: 'Marco Santiago', place: 'Paniqui, Tarlac', tag: 'Wisdom Tooth Removal' }
];

SC.faqs = [
  { q: 'Do you accept walk-ins?', a: 'Yes, walk-ins are welcome during clinic hours, Monday to Saturday from 9:00 AM to 6:00 PM. Booking online lets you pick the time that suits you.' },
  { q: 'I’ve been to SwiftCare before. Do I need to fill out forms again?', a: 'No. On the booking page, choose “I’m an Existing Patient” and enter your Patient Number and Last Name. It takes about 15 seconds.' },
  { q: 'Are the prices on the website final?', a: 'The prices listed are estimates. Your final fee is confirmed during your consultation, after the dentist has checked what you need.' },
  { q: 'Are you open on Sundays?', a: 'Sundays are by appointment only. Call us at 0995 090 2633 or message us on Facebook to arrange a visit.' },
  { q: 'I get nervous at the dentist. What can I do?', a: 'You’re not alone. Tell our team when you arrive, because we take a gentle, anxiety-free approach with patients of all ages. It also helps to agree on a hand signal to pause at any time, and to ask the dentist to explain each step before it happens.' },
  { q: 'Do you treat children?', a: 'Yes, we care for the whole family. Preventive treatments like fluoride application and pit & fissure sealants are especially helpful for protecting children’s teeth.' },
  { q: 'How often should I have a check-up and cleaning?', a: 'Most people are advised to have a check-up and cleaning about every six months. Your dentist may suggest a different schedule based on your gum health and cavity risk. Use the check-up reminder in our Patient Care Hub to add your next visit to your calendar.' },
  { q: 'What should I bring to my first visit?', a: 'Bring a valid ID, a list of any medicines you take, and any previous dental X-rays or records you have. Please tell us about allergies, pregnancy, or conditions such as diabetes or heart problems.' }
];
