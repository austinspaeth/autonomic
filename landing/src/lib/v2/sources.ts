// The research and clinical guidance the feature pages cite. Every entry was
// checked against its DOI record (Crossref) or the publisher's own page; add a
// new one the same way, never from memory. A page lists the ids it cites, in
// the order its <Cite n> numbers first appear.
export interface Source {
  authors: string;
  title: string;
  /** Journal or publisher, as it would appear in a reference list. */
  where: string;
  year: number;
  url: string;
  /** What the page uses it for, in plain words. */
  note: string;
  /** schema.org type: guidance documents are not journal articles. */
  kind?: 'ScholarlyArticle' | 'Report' | 'WebPage';
}

const doi = (d: string) => `https://doi.org/${d}`;

export const SOURCES = {
  taskforce1996: {
    authors: 'Task Force of the European Society of Cardiology and the North American Society of Pacing and Electrophysiology',
    title: 'Heart rate variability: standards of measurement, physiological interpretation, and clinical use',
    where: 'Circulation 93(5):1043–1065', year: 1996, url: doi('10.1161/01.CIR.93.5.1043'),
    note: 'The founding standard for measuring HRV and what it reflects.'
  },
  shaffer2017: {
    authors: 'Shaffer F, Ginsberg JP',
    title: 'An overview of heart rate variability metrics and norms',
    where: 'Frontiers in Public Health 5:258', year: 2017, url: doi('10.3389/fpubh.2017.00258'),
    note: 'What RMSSD, SDNN and pNN50 each measure.'
  },
  umetani1998: {
    authors: 'Umetani K, Singer DH, McCraty R, Atkinson M',
    title: 'Twenty-four hour time domain heart rate variability and heart rate: relations to age and gender over nine decades',
    where: 'Journal of the American College of Cardiology 31(3):593–601', year: 1998, url: doi('10.1016/S0735-1097(97)00554-8'),
    note: 'HRV falls with age.'
  },
  nunan2010: {
    authors: 'Nunan D, Sandercock GRH, Brodie DA',
    title: 'A quantitative systematic review of normal values for short-term heart rate variability in healthy adults',
    where: 'Pacing and Clinical Electrophysiology 33(11):1407–1417', year: 2010, url: doi('10.1111/j.1540-8159.2010.02841.x'),
    note: 'How widely “normal” HRV varies between healthy people.'
  },
  plews2017: {
    authors: 'Plews DJ, Scott B, Altini M, Wood M, Kilding AE, Laursen PB',
    title: 'Comparison of heart-rate-variability recording with smartphone photoplethysmography, Polar H7 chest strap, and electrocardiography',
    where: 'International Journal of Sports Physiology and Performance 12(10):1324–1328', year: 2017, url: doi('10.1123/ijspp.2016-0668'),
    note: 'A phone camera reading against a chest strap and an ECG.'
  },
  plews2013: {
    authors: 'Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M',
    title: 'Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring',
    where: 'Sports Medicine 43(9):773–781', year: 2013, url: doi('10.1007/s40279-013-0071-8'),
    note: 'Why HRV is read as a trend against your own baseline, not one morning.'
  },
  gilgen2019: {
    authors: 'Gilgen-Ammann R, Schweizer T, Wyss T',
    title: 'RR interval signal quality of a heart rate monitor and an ECG Holter at rest and during exercise',
    where: 'European Journal of Applied Physiology 119(7):1525–1532', year: 2019, url: doi('10.1007/s00421-019-04142-5'),
    note: 'A chest strap’s beat-to-beat signal against a medical ECG.'
  },
  shcherbina2017: {
    authors: 'Shcherbina A, Mattsson CM, Waggott D, et al.',
    title: 'Accuracy in wrist-worn, sensor-based measurements of heart rate and energy expenditure in a diverse cohort',
    where: 'Journal of Personalized Medicine 7(2):3', year: 2017, url: doi('10.3390/jpm7020003'),
    note: 'How well wrist sensors, the Apple Watch among them, read heart rate.'
  },
  davis2023: {
    authors: 'Davis HE, McCorkell L, Vogel JM, Topol EJ',
    title: 'Long COVID: major findings, mechanisms and recommendations',
    where: 'Nature Reviews Microbiology 21(3):133–146', year: 2023, url: doi('10.1038/s41579-022-00846-2'),
    note: 'Dysautonomia and POTS as common features of long COVID.'
  },
  vernino2021: {
    authors: 'Vernino S, Bourne KM, Stiles LE, et al.',
    title: 'Postural orthostatic tachycardia syndrome (POTS): state of the science and clinical care from a 2019 National Institutes of Health Expert Consensus Meeting, Part 1',
    where: 'Autonomic Neuroscience 235:102828', year: 2021, url: doi('10.1016/j.autneu.2021.102828'),
    note: 'What happens in the body when someone with POTS stands up.'
  },
  sheldon2015: {
    authors: 'Sheldon RS, Grubb BP, Olshansky B, et al.',
    title: '2015 Heart Rhythm Society expert consensus statement on the diagnosis and treatment of postural tachycardia syndrome, inappropriate sinus tachycardia, and vasovagal syncope',
    where: 'Heart Rhythm 12(6):e41–e63', year: 2015, url: doi('10.1016/j.hrthm.2015.03.029'), kind: 'Report',
    note: 'The diagnostic criteria for POTS, including the 30 and 40 bpm thresholds.'
  },
  freeman2011: {
    authors: 'Freeman R, Wieling W, Axelrod FB, et al.',
    title: 'Consensus statement on the definition of orthostatic hypotension, neurally mediated syncope and the postural tachycardia syndrome',
    where: 'Clinical Autonomic Research 21(2):69–72', year: 2011, url: doi('10.1007/s10286-011-0119-5'), kind: 'Report',
    note: 'The consensus definitions of POTS and orthostatic hypotension.'
  },
  raj2020: {
    authors: 'Raj SR, Guzman JC, Harvey P, et al.',
    title: 'Canadian Cardiovascular Society position statement on postural orthostatic tachycardia syndrome (POTS) and related disorders of chronic orthostatic intolerance',
    where: 'Canadian Journal of Cardiology 36(3):357–372', year: 2020, url: doi('10.1016/j.cjca.2019.12.024'), kind: 'Report',
    note: 'How an active stand test and a tilt table test are used.'
  },
  iom2015: {
    authors: 'Institute of Medicine',
    title: 'Beyond Myalgic Encephalomyelitis/Chronic Fatigue Syndrome: Redefining an Illness',
    where: 'The National Academies Press', year: 2015, url: doi('10.17226/19012'), kind: 'Report',
    note: 'Post-exertional malaise, and why the crash comes later.'
  },
  nice2021: {
    authors: 'National Institute for Health and Care Excellence',
    title: 'Myalgic encephalomyelitis (or encephalopathy)/chronic fatigue syndrome: diagnosis and management (NG206)',
    where: 'NICE guideline', year: 2021, url: 'https://www.nice.org.uk/guidance/ng206', kind: 'Report',
    note: 'Energy management: staying within your energy envelope.'
  },
  parker2023: {
    authors: 'Parker M, Sawant HB, Flannery T, et al.',
    title: 'Effect of using a structured pacing protocol on post-exertional symptom exacerbation and health status in a longitudinal cohort with the post-COVID-19 syndrome',
    where: 'Journal of Medical Virology 95(1):e28373', year: 2023, url: doi('10.1002/jmv.28373'),
    note: 'Structured pacing in long COVID.'
  },
  lillie2011: {
    authors: 'Lillie EO, Patay B, Diamant J, Issell B, Topol EJ, Schork NJ',
    title: 'The n-of-1 clinical trial: the ultimate strategy for individualizing medicine?',
    where: 'Personalized Medicine 8(2):161–173', year: 2011, url: doi('10.2217/pme.11.7'),
    note: 'Studying one person against themselves, over many days.'
  },
  benjamini1995: {
    authors: 'Benjamini Y, Hochberg Y',
    title: 'Controlling the false discovery rate: a practical and powerful approach to multiple testing',
    where: 'Journal of the Royal Statistical Society, Series B 57(1):289–300', year: 1995, url: doi('10.1111/j.2517-6161.1995.tb02031.x'),
    note: 'The correction Insights uses so patterns found by luck are not reported.'
  },
  schmalenberger2019: {
    authors: 'Schmalenberger KM, Eisenlohr-Moul TA, Würth L, et al.',
    title: 'A systematic review and meta-analysis of within-person changes in cardiac vagal activity across the menstrual cycle: implications for female health and future studies',
    where: 'Journal of Clinical Medicine 8(11):1946', year: 2019, url: doi('10.3390/jcm8111946'),
    note: 'HRV falls from the follicular to the luteal phase.'
  },
  peggs2012: {
    authors: 'Peggs KJ, Nguyen H, Enayat D, Keller NR, Al-Hendy A, Raj SR',
    title: 'Gynecologic disorders and menstrual cycle lightheadedness in postural tachycardia syndrome',
    where: 'International Journal of Gynecology & Obstetrics 118(3):242–246', year: 2012, url: doi('10.1016/j.ijgo.2012.04.014'),
    note: 'POTS symptoms around the menstrual cycle.'
  },
  bull2019: {
    authors: 'Bull JR, Rowland SP, Scherwitzl EB, Scherwitzl R, Danielsson KG, Harper J',
    title: 'Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles',
    where: 'npj Digital Medicine 2:83', year: 2019, url: doi('10.1038/s41746-019-0152-7'),
    note: 'How long cycles and their phases really run, and finding ovulation from temperature.'
  },
  jarjour2013: {
    authors: 'Jarjour IT, Jarjour LK',
    title: 'Low iron storage and mild anemia in postural tachycardia syndrome in adolescents',
    where: 'Clinical Autonomic Research 23(4):175–179', year: 2013, url: doi('10.1007/s10286-013-0198-6'),
    note: 'Low ferritin in POTS.'
  },
  thirunavukarasu2023: {
    authors: 'Thirunavukarasu AJ, Ting DSJ, Elangovan K, Gutierrez L, Tan TF, Ting DSW',
    title: 'Large language models in medicine',
    where: 'Nature Medicine 29(8):1930–1940', year: 2023, url: doi('10.1038/s41591-023-02448-8'),
    note: 'What AI models do well with health data, and where they go wrong.'
  }
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
export const pickSources = (ids: SourceId[]): Source[] => ids.map((id) => SOURCES[id]);

/** When the feature pages were last checked against their sources. Shown
 *  beside each page's Sources and stamped as the page's dateModified. */
export const SOURCES_REVIEWED = '2026-11-04';
