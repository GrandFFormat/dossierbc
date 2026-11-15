// Les libellés — le pendant de montreal/assets/libelles-en.js, dans l'autre sens.
//
// Montréal écrit en français et traduit vers l'anglais. Vancouver écrit en anglais : libelleEn et
// themeEn rendent le texte tel quel ; libelleFr et themeFr donnent le français quand la page est
// lue en français (Martin, 15 nov. 2026). Seuls les mots d'un vocabulaire fermé se traduisent ici
// (résultats, statuts de vote, sujets) ; la ligne d'ordre du jour, les noms et les types de séance
// restent ceux de la Ville.

export function libelleEn(texte) {
  return texte;
}
export const themeEn = (cle, libelle) => libelle ?? cle;

const LIBELLES_FR = {
  Carried: 'Adoptée',
  'Carried Unanimously': 'Adoptée à l’unanimité',
  Lost: 'Rejetée',
  Motion: 'Motion',
  'In Favour': 'Pour',
  'In Opposition': 'Contre',
  Abstain: 'Abstention',
  Absent: 'Absent',
  'Declared Conflict': 'Conflit déclaré',
  Ineligible: 'Inadmissible',
  'No Vote': 'Aucun vote',
};
export const libelleFr = (texte) => LIBELLES_FR[texte] ?? texte;

// Les sujets : mêmes clés que lib/themes.js (celles de Montréal).
const THEMES_FR = {
  procedure: 'Procédure', urbanisme: 'Zonage et aménagement', transport: 'Transport', immobilier: 'Immeubles de la Ville',
  subventions: 'Subventions', contrats: 'Contrats', finances: 'Budget et taxes', rh: 'Nominations et personnel',
  environnement: 'Environnement et climat', culture: 'Arts, culture et patrimoine', loisirs: 'Parcs et loisirs',
  securite: 'Sécurité publique', economie: 'Commerce et économie', travaux: 'Rues et infrastructures',
  administration: 'Administration', honneurs: 'Motions et proclamations', social: 'Logement et social',
};
export const themeFr = (cle, libelle) => THEMES_FR[cle] ?? libelle ?? cle;

// Les explications des types de séance (data/*.json : « instances »), en français.
export const INSTANCES_FR = {
  Council: 'Le conseil au complet : le maire et les dix conseillers, qui décident pour toute la ville.',
  'Regular Council': 'Une séance ordinaire du conseil au complet.',
  'Special Council': 'Une séance du conseil convoquée hors du calendrier régulier, en général pour une seule question.',
  'Public Hearing': 'Le conseil siège pour entendre le public avant de décider des rezonages et des projets d’aménagement.',
  'Policy & Strategic Priorities': 'Un comité permanent formé de tout le conseil, sur les orientations et les priorités ; ses décisions sont renvoyées au conseil.',
  'City Finance & Services': 'Un comité permanent formé de tout le conseil, sur les finances, les contrats et les services ; ses décisions sont renvoyées au conseil.',
  'Courts of Revision': 'Le conseil siège pour entendre les contestations de redevances d’amélioration locale et de taxes de parcelle.',
  'Auditor General Committee': 'Le comité du conseil qui supervise le vérificateur général de la Ville.',
};
