// Résumés en langage clair des projets de loi de la C.-B., en anglais ET en français (13 nov. 2026).
//
// Martin : « les projets de loi doivent être lisibles en français, c'est le but des sites Dossier ».
// Même mécanique que DossierOntario (scrapers/resumes.js) : le TEXTE OFFICIEL du projet, lu sur
// l'API de l'Assemblée (texteApi, posé par bills.js), un appel au modèle avec sortie forcée par un
// outil à schéma strict, et « sansContenu » quand le texte ne permet pas un résumé honnête.
// Différence : la C.-B. ne légifère qu'en anglais. Un seul appel par projet rend donc les deux
// langues, chacune écrite à partir du texte anglais (pas une traduction du résumé anglais).
// Leçon de l'Ontario : la langue de sortie s'écrit dans la consigne ET dans le schéma de l'outil.
//
// Droit d'auteur (leg.bc.ca/copyright) : le texte est lu en mémoire, jamais enregistré. Seul notre
// résumé est gardé, dans data/resumes.json ({ resumes: { <billId>: { en, fr, source, faitLe,
// tronque, modele } } }), que bills.js relit à chaque passage.
//
// CACHE : un projet déjà résumé à partir de la même adresse de texte n'est jamais repayé.
//
// Usage :
//   node scrapers/bill-summaries.js              résume ce qui manque (exige ANTHROPIC_API_KEY)
//   node scrapers/bill-summaries.js --estimation lit les textes, compte, estime le coût (gratuit)
//   SCRAPE_LIMIT=3 node scrapers/bill-summaries.js
// Sans clé, le script le dit et sort à 0 : refresh.js continue.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BILLS = 'data/bills.json';
const SORTIE = 'data/resumes.json';
// Haiku : le moins cher qui fait bien ce travail (résumer un texte court en puces factuelles).
const MODELE = 'claude-sonnet-5-5';   // Sonnet plutôt que Haiku : meilleur français, moins d'erreurs (Martin, 13 nov. 2026)
const PRIX = { entree: 2 / 1e6, sortie: 10 / 1e6 };   // $ US par jeton, Sonnet 5.5
const MAX_SIGNES = 60000;
const DELAI = 1500;   // politesse envers api.lims.leg.bc.ca, comme bc-commun.js
const USER_AGENT = 'dossierbc-resumes/1.0 (projet citoyen independant; +https://dossierbc.ca)';
const ESTIMATION = process.argv.includes('--estimation');

const CONSIGNE = `You summarise bills of the Legislative Assembly of British Columbia for an independent, non-partisan citizen website. Readers are in a hurry or find long text hard to read.

You return the SAME summary twice through the tool: once in English (field "en"), once in Québec French (field "fr"). Both are written from the official English text.

Content rules (both languages):
- Only what the text actually says. Never invent, never assume, never add a qualifier absent from the text.
- Neutral: no opinion, no judgement.
- No procedure: not who introduced it, when, or at what stage it is.
- Say WHO is affected and WHAT CHANGES for them first, then the numbers (amounts, fines, deadlines).
- 3 to 8 bullets, one idea each, about 20 words at most, everyday words. No intro, no conclusion.
- Fines: one bullet naming each person targeted with the amount.
- A short amending bill may get only 2 or 3 bullets. If the text is procedural, too short or too technical to summarise honestly, set sansContenu to true and return empty lists.

French rules (field "fr"):
- Québec French, clear and simple. Keep Act names in English (« la Police Act, qui encadre les services de police »), and say in a few words what they do the first time.
- Never put a comma before « et ».
- « regulation » → « une règle du gouvernement, sans nouveau vote à l'Assemblée » ; « repeal » → « supprime » ; « Lieutenant Governor in Council » → « le Conseil des ministres ».`;

const OUTIL = {
  name: 'resume',
  description: 'Returns the plain-language summary of the bill: English bullets in "en", Québec French bullets in "fr". / Rend le résumé : puces anglaises dans « en », puces en français du Québec dans « fr ».',
  input_schema: {
    type: 'object',
    properties: {
      // Pas de maxItems : en mode strict l'API le refuse (« For 'array' type, property
      // 'maxItems' is not supported », 13 nov. 2026). La limite vit dans la consigne.
      en: { type: 'array', items: { type: 'string' }, description: 'The bullets, written IN ENGLISH. 8 at most. No leading dash.' },
      fr: { type: 'array', items: { type: 'string' }, description: 'Les mêmes puces, rédigées EN FRANÇAIS du Québec. 8 au maximum. Sans tiret au début. Jamais de virgule devant « et ».' },
      sansContenu: { type: 'boolean', description: 'true if the text cannot be summarised honestly / vrai si le texte ne se résume pas honnêtement.' },
    },
    required: ['en', 'fr', 'sansContenu'],
    additionalProperties: false,
  },
  // strict : l'API garantit que l'entrée de l'outil respecte le schéma. Remplace le
  // tool_choice forcé, que claude-sonnet-5-5 refuse (400) — voir l'appel plus bas.
  strict: true,
};

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const decoder = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’');

// Trois tentatives, espacées : le 13 nov. 2026, M 218 et M 205 ont été perdus sur un
// « fetch failed » — deux hoquets réseau sur 102 lectures, les mêmes adresses répondant
// 200 la minute d'après. Une lecture ratée n'avait aucune seconde chance et le projet
// sautait pour toute la semaine. Un échec de lecture arrive AVANT l'appel payant :
// réessayer ne coûte rien. Un 404 ou un 403, eux, ne s'arrangeront pas en réessayant.
async function lireTexte(url) {
  let r;
  for (let essai = 1; ; essai++) {
    try {
      r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      break;
    } catch (e) {
      if (essai >= 3) throw e;
      console.error(`    (lecture ratée, essai ${essai}/3 : ${e.message}) — on réessaie`);
      await attendre(DELAI * essai * 2);
    }
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  if (!/<html/i.test(html)) throw new Error('réponse inattendue (pas une page de projet de loi)');
  // Le texte seul : sans l'en-tête (avertissement), la table des matières ni les scripts.
  const corps = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<div id="contents">[\s\S]*?<\/table>/i, '')
    .replace(/<div id="header">[\s\S]*?<\/div>/i, '');
  return decoder(corps.replace(/<(br|p|div|tr|h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

const sansVirguleEt = (s) => s.replace(/,\s+et\b/g, ' et');
const puces = (liste) => liste.map((p) => String(p).trim().replace(/^[-•]\s*/, '')).filter(Boolean).map((p) => `- ${p}`).join('\n');

async function main() {
  const data = JSON.parse(readFileSync(BILLS, 'utf-8'));
  const cache = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf-8')) : { resumes: {} };
  cache.resumes ??= {};
  const aFaire = data.bills.filter((b) => b.texteApi && cache.resumes[b.billId]?.source !== b.texteApi);
  const limite = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : aFaire.length;
  console.log(`${aFaire.length} projet(s) sans résumé à jour (sur ${data.bills.length}).`);
  if (!aFaire.length) return;

  if (!ESTIMATION && !process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY absente : aucun résumé fait (lancer le workflow GitHub, qui a le secret).');
    return;
  }
  const client = ESTIMATION ? null : new (await import('@anthropic-ai/sdk')).default();

  let fait = 0, vides = 0, erreurs = 0, jetonsE = 0, jetonsS = 0, signes = 0;
  // Coupe-circuit : si les 3 premiers échouent sans qu'aucun n'ait réussi, la requête
  // elle-même est en cause (schéma refusé, clé rejetée). Inutile de la répéter 99 fois :
  // on arrête et l'erreur reste lisible en haut du journal. (13 nov. 2026)
  let echecsDAffilee = 0;
  for (const b of aFaire.slice(0, limite)) {
    try {
      const brut = await lireTexte(b.texteApi);
      const tronque = brut.length > MAX_SIGNES;
      const texte = brut.slice(0, MAX_SIGNES);
      signes += texte.length;
      if (ESTIMATION) { console.log(`  ${b.numAffiche} (${b.introSession}e session) : ${texte.length} signes`); await attendre(DELAI); continue; }
      const rep = await client.messages.create({
        model: MODELE,
        // 8000 et non 2000 : claude-sonnet-5-5 réfléchit avant de répondre, et cette
        // réflexion compte dans max_tokens. À 2000, le budget pouvait être épuisé avant
        // le résumé. L'effort « low » suffit pour résumer un texte en puces.
        max_tokens: 8000,
        output_config: { effort: 'low' },
        system: CONSIGNE,
        tools: [OUTIL],
        // auto, PAS { type: 'tool' } : claude-sonnet-5-5 rejette le tool_choice forcé
        // (400 « tool_choice: type "tool" and "any" are not supported for this model »,
        // 13 nov. 2026 — 102 projets de loi perdus). L'outil est nommé dans le message.
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: `Bill ${b.numAffiche}: ${b.title}\n${tronque ? `[Text cut at the first ${MAX_SIGNES} characters: the bill is longer.]\n` : ''}\n<official_text>\n${texte}\n</official_text>\n\nEnd of the official text. Now call the tool: English bullets in "en", Québec French bullets in "fr".` }],
      });
      jetonsE += rep.usage.input_tokens; jetonsS += rep.usage.output_tokens;
      const bloc = rep.content.find((c) => c.type === 'tool_use')?.input;
      if (!bloc) throw new Error('aucune sortie d’outil');
      const vide = bloc.sansContenu || !bloc.en?.length || !bloc.fr?.length;
      if (vide) vides++; else fait++;
      echecsDAffilee = 0;
      cache.resumes[b.billId] = {
        en: vide ? null : puces(bloc.en),
        fr: vide ? null : sansVirguleEt(puces(bloc.fr)),
        source: b.texteApi,
        faitLe: new Date().toISOString(),
        tronque,
        modele: MODELE,
      };
      writeFileSync(SORTIE, JSON.stringify(cache, null, 2));
      console.log(`  ✓ ${b.numAffiche} (${b.introSession}e session)${vide ? ' : sans contenu' : ''}`);
    } catch (e) {
      erreurs++;
      console.error(`  ⚠ ${b.numAffiche} (billId ${b.billId}) : ${e.message}`);
      if (!fait && !vides && ++echecsDAffilee >= 3) {
        console.error('  ✖ 3 échecs d’affilée sans un seul succès : la requête elle-même est en cause. On arrête ici.');
        break;
      }
    }
    await attendre(DELAI);
  }

  if (ESTIMATION) {
    // La prose juridique fait environ 3 signes par jeton (leçon de l'Ontario : 4 sous-estimait).
    const e = signes / 3 + 1200 * Math.min(limite, aFaire.length), s = 450 * Math.min(limite, aFaire.length);
    console.log(`Estimation : ~${Math.round(e)} jetons lus, ~${s} écrits → ~${(e * PRIX.entree + s * PRIX.sortie).toFixed(2)} $ US (${MODELE}).`);
    return;
  }
  // Recopie dans data/bills.json, pour un build immédiat sans relancer bills.js.
  for (const b of data.bills) {
    const r = cache.resumes[b.billId];
    if (!r) continue;
    Object.assign(b, { summary: r.fr, summaryEn: r.en, summaryAiGenerated: true, summarySource: r.source, summaryGeneratedAt: r.faitLe, summaryTronque: r.tronque });
  }
  writeFileSync(BILLS, JSON.stringify(data, null, 2));
  console.log(`Terminé : ${fait} résumés, ${vides} sans contenu, ${erreurs} erreur(s). Coût réel : ${(jetonsE * PRIX.entree + jetonsS * PRIX.sortie).toFixed(3)} $ US (${jetonsE} jetons lus, ${jetonsS} écrits, ${MODELE}).`);
}

main().catch((e) => { console.error('bill-summaries.js :', e); process.exitCode = 1; });
