// Scraper — les séances des comités parlementaires (Martin, 15 nov. 2026 : la fenêtre « Latest
// committee sittings » de l'accueil remplace celle des projets signalés).
//
// Source : l'API de l'Assemblée (api.lims.leg.bc.ca), celle que dessine la page officielle
// « Committee Meetings » (dyn.leg.bc.ca) :
//   - pcms/committees : la liste des comités en cours (permanents, spéciaux, statutaires), chacun
//     rattaché à une session (sessionId) ou à une législature entière (parliamentId) ;
//   - pcms/committees/<abrév>/<43rd>/about[?session=2nd] : ses séances (date, heures, lieu).
//
// Droit d'auteur (bc-commun.js) : on ne garde que des FAITS — le comité, la date, les heures, le
// lieu — et le lien vers sa page officielle. L'ordre du jour (description) est un texte de
// l'Assemblée : il n'est ni copié ni résumé.
//
// Après une élection, les comités cessent d'exister jusqu'à la nouvelle législature : la liste
// garde alors ceux de la dernière session, et leurs séances restent les plus récentes publiées.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { lireJson, legislatures, rang, HOTE, API } from './bc-commun.js';

const OUT_PATH = 'data/comites.json';
const GARDER = 12;   // les 12 séances les plus récentes suffisent à la fenêtre de l'accueil

async function main() {
  const { toutes } = await legislatures();
  const parSession = new Map();
  const parLeg = new Map();
  for (const p of toutes) {
    parLeg.set(p.id, p);
    for (const s of p.sessions) parSession.set(s.id, { leg: p.numero, ses: s.numero });
  }

  const liste = await lireJson('pcms/committees');
  const comites = [];
  for (const [genre, items] of Object.entries(liste)) {
    for (const c of items ?? []) {
      const cc = c.committeeByCommitteeId;
      if (!cc?.abbreviation) continue;
      let leg = null, ses = null;
      if (c.sessionId && parSession.has(c.sessionId)) ({ leg, ses } = parSession.get(c.sessionId));
      else if (c.parliamentId && parLeg.has(c.parliamentId)) leg = parLeg.get(c.parliamentId).numero;
      else if (c.parliamentId) leg = c.parliamentId;   // l'API donne parfois le numéro directement
      if (!leg) { console.warn(`  ${cc.abbreviation} : législature inconnue, ignoré`); continue; }
      comites.push({ genre, abrev: cc.abbreviation, nom: cc.name, leg, ses });
    }
  }
  if (!comites.length) throw new Error('aucun comité lu — format changé ?');

  const seances = [];
  for (const c of comites) {
    const legTxt = `${c.leg}${rang(c.leg)}`;
    const sesTxt = c.ses ? `${c.ses}${rang(c.ses)}` : null;
    const d = await lireJson(`pcms/committees/${c.abrev}/${legTxt}/about${sesTxt ? `?session=${sesTxt}` : ''}`);
    const a = d?.committeePeriodAbout;
    if (!a) throw new Error(`${c.abrev} : committeePeriodAbout absent — format changé ?`);
    const nom = a.allCommittees?.nodes?.[0]?.name || c.nom;
    const court = a.allCommittees?.nodes?.[0]?.shortName || nom;
    const page = `${HOTE}/parliamentary-business/committees/${legTxt}parliament-${sesTxt ? `${sesTxt}session-` : ''}${c.abrev}`;
    // La transcription FINALE (« -n12.html », publiée) de chaque séance. Les « Blues » sont des
    // brouillons : leur avis dit que les attribuer publiquement « could entail legal liability ».
    // On ne les lit jamais ; une séance sans finale n'a donc pas de résumé.
    const finales = new Map();
    for (const t of d.committeeTranscripts ?? []) {
      const id = t.committeeTranscriptAttributeByFileId?.committeeMeetingId;
      if (id && t.published && /-n\d+\.html?$/i.test(t.fileName) && !/blues/i.test(t.fileName)) {
        finales.set(id, { lire: `${API}/hdms/file${t.filePath}/${t.fileName}`, lien: `${HOTE}/hansard-content${t.filePath}/${t.fileName}` });
      }
    }
    for (const m of a.allCommitteeMeetings?.nodes ?? []) {
      if (!m.published || !m.startTime) continue;
      seances.push({
        id: m.id,
        comite: nom,
        comiteCourt: court,
        debut: m.startTime,
        fin: m.endTime ?? null,
        lieu: m.location || m.communityByCommunityId?.name || null,
        page,
        transcription: finales.get(m.id)?.lien ?? null,
        transcriptionTexte: finales.get(m.id)?.lire ?? null,
      });
    }
    console.log(`  ${c.abrev} (${legTxt}${sesTxt ? ' ' + sesTxt : ''}) : ${(a.allCommitteeMeetings?.nodes ?? []).length} séance(s)`);
  }

  seances.sort((x, y) => y.debut.localeCompare(x.debut));
  // Les résumés déjà faits (scrapers/comites-resumes.js), recollés à leur séance s'ils ont été
  // écrits à partir de la même transcription.
  const RES = 'data/comites-resumes.json';
  const cache = existsSync(RES) ? JSON.parse(readFileSync(RES, 'utf-8')).resumes ?? {} : {};
  for (const m of seances) {
    const r = cache[m.id];
    if (r && r.source === m.transcriptionTexte) Object.assign(m, { resumeEn: r.en, resumeFr: r.fr, huisClos: r.huisClos ?? null });
  }
  const out = {
    source: `${HOTE}/parliamentary-business/committees/committee-meetings`,
    lu: new Date().toISOString(),
    comites: comites.length,
    seances: seances.slice(0, GARDER),
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ ${OUT_PATH} : ${out.seances.length} séance(s) sur ${seances.length}, ${comites.length} comités`);
}

main().catch((e) => { console.error(`✗ comites : ${e.message}`); process.exit(1); });
