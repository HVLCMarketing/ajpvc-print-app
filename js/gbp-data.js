// Google Business Profile copy for each facility and provider.
// {CITY}, {LOCATION}, {ADDRESS} and {HOURS} are filled from the selected location; {NAME} and {CRED} from the provider.
// Edit the wording here; the app shows it with copy buttons and character counts.
window.AJPVC_GBP = {
  facilities: {
    ajpvc: {
      name: 'Advanced Joint Pain & Vascular Center',
      categories: { primary: 'Pain control clinic', additional: ['Medical clinic', 'Vascular center (if offered)'] },
      description: 'Advanced Joint Pain & Vascular Center, a division of Heart Vascular & Leg Center, offers consultations and follow-up visits for persistent joint and tendon pain in the knee, hip, shoulder, hand and heel. Our team evaluates whether minimally invasive, image-guided options such as genicular artery embolization (GAE) and transcatheter arterial microembolization (TAME) may fit your diagnosis, alongside conservative care. We also see patients for circulation, vein and wound concerns. Procedures are performed at our Bakersfield center. Se habla español.',
      services: [
        ['Joint pain consultation', 'Evaluation of persistent knee, hip, shoulder, hand or heel pain, including a review of your imaging and the treatments you have tried.'],
        ['Genicular artery embolization (GAE)', 'A minimally invasive, image-guided option for selected patients with knee osteoarthritis pain that has not improved with conservative care.'],
        ['Transcatheter arterial microembolization (TAME)', 'Evaluation for selected chronic inflammatory conditions of the hip, shoulder and hand.'],
        ['Plantar fascia embolization (PFE)', 'Evaluation for selected patients with persistent plantar fasciitis heel pain despite standard care.'],
        ['Peripheral nerve stimulation (PNS)', 'Targeted stimulation to help manage certain types of persistent pain.'],
        ['Circulation and vein evaluation', 'Assessment of leg pain, swelling, varicose veins and slow-healing wounds, with testing through Heart Vascular & Leg Center.']
      ],
      posts: [
        ['Now seeing patients in {CITY}', 'Advanced Joint Pain & Vascular Center is now offering consultations and follow-up visits at {LOCATION}. If knee, hip, shoulder, hand or heel pain has kept going despite physical therapy, medicine or injections, book a screening to talk through your options. Se habla español.', 'Book'],
        ['Knee pain that won’t quit?', 'Genicular artery embolization (GAE) is a minimally invasive, image-guided option for selected people with knee osteoarthritis pain. It does not replace the joint or regrow cartilage, and results vary. A screening visit helps decide whether it fits your diagnosis and goals.', 'Learn more'],
        ['Hip, shoulder or hand pain', 'For selected chronic inflammatory conditions of the hip, shoulder and hand, our team evaluates whether transcatheter arterial microembolization (TAME) may be an option. Tell us what the pain is keeping you from doing, and we will review your history, imaging and alternatives with you.', 'Book'],
        ['Persistent heel pain', 'Plantar fasciitis that has not improved with stretching, footwear changes and other standard care may be worth a closer look. Ask about our evaluation for plantar fascia embolization, an emerging option for selected patients.', 'Learn more'],
        ['Getting ready for your first visit', 'Bring your medication list, insurance card, any recent X-rays or MRI reports, and a short list of treatments you have already tried. Write down the activity you most want to get back to. It helps us focus on what matters to you.', 'Book'],
        ['We check your insurance first', 'Before your visit, our team verifies your coverage, referral requirements and any expected costs, including Medicare and most major plans. Coverage depends on the procedure and your plan. Se habla español.', 'Call']
      ]
    },
    hvlc: {
      name: 'Heart Vascular & Leg Center',
      categories: { primary: 'Cardiologist', additional: ['Medical clinic', 'Vein clinic (if offered)', 'Wound care service (if offered)'] },
      description: 'Heart Vascular & Leg Center treats heart, artery, vein and wound conditions and persistent joint pain with minimally invasive, image-guided care. Services include vascular ultrasound and ankle-brachial index testing, angiography, angioplasty and stenting, vein treatments such as radiofrequency ablation, VenaSeal and sclerotherapy, same-day DVT evaluation for most plans, specialized wound care and hyperbaric oxygen therapy, and cardiac testing including echocardiograms, stress tests and rhythm monitoring. Led by Chief Medical Officer Dr. Vinod Kumar. Se habla español.',
      services: [
        ['Peripheral artery disease (PAD) care', 'Testing and treatment for leg pain with walking, rest pain and poor circulation, including angiography, angioplasty, stenting and atherectomy.'],
        ['Vein treatment', 'Radiofrequency ablation, VenaSeal, Varithena, foam sclerotherapy, MOCA and phlebectomy for symptomatic varicose veins and venous insufficiency.'],
        ['Same-day DVT evaluation', 'Ultrasound evaluation for a suspected blood clot in the leg, available the same day with most major plans.'],
        ['Wound care', 'Vascular assessment and specialized wound care for nonhealing leg and foot wounds, including hyperbaric oxygen therapy for qualifying wounds.'],
        ['Vascular testing', 'Arterial and venous duplex ultrasound and ankle-brachial index (ABI) testing.'],
        ['Cardiac testing', 'EKG, echocardiogram, stress testing and heart rhythm monitoring.'],
        ['Joint pain care', 'Evaluation for minimally invasive joint pain treatment through Advanced Joint Pain & Vascular Center.']
      ],
      posts: [
        ['Leg swelling or pain in one leg?', 'A sudden swollen, painful or warm leg can be a sign of a blood clot (DVT). We offer same-day ultrasound evaluation for most major plans. If you have chest pain or shortness of breath, call 911 instead.', 'Call'],
        ['Leg pain when you walk?', 'Cramping or aching in the calves, thighs or hips that eases with rest can be a sign of peripheral artery disease (PAD). A quick, painless ankle-brachial index (ABI) test helps check your circulation.', 'Book'],
        ['Aching, heavy or bulging veins', 'Varicose veins can cause aching, swelling and skin changes. After an ultrasound to find the source, many vein treatments are done in the office with a short recovery. Coverage depends on your plan.', 'Book'],
        ['A wound that won’t heal', 'A foot or leg sore that is not healing may need a circulation check, not just a new dressing. People with diabetes should check their feet daily and contact their care team about any new or slow-healing wound.', 'Learn more'],
        ['Heart testing close to home', 'We provide EKGs, echocardiograms, stress testing and heart rhythm monitoring, with results shared with your doctor. Ask your physician whether a referral is right for you.', 'Book'],
        ['Meet Dr. Vinod Kumar', 'Our Chief Medical Officer, Dr. Vinod Kumar, is a board-certified cardiologist and vascular specialist who treats artery, vein, wound and joint pain conditions with minimally invasive, image-guided techniques. Se habla español.', 'Learn more']
      ]
    }
  },
  // role decides the suggested Google category and the description wording
  providers: [
    { name: 'Vinod Kumar', cred: 'MD, FACC, RPVI', role: 'cmo' },
    { name: 'Newton Phuong', cred: 'MD', role: 'md' },
    { name: 'Mark Le', cred: 'MD, RPVI', role: 'md' },
    { name: 'Gerardo Murguia', cred: 'PA-C', role: 'pa' },
    { name: 'Adrian Rojas', cred: 'PA', role: 'pa' },
    { name: 'Noel Guido', cred: 'PA-C', role: 'pa' },
    { name: 'Jasleen Kaur', cred: 'PA-C', role: 'pa' },
    { name: 'Elsita Mathew', cred: 'FNP-C', role: 'np' },
    { name: 'Magdalene Tanyi Epse Ayuk', cred: 'FNP-C', role: 'np' },
    { name: 'Noemi Mitchell', cred: 'FNP-C', role: 'np' },
    { name: 'Shahrzad Irani', cred: 'FNP-C', role: 'np' }
  ],
  roles: {
    cmo: { title: 'Chief Medical Officer', category: 'Cardiologist',
      text: 'Dr. {NAME}, {CRED}, is the Chief Medical Officer of Heart Vascular & Leg Center and Advanced Joint Pain & Vascular Center. A board-certified cardiologist and vascular specialist, he treats arterial and venous disease, nonhealing wounds and joint pain with minimally invasive, image-guided techniques, and trained in joint embolization in Tokyo with Dr. Yuji Okuno. He sees patients at {LOCATION}.' },
    md: { title: 'Physician', category: 'Doctor',
      text: 'Dr. {NAME}, {CRED}, is a physician with {FACILITY}, part of a team that treats artery, vein, wound and joint pain conditions with minimally invasive, image-guided care. Dr. {LAST} sees patients at {LOCATION}.' },
    pa: { title: 'Physician assistant', category: 'Physician assistant (if offered), otherwise Medical clinic',
      text: '{NAME}, {CRED}, is a physician assistant with {FACILITY}. Working with our physician team, {FIRST} sees patients for joint pain, circulation, vein and wound concerns, from first evaluation through follow-up. {FIRST} sees patients at {LOCATION}.' },
    np: { title: 'Family nurse practitioner', category: 'Nurse practitioner',
      text: '{NAME}, {CRED}, is a family nurse practitioner with {FACILITY}. Working with our physician team, {FIRST} sees patients for joint pain, circulation, vein and wound concerns, from first evaluation through follow-up. {FIRST} sees patients at {LOCATION}.' }
  }
};
