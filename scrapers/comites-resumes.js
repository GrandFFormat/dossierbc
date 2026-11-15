// Résumés en langage clair des séances de comités (Martin, 15 nov. 2026 : « au Québec, on comprend
// quand même mieux »). Même mécanique que bill-summaries.js : un appel au modèle par séance, sortie
// par un outil à schéma strict, anglais ET français écrits à partir du texte anglais.
//
// Source : la transcription FINALE de la séance (Hansard, « -nN.html »), posée par comites.js dans
// data/comites.json (transcriptionTexte). Jamais les « Blues » : ce sont des brouillons, et leur
// avis dit que leur attribution publique « could entail legal liability ».
//
// Droit d'auteur (leg.bc.ca/copyright) : la transcription est lue en mémoire, jamais enregistrée.
// Seul notre résumé est gardé, dans data/comites-resumes.json ({ resumes: { <idSéance>: { en, fr,
// huisClos, source, faitLe, tronque, modele } } }). comites.js les recolle à chaque passage.
//
// CACHE : une séance déjà résumée à partir de la même transcription n'est jamais repayée.
// Sans ANTHROPIC_API_KEY (ordi de Martin), le script le dit et sort à 0 : refresh.js continue.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lire } from './bc-commun.js';

const SEANCES = 'data/comites.json';
const SORTIE = 'data/comites-resumes.json';
const MODELE = 'claude-sonnet-5-5';   // même modèle que les projets de loi (meilleur français)
const PRIX = { entree: 2 / 1e6, sortie: 10 / 1e6 };
const MAX_SIGNES = 250000;   // les audiences publiques dépassent souvent 120 000 signes
const ESTIMATION = process.argv.includes('--estimation');

const CONSIGNE = `You summarise one sitting of a committee of the Legislative Assembly of British Columbia, from its official Hansard transcript, for an independent, non-partisan citizen website. Readers are in a hurry.

You return the SAME summary twice through the tool: English in "en", Québec French in "fr", both written from the English transcript.

Rules (both languages):
- Only what the transcript says. Never invent, never assume. Neutral: no opinion, no judgement of anyone.
- What was studied, who presented (witness organisations, officials), what was decided (motions adopted or defeated, reports approved), and what comes next if the transcript says so.
- Name an MLA only by role or riding as the transcript does; never characterise a person.
- 3 to 5 bullets, one idea each, about 25 words at most, everyday words. No intro, no conclusion.
- If most of the sitting was held in camera (closed to the public), say so in one bullet and set huisClos to true.
- If the transcript is too short or purely procedural to summarise honestly, set sansContenu to true and return empty lists.

French ("fr"): Québec French, clear and simple. Keep Act and committee names in English the first time, with a few words saying what they are. Never put a comma before « et ». « in camera » → « à huis clos ».`;

const OUTIL = {
  name: 'resume',
  description: 'Returns the plain-language summary of the committee sitting: English bullets in "en", Québec French bullets in "fr".',
  input_schema: {
    type: 'object',
    properties: {
      en: { type: 'array', items: { type: 'string' }, description: 'The bullets, IN ENGLISH. 5 at most. No leading dash.' },
      fr: { type: 'array', items: { type: 'string' }, description: 'Les mêmes puces, EN FRANÇAIS du Québec. 5 au maximum. Sans tiret. Jamais de virgule devant « et ».' },
      huisClos: { type: 'boolean', description: 'true if most of the sitting was in camera.' },
      sansContenu: { type: 'boolean', description: 'true if the transcript cannot be summarised honestly.' },
    },
    required: ['en', 'fr', 'huisClos', 'sansContenu'],
    additionalProperties: false,
  },
  strict: true,
};

const decoder = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’');
const texteDe = (html) => decoder(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<(br|p|div|tr|h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const sansVirguleEt = (s) => s.replace(/,\s+et\b/g, ' et');
const nettoyer = (l) => l.map((p) => String(p).trim().replace(/^[-•]\s*/, '')).filter(Boolean);

async function main() {
  const data = JSON.parse(readFileSync(SEANCES, 'utf-8'));
  const cache = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf-8')) : { resumes: {} };
  cache.resumes ??= {};
  const aFaire = data.seances.filter((m) => m.transcriptionTexte && cache.resumes[m.id]?.source !== m.transcriptionTexte);
  console.log(`${aFaire.length} séance(s) à résumer (sur ${data.seances.length}).`);
  if (!aFaire.length) return;
  if (!ESTIMATION && !process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY absente : aucun résumé fait (le workflow GitHub a le secret).');
    return;
  }
  const client = ESTIMATION ? null : new (await import('@anthropic-ai/sdk')).default();
  let fait = 0, erreurs = 0, jE = 0, jS = 0, signes = 0, echecs = 0;
  for (const m of aFaire) {
    try {
      const brut = texteDe(await lire(m.transcriptionTexte));
      const tronque = brut.length > MAX_SIGNES;
      const texte = brut.slice(0, MAX_SIGNES);
      signes += texte.length;
      if (ESTIMATION) { console.log(`  ${m.id} ${m.comiteCourt} : ${texte.length} signes`); continue; }
      const rep = await client.messages.create({
        model: MODELE,
        max_tokens: 8000,                    // la réflexion compte dans max_tokens (voir bill-summaries.js)
        output_config: { effort: 'low' },
        system: CONSIGNE,
        tools: [OUTIL],
        tool_choice: { type: 'auto' },       // le tool_choice forcé est refusé par ce modèle
        messages: [{ role: 'user', content: `${m.comite} — sitting of ${m.debut.slice(0, 10)}\n${tronque ? `[Transcript cut at ${MAX_SIGNES} characters.]\n` : ''}\n<official_transcript>\n${texte}\n</official_transcript>\n\nNow call the tool.` }],
      });
      jE += rep.usage.input_tokens; jS += rep.usage.output_tokens;
      const b = rep.content.find((c) => c.type === 'tool_use')?.input;
      if (!b) throw new Error('aucune sortie d’outil');
      const vide = b.sansContenu || !b.en?.length || !b.fr?.length;
      cache.resumes[m.id] = {
        en: vide ? null : nettoyer(b.en), fr: vide ? null : nettoyer(b.fr).map(sansVirguleEt),
        huisClos: !!b.huisClos, source: m.transcriptionTexte, faitLe: new Date().toISOString(), tronque, modele: MODELE,
      };
      writeFileSync(SORTIE, JSON.stringify(cache, null, 2) + '\n');
      fait++; echecs = 0;
      console.log(`  ✓ ${m.id} ${m.comiteCourt}${vide ? ' : sans contenu' : ''}`);
    } catch (e) {
      erreurs++;
      console.error(`  ⚠ ${m.id} : ${e.message}`);
      if (!fait && ++echecs >= 3) { console.error('  ✖ 3 échecs d’affilée : on arrête.'); break; }
    }
  }
  if (ESTIMATION) {
    const e = signes / 4 + 1000 * aFaire.length, s = 500 * aFaire.length;
    console.log(`Estimation : ~${(e * PRIX.entree + s * PRIX.sortie).toFixed(2)} $ US (${MODELE}).`);
    return;
  }
  // Recolle tout de suite dans data/comites.json, pour un build sans relancer comites.js.
  for (const m of data.seances) {
    const r = cache.resumes[m.id];
    if (r && r.source === m.transcriptionTexte) Object.assign(m, { resumeEn: r.en, resumeFr: r.fr, huisClos: r.huisClos });
  }
  writeFileSync(SEANCES, JSON.stringify(data, null, 2) + '\n');
  console.log(`Terminé : ${fait} résumé(s), ${erreurs} erreur(s). Coût : ${(jE * PRIX.entree + jS * PRIX.sortie).toFixed(3)} $ US.`);
}

main().catch((e) => { console.error('comites-resumes.js :', e); process.exitCode = 1; });
