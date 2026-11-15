// Le lexique du conseil de Vancouver, mesuré sur les points votés.
//
//   node scrapers/lexique.js
//
// Même idée qu'à Québec et à Montréal : les DÉFINITIONS sont de nous, les DÉCOMPTES et les EXEMPLES
// viennent des données de la Ville. Aucune requête ici : tout se lit dans data/decisions.json et
// data/votes.json, écrits par scrapers/votes.js. Chaque terme porte une expression régulière ; le
// scraper compte combien de points votés la contiennent (ou, pour les termes de structure, combien
// de séances, de bulletins ou de résultats), et garde un exemple réel.
//
// RÈGLE : une définition dit ce que le mot veut dire dans les documents de la Ville, pas ce que la
// loi en dit. Quand la loi compte (l'abstention, l'inadmissibilité), on décrit ce que le registre
// consigne, sans prêter une raison que le registre ne donne pas.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CATEGORIES_FR, ENTREES_FR } from '../lib/lexique-fr.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const CATEGORIES = {
  instances: 'Who decides',
  vote: 'Voting and results',
  documents: 'Motions and by-laws',
  urbanisme: 'Zoning and development',
  argent: 'Money and property',
};

// sur : 'objet' (la ligne d'ordre du jour), 'instance' (le type de séance), 'vote' (un bulletin),
// 'resultat' (le résultat d'un point).
const TERMES = [
  // --- Who decides ---
  { terme: 'City Council', categorie: 'instances', sur: 'instance', recherche: /^(?:Regular )?Council$/,
    definition: 'The Mayor and ten Councillors, all elected city-wide for four years. Council decides by motion: the question is put, each member votes, and the motion is carried or lost.',
    ouVousLeVoyez: 'The meeting type on most cards. Vancouver has no wards: every member represents the whole city.' },
  { terme: 'Regular Council', categorie: 'instances', sur: 'instance', recherche: /^Regular Council$/,
    definition: 'A Council meeting held on the regular schedule, where reports, by-laws and motions are decided.',
    ouVousLeVoyez: 'A meeting type in the City’s record.' },
  { terme: 'Special Council', categorie: 'instances', sur: 'instance', recherche: /^Special Council$/,
    definition: 'A Council meeting called outside the regular schedule, usually for one matter.',
    ouVousLeVoyez: 'A meeting type in the City’s record.' },
  { terme: 'Public Hearing', categorie: 'instances', sur: 'instance', recherche: /^Public Hearing$/,
    definition: 'Council sitting to hear speakers before deciding on rezoning, heritage and certain other by-laws. The vote at the end of a hearing is a Council vote.',
    ouVousLeVoyez: 'Most rezoning decisions are made at a public hearing, often late in the evening.' },
  { terme: 'Standing committee', categorie: 'instances', sur: 'instance', recherche: /^(?:Policy & Strategic Priorities|City Finance & Services)$/, aussi: 'Policy & Strategic Priorities; City Finance & Services',
    definition: 'A committee made up of all Council members that hears staff reports and speakers first. Its decisions are referred to the next Council meeting to be made final.',
    ouVousLeVoyez: 'Two of Vancouver’s meeting types. The same item can therefore be voted twice: once in committee, once in Council.' },
  { terme: 'Courts of Revision', categorie: 'instances', sur: 'instance', recherche: /^Courts of Revision$/,
    definition: 'Council sitting as a court to hear appeals about local improvement charges and parcel taxes.',
    ouVousLeVoyez: 'A rare meeting type in the City’s record.' },
  { terme: 'Auditor General Committee', categorie: 'instances', sur: 'instance', recherche: /^Auditor General Committee$/,
    definition: 'The Council committee that oversees the City’s independent Auditor General.',
    ouVousLeVoyez: 'A rare meeting type in the City’s record.' },
  { terme: 'Mayor', categorie: 'instances', sur: 'bulletin', recherche: /^Mayor\b/,
    definition: 'Elected city-wide. Chairs Council meetings and votes like every other member.',
    ouVousLeVoyez: 'One line per vote in the City’s record, like the ten Councillors.' },
  { terme: 'Councillor', categorie: 'instances', sur: 'bulletin', recherche: /^Councillor\b/,
    definition: 'One of ten members elected city-wide. No Councillor represents a neighbourhood: each one represents all of Vancouver.',
    ouVousLeVoyez: 'The City writes the title, an initial and the family name: “Councillor P Fry”.' },

  // --- Voting and results ---
  { terme: 'Recorded vote', categorie: 'vote', sur: 'objet', recherche: /./,
    definition: 'A vote in which each member’s choice is written down. Since 2016 Vancouver records every Council vote electronically, member by member — in many councils a recorded vote has to be requested.',
    ouVousLeVoyez: 'Every card on this site. The City notes that the official record remains the meeting minutes.' },
  { terme: 'In Favour', categorie: 'vote', sur: 'vote', recherche: /^In Favour$/,
    definition: 'The member voted for the motion.',
    ouVousLeVoyez: 'The “for” count on each card.' },
  { terme: 'In Opposition', categorie: 'vote', sur: 'vote', recherche: /^In Opposition$/,
    definition: 'The member voted against the motion.',
    ouVousLeVoyez: 'The “against” count, and the names under “Against”.' },
  { terme: 'Abstain', categorie: 'vote', sur: 'vote', recherche: /^Abstain$/,
    definition: 'The member was present and did not vote for or against. The record gives the status, not the reason.',
    ouVousLeVoyez: 'Listed under “Abstained” when a card is opened.' },
  { terme: 'Absent', categorie: 'vote', sur: 'vote', recherche: /^Absent$/,
    definition: 'The member was not in the room when this vote was taken.',
    ouVousLeVoyez: 'Listed under “Absent” when a card is opened. Absence from one vote is not absence from the meeting.' },
  { terme: 'Declared Conflict', categorie: 'vote', sur: 'vote', recherche: /^Declared Conflict$/,
    definition: 'The member declared a conflict of interest on this item, left the room and did not vote.',
    ouVousLeVoyez: 'The gold tag on a card and on a member’s profile. The rarest status in the record.' },
  { terme: 'Ineligible', categorie: 'vote', sur: 'vote', recherche: /^Ineligible$/,
    definition: 'The member was not eligible to vote on this item. The record gives the status, not the reason.',
    ouVousLeVoyez: 'Rare. Shown when a card is opened.' },
  { terme: 'No Vote', categorie: 'vote', sur: 'vote', recherche: /^No Vote$/,
    definition: 'No vote was registered for the member. The City changed the definition of this status on September 21, 2021; see its change log.',
    ouVousLeVoyez: 'Rare in recent years.' },
  { terme: 'Carried', categorie: 'vote', sur: 'resultat', recherche: /^Carried$/,
    definition: 'More members voted for the motion than against it: it passed.',
    ouVousLeVoyez: 'The result tag on a card.' },
  { terme: 'Carried Unanimously', categorie: 'vote', sur: 'resultat', recherche: /^Carried Unanimously$/,
    definition: 'Every member who voted was in favour.',
    ouVousLeVoyez: 'The most common result. Unanimous does not mean everyone was present.' },
  { terme: 'Lost', categorie: 'vote', sur: 'resultat', recherche: /^Lost$/,
    definition: 'The motion did not get a majority: it failed.',
    ouVousLeVoyez: 'The red result tag. Often an amendment or a member’s motion.' },

  // --- Motions and by-laws ---
  { terme: 'Motion', categorie: 'documents', sur: 'objet', recherche: /\bmotion\b/i,
    definition: 'The question Council votes on. A staff report’s recommendations, a by-law, or a member’s own proposal become a motion once moved and seconded.',
    ouVousLeVoyez: 'Every card is one motion put to a vote.' },
  { terme: 'Amendment', categorie: 'documents', sur: 'objet', recherche: /\bamend/i,
    definition: 'A motion to change the wording of the motion on the floor. It is voted first; if it carries, the main motion is then voted as amended.',
    ouVousLeVoyez: 'A card whose subject ends with “– Amendment”. The same item then appears again as the main motion.' },
  { terme: 'Referral', categorie: 'documents', sur: 'objet', recherche: /\brefer/i,
    definition: 'A motion to send the matter to staff, to a committee or to a later meeting instead of deciding now.',
    ouVousLeVoyez: 'A card whose subject ends with “– Referral”.' },
  { terme: 'By-law', categorie: 'documents', sur: 'objet', recherche: /\bby-?law/i,
    definition: 'A City law. Council votes to enact it after a report and, for zoning and heritage, after a public hearing.',
    ouVousLeVoyez: 'Enactment votes, often several at once near the end of a Council meeting.' },
  { terme: 'New Business', categorie: 'documents', sur: 'objet', recherche: /\bnew business\b/i, aussi: 'Member’s motion',
    definition: 'Items brought by a Councillor or the Mayor rather than by staff, raised at the end of a meeting.',
    ouVousLeVoyez: 'A card whose subject starts with “NEW BUSINESS”.' },

  // --- Zoning and development ---
  { terme: 'Rezoning', categorie: 'urbanisme', sur: 'objet', recherche: /\brezon/i,
    definition: 'Changing which uses and buildings are allowed on a site, by amending the Zoning and Development By-law. Decided after a public hearing.',
    ouVousLeVoyez: 'The most frequent subject at public hearings, usually with the street address.' },
  { terme: 'CD-1', categorie: 'urbanisme', sur: 'objet', recherche: /\bCD-?1\b/i, aussi: 'Comprehensive Development district',
    definition: 'A zoning district written for one site, with its own rules, instead of a standard zone that applies across the city.',
    ouVousLeVoyez: '“CD-1 Rezoning: 5229-5249 Ash Street”.' },
  { terme: 'Text Amendment', categorie: 'urbanisme', sur: 'objet', recherche: /\btext amendment\b/i,
    definition: 'A change to the wording of a zoning district’s rules, rather than to the zoning map.',
    ouVousLeVoyez: 'Public hearing items without a single address.' },
  { terme: 'Heritage designation', categorie: 'urbanisme', sur: 'objet', recherche: /\bheritage\b/i,
    definition: 'Legal protection of a building or site by by-law. Changes to it then need a heritage alteration permit.',
    ouVousLeVoyez: 'Public hearing items that pair a heritage by-law with a rezoning.' },
  { terme: 'Development Permit', categorie: 'urbanisme', sur: 'objet', recherche: /\bdevelopment permit\b/i,
    definition: 'The City’s approval of a specific building project under the zoning that already applies. Most are decided by staff; Council sees policy and appeals.',
    ouVousLeVoyez: 'Occasionally in Council items about process and timelines.' },

  // --- Money and property ---
  { terme: 'Grant', categorie: 'argent', sur: 'objet', recherche: /\bgrants?\b/i,
    definition: 'Money the City gives to an organization for a stated purpose. Council approves grants, often by the dozen in one report.',
    ouVousLeVoyez: 'Items from Arts, Culture and Community Services.' },
  { terme: 'Lease and licence', categorie: 'argent', sur: 'objet', recherche: /\b(?:sub)?lease\b|\blicen[cs]e agreement/i,
    definition: 'The City renting out, or renting, a property. A licence agreement gives a right to use a space without a lease.',
    ouVousLeVoyez: 'Real estate items, often bundled with grants to community groups.' },
  { terme: 'Tax Sale', categorie: 'argent', sur: 'objet', recherche: /\btax sale\b/i,
    definition: 'The yearly auction of properties whose property taxes have been unpaid for years. Council can cancel a sale.',
    ouVousLeVoyez: 'A short Council item each fall.' },
  { terme: 'Capital plan and budget', categorie: 'argent', sur: 'objet', recherche: /\bcapital (?:plan|budget|project)/i,
    definition: 'The multi-year plan of what the City will build, buy and repair, and the yearly budget that funds it.',
    ouVousLeVoyez: 'Finance committee and Council items, mostly in the fall and winter.' },
  { terme: 'DCL and CAC', categorie: 'argent', sur: 'objet', recherche: /\bDCL\b|\bdevelopment cost lev|\bCAC\b|\bcommunity amenity contribution/i, aussi: 'Development Cost Levies; Community Amenity Contributions',
    definition: 'What developers pay the City when they build: a levy set by by-law (DCL), and a contribution negotiated with a rezoning (CAC).',
    ouVousLeVoyez: 'Rezoning reports and by-law updates.' },
];

async function lireJson(chemin) {
  try { return JSON.parse(await readFile(chemin, 'utf8')); } catch { return null; }
}

async function main() {
  const decisions = await lireJson('data/decisions.json');
  const votes = await lireJson('data/votes.json');
  if (!decisions || !votes) throw new Error('data/decisions.json ou data/votes.json manquant — lancer d’abord scrapers/votes.js');

  const points = decisions.decisions;
  const bulletins = [];
  for (const v of votes.votes) {
    for (const [statut, liste] of [['In Favour', v.pour], ['In Opposition', v.contre], ['Abstain', v.abstentions], ['Absent', v.absents], ['Declared Conflict', v.conflits], ['Ineligible', v.inadmissibles], ['No Vote', v.sansVote]]) {
      for (const membre of liste ?? []) bulletins.push({ statut, membre });
    }
  }
  const seances = decisions.seances ?? [];

  const entrees = TERMES.map((t) => {
    let occurrences;
    let exemple = null;
    if (t.sur === 'objet') {
      const trouves = points.filter((p) => t.recherche.test(p.objet ?? ''));
      occurrences = { points: trouves.length, surTotal: points.length };
      if (trouves[0]) exemple = { numero: trouves[0].numero, objet: trouves[0].objet, date: trouves[0].date, instance: trouves[0].instance };
    } else if (t.sur === 'instance') {
      const s = seances.filter((x) => t.recherche.test(x.instance ?? ''));
      const p = points.filter((x) => t.recherche.test(x.instance ?? ''));
      occurrences = { seances: s.length, points: p.length, surTotal: points.length };
      if (p[0]) exemple = { numero: p[0].numero, objet: p[0].objet, date: p[0].date, instance: p[0].instance };
    } else if (t.sur === 'vote') {
      const b = bulletins.filter((x) => t.recherche.test(x.statut));
      occurrences = { bulletins: b.length, surTotal: bulletins.length };
      const p = votes.votes.find((v) => ({ 'In Favour': v.pour, 'In Opposition': v.contre, Abstain: v.abstentions, Absent: v.absents, 'Declared Conflict': v.conflits, Ineligible: v.inadmissibles, 'No Vote': v.sansVote }[b[0]?.statut] ?? []).length);
      if (p) exemple = { numero: p.numero, objet: p.objet, date: p.date, instance: p.instance };
    } else if (t.sur === 'resultat') {
      const p = points.filter((x) => t.recherche.test(x.resultat ?? ''));
      occurrences = { points: p.length, surTotal: points.length };
      if (p[0]) exemple = { numero: p[0].numero, objet: p[0].objet, date: p[0].date, instance: p[0].instance };
    } else if (t.sur === 'bulletin') {
      const b = bulletins.filter((x) => t.recherche.test(x.membre));
      occurrences = { bulletins: b.length, membres: new Set(b.map((x) => x.membre)).size, surTotal: bulletins.length };
    }
    return {
      terme: t.terme,
      categorie: t.categorie,
      ...(t.aussi ? { aussi: t.aussi } : {}),
      recherche: t.recherche.source,
      definition: t.definition,
      ouVousLeVoyez: t.ouVousLeVoyez,
      occurrences: { ...occurrences, periode: `${decisions.parametres.depuis} → ${decisions.parametres.jusqua}` },
      exemple,
    };
  });

  const sortie = {
    generatedAt: new Date().toISOString(),
    source: decisions.source,
    avertissement: 'The definitions in this glossary are written by DossierBC — they are not the City of Vancouver’s texts nor legal definitions. What comes from the official record is the count of occurrences and the example under each term.',
    categories: CATEGORIES,
    parametres: decisions.parametres,
    nombre: entrees.length,
    entrees,
  };
  await writeFile('data/lexique.json.tmp', JSON.stringify(sortie, null, 1), 'utf8');
  await rename('data/lexique.json.tmp', 'data/lexique.json');
  // La version française : les mêmes termes, superposés par la page quand le français est choisi.
  const manquants = entrees.filter((e) => !ENTREES_FR[e.terme]).map((e) => e.terme);
  if (manquants.length) console.warn(`⚠ sans traduction française : ${manquants.join(', ')}`);
  const fr = { generatedAt: sortie.generatedAt, avertissement: 'Les définitions de ce lexique sont écrites par DossierBC — ce ne sont ni des textes de la Ville de Vancouver ni des définitions juridiques. Ce qui vient du registre officiel, c’est le nombre d’occurrences et l’exemple sous chaque terme.', categories: CATEGORIES_FR, entrees: ENTREES_FR };
  await writeFile('data/lexique-fr.json.tmp', JSON.stringify(fr, null, 1), 'utf8');
  await rename('data/lexique-fr.json.tmp', 'data/lexique-fr.json');
  const zero = entrees.filter((e) => !Object.values(e.occurrences).some((v) => typeof v === 'number' && v > 0 && v !== e.occurrences.surTotal));
  console.log(`${entrees.length} termes dans data/lexique.json ; ${zero.length} sans occurrence sur la fenêtre : ${zero.map((e) => e.terme).join(', ') || 'aucun'}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
