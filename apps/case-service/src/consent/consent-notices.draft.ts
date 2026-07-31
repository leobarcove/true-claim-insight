import { ConsentPurpose } from '@prisma/client';

/**
 * DRAFT consent wording — **not legally reviewed**.
 *
 * These are seeded as unapproved notices. The service refuses to record consent
 * against an unapproved notice, so nothing here can reach a claimant until a
 * named person approves it. That is deliberate: consent wording is a legal
 * instrument, and software that quietly starts using unreviewed text produces
 * consents that are worthless precisely when they are needed.
 *
 * What still needs a human before approval:
 *  - a Malaysian data-protection practitioner to review the English;
 *  - a native Bahasa Malaysia speaker to review the translation, since a
 *    translation that drifts in meaning is worse than none — the subject would
 *    have agreed to something other than what the English says;
 *  - confirmation of the named offshore recipients, which change as providers
 *    change, and which s.129 requires the subject to be told about.
 *
 * PDPA s.7 requires the notice in **both English and Bahasa Malaysia**, which is
 * why every purpose below carries both and why the service will not approve a
 * version with only one.
 */
export interface DraftNotice {
  purpose: ConsentPurpose;
  version: number;
  locale: 'en' | 'ms';
  title: string;
  body: string;
}

export const DRAFT_CONSENT_NOTICES: DraftNotice[] = [
  {
    purpose: ConsentPurpose.CLAIM_PROCESSING,
    version: 1,
    locale: 'en',
    title: 'Processing your claim',
    body: [
      'We collect and process your personal data — including your name, identity card number, contact details, bank account details and the documents you provide — in order to assess and administer your insurance claim on behalf of your insurer.',
      'We may share this data with your insurer, and with third parties instructed for your claim such as repairers, medical providers or experts, where doing so is necessary to assess it.',
      'Providing this data is necessary to process your claim. If you do not provide it, we may be unable to assess your claim.',
      'You may ask us for a copy of the personal data we hold about you, ask us to correct it, or withdraw this consent at any time by contacting us. Withdrawing consent may mean we can no longer process your claim.',
      'We keep claim records for at least seven years, as our regulator requires.',
    ].join('\n\n'),
  },
  {
    purpose: ConsentPurpose.CLAIM_PROCESSING,
    version: 1,
    locale: 'ms',
    title: 'Pemprosesan tuntutan anda',
    body: [
      'Kami mengumpul dan memproses data peribadi anda — termasuk nama, nombor kad pengenalan, maklumat perhubungan, butiran akaun bank dan dokumen yang anda berikan — untuk menilai dan mentadbir tuntutan insurans anda bagi pihak penanggung insurans anda.',
      'Kami mungkin berkongsi data ini dengan penanggung insurans anda, dan dengan pihak ketiga yang diarahkan untuk tuntutan anda seperti pembaiki, penyedia perubatan atau pakar, apabila ia perlu untuk menilai tuntutan tersebut.',
      'Pemberian data ini adalah perlu untuk memproses tuntutan anda. Jika anda tidak memberikannya, kami mungkin tidak dapat menilai tuntutan anda.',
      'Anda boleh meminta salinan data peribadi yang kami simpan mengenai anda, meminta kami membetulkannya, atau menarik balik persetujuan ini pada bila-bila masa dengan menghubungi kami. Penarikan balik persetujuan mungkin bermakna kami tidak lagi boleh memproses tuntutan anda.',
      'Kami menyimpan rekod tuntutan selama sekurang-kurangnya tujuh tahun, sebagaimana yang dikehendaki oleh pihak berkuasa kawal selia kami.',
    ].join('\n\n'),
  },

  {
    purpose: ConsentPurpose.BIOMETRIC_ANALYSIS,
    version: 1,
    locale: 'en',
    title: 'Recording and analysis of your video assessment',
    body: [
      'If your claim is assessed by video, we record the session. The recording, including your voice and image, is analysed by automated systems that assess indicators such as tone of voice and attention.',
      'Voice and facial data are treated as sensitive personal data under Malaysian law, and we ask for your explicit consent to process them.',
      'These automated results are one input among several. They never decide your claim on their own: a qualified adjuster reviews the evidence and makes the assessment, and your insurer decides the outcome.',
      'You may refuse this consent. If you do, your claim will be assessed without a video session, by document review or another method. Refusing will not, by itself, cause your claim to be declined.',
      'You may withdraw this consent at any time. We will stop analysing your recording, though we must retain records already made for the period our regulator requires.',
    ].join('\n\n'),
  },
  {
    purpose: ConsentPurpose.BIOMETRIC_ANALYSIS,
    version: 1,
    locale: 'ms',
    title: 'Rakaman dan analisis sesi penilaian video anda',
    body: [
      'Jika tuntutan anda dinilai melalui video, kami merakam sesi tersebut. Rakaman itu, termasuk suara dan imej anda, dianalisis oleh sistem automatik yang menilai petunjuk seperti nada suara dan tumpuan.',
      'Data suara dan wajah dianggap sebagai data peribadi sensitif di bawah undang-undang Malaysia, dan kami memohon persetujuan jelas anda untuk memprosesnya.',
      'Keputusan automatik ini hanyalah satu daripada beberapa input. Ia tidak pernah menentukan tuntutan anda dengan sendirinya: seorang penilai bertauliah akan menyemak bukti dan membuat penilaian, dan penanggung insurans anda yang memutuskan hasilnya.',
      'Anda boleh menolak persetujuan ini. Jika anda menolak, tuntutan anda akan dinilai tanpa sesi video, melalui semakan dokumen atau kaedah lain. Penolakan itu sendiri tidak akan menyebabkan tuntutan anda ditolak.',
      'Anda boleh menarik balik persetujuan ini pada bila-bila masa. Kami akan berhenti menganalisis rakaman anda, walaupun kami perlu menyimpan rekod yang telah dibuat untuk tempoh yang dikehendaki oleh pihak berkuasa kawal selia kami.',
    ].join('\n\n'),
  },

  {
    purpose: ConsentPurpose.CROSS_BORDER_TRANSFER,
    version: 1,
    locale: 'en',
    title: 'Processing of your data outside Malaysia',
    body: [
      'Some of the services we use to assess claims operate outside Malaysia. This means your personal data may be sent to, and processed in, another country.',
      'The recipients, the country each operates from, and what each is used for are listed in our privacy notice, which we keep current.',
      'We require these providers by contract to protect your data to the standard Malaysian law requires, and we transfer it only where it is needed for the purpose described.',
      'You may withdraw this consent at any time. We will then use only providers that process your data within Malaysia, which may mean some assessment methods are no longer available for your claim.',
    ].join('\n\n'),
  },
  {
    purpose: ConsentPurpose.CROSS_BORDER_TRANSFER,
    version: 1,
    locale: 'ms',
    title: 'Pemprosesan data anda di luar Malaysia',
    body: [
      'Sebahagian daripada perkhidmatan yang kami gunakan untuk menilai tuntutan beroperasi di luar Malaysia. Ini bermakna data peribadi anda mungkin dihantar ke, dan diproses di, negara lain.',
      'Penerima, negara tempat setiap satu beroperasi, dan tujuan penggunaannya disenaraikan dalam notis privasi kami, yang sentiasa kami kemas kini.',
      'Kami mewajibkan penyedia ini melalui kontrak untuk melindungi data anda mengikut piawaian yang dikehendaki oleh undang-undang Malaysia, dan kami hanya memindahkannya apabila ia diperlukan untuk tujuan yang dinyatakan.',
      'Anda boleh menarik balik persetujuan ini pada bila-bila masa. Kami kemudiannya hanya akan menggunakan penyedia yang memproses data anda di dalam Malaysia, yang mungkin bermakna sesetengah kaedah penilaian tidak lagi tersedia untuk tuntutan anda.',
    ].join('\n\n'),
  },
];

/** Locales PDPA s.7 requires a notice to exist in before it can be approved. */
export const REQUIRED_LOCALES = ['en', 'ms'] as const;
