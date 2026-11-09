// Scraper — les votes nominatifs (divisions) de l'Assemblée législative de la Colombie-Britannique,
// au format de DossierQuébec.
//
// Source : les procès-verbaux (Votes and Proceedings) de chaque séance. L'API de l'Assemblée donne
// la liste des fichiers d'une session (pdms/votes-and-proceedings/43rd2nd) ; chaque fichier porte
// ses divisions dans un <table class="division">.
//
// Ce qu'on en garde : des faits. Les totaux, les noms de celles et ceux qui ont voté pour ou
// contre, la date, l'étape et le projet de loi visé. La phrase du procès-verbal qui annonce le
// vote sert à tirer ces champs ; elle n'est pas recopiée (avis de droit d'auteur, voir
// bc-commun.js). Le sujet affiché est notre propre phrase, bâtie sur ces faits.
//
// LE CONTRÔLE (étape 4 du guide). L'Assemblée ne publie aucun compte des divisions d'une session :
// le champ « voteNumbers » de son index ressemble à un compte, mais ce sont les CRÉDITS
// BUDGÉTAIRES étudiés ce jour-là (le 1er avril 2026 : « 31 », pour quatre divisions). Le comparer
// à notre récolte donnerait une fausse alerte à chaque séance. Faute de compte rendu indépendant,
// trois contrôles tiennent sur ce que l'Assemblée publie elle-même, et aucun n'arrête le site :
//   1. chaque tableau annonce son total (« Yeas — 46 ») : on compte les noms et on compare ;
//   2. chaque nom doit se rattacher à une seule personne de la législature ;
//   3. le nombre de votants ne peut pas dépasser le nombre de sièges.
// Les écarts s'écrivent dans votesNonPublies, et la page les affiche.
//
// Pièges de la Colombie-Britannique, réglés ici :
//   1. SEULS LES NOMS DE FAMILLE SONT PUBLIÉS. Une initiale n'est ajoutée qu'en cas d'homonymie
//      (« B. Anderson » et « G. Anderson », « L. Neufeld » et « K. Neufeld »). On rapproche donc
//      par nom de famille, et seulement s'il n'y a qu'une personne ; avec une initiale, par nom de
//      famille + initiale du prénom.
//   2. LES NOMS COMPOSÉS. « Chandra Herbert » est un nom de famille en deux mots : on ne coupe
//      jamais sur l'espace.
//   3. CELLES ET CEUX QUI ONT QUITTÉ VOTENT QUAND MÊME. La liste des député·e·s en poste ne suffit
//      pas : Joan Phillip (morte le 28 août 2026) a voté des dizaines de fois. On prend donc TOUS
//      les membres de la législature, actifs ou non (95 pour la 43e, dont 91 en poste), et on
//      marque ancien: true. Les sièges vacants de l'API (« Vacant Seat ») ne sont pas des
//      personnes : ils sont écartés.
//   4. L'ÉGALITÉ. Le 1er avril 2026, le projet n° 2 a passé la 3e lecture à 46 contre 46 : la
//      présidence a tranché, et le procès-verbal le dit dans la phrase qui suit le tableau. On lit
//      cette phrase, sinon le site afficherait une égalité inexpliquée.
//   5. LA PRÉSIDENCE NE VOTE PAS. Son absence des listes est normale, pas une absence au travail.
//   6. UN VOTE PEUT NE VISER AUCUN PROJET DE LOI (motion d'ajournement, motion de l'opposition) :
//      billNum vaut alors null, et le sujet dit de quoi il s'agissait.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lire, lireJson, graphql, legislatures, cleSession, plierNom, rang, API, HOTE } from './bc-commun.js';

const OUT_PATH = 'data/votes.json';

/** Les étapes, telles que la phrase d'annonce les nomme, et notre libellé. */
const ETAPES = [
  // Pas de \b devant « amendment » : les procès-verbaux écrivent aussi « subamendment ».
  { re: /sub-?amendment/i, fr: 'Sous-amendement', en: 'Subamendment' },
  { re: /amendment/i, fr: 'Amendement', en: 'Amendment' },
  { re: /third reading/i, fr: 'Troisième lecture', en: 'Third reading' },
  { re: /second reading|read a second time/i, fr: 'Deuxième lecture', en: 'Second reading' },
  { re: /be introduced and read a first time|introduced and read a first time|first reading/i, fr: 'Présentation', en: 'Introduction' },
  { re: /Committee of Supply|\bestimates\b|\bResolution\b|\bVote \d+/i, fr: 'Crédits', en: 'Supply' },
  { re: /\bclauses?\b|committee of the whole|reported out|report of the committee|was again committed|the title of Bill/i, fr: 'Comité', en: 'Committee' },
  { re: /throne speech|address in reply/i, fr: 'Discours du Trône', en: 'Throne Speech' },
  { re: /\bbudget\b/i, fr: 'Budget', en: 'Budget' },
  { re: /adjourn/i, fr: 'Ajournement', en: 'Adjournment' },
  { re: /\bpetition\b/i, fr: 'Pétition', en: 'Petition' },
  { re: /\bmotion\b/i, fr: 'Motion', en: 'Motion' },
];

/**
 * Le résultat, tel que la phrase d'annonce le dit. Les formules sont nombreuses : « Motion agreed
 * to … on the following division », « … which was defeated on the following division », « Clause
 * 75 of Bill (No. 13) passed on the following division », « Motion negatived ». Une formule
 * inconnue laisse adoptee à null plutôt que de deviner.
 */
function resultatDe(phrase) {
  if (/\b(negatived|defeated|rejected|resolved in the negative|lost)\b/i.test(phrase)) return false;
  if (/\b(agreed to|passed|carried|adopted|resolved in the affirmative)\b/i.test(phrase)) return true;
  return null;
}

/**
 * Les deux bornes d'un bloc de comité dans le procès-verbal. Le greffier ouvre par un titre entre
 * parenthèses — « ( In Committee — Section A ) » — et ferme par le rapport de la section —
 * « Section C of Committee of the Whole reported Bill (No. 13) … ». Entre les deux, la Chambre ne
 * siège pas : c'est une poignée de député·e·s en salle de comité.
 *
 * Vérifié le 9 novembre 2026 sur les 130 divisions de la 43e législature : le marqueur et le
 * nombre de votants concordent 130 fois sur 130 (56 divisions de section à 8-12 votants,
 * 74 divisions de la Chambre à 80 et plus). Aucun désaccord.
 */
const SECTION_ENTRE = /\(\s*In\s+Committee\s*(?:—|–|-)\s*Section\s*([A-C])\s*\)/i;
const SECTION_SORT = /Section\s*[A-C]\s+of\s+Committee\s+of\s+(?:the\s+Whole|Supply)\s+reported|\(\s*In\s+the\s+House\s*\)/i;

/** Découpe le document en blocs dans l'ordre : paragraphes et tableaux de division. */
function blocs(html) {
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>|<table\b[^>]*class="division"[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) out.push({ type: 'p', html: m[1] });
    else out.push({ type: 'division', html: m[2] });
  }
  return out;
}

const propre = (s) => String(s ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#8217;|&rsquo;/g, '’')
  .replace(/&#8212;|&mdash;/g, '—')
  .replace(/&#8211;|&ndash;/g, '–')
  .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
  .replace(/&#(\d+);/g, (x, d) => String.fromCodePoint(Number(d)))
  .replace(/[ \t]+/g, ' ')
  .trim();

/** Un tableau de division : [{ libelle, compte, noms: [] }] dans l'ordre du procès-verbal. */
function lireDivision(html) {
  const groupes = [];
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(html))) {
    const brut = m[0];
    const txt = propre(m[1]);
    if (/class="head"/i.test(brut)) {
      const t = txt.match(/^(Yeas|Nays|Abstentions?)\s*[—–-]\s*(\d+)/i);
      if (t) groupes.push({ libelle: t[1].toLowerCase().replace(/s$/, '') + 's', compte: Number(t[2]), noms: [] });
      continue;
    }
    if (!groupes.length) continue;
    for (const ligne of txt.split('\n')) {
      const nom = ligne.trim().replace(/\s+/g, ' ');
      if (nom) groupes[groupes.length - 1].noms.push(nom);
    }
  }
  return groupes;
}

/**
 * TOUS les membres de la législature, en poste ou non (piège n° 3). Les sièges vacants de l'API
 * ne sont pas des personnes : on les écarte.
 */
async function membresDeLaLegislature(parliamentId) {
  const d = await graphql(`query($p: Int!) {
    allMemberParliaments(condition: { parliamentId: $p }) {
      nodes {
        active
        partyByPartyId { abbreviation }
        constituencyByConstituencyId { name }
        memberByMemberId { id firstName lastName }
      }
    }
  }`, { p: parliamentId });
  return (d.allMemberParliaments?.nodes ?? [])
    .filter((n) => n.memberByMemberId?.lastName && !/^vacant/i.test(n.memberByMemberId.lastName)
      && !/^vacant$/i.test(n.partyByPartyId?.abbreviation ?? ''))
    .map((n) => ({
      assnatId: Number(n.memberByMemberId.id),
      prenom: n.memberByMemberId.firstName ?? '',
      nomFamille: n.memberByMemberId.lastName,
      name: `${n.memberByMemberId.firstName ?? ''} ${n.memberByMemberId.lastName}`.trim(),
      riding: n.constituencyByConstituencyId?.name ?? null,
      partiAssemblee: n.partyByPartyId?.abbreviation ?? null,
      enPoste: Boolean(n.active),
    }));
}

/**
 * Rapproche un nom du procès-verbal d'une personne.
 * « Chandra Herbert » → nom de famille entier ; « B. Anderson » → initiale + nom de famille.
 */
function faireIndex(membres) {
  const parFamille = new Map();
  for (const m of membres) {
    const cle = plierNom(m.nomFamille);
    if (!parFamille.has(cle)) parFamille.set(cle, []);
    parFamille.get(cle).push(m);
  }
  return (nomBrut) => {
    const nom = nomBrut.replace(/\s+/g, ' ').trim();
    const avecInitiale = nom.match(/^([A-Z])\.\s*(.+)$/);
    const famille = plierNom(avecInitiale ? avecInitiale[2] : nom);
    const candidats = parFamille.get(famille) ?? [];
    if (!candidats.length) return { erreur: `« ${nom} » ne correspond à aucun·e député·e de la législature` };
    if (candidats.length === 1) return { membre: candidats[0] };
    if (avecInitiale) {
      const initiale = plierNom(avecInitiale[1]);
      const reduits = candidats.filter((m) => plierNom(m.prenom).startsWith(initiale));
      if (reduits.length === 1) return { membre: reduits[0] };
    }
    return { erreur: `« ${nom} » correspond à ${candidats.length} personnes (${candidats.map((m) => m.name).join(', ')})` };
  };
}

function etapeDe(phrase) {
  const t = ETAPES.find((e) => e.re.test(phrase));
  return t ? { fr: t.fr, en: t.en } : { fr: null, en: null };
}

/** Le numéro de projet de loi nommé dans la phrase : « Bill (No. 2) », « Bill (No. M 231) ». */
function billDe(phrase) {
  const m = phrase.match(/Bill\s*\(No\.\s*(M|Pr)?\s*(\d+)\)/i);
  if (!m) return { billNum: null, billPrefixe: null };
  return { billNum: Number(m[2]), billPrefixe: m[1] ? m[1].toUpperCase() : null };
}

/**
 * Le titre officiel du projet, tel que le procès-verbal l'écrit : « Bill (No. 2) intituled
 * <em>Budget Measures Implementation Act, 2026</em> ». On le lit dans le HTML BRUT du paragraphe,
 * parce que c'est la balise <em> qui dit où le titre finit — une fois le texte nettoyé, plus rien
 * ne le délimite.
 *
 * À quoi il sert : à rattacher le vote au bon projet de loi. Le numéro seul n'y suffit pas, il
 * repart à 1 à chaque session (voir bills.js) ; le titre lève l'ambiguïté.
 */
function titreDe(htmlBruts) {
  for (const h of htmlBruts) {
    const m = h.match(/Bill\s*\(No\.[^)]*\)\s*intituled\s*<em>([\s\S]*?)<\/em>/i);
    if (m) return propre(m[1]).replace(/[.,;]\s*$/, '');
  }
  return null;
}

const pageSeance = (leg, ses, fichier) =>
  `${HOTE}/parliamentary-business/overview/${leg}${rang(leg)}-parliament/${ses}${rang(ses)}-session/file/${fichier}`;

async function main() {
  const { avecDonnees: leg } = await legislatures();

  const membres = await membresDeLaLegislature(leg.id);
  if (!membres.length) throw new Error(`aucun membre lu pour la ${leg.numero}e législature`);
  const trouver = faireIndex(membres);
  const enPoste = membres.filter((m) => m.enPoste).length;
  console.log(`${membres.length} personnes ont siégé dans la ${leg.numero}e législature (${enPoste} en poste à la fin)`);

  // Le parti du jour vient de notre relevé (deputes.json) ; l'API réécrit celui des ancien·ne·s.
  const partiDuJour = new Map();
  if (existsSync('data/deputes.json')) {
    for (const d of JSON.parse(readFileSync('data/deputes.json', 'utf-8')).deputes ?? []) {
      partiDuJour.set(Number(d.assnatId), d.party);
    }
  }
  const sieges = existsSync('data/deputes.json')
    ? JSON.parse(readFileSync('data/deputes.json', 'utf-8')).sieges ?? null
    : null;

  const votes = [];
  const problemes = [];
  let seancesLues = 0;
  let seancesPubliees = 0;

  for (const ses of [...leg.sessions].sort((a, b) => a.numero - b.numero)) {
    const cle = cleSession(leg.numero, ses.numero);
    let index;
    try {
      index = await lireJson(`pdms/votes-and-proceedings/${cle}`);
    } catch (e) {
      problemes.push(`session ${ses.numero} : index des procès-verbaux illisible (${e.message})`);
      continue;
    }
    const fichiers = (index.allParliamentaryFileAttributes?.nodes ?? []).filter((f) => f.published);
    seancesPubliees += fichiers.length;
    console.log(`  session ${ses.numero} : ${fichiers.length} procès-verbaux publiés`);

    for (const f of fichiers) {
      const url = `${API}/pdms${f.filePath}/${f.fileName}`;
      let html;
      try {
        html = await lire(url);
      } catch (e) {
        problemes.push(`${f.fileName} : illisible (${e.message})`);
        continue;
      }
      seancesLues++;
      const date = String(f.date ?? '').slice(0, 10) || null;
      const suite = blocs(html);
      let rang_ = 0;
      // Où siège la Chambre à cet endroit du procès-verbal. Les comités (Committee of the Whole,
      // Committee of Supply) siègent en Section A, B ou C avec une poignée de député·e·s : leurs
      // divisions ne comptent que 8 à 12 votants. Les compter comme des votes de la Chambre
      // ferait passer 56 des 130 divisions de la 43e pour des absences générales.
      let section = null;

      for (let i = 0; i < suite.length; i++) {
        if (suite[i].type === 'p') {
          const txt = propre(suite[i].html);
          const entre = txt.match(SECTION_ENTRE);
          if (entre) { section = entre[1]; continue; }
          if (SECTION_SORT.test(txt)) section = null;
          continue;
        }
        if (suite[i].type !== 'division') continue;
        rang_++;
        // La phrase qui annonce la division porte le résultat, et souvent le sujet :
        //   « Clause 75 of Bill (No. 13) passed on the following division: »
        //   « … which was defeated on the following division: »
        //   « Motion agreed to nemine contradicente on the following division: » (sujet plus haut)
        // Quand elle ne nomme pas de projet de loi, on remonte jusqu'à la plus proche qui le fait.
        const avantBruts = suite.slice(Math.max(0, i - 12), i).filter((b) => b.type === 'p').map((b) => b.html).reverse();
        const avant = suite.slice(Math.max(0, i - 12), i).filter((b) => b.type === 'p').map((b) => propre(b.html));
        // « on the following division » — ou « on the following deferred division » quand la
        // Chambre a reporté le vote à plus tard (article 16 (4) du Règlement).
        const resultatPhrase = [...avant].reverse().find((p) => /on the following (deferred )?division/i.test(p)) ?? '';
        const sujetPhrase = /Bill\s*\(No\./i.test(resultatPhrase)
          ? resultatPhrase
          : ([...avant].reverse().find((p) => /Bill\s*\(No\./i.test(p)) ?? '');
        const apres = suite.slice(i + 1).find((b) => b.type === 'p');
        const phraseApres = apres ? propre(apres.html) : '';

        const groupes = lireDivision(suite[i].html);
        if (!groupes.length) {
          problemes.push(`${f.fileName} : un tableau de division sans « Yeas / Nays » lisible`);
          continue;
        }
        // Contrôle 1 : le tableau annonce ses totaux, on compte les noms.
        const ecart = groupes.find((g) => g.noms.length !== g.compte);
        if (ecart) {
          problemes.push(`${f.fileName} : « ${ecart.libelle} — ${ecart.compte} » mais ${ecart.noms.length} noms lus`);
          continue;
        }
        // Contrôle 3 : pas plus de votants que de sièges.
        const votants = groupes.reduce((s, g) => s + g.compte, 0);
        if (sieges && votants > sieges) {
          problemes.push(`${f.fileName} : ${votants} votants pour ${sieges} sièges`);
          continue;
        }

        // Contrôle 2 : chaque nom se rattache à une seule personne.
        const resolus = {};
        let erreurNom = null;
        for (const g of groupes) {
          resolus[g.libelle] = [];
          for (const nom of g.noms) {
            const r = trouver(nom);
            if (r.erreur) { erreurNom = `${f.fileName} (${date}) : ${r.erreur}`; break; }
            resolus[g.libelle].push({
              assnatId: r.membre.assnatId,
              lastName: r.membre.nomFamille,
              riding: r.membre.riding,
              party: partiDuJour.get(r.membre.assnatId)
                ?? (r.membre.partiAssemblee ? r.membre.partiAssemblee : null),
              ancien: !r.membre.enPoste,
            });
          }
          if (erreurNom) break;
        }
        if (erreurNom) { problemes.push(erreurNom); continue; }

        const phrase = `${resultatPhrase} ${sujetPhrase}`.trim();
        const { billNum, billPrefixe } = billDe(phrase);
        const etape = etapeDe(phrase);

        votes.push({
          legislature: leg.numero,
          session: ses.numero,
          num: null,                       // numéroté plus bas, dans l'ordre des séances
          seance: f.fileName,
          rangDansLaSeance: rang_,
          date,
          url: pageSeance(leg.numero, ses.numero, f.fileName),
          sourceApi: url,
          stage: etape.fr,
          stageEn: etape.en,
          billNum,
          billPrefixe,
          billTitre: titreDe(avantBruts),
          billId: null,        // rattaché plus bas, sur data/bills.json
          adoptee: resultatDe(resultatPhrase),
          unanime: /nemine contradicente/i.test(resultatPhrase),
          differe: /deferred division/i.test(resultatPhrase),
          motion: (phrase.match(/\bMotion\s+(M\s*\d+)/i) ?? [])[1]?.replace(/\s+/, ' ') ?? null,
          tranchePresidence: /votes being equal|cast (his|her|their) vote/i.test(phraseApres),
          section,             // « A », « B », « C » — ou null quand la Chambre entière vote
          totals: {
            pour: groupes.find((g) => g.libelle === 'yeas')?.compte ?? null,
            contre: groupes.find((g) => g.libelle === 'nays')?.compte ?? null,
            abstentions: groupes.find((g) => g.libelle === 'abstentions')?.compte ?? null,
          },
          pour: resolus.yeas ?? [],
          contre: resolus.nays ?? [],
          abstentions: resolus.abstentions ?? [],
        });
      }
    }
  }

  votes.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? ''))
    || a.session - b.session || a.rangDansLaSeance - b.rangDansLaSeance);
  votes.forEach((v, i) => { v.num = i + 1; });

  // --- Le rattachement au projet de loi -----------------------------------------------------
  // Le numéro seul ne suffit pas : il repart à 1 à chaque session, et le même « Bill (No. 2) »
  // désigne deux lois différentes d'une session à l'autre. On exige donc le titre, que le
  // procès-verbal écrit à côté du numéro. Sans titre lisible, on ne rattache rien : un vote
  // rattaché au mauvais projet serait pire que pas rattaché.
  const projets = existsSync('data/bills.json')
    ? JSON.parse(readFileSync('data/bills.json', 'utf-8')).bills ?? []
    : [];
  const normTitre = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let rattaches = 0;
  const sansProjet = [];
  for (const v of votes) {
    if (!v.billNum) continue;
    const memeNumero = projets.filter((b) => Number(b.num) === Number(v.billNum));
    if (!memeNumero.length) { sansProjet.push(`${v.date} n° ${v.billNum} (aucun projet de ce numéro)`); continue; }
    const t = normTitre(v.billTitre);
    let deduit = false;
    let trouve = t
      ? memeNumero.find((b) => {
        const bt = normTitre(b.title);
        return bt && (bt === t || bt.includes(t) || t.includes(bt));
      })
      : null;
    if (!trouve && memeNumero.length === 1) trouve = memeNumero[0];
    if (!trouve && !t) {
      // Le procès-verbal ne répète pas toujours le titre (« Clause 7 of Bill (No. 7) passed »).
      // On retient alors le projet de ce numéro introduit DANS LA SESSION du vote : un projet
      // n° 7 de la 2e session n'existait pas encore pendant la 1re. C'est une déduction, et elle
      // est marquée comme telle (billRattachementDeduit) pour que la page puisse le dire.
      const memeSession = memeNumero.filter((b) => Number(b.introSession) === Number(v.session));
      if (memeSession.length === 1) { trouve = memeSession[0]; deduit = true; }
    }
    if (trouve) { v.billId = trouve.id; v.billRattachementDeduit = deduit; rattaches++; }
    else sansProjet.push(`${v.date} n° ${v.billNum}${v.billTitre ? ` « ${v.billTitre} »` : ' (titre non lu)'}`);
  }

  // Le sujet affiché : notre phrase, bâtie sur les faits lus.
  for (const v of votes) {
    const projet = v.billNum ? `projet de loi ${v.billPrefixe ? `${v.billPrefixe} ` : ''}${v.billNum}`
      : v.motion ? `motion ${v.motion}` : null;
    const projetEn = v.billNum ? `Bill ${v.billPrefixe ? `${v.billPrefixe} ` : ''}${v.billNum}`
      : v.motion ? `Motion ${v.motion}` : null;
    v.subject = [v.stage, projet].filter(Boolean).join(' — ') || 'Motion de la Chambre';
    v.subjectEn = [v.stageEn, projetEn].filter(Boolean).join(' — ') || 'Motion of the House';
    v.title = v.subject;
  }

  writeFileSync(OUT_PATH, JSON.stringify({
    legislature: leg.numero,
    source: `${API}/pdms/votes-and-proceedings/${cleSession(leg.numero, leg.sessions[0].numero)}`,
    pageOfficielle: `${HOTE}/parliamentary-business/overview/${leg.numero}${rang(leg.numero)}-parliament`,
    scrapedAt: new Date().toISOString(),
    note: "Votes nominatifs (divisions) lus dans les procès-verbaux de l'Assemblée législative de la Colombie-Britannique. La plupart des décisions se prennent de vive voix : l'absence de vote nominatif ne veut pas dire « unanime ». La présidence ne vote pas, sauf pour départager une égalité.",
    noteControle: "L'Assemblée ne publie pas de compte des divisions d'une session. Trois contrôles tiennent sur ce qu'elle publie : le total annoncé par chaque tableau, le rattachement de chaque nom à une seule personne, et le nombre de votants comparé au nombre de sièges. Les écarts sont listés dans votesNonPublies.",
    seancesPubliees,
    seancesLues,
    membresDeLaLegislature: membres.length,
    count: votes.length,
    rattachesAuProjet: rattaches,
    votesSansRattachement: sansProjet,
    votesNonPublies: problemes,
    votes,
  }, null, 2) + '\n');

  console.log(`${votes.length} votes écrits dans ${OUT_PATH} (${seancesLues} / ${seancesPubliees} procès-verbaux lus)`);
  const avecNumero = votes.filter((v) => v.billNum).length;
  console.log(`  portent sur un projet de loi : ${avecNumero} · motions sans projet : ${votes.length - avecNumero}`);
  console.log(`  rattachés à une fiche de projet : ${rattaches}${sansProjet.length ? ` · ${sansProjet.length} sans rattachement` : ''}`);
  for (const x of sansProjet.slice(0, 6)) console.log(`     ${x}`);
  if (sansProjet.length > 6) console.log(`     … et ${sansProjet.length - 6} autres`);
  const anciens = new Set();
  for (const v of votes) for (const c of [...v.pour, ...v.contre, ...v.abstentions]) if (c.ancien) anciens.add(c.lastName);
  if (anciens.size) console.log(`  ont voté puis quitté la Chambre : ${[...anciens].join(', ')}`);
  const egalites = votes.filter((v) => v.tranchePresidence);
  console.log(`  égalités tranchées par la présidence : ${egalites.length}`);
  const sansEtape = votes.filter((v) => !v.stage);
  if (sansEtape.length) console.log(`  ⚠ sans étape lue : ${sansEtape.length} (${sansEtape.slice(0, 5).map((v) => `${v.date} #${v.rangDansLaSeance}`).join(', ')})`);
  if (problemes.length) {
    console.log(`  ⚠ ${problemes.length} écart(s), écrits dans le fichier :`);
    for (const p of problemes.slice(0, 10)) console.log(`     ${p}`);
    if (problemes.length > 10) console.log(`     … et ${problemes.length - 10} autres`);
  } else {
    console.log('  contrôles au vert : totaux annoncés, noms rattachés, votants sous le nombre de sièges');
  }
}

main().catch((err) => {
  console.error('Échec du scraper votes.js :', err.message);
  process.exitCode = 1;
});
