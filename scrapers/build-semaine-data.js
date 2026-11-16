// Construit data/semaine.json : la fenêtre « Cette semaine à l'Assemblée » de l'accueil
// (Martin, 15 nov. 2026). Rien n'est lu en ligne ici : tout vient de data/bills.json (les dates
// d'étapes, posées par bills.js) et de data/comites.json (comites.js + comites-resumes.js).
//
// Une carte par (jour, étape) pour les projets de loi — le 16 avril, 9 sanctions font UNE carte,
// pas neuf — et une carte par séance de comité. Les projets passent en premier, puis les comités.
//
// « Cette semaine » = du lundi au dimanche, heure de Victoria. Une semaine vide (hors session) ne
// laisse pas la fenêtre vide : on montre alors les dernières activités, en le disant (mode
// « dernieres »). Les dates viennent des données ; aucune n'est écrite à la main.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SORTIE = 'data/semaine.json';
const MAX_PROJETS = 9, MAX_COMITES = 6, MAX_CHAMBRE = 6;

// L'ordre de la vie d'un projet (lexique.html#vie-projet). « amende » n'est pas une étape : c'est
// une précision de l'étude en comité, on ne la montre pas seule.
const ETAPES = {
  premiere: ['Première lecture', 'First reading'],
  deuxieme: ['Deuxième lecture', 'Second reading'],
  comite: ['Étude en comité', 'Committee stage'],
  rapport: ['Rapport', 'Report stage'],
  troisieme: ['Troisième lecture', 'Third reading'],
  sanction: ['Sanction royale', 'Royal Assent'],
};
const ORDRE = Object.keys(ETAPES);

const jourVictoria = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
function lundiDe(iso) {
  const t = new Date(`${iso}T12:00:00Z`);
  return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
}

const bills = JSON.parse(readFileSync('data/bills.json', 'utf-8')).bills ?? [];
const comites = existsSync('data/comites.json') ? JSON.parse(readFileSync('data/comites.json', 'utf-8')).seances ?? [] : [];

// Les étapes de projets, regroupées par (jour, étape).
const groupes = new Map();
for (const b of bills) {
  for (const [cle, jour] of Object.entries(b.dates ?? {})) {
    if (!ETAPES[cle] || !jour) continue;
    const k = `${jour}|${cle}`;
    if (!groupes.has(k)) groupes.set(k, { type: 'projets', jour, etape: cle, fr: ETAPES[cle][0], en: ETAPES[cle][1], projets: [] });
    groupes.get(k).projets.push({
      num: b.numAffiche ?? String(b.num), titre: b.title, titreEn: b.titleEn || b.title,
      url: b.legislature && b.introSession ? `/projets-de-loi/${b.num}-${b.legislature}-${b.introSession}` : null,
    });
  }
}
// Les séances de la Chambre déjà résumées (scrapers/hansard-resumes.js) : le contenu des débats,
// avec les players. Elles passent avant les cartes d'étapes, qui ne disent que les grandes lignes.
const hansard = existsSync('data/hansard-resumes.json') ? JSON.parse(readFileSync('data/hansard-resumes.json', 'utf-8')).seances ?? {} : {};
const chambre = Object.entries(hansard)
  .filter(([, h]) => h.en && h.fr)
  .map(([fichier, h]) => ({ ...h, genre: h.type, type: 'chambre', jour: h.debut.slice(0, 10), fichier }))
  .sort((a, b) => b.debut.localeCompare(a.debut));
const projets = [...groupes.values()].sort((a, b) => b.jour.localeCompare(a.jour) || ORDRE.indexOf(b.etape) - ORDRE.indexOf(a.etape));
const seances = comites.map((m) => ({ type: 'comite', jour: m.debut.slice(0, 10), ...m }))
  .sort((a, b) => b.debut.localeCompare(a.debut));

const aujourdhui = jourVictoria();
const lundi = lundiDe(aujourdhui);
const dimanche = new Date(new Date(`${lundi}T12:00:00Z`).getTime() + 6 * 864e5).toISOString().slice(0, 10);
const dansSemaine = (x) => x.jour >= lundi && x.jour <= dimanche;
const pSemaine = projets.filter(dansSemaine), cSemaine = seances.filter(dansSemaine), hSemaine = chambre.filter(dansSemaine);
const mode = pSemaine.length || cSemaine.length || hSemaine.length ? 'semaine' : 'dernieres';
const cartes = mode === 'semaine'
  ? [...hSemaine, ...pSemaine, ...cSemaine]
  : [...chambre.slice(0, MAX_CHAMBRE), ...projets.slice(0, MAX_PROJETS), ...seances.slice(0, MAX_COMITES)];

// Martin, 15 nov. 2026 : « garde juste 1-3 ». La fenêtre ne montre que les 3 premières cartes
// (séances de la Chambre d'abord), sans flèches.
cartes.splice(3);
writeFileSync(SORTIE, JSON.stringify({ fait: new Date().toISOString(), lundi, dimanche, mode, cartes }, null, 2) + '\n');
console.log(`✓ ${SORTIE} : ${mode}, ${cartes.length} carte(s) (${lundi} → ${dimanche})`);
