// Les votes nominatifs du conseil de Vancouver — et tout ce qui s'en déduit.
//
//   node scrapers/votes.js                               les deux derniers mois civils révolus
//   node scrapers/votes.js --depuis=2026-06-01 --jusqua=2026-07-31
//   node scrapers/votes.js --fichier=data/brut/council-voting-records.csv --depuis=… --jusqua=…
//
// DEUX PORTES POUR LES MÊMES LIGNES. Sans --fichier, le scraper lit l'API Explore du portail
// (lib/van.js). Avec --fichier, il lit un export CSV du même jeu, téléchargé à la main depuis
// la page du jeu (bouton « Export », format CSV, séparateur « ; ») : c'est la porte qui ne
// touche pas à /api/, celle à prendre tant que la question du robots.txt n'est pas tranchée
// (voir lib/van.js). Le fichier est filtré sur la fenêtre, puis tout le reste est identique.
//
// UNE SEULE SOURCE, UNE SEULE LECTURE, CINQ FICHIERS. Vancouver ne publie qu'un jeu utile sur
// son conseil, « Council voting records » (lib/van.js) : une ligne par membre et par point mis
// aux voix. Tout le volet en sort :
//
//   data/votes.json             un vote par point mis aux voix : qui a voté quoi, le résultat
//   data/decisions.json         les mêmes points, dans la forme que la page Décisions attend
//   data/seances.json           les séances, déduites des votes (date, type, nombre de points)
//   data/elus.json              les membres du conseil, déduits des votes de la période
//   data/votes-decisions.json   les votes rangés par numéro, pour la boîte « Recorded vote »
//
// À Montréal ce sont cinq scrapers, parce que ce sont cinq sources. Ici, découper ferait cinq
// fois les mêmes requêtes à la Ville pour rien.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Le jeu ne dit ni le parti, ni le district (il n'y
// en a pas : Vancouver élit son conseil à l'échelle de la ville), ni le texte de la décision, ni
// le procès-verbal. Ces champs restent à null et les pages le disent. Une séance où aucun point
// n'a été mis aux voix n'existe pas dans le jeu : elle n'existe donc pas ici non plus.
//
// LA FENÊTRE. Par défaut, les deux derniers mois civils révolus. Pour la maquette de novembre
// 2026, scripts/refresh.js impose juin–juillet 2026 : septembre et novembre ont zéro vote, octobre
// en a onze — élections municipales de la C.-B. le 17 octobre 2026, conseil en pause — et une
// maquette sur une fenêtre vide ne montrerait rien.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  JEU, PAGE_JEU, PORTAIL, LICENCE, ATTRIBUTION, USER_AGENT, INSTANCES,
  toutesLesLignes, compter, metadonnees, lienSeance, heureVancouver, cleInstance, lireJson,
} from '../lib/van.js';
import { classer, THEMES } from '../lib/themes.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const iso = (d) => d.toISOString().slice(0, 10);
// Les deux derniers mois civils révolus : le 15 novembre, c'est septembre et octobre.
// Default window = the preview window, the same as scripts/refresh.js — so that running this
// scraper alone does not silently rewrite the data for another period (15 Nov. 2026: launched
// without arguments, it had replaced June–July with September–October, eleven votes).
// The "last two full months" rule is kept for the day the section goes live: --depuis=auto.
function fenetreParDefaut() {
  return { depuis: '2026-06-01', jusqua: '2026-07-31' };
}
function fenetreGlissante() {
  const now = new Date();
  const debut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const fin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { depuis: iso(debut), jusqua: iso(fin) };
}

// Some agenda lines arrive double-encoded from the City (« â€“ » for « – »). We repair the handful
// of known sequences and nothing else: it is the City's text, read back to what it typed.
const reparerEncodage = (t) => String(t).replace(/â€“/g, '–').replace(/â€”/g, '—').replace(/â€™/g, '’').replace(/â€˜/g, '‘').replace(/â€œ/g, '“').replace(/â€/g, '”').replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/Ã /g, 'à').replace(/Â /g, ' ');

async function lireJsonLocal(chemin) {
  try { return JSON.parse(await readFile(chemin, 'utf8')); } catch { return null; }
}

// Écriture en deux temps : le fichier voisin, puis le renommage. Un run interrompu ne laisse
// jamais un JSON à moitié écrit à la place du précédent.
async function ecrire(chemin, objet, compact = false) {
  await mkdir('data', { recursive: true });
  const tmp = `${chemin}.tmp`;
  await writeFile(tmp, compact ? JSON.stringify(objet) : JSON.stringify(objet, null, 1), 'utf8');
  await rename(tmp, chemin);
}

// « Mayor K Sim » → fonction Mayor, initiale K, nom Sim. On ne reconstruit pas un prénom qu'on
// n'a pas : nomComplet reste la chaîne telle que la Ville l'écrit.
function lireMembre(chaine) {
  const m = String(chaine).trim().match(/^(Mayor|Acting Mayor|Deputy Mayor|Councillor|Commissioner|Trustee)\s+(\S+)\s+(.+)$/);
  if (!m) return { nomComplet: chaine, fonction: null, prenom: null, nom: chaine };
  return { nomComplet: chaine, fonction: m[1], prenom: m[2], nom: m[3] };
}

// « 12. CD-1 Rezoning: 5229-5249 Ash Street » → article « 12 », objet sans le numéro.
// « NEW BUSINESS - Emancipation Day Motion » → pas d'article, objet tel quel.
function lireDescription(description) {
  const brut = String(description ?? '').replace(/\s+/g, ' ').trim();
  const m = brut.match(/^([A-Z]?\d+[a-z]?(?:\.\d+)*)\.\s+(.+)$/);
  if (m) return { article: m[1], objet: m[2] };
  return { article: null, objet: brut };
}

// Le « dossier » : ce qui relie plusieurs votes sur un même point. « 19. CD-1 Rezoning: 2345-2349
// Main Street » a reçu trois votes le même soir — le retrait, l'amendement, la motion telle
// qu'approuvée — et la page les montre comme le parcours d'un seul dossier.
const SUFFIXES_DE_VOTE = /\s+[-–—]\s+(?:Amendment|Amended Motion|Main Motion|Motion as (?:Approved|Amended)|Withdrawal(?: Motion)?(?: on the Main Motion)?|Referral(?: Motion)?|Postponement(?: Motion)?|Reconsideration|Tabling|Sever(?:ance|ed)|Motion to (?:Amend|Refer|Postpone|Table|Withdraw|Sever|Reconsider)|Part [A-Z0-9]+|Recommendation [A-Z0-9]+)\b.*$/i;
const dossierDe = (objet) => objet.replace(SUFFIXES_DE_VOTE, '').trim() || objet;

const ORDRE_FONCTION = { Mayor: 0, 'Acting Mayor': 1, 'Deputy Mayor': 1, Councillor: 2 };

// Un export CSV du portail : « ; » entre les champs, guillemets doublés dedans, première ligne
// = noms des champs (les mêmes que l'API), parfois un BOM en tête. Lu entièrement en mémoire :
// le jeu complet fait 83 824 lignes, une vingtaine de méga-octets — ça tient.
function lireCsv(texte) {
  const t = texte.replace(/^﻿/, '');
  const lignes = [];
  let champ = '', ligne = [], guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ';') { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((x) => x !== '')) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); if (ligne.some((x) => x !== '')) lignes.push(ligne); }
  const entete = lignes.shift() ?? [];
  const ATTENDUS = ['meeting_id', 'meeting_type', 'vote_date', 'vote_number', 'agenda_description', 'vote_start_date_time', 'council_member', 'vote', 'decision', 'vote_detail_id'];
  const manquants = ATTENDUS.filter((a) => !entete.includes(a));
  if (manquants.length) throw new Error(`export CSV : colonnes manquantes ${manquants.join(', ')} — en-tête lu : ${entete.join(' ; ')}`);
  return lignes.map((l) => {
    const o = {};
    entete.forEach((nom, i) => { o[nom] = l[i] ?? ''; });
    o.meeting_id = Number(o.meeting_id);
    return o;
  });
}

// Les lignes de la fenêtre, par l'une ou l'autre porte. Même forme en sortie.
async function lignesDeLaFenetre({ fichier, depuis, jusqua }) {
  if (fichier) {
    console.log(`Lecture du fichier ${fichier} (export du portail), sans requête à la Ville.`);
    const toutes = lireCsv(await readFile(fichier, 'utf8'));
    const lignes = toutes.filter((l) => { const d = String(l.vote_date).slice(0, 10); return d >= depuis && d <= jusqua; });
    lignes.sort((a, b) => a.vote_date.localeCompare(b.vote_date) || Number(a.vote_number) - Number(b.vote_number) || String(a.vote_detail_id).localeCompare(String(b.vote_detail_id)));
    console.log(`  ${toutes.length} lignes dans le fichier, ${lignes.length} dans la fenêtre.`);
    return { lignes, total: lignes.length, totalJeu: toutes.length };
  }
  const where = `vote_date>=date'${depuis}' AND vote_date<=date'${jusqua}'`;
  const { lignes, total } = await toutesLesLignes(where);
  return { lignes, total, totalJeu: null };
}

async function main() {
  const args = parseArgs(process.argv);
  const defaut = args.depuis === 'auto' ? fenetreGlissante() : fenetreParDefaut();
  if (args.depuis === 'auto') { delete args.depuis; delete args.jusqua; }
  const depuis = String(args.depuis ?? defaut.depuis);
  const jusqua = String(args.jusqua ?? defaut.jusqua);
  for (const d of [depuis, jusqua]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { console.error(`Date attendue au format AAAA-MM-JJ, reçu « ${d} ».`); process.exit(1); }
  }
  if (jusqua < depuis) { console.error('--jusqua est avant --depuis.'); process.exit(1); }
  console.log(`Fenêtre : du ${depuis} au ${jusqua} inclus. Robot : ${USER_AGENT}`);

  const fichier = args.fichier ? String(args.fichier) : null;

  // 1. Les métadonnées du jeu, et le robots.txt — pour la page Sources, et parce qu'on les lit
  //    avant de lire quoi que ce soit d'autre (guide de reproduction, section 3, règle 3).
  //    Par la porte du fichier, on ne touche pas à l'API : les métadonnées viennent du fichier
  //    précédent s'il y en a un, sinon elles restent à null et la page Sources le dit.
  let meta = { titre: 'Council voting records', licence: LICENCE.nom, licenceUrl: LICENCE.url, nombreTotal: null, donneesTraiteesLe: null };
  if (!fichier) {
    meta = await metadonnees();
    console.log(`Jeu « ${meta.titre} » : ${meta.nombreTotal} lignes, données traitées le ${(meta.donneesTraiteesLe ?? '').slice(0, 10)}, licence « ${meta.licence} ».`);
  } else {
    const avant = await lireJsonLocal('data/votes.json');
    if (avant?.jeuMisAJourLe) meta.donneesTraiteesLe = avant.jeuMisAJourLe;
    if (avant?.totalDisponible) meta.nombreTotal = avant.totalDisponible;
  }
  let robots = null;
  try {
    const r = await fetch(`${PORTAIL}robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
    robots = r.ok ? await r.text() : null;
  } catch { /* pas bloquant */ }
  await ecrire('data/robots.json', {
    luLe: new Date().toISOString(),
    url: `${PORTAIL}robots.txt`,
    texte: robots,
    interditApi: robots ? /^Disallow:\s*\/api\/\s*$/m.test(robots) : null,
    porteUtilisee: fichier ? 'export CSV téléchargé à la main' : 'API Explore v2.1',
    note: 'Le robots.txt régit l’indexation par les moteurs de recherche. L’API Explore v2.1 est l’interface documentée du portail et la licence autorise l’usage ; la ligne « Disallow: /api/ » est notée ici pour que la décision d’y faire tourner un robot soit prise en connaissance de cause (voir lib/van.js).',
  });

  // 2. Les lignes de la fenêtre.
  const { lignes, total, totalJeu } = await lignesDeLaFenetre({ fichier, depuis, jusqua });
  if (totalJeu && !meta.nombreTotal) meta.nombreTotal = totalJeu;
  if (lignes.length !== total) throw new Error(`lu ${lignes.length} lignes, la source en annonçait ${total}`);
  if (!lignes.length) console.warn('⚠ Aucun vote dans la fenêtre. Les fichiers seront écrits vides.');

  // 3. Regrouper par point mis aux voix : (meeting_id, vote_number).
  const points = new Map();
  for (const l of lignes) {
    const cle = `${l.meeting_id}|${l.vote_number}`;
    if (!points.has(cle)) {
      points.set(cle, {
        meetingId: l.meeting_id,
        meetingType: l.meeting_type,
        voteNumber: String(l.vote_number),
        date: String(l.vote_date).slice(0, 10),
        horodatage: l.vote_start_date_time ?? null,
        description: reparerEncodage(l.agenda_description ?? ''),
        decision: l.decision ?? null,
        bulletins: [],
      });
    }
    points.get(cle).bulletins.push({ membre: l.council_member, vote: l.vote });
  }

  // 4. Les séances.
  const seancesParId = new Map();
  for (const p of points.values()) {
    if (!seancesParId.has(p.meetingId)) {
      const instance = cleInstance(p.meetingType);
      seancesParId.set(p.meetingId, {
        id: `${instance}_${p.date}_${p.meetingId}`,
        instance,
        nom: p.meetingType,
        explication: INSTANCES[p.meetingType]?.explication ?? null,
        date: p.date,
        heure: heureVancouver(p.horodatage),
        titre: `${p.meetingType} — ${p.date}`,
        lien: lienSeance(p.meetingId),
        source: JEU,
        meetingId: p.meetingId,
        nombrePoints: 0,
        nombreDivises: 0,
        nombreRejetes: 0,
      });
    }
    const s = seancesParId.get(p.meetingId);
    s.nombrePoints++;
    if (p.bulletins.some((b) => b.vote === 'In Opposition')) s.nombreDivises++;
    if (p.decision === 'Lost') s.nombreRejetes++;
    // L'heure de la séance : celle du premier vote.
    const h = heureVancouver(p.horodatage);
    if (h && (!s.heure || h < s.heure)) s.heure = h;
  }
  const seances = [...seancesParId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom));

  // 5. Les votes et les décisions.
  const precedent = await lireJsonLocal('data/decisions.json');
  const idsPrecedents = new Set((precedent?.decisions ?? []).map((d) => d.id));
  const par = (b, v) => b.filter((x) => x.vote === v).map((x) => x.membre).sort();
  const votes = [];
  const decisions = [];
  for (const p of [...points.values()].sort((a, b) => b.date.localeCompare(a.date) || Number(b.voteNumber) - Number(a.voteNumber))) {
    const seance = seancesParId.get(p.meetingId);
    const { article, objet } = lireDescription(p.description);
    const id = `V${p.voteNumber}`;
    const numero = `Vote ${p.voteNumber}`;
    const pour = par(p.bulletins, 'In Favour');
    const contre = par(p.bulletins, 'In Opposition');
    const abstentions = par(p.bulletins, 'Abstain');
    const absents = par(p.bulletins, 'Absent');
    const conflits = par(p.bulletins, 'Declared Conflict');
    const inadmissibles = par(p.bulletins, 'Ineligible');
    const sansVote = par(p.bulletins, 'No Vote');
    const { theme, themeSource } = classer({ objet });
    const commun = {
      id, numero, objet, article, date: p.date, annee: p.date.slice(0, 4),
      instance: p.meetingType, seanceId: seance.id, dossier: dossierDe(objet),
      resultat: p.decision, pdf: null, lienSource: seance.lien,
      decomptePour: pour.length, decompteContre: contre.length,
      theme, themeSource,
    };
    votes.push({
      ...commun,
      pour, contre, abstentions, absents, conflits, inadmissibles, sansVote,
      abstention: abstentions.length ? abstentions.join(', ') : null,
      demandeParVote: null,
      avertissements: [],
      brut: null,
      nouveau: precedent ? !idsPrecedents.has(id) : null,
    });
    decisions.push({
      ...commun,
      type: 'Motion',
      unite: null,
      sommaireId: null, sommairePdf: null,
      dissidences: contre,
      abstentions, absents, conflits,
      voteEnregistre: true,
      nouveau: precedent ? !idsPrecedents.has(id) : false,
    });
  }

  // 6. Les membres, déduits des bulletins de la période.
  const membres = new Map();
  for (const p of points.values()) {
    for (const b of p.bulletins) {
      if (!membres.has(b.membre)) {
        membres.set(b.membre, {
          ...lireMembre(b.membre),
          genre: null,
          siegeAuConseilMunicipal: true,
          districtNumero: null, district: null, districtCle: null, arrondissement: null, arrondissementCle: null,
          parti: null,
          roles: [],
          comiteExecutif: false,
          telephone: null, formulaireCourriel: null, courriel: null, biographie: null, photo: null,
          votes: { pour: 0, contre: 0, abstentions: 0, absents: 0, conflits: 0, inadmissibles: 0, sansVote: 0, total: 0 },
        });
      }
      const v = membres.get(b.membre).votes;
      v.total++;
      const champ = { 'In Favour': 'pour', 'In Opposition': 'contre', Abstain: 'abstentions', Absent: 'absents', 'Declared Conflict': 'conflits', Ineligible: 'inadmissibles', 'No Vote': 'sansVote' }[b.vote];
      if (champ) v[champ]++;
      else console.warn(`⚠ valeur de vote inconnue : « ${b.vote} » (${b.membre}, point ${p.voteNumber})`);
    }
  }
  const listeMembres = [...membres.values()].sort((a, b) => (ORDRE_FONCTION[a.fonction] ?? 9) - (ORDRE_FONCTION[b.fonction] ?? 9) || a.nom.localeCompare(b.nom));

  // 7. Les facettes de la page Décisions.
  const facette = (cle) => {
    const c = new Map();
    for (const d of decisions) c.set(d[cle], (c.get(d[cle]) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([valeur, n]) => ({ valeur, n }));
  };
  const parTheme = facette('theme');
  const defauts = decisions.filter((d) => d.themeSource === 'defaut').length;

  // 8. Écrire.
  const generatedAt = new Date().toISOString();
  const parametres = { annee: depuis.slice(0, 4), depuis, jusqua };
  const racine = {
    generatedAt,
    source: PAGE_JEU,
    jeu: JEU,
    licence: `${LICENCE.nom} ${LICENCE.version} — ${LICENCE.url}`,
    attribution: ATTRIBUTION,
    jeuMisAJourLe: meta.donneesTraiteesLe,
    parametres,
  };
  const nouveauxD = precedent ? decisions.filter((d) => d.nouveau).length : null;

  await ecrire('data/seances.json', {
    ...racine,
    nombre: seances.length,
    parInstance: Object.fromEntries(seances.reduce((m, s) => m.set(s.nom, (m.get(s.nom) ?? 0) + 1), new Map())),
    instances: Object.fromEntries(Object.entries(INSTANCES).map(([nom, i]) => [nom, i.explication])),
    seances,
  });

  await ecrire('data/votes.json', {
    ...racine,
    methode: 'Chaque ligne du jeu « Council voting records » est le vote d’un membre sur un point ; les lignes sont regroupées par séance et par numéro de vote. Aucun texte n’est lu, aucun nom n’est extrait d’un document : tout est déjà structuré chez la Ville.',
    versionLecture: 1,
    totalDisponible: meta.nombreTotal,
    documentsAnalyses: seances.length,
    nombre: votes.length,
    nouveauxDepuisDerniereExecution: nouveauxD,
    avecAvertissement: 0,
    themes: THEMES,
    votes,
  });

  await ecrire('data/decisions.json', {
    ...racine,
    partiel: true,
    totalDisponible: meta.nombreTotal,
    nombre: decisions.length,
    nouveauxDepuisDerniereExecution: nouveauxD,
    seancesLues: seances.length,
    seancesEnAttente: 0,
    themes: THEMES,
    sansTheme: defauts,
    // Ce que chaque type de séance veut dire, pour la ligne « Scope » des fiches (app.js, porteeDe).
    instances: Object.fromEntries(Object.entries(INSTANCES).map(([nom, i]) => [nom, i.explication])),
    facettes: { type: facette('type'), instance: facette('instance'), theme: parTheme },
    seances: seances.map((s) => ({ id: s.id, instance: s.nom, date: s.date, nombrePoints: s.nombrePoints })),
    decisions,
  });

  await ecrire('data/elus.json', {
    ...racine,
    note: 'Déduit du jeu des votes : les personnes qui ont voté pendant la période. Le jeu ne publie ni parti, ni district (le conseil est élu à l’échelle de la ville), ni coordonnées.',
    nombre: listeMembres.length,
    nombreTotal: listeMembres.length,
    partis: {},
    membres: listeMembres,
  });

  // La version allégée pour la boîte « Recorded vote » : les noms en index (scripts/votes-decisions.js
  // à Montréal — ici, dans le même passage, puisque les données sont déjà en mémoire).
  const noms = [];
  const rang = (n) => { let i = noms.indexOf(n); if (i < 0) { noms.push(n); i = noms.length - 1; } return i; };
  const v = {};
  for (const x of votes) v[x.numero] = [x.resultat ?? '', x.pour.map(rang), x.contre.map(rang), '', x.lienSource, x.abstentions.map(rang), x.absents.map(rang), x.conflits.map(rang)];
  await ecrire('data/votes-decisions.json', { noms, v }, true);

  // 9. Le bilan, pour l'œil.
  const divises = votes.filter((x) => x.contre.length).length;
  const rejetes = votes.filter((x) => x.resultat === 'Lost').length;
  const conflitsTotal = votes.reduce((n, x) => n + x.conflits.length, 0);
  console.log(`\n${seances.length} séance(s), ${votes.length} point(s) mis aux voix, ${lignes.length} bulletins, ${listeMembres.length} membres.`);
  console.log(`  ${divises} point(s) avec au moins un vote contre, ${rejetes} rejeté(s), ${conflitsTotal} conflit(s) d’intérêts déclaré(s).`);
  console.log('  Séances : ' + Object.entries(seances.reduce((m, s) => ({ ...m, [s.nom]: (m[s.nom] ?? 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join(' · '));
  console.log('  Sujets  : ' + parTheme.map((t) => `${THEMES[t.valeur]?.libelle ?? t.valeur} ${t.n}`).join(' · ') + (defauts ? `  (${defauts} par défaut)` : ''));
  console.log('  Écrit : data/seances.json, votes.json, decisions.json, elus.json, votes-decisions.json, robots.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
