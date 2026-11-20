// L'IA du volet Vancouver (Martin, 20 nov. 2026 : « fais la traduction et fais le AI recap comme ailleurs »).
//
//   node vancouver/scrapers/ia.js --dry-run     montre ce qui serait demandé, n'appelle rien
//   node vancouver/scrapers/ia.js               traduit et résume (ANTHROPIC_API_KEY : secret GitHub seulement)
//
// Deux sorties, tirées SEULEMENT du registre des votes (data/decisions.json) : la Ville refuse la
// lecture automatisée de ses procès-verbaux, on ne la contourne pas.
//   - data/objets-fr.json : la traduction française de chaque ligne d'ordre du jour, par paquets de 20.
//     Garde-fou : les nombres de l'anglais et du français doivent être les mêmes, sinon on garde l'anglais.
//   - data/resumes-seances.json : une ou deux phrases par séance, en français et en anglais, comme
//     dossierquebec/scripts/resumes-seances.js. Garde-fous : tout nombre doit venir de la liste
//     envoyée, aucun mot de jugement ; sinon pas de phrase (la carte garde son récap compté).
// Rien n'est redemandé tant que le texte source n'a pas changé.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const D = new URL('../data/', import.meta.url);
const MODELE = 'claude-sonnet-5-5';   // comme le reste de DossierBC (Martin, 20 nov. 2026)
const TARIF = { entree: 3, sortie: 15 };   // $ US par million de jetons (estimation)
const JUGEMENT = /\b(majeur|majeure|majeurs|majeures|important|importante|importants|importantes|ambitieu|coûteu|controvers|totalisant|au total|environ|historique|major|significant|ambitious|costly|totaling|totalling|approximately|historic)/i;
const lire = async (n) => (existsSync(new URL(n, D)) ? JSON.parse(await readFile(new URL(n, D), 'utf8')) : null);
const ecrire = (n, o) => writeFile(new URL(n, D), JSON.stringify(o, null, 1) + '\n', 'utf8');
const nombres = (t) => (String(t ?? '').replace(/[\s  ]/g, '').match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, ''));
const plat = (t) => String(t ?? '').toLowerCase().replace(/[’ʼ]/g, "'");
const garder = (mots, phrase) => (mots ?? []).map((m) => {
  if (!m || m.length > 40 || m.includes('$') || (m.match(/[0-9]/g) ?? []).length > m.length / 3) return null;
  const i = plat(phrase).indexOf(plat(m).trim());
  return i >= 0 ? String(phrase).slice(i, i + m.trim().length) : null;
}).filter(Boolean).slice(0, 3);

const client = DRY ? null : new Anthropic();
let entree = 0, sortieJ = 0, appels = 0;
async function outil(system, def, contenu, max) {
  const rep = await client.messages.create({ model: MODELE, max_tokens: max, system, tools: [def], tool_choice: { type: 'tool', name: def.name }, messages: [{ role: 'user', content: contenu }] });
  appels++; entree += rep.usage.input_tokens; sortieJ += rep.usage.output_tokens;
  return rep.content.find((c) => c.type === 'tool_use')?.input ?? {};
}

// ---------- 1. Les lignes d'ordre du jour, en français ----------
const CONSIGNE_TITRES = `Tu traduis en français du Québec des lignes d'ordre du jour du conseil municipal de Vancouver,
pour un site d'information citoyenne. Traduction fidèle et courte, sans rien ajouter ni expliquer.
Garde tels quels : les adresses (« 2345-2349 Main Street »), les noms propres, les sigles (CD-1, ODP) et les numéros.
« Rezoning » = « Rezonage », « Amendment » = « Amendement », « Contract Award » = « Attribution de contrat »,
« NEW BUSINESS » = « Affaires nouvelles », « Referral Report » = « Rapport de renvoi ».
Rends exactement autant de traductions que de lignes reçues, dans le même ordre, sans leur numéro.`;
const OUTIL_TITRES = { name: 'traductions', description: 'Enregistre les traductions, dans l’ordre.', strict: true,
  input_schema: { type: 'object', properties: { fr: { type: 'array', items: { type: 'string' } } }, required: ['fr'], additionalProperties: false } };

async function titres(decisions) {
  const ancien = (await lire('objets-fr.json'))?.objets ?? {};
  const votes = (await lire('votes.json'))?.votes ?? [];
  const textes = [...new Set([...decisions.map((d) => d.objet), ...votes.map((v) => v.objet)].filter(Boolean))];
  const objets = {};
  for (const t of textes) if (ancien[t]) objets[t] = ancien[t];
  const reste = textes.filter((t) => !objets[t]);
  console.log(`Titres : ${textes.length}, déjà traduits ${textes.length - reste.length}, à traduire ${reste.length}`);
  let refus = 0;
  for (let i = 0; i < reste.length; i += 20) {
    const paquet = reste.slice(i, i + 20);
    if (DRY) { console.log(paquet.slice(0, 3).join('\n') + '\n…'); continue; }
    try {
      const { fr } = await outil(CONSIGNE_TITRES, OUTIL_TITRES, paquet.map((t, k) => `${k + 1}. ${t}`).join('\n'), 4000);
      if (!Array.isArray(fr) || fr.length !== paquet.length) { console.log(`  paquet ${i} : ${fr?.length} pour ${paquet.length}, rejeté`); refus += paquet.length; continue; }
      paquet.forEach((t, k) => {
        const f = String(fr[k] ?? '').replace(/^\d+\.\s*/, '').trim();
        if (!f || nombres(t).sort().join(' ') !== nombres(f).sort().join(' ')) { refus++; console.log(`  refusé (nombres) : ${t} → ${f}`); }
        else objets[t] = f;
      });
    } catch (e) { console.log(`  paquet ${i} : ${e.message}`); }
  }
  if (!DRY) await ecrire('objets-fr.json', { genereLe: new Date().toISOString(), modele: MODELE, avertissement: 'Traduction automatique (IA) des lignes d’ordre du jour de la Ville ; l’anglais de la Ville fait foi.', objets });
  return refus;
}

// ---------- 2. Une phrase par séance ----------
const CONSIGNE_SEANCE = `Tu écris le résumé d'une séance du conseil municipal de Vancouver pour un site d'information citoyenne.
On te donne SEULEMENT le registre des votes : pour chaque point, la ligne d'ordre du jour de la Ville (en anglais),
le résultat et le décompte pour/contre. La Ville ne publie aucun autre texte : tu n'en sais pas plus.

Écris UNE ou DEUX phrases, 45 mots au plus, qui disent ce que l'instance a fait de plus concret : les sujets
principaux (rezonages et leurs adresses, contrats, motions), ce qui a été adopté ou rejeté.
En français, commence par « Le conseil » (« Le comité » pour un comité, « À cette audience publique, le conseil »
pour une audience publique). En anglais : « Council », « The committee », « At this public hearing, Council ».

Interdits absolus (une phrase qui les enfreint est jetée) :
1. N'invente rien, n'explique rien que la ligne ne dit pas. Tout nombre doit être recopié tel quel de la liste
   (adresses, décomptes). Pas de total, pas d'arrondi, pas de « environ ».
2. Aucun jugement : ni « majeur », ni « important », ni « ambitieux », ni « controversé », ni « historique ».
3. Pas de vocabulaire de procédure (ordre du jour, procès-verbal, levée de séance).

Donne la phrase en français (phrase) et en anglais (phraseEn), fidèles l'une à l'autre.
Donne enfin motsCles : 2 ou 3 mots ou courtes expressions (1 à 3 mots) recopiés TELS QUELS de la phrase française,
qui disent le SUJET concret de chaque élément (ex. « rezonages », « fête de l'Émancipation », « cybersécurité »).
Jamais un montant, une adresse, un nom de conseil ou un verbe. Et motsClesEn : les mêmes, recopiés tels quels de phraseEn.`;
const OUTIL_SEANCE = { name: 'resume_seance', description: 'Enregistre la phrase qui résume la séance.', strict: true,
  input_schema: { type: 'object', properties: { phrase: { type: 'string' }, phraseEn: { type: 'string' }, motsCles: { type: 'array', items: { type: 'string' } }, motsClesEn: { type: 'array', items: { type: 'string' } } }, required: ['phrase', 'phraseEn', 'motsCles', 'motsClesEn'], additionalProperties: false } };

async function seances(decisions, liste) {
  const ancien = (await lire('resumes-seances.json'))?.seances ?? {};
  const sortie = {};
  let rejets = 0;
  for (const s of liste) {
    const decs = decisions.filter((d) => d.seanceId === s.id && d.theme !== 'procedure');
    if (decs.length < 2) continue;
    const lignes = decs.map((d) => `- ${d.objet} [${d.resultat}${d.decomptePour != null ? `, ${d.decomptePour} pour – ${d.decompteContre} contre` : ''}]`).join('\n');
    const message = `${s.nom}, séance du ${s.date} — ${decs.length} votes.\n\n${lignes}`;
    const signature = `${decs.length}:${message.length}`;
    const vieux = ancien[s.id];
    if (vieux?.signature === signature && (vieux.phrase || (vieux.rejets ?? 0) >= 3)) { sortie[s.id] = vieux; continue; }
    if (DRY) { console.log(`\n=== ${s.id}\n${message.slice(0, 400)}…`); continue; }
    try {
      const { phrase, phraseEn, motsCles, motsClesEn } = await outil(CONSIGNE_SEANCE, OUTIL_SEANCE, message, 800);
      const permis = nombres(message);
      const fautifs = [...nombres(phrase), ...nombres(phraseEn)].filter((n) => !permis.includes(n));
      if (JUGEMENT.test(phrase ?? '') || JUGEMENT.test(phraseEn ?? '')) fautifs.push('mot de jugement');
      if (!phrase || !phraseEn || fautifs.length) {
        rejets++; console.log(`  ${s.id} rejetée (${fautifs.join(', ')}) — ${phrase}`);
        sortie[s.id] = { signature, rejets: (vieux?.signature === signature ? vieux.rejets ?? 0 : 0) + 1, phrase: null, phraseEn: null };
        continue;
      }
      // Le thème de chaque mot clé anglais : celui de la première ligne qui le contient.
      const mc = garder(motsCles, phrase), mcEn = garder(motsClesEn, phraseEn);
      const themeDe = (m) => decs.find((d) => plat(d.objet).includes(plat(m)))?.theme ?? null;
      sortie[s.id] = { signature, phrase, phraseEn, motsCles: mc, motsClesEn: mcEn, motsThemes: mcEn.map(themeDe), genereLe: new Date().toISOString() };
    } catch (e) { console.log(`  ${s.id} : ${e.message}`); }
  }
  if (!DRY) await ecrire('resumes-seances.json', { genereLe: new Date().toISOString(), modele: MODELE, source: 'Registre des votes de la Ville de Vancouver (données ouvertes), rien d’autre', seances: sortie });
  return rejets;
}

const decisions = (await lire('decisions.json')).decisions;
const refus = await titres(decisions);
const rejets = await seances(decisions, (await lire('seances.json')).seances ?? []);
console.log(`Appels ${appels}, ${entree} jetons en entrée, ${sortieJ} en sortie ≈ ${((entree * TARIF.entree + sortieJ * TARIF.sortie) / 1e6).toFixed(3)} $ US. Titres refusés ${refus}, phrases rejetées ${rejets}.`);
