// Scraper — les projets de loi de la législature en cours, au format de DossierQuébec.
//
// Source : l'API de l'Assemblée, « progress of bills » par session
// (api.lims.leg.bc.ca/pdms/bills/progress-of-bills/<id de session>), celle qui alimente la page
// officielle. Elle donne le numéro, le titre, le parrain, la date de chaque étape, le numéro de
// chapitre et les fichiers de texte publiés.
//
// Ce que ce fichier NE contient PAS, et pourquoi : aucun texte officiel, aucune note explicative.
// L'avis de droit d'auteur de l'Assemblée (leg.bc.ca/copyright) interdit toute reproduction hors
// usage personnel sans le consentement écrit du président. Le site publie donc les faits (numéro,
// titre, étapes, dates, parrain, votes) et un résumé écrit par nous, avec le lien vers la page
// officielle à côté. Le champ texteOfficielUrl mène à cette page ; texteApi sert seulement au
// résumeur, qui lit le texte sans le garder.
//
// Pièges de la Colombie-Britannique, réglés ici :
//   1. LE NUMÉRO N'EST PAS UNE CLÉ. Il repart à 1 à chaque session : le n° 1 de la 1re session
//      (« Acting Conflict of Interest Commissioner… » côté n° 2) n'est pas celui de la 2e. La clé
//      est billId, l'identifiant de l'API, et l'id du site porte en plus la session.
//   2. UN PROJET RÉTABLI PORTE LE MÊME billId DANS DEUX SESSIONS. Quatre projets de député·e·s de
//      la 43e sont dans les deux listes. On garde la session la plus récente, celle où il vit, et
//      on écrit rétabli: true.
//   3. LES DATES DU TABLEAU SONT PARFOIS VIDES. Dans la 1re session, 14 projets sanctionnés n'ont
//      pas de date de 1re lecture dans le tableau, alors que le fichier de 1re lecture, publié par
//      l'Assemblée, porte la sienne. On prend celle du fichier quand le tableau se taît.
//   4. LE TABLEAU PEUT OUBLIER UNE ÉTAPE. Le projet n° 2 de la 2e session (budget) n'a pas de date
//      de 3e lecture dans l'API, alors que le procès-verbal du 1er avril 2026 montre le vote
//      (46 contre 46, tranché par le président). Les votes sont donc lus à part (votes.js), et le
//      contrôle signale ces écarts au lieu de les cacher.
//   5. DES TROUS DANS LA NUMÉROTATION SONT NORMAUX. Le n° 19 de la 2e session n'existe ni dans
//      l'API ni dans les procès-verbaux : un numéro réservé puis non déposé. On le signale, on ne
//      l'invente pas.
//   6. UN PROJET DÉCLARÉ IRRECEVABLE reste dans la liste (ruledOutOfOrder) : on l'affiche avec son
//      état, on ne le retire pas.
//
// Statuts (ceux de DossierQuébec, commun/dq.js) :
//   - 'sanctionne'     : sanction royale reçue ;
//   - 'encours'        : session en cours, pas encore sanctionné ;
//   - 'laisse_de_cote' : session terminée sans sanction (mort au Feuilleton), ou déclaré
//                        irrecevable quand l'Assemblée le dit.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lireJson, legislatures, rang, cleSession, HOTE, API } from './bc-commun.js';

const OUT_PATH = 'data/bills.json';

// Les étapes de l'API, sur l'échelle de DossierQuébec (1 présentation … 5 sanction). La page
// affiche trois cases (displayStep, commun/dq.js) : 1, puis 2 à 4, puis 5.
const ETAPES = [
  { champ: 'firstReading', cle: 'premiere', step: 1 },
  { champ: 'secondReading', cle: 'deuxieme', step: 2 },
  { champ: 'committeeReading', cle: 'comite', step: 3 },
  { champ: 'reportReading', cle: 'rapport', step: 4 },
  { champ: 'amendedReading', cle: 'amende', step: 4 },
  { champ: 'thirdReading', cle: 'troisieme', step: 5 },
  { champ: 'royalAssent', cle: 'sanction', step: 5 },
];

// Le préfixe que l'Assemblée met devant le numéro, et nos libellés de catégorie (les nôtres : ce
// ne sont pas des textes de l'Assemblée).
const TYPES = {
  1: { prefixe: '', fr: 'Projet de loi du gouvernement', en: 'Government bill' },
  2: { prefixe: 'M ', fr: 'Projet de loi de député·e', en: "Member's bill" },
  3: { prefixe: 'Pr ', fr: "Projet de loi d'intérêt privé", en: 'Private bill' },
};

/** L'adresse de la page officielle qui porte un texte publié. */
const pageDuFichier = (leg, ses, fichier) =>
  `${HOTE}/parliamentary-business/overview/${leg}${rang(leg)}-parliament/${ses}${rang(ses)}-session/file/${fichier}`;

function etapes(b) {
  const dates = {};
  for (const e of ETAPES) if (b[e.champ]) dates[e.cle] = b[e.champ];
  // Piège n° 3 : le tableau se taît, le fichier publié porte la date de sa lecture.
  const parLecture = { 1: 'premiere', 2: 'amende', 3: 'troisieme' };
  for (const f of b.files?.nodes ?? []) {
    const cle = parLecture[f.readingTypeId];
    if (cle && !dates[cle] && f.readingDate) dates[cle] = f.readingDate;
  }
  return dates;
}

function statutEtNote(b, dates, ses, sessionFinie) {
  if (dates.sanction) {
    const ch = b.chapterNumber ? `, chapitre ${b.chapterNumber}` : '';
    const chEn = b.chapterNumber ? `, chapter ${b.chapterNumber}` : '';
    return ['sanctionne',
      `Sanctionné le ${dates.sanction}${ch}`,
      `Received Royal Assent on ${dates.sanction}${chEn}`];
  }
  if (b.ruledOutOfOrder) {
    return ['laisse_de_cote',
      "Déclaré irrecevable par la présidence : il ne peut pas aller plus loin",
      'Ruled out of order by the Speaker: it cannot proceed'];
  }
  const derniere = Object.values(dates).sort().pop() ?? null;
  if (sessionFinie) {
    return ['laisse_de_cote',
      `Mort au Feuilleton à la fin de la session ${ses}${derniere ? `, dernière étape le ${derniere}` : ''}`,
      `Died on the Order Paper at the end of session ${ses}${derniere ? `, last stage on ${derniere}` : ''}`];
  }
  if (dates.troisieme) return ['encours', `Adopté en troisième lecture le ${dates.troisieme}, en attente de la sanction royale`, `Passed third reading on ${dates.troisieme}, awaiting Royal Assent`];
  if (dates.rapport) return ['encours', `Étape du rapport franchie le ${dates.rapport}`, `Reported out of committee on ${dates.rapport}`];
  if (dates.comite) return ['encours', `Étude en comité le ${dates.comite}`, `Committee stage on ${dates.comite}`];
  if (dates.deuxieme) return ['encours', `Adopté en deuxième lecture le ${dates.deuxieme}`, `Passed second reading on ${dates.deuxieme}`];
  return ['encours', `Déposé le ${dates.premiere ?? '(date non publiée)'}`, `Introduced on ${dates.premiere ?? '(date not published)'}`];
}

/**
 * Les trous de numérotation : un numéro réservé puis non déposé (piège n° 5).
 *
 * Attention aux deux numérotations, vérifiées sur la 43e législature : les projets du
 * gouvernement repartent à 1 à CHAQUE SESSION (la 2e session va de 1 à 22), tandis que ceux des
 * député·e·s se suivent sur TOUTE LA LÉGISLATURE (201 à 249, sans trou, à cheval sur les deux
 * sessions). Compter les trous par session pour les seconds inventerait des projets manquants.
 */
function trous(bills, sessions) {
  const manquants = (nums) => {
    const tri = [...new Set(nums)].sort((a, b) => a - b);
    const sortie = [];
    for (let n = tri[0]; n <= tri[tri.length - 1]; n++) if (!tri.includes(n)) sortie.push(n);
    return sortie;
  };
  const sortie = [];
  for (const ses of sessions) {
    const nums = bills.filter((b) => b.introSession === ses.numero && b.typeId === 1).map((b) => b.num);
    if (nums.length > 1) {
      for (const n of manquants(nums)) sortie.push({ quoi: String(n), ou: `session ${ses.numero}` });
    }
  }
  for (const type of [2, 3]) {
    const nums = bills.filter((b) => b.typeId === type).map((b) => b.num);
    if (nums.length > 1) {
      for (const n of manquants(nums)) sortie.push({ quoi: `${TYPES[type].prefixe}${n}`, ou: 'la législature' });
    }
  }
  return sortie;
}

async function main() {
  const { encours, avecDonnees } = await legislatures();
  const leg = avecDonnees;
  if (encours.numero !== leg.numero) {
    console.log(`la ${encours.numero}e législature est ouverte depuis le ${encours.debut} mais n'a pas encore de session — on garde la ${leg.numero}e`);
  }
  const sessions = [...leg.sessions].sort((a, b) => a.numero - b.numero);
  console.log(`${leg.numero}e législature, sessions ${sessions.map((s) => s.numero).join(', ')}`);

  const deputes = existsSync('data/deputes.json')
    ? JSON.parse(readFileSync('data/deputes.json', 'utf-8')).deputes ?? []
    : [];
  const deputeParId = new Map(deputes.map((d) => [Number(d.assnatId), d]));

  // Les résumés déjà écrits (bill-summaries.js), gardés d'un passage à l'autre.
  const resumes = existsSync('data/resumes.json')
    ? JSON.parse(readFileSync('data/resumes.json', 'utf-8')).resumes ?? {}
    : {};

  const parBillId = new Map();
  const comptes = [];
  for (const ses of sessions) {
    const liste = await lireJson(`pdms/bills/progress-of-bills/${ses.id}`);
    if (!Array.isArray(liste)) throw new Error(`session ${ses.numero} : l'API ne rend pas une liste`);
    if (!liste.length) throw new Error(`session ${ses.numero} : aucun projet de loi lu`);
    comptes.push({ session: ses.numero, lus: liste.length });
    console.log(`  session ${ses.numero} (id ${ses.id}) : ${liste.length} projets`);
    for (const b of liste) {
      if (!b.billId || !b.billNumber) throw new Error(`session ${ses.numero} : un projet sans billId ni numéro`);
      // Piège n° 2 : même billId dans deux sessions = projet rétabli. La session la plus récente
      // gagne, parce que c'est celle où il a vécu.
      const avant = parBillId.get(b.billId);
      parBillId.set(b.billId, { b, ses, rétabli: Boolean(avant) || Boolean(b.reinstated), sesPrecedente: avant?.ses.numero ?? null });
    }
  }

  const bills = [];
  for (const { b, ses, rétabli, sesPrecedente } of parBillId.values()) {
    const dates = etapes(b);
    const sessionFinie = Boolean(ses.fin);
    const [status, note, noteEn] = statutEtNote(b, dates, ses.numero, sessionFinie);
    const step = Math.max(0, ...Object.keys(dates).map((k) => ETAPES.find((e) => e.cle === k)?.step ?? 0)) || null;
    const type = TYPES[b.billTypeId] ?? { prefixe: '', fr: 'Projet de loi', en: 'Bill' };
    const depute = deputeParId.get(Number(b.memberId));
    const premierFichier = (b.files?.nodes ?? []).find((f) => f.readingTypeId === 1)
      ?? (b.files?.nodes ?? [])[0] ?? null;
    const resume = resumes[String(b.billId)] ?? null;

    bills.push({
      id: leg.numero * 100000 + ses.numero * 1000 + b.billNumber,
      billId: b.billId,
      num: b.billNumber,
      numAffiche: `${type.prefixe}${b.billNumber}`,
      typeId: b.billTypeId,
      legislature: leg.numero,
      introSession: ses.numero,
      type: type.fr,
      typeEn: type.en,
      title: b.title,
      titleEn: b.title,
      titleFrOfficiel: false,   // la C.-B. ne publie pas de titre français
      status,
      step,
      note,
      noteEn,
      presentedOn: dates.premiere ?? null,
      lastActivity: Object.values(dates).sort().pop() ?? null,
      dates,
      chapitre: b.chapterNumber ?? null,
      amende: Boolean(dates.amende),
      irrecevable: Boolean(b.ruledOutOfOrder),
      titreChange: Boolean(b.titleChanged),
      retabli: rétabli,
      sessionPrecedente: sesPrecedente,
      url: premierFichier ? pageDuFichier(leg.numero, ses.numero, premierFichier.fileName) : null,
      urlEn: premierFichier ? pageDuFichier(leg.numero, ses.numero, premierFichier.fileName) : null,
      texteOfficielUrl: premierFichier ? pageDuFichier(leg.numero, ses.numero, premierFichier.fileName) : null,
      // Lu par le résumeur, jamais republié (voir l'avis de droit d'auteur en tête de fichier).
      texteApi: premierFichier ? `${API}/pdms${premierFichier.path}` : null,
      textes: (b.files?.nodes ?? []).map((f) => ({
        lecture: f.readingTypeName,
        le: f.readingDate ?? null,
        page: pageDuFichier(leg.numero, ses.numero, f.fileName),
      })),
      sponsor: b.memberAlias ?? null,
      sponsorId: depute ? Number(depute.assnatId) : null,
      summary: resume?.fr ?? null,
      summaryEn: resume?.en ?? null,
      summaryAiGenerated: Boolean(resume),
      summarySource: resume?.source ?? null,
      summaryGeneratedAt: resume?.faitLe ?? null,
      summaryTronque: resume?.tronque ?? false,
    });
  }

  bills.sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')) || b.id - a.id);

  const derniereSession = sessions[sessions.length - 1];
  writeFileSync(OUT_PATH, JSON.stringify({
    source: `${API}/pdms/bills/progress-of-bills/${derniereSession.id}`,
    pageOfficielle: `${HOTE}/parliamentary-business/overview/${leg.numero}${rang(leg.numero)}-parliament/${derniereSession.numero}${rang(derniereSession.numero)}-session/bills/progress-of-bills`,
    cleSession: cleSession(leg.numero, derniereSession.numero),
    legislature: leg.numero,
    legislatureEnCours: encours.numero,
    legislatureEnCoursDebut: encours.debut,
    legislatureTerminee: leg.fin ?? null,
    sessions: sessions.map((s) => ({ numero: s.numero, debut: s.debut, fin: s.fin })),
    scrapedAt: new Date().toISOString(),
    avis: "La version imprimée reste la version officielle (avis de l'Assemblée législative de la Colombie-Britannique). Les titres sont ceux de l'Assemblée, en anglais : la province ne publie pas de version française.",
    avisDates: "Quand le tableau des étapes ne donne pas la date d'une lecture, c'est la date de publication du texte de cette lecture, publiée par l'Assemblée, qui est retenue.",
    count: bills.length,
    bills,
  }, null, 2) + '\n');

  const compte = (s) => bills.filter((b) => b.status === s).length;
  console.log(`${bills.length} projets écrits dans ${OUT_PATH} — sanctionnés ${compte('sanctionne')}, en cours ${compte('encours')}, laissés de côté ${compte('laisse_de_cote')}`);
  const sansProjet = trous(bills, sessions);
  if (sansProjet.length) {
    const par = sansProjet.map((t) => `${t.quoi} (dans ${t.ou})`).join(', ');
    console.log(`  numéros sans projet : ${par} — réservés puis non déposés, on ne les invente pas`);
  }
  const retablis = bills.filter((b) => b.retabli);
  if (retablis.length) console.log(`  rétablis d'une session à l'autre : ${retablis.map((b) => b.numAffiche).join(', ')}`);
  const irrecevables = bills.filter((b) => b.irrecevable);
  if (irrecevables.length) console.log(`  déclarés irrecevables : ${irrecevables.map((b) => b.numAffiche).join(', ')}`);
  const sansParrain = bills.filter((b) => !b.sponsor);
  if (sansParrain.length) console.log(`  ⚠ sans parrain : ${sansParrain.map((b) => b.numAffiche).join(', ')}`);
  const horsListe = bills.filter((b) => b.sponsor && !b.sponsorId);
  if (horsListe.length) console.log(`  parrain hors de la liste actuelle : ${horsListe.map((b) => `${b.numAffiche} (${b.sponsor})`).join(', ')}`);
  const sansTexte = bills.filter((b) => !b.texteOfficielUrl);
  if (sansTexte.length) console.log(`  ⚠ sans texte publié : ${sansTexte.map((b) => b.numAffiche).join(', ')}`);
}

main().catch((err) => {
  console.error('\nÉchec du scraper bills.js :', err.message);
  process.exitCode = 1;
});
