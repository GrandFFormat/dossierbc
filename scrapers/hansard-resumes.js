// Résumés des séances de la Chambre (Hansard), en anglais ET en français (Martin, 15 nov. 2026 :
// « on a les grandes lignes, mais pas les débats, les players et le résumé »).
//
// Source : la liste des transcriptions de la session (api.lims.leg.bc.ca/hdms/debates/<43rd2nd>),
// puis chaque transcription FINALE (« -nNNN.html », publiée) lue sur hdms/file/. Jamais les
// « Blues » : ce sont des brouillons, et leur avis dit que les attribuer publiquement « could
// entail legal liability ».
//
// Pour chaque séance, un appel au modèle rend : les puces du résumé (EN + FR), les « players »
// (qui a parlé, avec le rôle ou la circonscription que donne la transcription) et les numéros des
// projets de loi débattus, avec leur étape — de quoi relier plus tard chaque débat à la page de
// son projet. Ce qui est dit est rapporté sans qualificatif : aucun jugement sur une personne.
//
// Droit d'auteur (leg.bc.ca/copyright) : la transcription est lue en mémoire, jamais enregistrée.
// Seul notre résumé est gardé, dans data/hansard-resumes.json, clé = nom du fichier final.
//
// LIMITE PAR PASSAGE : HANSARD_LIMIT, 3 par défaut. Martin a demandé d'en voir 3 avant de lancer
// tout l'historique (15 nov. 2026) ; les plus récentes passent en premier. Pour l'historique
// complet, lancer le workflow avec HANSARD_LIMIT=100, puis remonter le défaut quand la Chambre
// siège (une à deux séances par jour).
//
// Sans ANTHROPIC_API_KEY, le script le dit et sort à 0 : refresh.js continue.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lire, lireJson, legislatures, cleSession, API, HOTE } from './bc-commun.js';

const SORTIE = 'data/hansard-resumes.json';
const MODELE = 'claude-sonnet-5-5';
const PRIX = { entree: 2 / 1e6, sortie: 10 / 1e6 };
const MAX_SIGNES = 600000;   // une longue séance (27 mai 2026) dépasse 320 000 signes
const LIMITE = Number(process.env.HANSARD_LIMIT || 6);
// Martin, 15 nov. 2026 : pas d'historique. Seules les séances tenues à partir de cette date sont
// résumées (les 3 du 27-28 mai 2026, faites pour l'aperçu, restent). Réévaluation le 15 févr. 2027 :
// combien d'ouvertures du « + » par mois (dq_mesures, cible « bc-hansard-plus ») pour ~15 $/mois.
const DEPUIS = process.env.HANSARD_DEPUIS || '2026-11-15';
const ESTIMATION = process.argv.includes('--estimation');

const CONSIGNE = `You summarise one sitting of the Legislative Assembly of British Columbia from its official, final Hansard transcript, for an independent, non-partisan citizen website. Readers are in a hurry.

Return through the tool:
- "en" and "fr": the SAME summary, English and Québec French, 4 to 7 bullets. Each bullet: one idea, about 30 words at most, everyday words. Cover what the House actually did: bills debated and at which stage (second reading, Committee of the Whole, third reading…), estimates studied (which ministry), main questions asked in Question Period, motions, votes and their result. For a bill debate, say what the government presented and what the opposition asked or proposed, as the transcript shows it.
- "joueurs": the people who took a significant part, at most 12. "nom" exactly as the transcript names them, "role" as the transcript gives it (minister's title, or riding), "sujet" in a few English words, "sujetFr" the same in French.
- "projets": each bill debated: "numero" (the bill number only, e.g. "22" or "M 217"), "etape" ("second reading", "committee", "report", "third reading", "first reading", "other").

Rules:
- Only what the transcript says. Never invent, never assume. Neutral: report what each person said or asked, never judge, never characterise a person or a party ("attacked", "failed", "dodged" are forbidden).
- No quotes longer than a few words.
- French: Québec French, simple. Keep Act names in English. Never put a comma before « et ». « Committee of the Whole » → « l'étude détaillée en comité plénier » ; « estimates » → « l'étude des crédits ».
- If the transcript is purely ceremonial or too short to summarise honestly, set sansContenu to true and return empty lists.`;

const OUTIL = {
  name: 'seance',
  description: 'Returns the summary of the sitting (en, fr), the people who took part (joueurs) and the bills debated (projets).',
  input_schema: {
    type: 'object',
    properties: {
      en: { type: 'array', items: { type: 'string' }, description: 'Bullets IN ENGLISH, 7 at most, no leading dash.' },
      fr: { type: 'array', items: { type: 'string' }, description: 'Les mêmes puces EN FRANÇAIS du Québec, 7 au maximum. Jamais de virgule devant « et ».' },
      joueurs: {
        type: 'array',
        items: {
          type: 'object',
          properties: { nom: { type: 'string' }, role: { type: 'string' }, sujet: { type: 'string' }, sujetFr: { type: 'string' } },
          required: ['nom', 'role', 'sujet', 'sujetFr'], additionalProperties: false,
        },
        description: '12 at most.',
      },
      projets: {
        type: 'array',
        items: {
          type: 'object',
          properties: { numero: { type: 'string' }, etape: { type: 'string', enum: ['first reading', 'second reading', 'committee', 'report', 'third reading', 'other'] } },
          required: ['numero', 'etape'], additionalProperties: false,
        },
      },
      sansContenu: { type: 'boolean' },
    },
    required: ['en', 'fr', 'joueurs', 'projets', 'sansContenu'],
    additionalProperties: false,
  },
  strict: true,
};

const decoder = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’');
const texteDe = (html) => decoder(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<(br|p|div|tr|h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const nettoyer = (l) => (l ?? []).map((p) => String(p).trim().replace(/^[-•]\s*/, '')).filter(Boolean);
const sansVirguleEt = (s) => s.replace(/,\s+et\b/g, ' et');

async function main() {
  const { avecDonnees: leg } = await legislatures();
  const ses = leg.sessions[0];   // la plus récente (orderBy NUMBER_DESC)
  const cle = cleSession(leg.numero, ses.numero);
  const liste = (await lireJson(`hdms/debates/${cle}`)).allHansardFileAttributes?.nodes ?? [];
  const finales = liste
    .filter((n) => n.published && /-n\d+\.html?$/i.test(n.fileName) && !/blues/i.test(n.fileName))
    .map((n) => {
      const a = n.debateAttributes?.nodes?.[0] ?? {};
      return {
        fichier: n.fileName,
        titre: n.title?.replace(/\s+/g, ' ').trim() ?? n.fileName,
        debut: a.date ?? null,
        type: a.debateType?.name ?? 'House',
        lire: `${API}/hdms/file${n.filePath}/${n.fileName}`,
        lien: `${HOTE}/hansard-content${n.filePath}/${n.fileName}`,
      };
    })
    .filter((f) => f.debut)
    .sort((a, b) => b.debut.localeCompare(a.debut));

  const cache = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf-8')) : { seances: {} };
  cache.seances ??= {};
  const aFaire = finales.filter((f) => !cache.seances[f.fichier] && f.debut.slice(0, 10) >= DEPUIS).slice(0, LIMITE);
  console.log(`${finales.length} transcription(s) finale(s) en ${cle} ; ${aFaire.length} à résumer ce passage (limite ${LIMITE}).`);
  if (!aFaire.length) return;
  if (!ESTIMATION && !process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY absente : aucun résumé fait (le workflow GitHub a le secret).');
    return;
  }
  const client = ESTIMATION ? null : new (await import('@anthropic-ai/sdk')).default();
  let fait = 0, erreurs = 0, echecs = 0, jE = 0, jS = 0, signes = 0;
  for (const f of aFaire) {
    try {
      const brut = texteDe(await lire(f.lire));
      const tronque = brut.length > MAX_SIGNES;
      const texte = brut.slice(0, MAX_SIGNES);
      signes += texte.length;
      if (ESTIMATION) { console.log(`  ${f.fichier} : ${texte.length} signes`); continue; }
      const rep = await client.messages.create({
        model: MODELE,
        max_tokens: 12000,                   // la réflexion compte dans max_tokens
        output_config: { effort: 'low' },
        system: CONSIGNE,
        tools: [OUTIL],
        tool_choice: { type: 'auto' },       // le tool_choice forcé est refusé par ce modèle
        messages: [{ role: 'user', content: `${f.titre}\n${tronque ? `[Transcript cut at ${MAX_SIGNES} characters.]\n` : ''}\n<official_transcript>\n${texte}\n</official_transcript>\n\nNow call the tool "seance".` }],
      });
      jE += rep.usage.input_tokens; jS += rep.usage.output_tokens;
      const b = rep.content.find((c) => c.type === 'tool_use')?.input;
      if (!b) throw new Error('aucune sortie d’outil');
      const vide = b.sansContenu || !b.en?.length || !b.fr?.length;
      cache.seances[f.fichier] = {
        titre: f.titre, debut: f.debut, type: f.type, lien: f.lien,
        en: vide ? null : nettoyer(b.en), fr: vide ? null : nettoyer(b.fr).map(sansVirguleEt),
        joueurs: vide ? [] : (b.joueurs ?? []).slice(0, 12),
        projets: vide ? [] : (b.projets ?? []),
        faitLe: new Date().toISOString(), tronque, modele: MODELE,
      };
      writeFileSync(SORTIE, JSON.stringify(cache, null, 2) + '\n');
      fait++; echecs = 0;
      console.log(`  ✓ ${f.fichier}${vide ? ' : sans contenu' : ''}`);
    } catch (e) {
      erreurs++;
      console.error(`  ⚠ ${f.fichier} : ${e.message}`);
      if (!fait && ++echecs >= 3) { console.error('  ✖ 3 échecs d’affilée : on arrête.'); break; }
    }
  }
  if (ESTIMATION) {
    const e = signes / 4 + 1500 * aFaire.length, s = 1500 * aFaire.length;
    console.log(`Estimation : ~${(e * PRIX.entree + s * PRIX.sortie).toFixed(2)} $ US pour ${aFaire.length} séance(s) (${MODELE}).`);
    return;
  }
  console.log(`Terminé : ${fait} résumé(s), ${erreurs} erreur(s). Coût : ${(jE * PRIX.entree + jS * PRIX.sortie).toFixed(3)} $ US.`);
}

main().catch((e) => { console.error('hansard-resumes.js :', e); process.exitCode = 1; });
