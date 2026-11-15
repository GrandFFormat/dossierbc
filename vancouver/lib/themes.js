// Classement thématique des points votés — « ça parle de quoi ».
//
// Même méthode qu'à Québec et à Montréal (lib/themes.js des volets), réécrite pour ce que
// Vancouver publie : non pas l'objet d'une résolution, mais la LIGNE D'ORDRE DU JOUR du point
// mis aux voix (« 12. CD-1 Rezoning: 5229-5249 Ash Street », « 6. Arts, Culture and Community
// Services Sublease, Lease and Licence Agreements and Grant Approvals »). Quarante-huit signes
// en moyenne : un titre, pas un texte. Le classement est donc plus grossier qu'à Montréal, et
// on le dit sur la page Sources.
//
//   1. La description, par règles de mots-clés, les sujets avant les véhicules (contrats,
//      finances) — voir l'avertissement plus bas, hérité de Québec.
//   2. Faute de mieux, « Administration », avec `themeSource: 'defaut'`.
//
// LES CLÉS SONT CELLES DE MONTRÉAL (procedure, urbanisme, transport…) : la feuille de style
// des volets colore les pastilles par classe (t-urbanisme, t-contrats…), et garder les mêmes
// clés veut dire zéro ligne de CSS à toucher. Seuls les libellés sont en anglais.
//
// Recompter à chaque changement de règles (le scraper affiche la répartition) et viser
// zéro « defaut » sur la fenêtre.

export const THEMES = {
  procedure: { libelle: 'Procedure', couleur: '#8b8577' },
  urbanisme: { libelle: 'Zoning and development', couleur: '#8a6b8f' },
  transport: { libelle: 'Transportation', couleur: '#4f7288' },
  immobilier: { libelle: 'City property', couleur: '#7d6a55' },
  subventions: { libelle: 'Grants', couleur: '#2f6b4f' },
  contrats: { libelle: 'Contracts', couleur: '#a3705c' },
  finances: { libelle: 'Budget and taxes', couleur: '#96741a' },
  rh: { libelle: 'Appointments and staff', couleur: '#6f7a52' },
  environnement: { libelle: 'Environment and climate', couleur: '#5f7f6b' },
  culture: { libelle: 'Arts, culture and heritage', couleur: '#9c5f6b' },
  loisirs: { libelle: 'Parks and recreation', couleur: '#4e7f7a' },
  securite: { libelle: 'Public safety', couleur: '#a33a2c' },
  economie: { libelle: 'Business and economy', couleur: '#7a6aa0' },
  travaux: { libelle: 'Streets and infrastructure', couleur: '#6b7280' },
  administration: { libelle: 'Administration', couleur: '#7c7468' },
  honneurs: { libelle: 'Motions and proclamations', couleur: '#9F1239' },
  social: { libelle: 'Housing and social', couleur: '#0D9488' },
};

// L'ordre compte : la première règle qui accroche gagne.
const REGLES = [
  // La procédure pure : approbation des procès-verbaux, de l'ordre du jour, levée de séance.
  ['procedure', /\b(?:adoption|approval) of (?:the )?(?:minutes|agenda)\b|\bminutes of\b|\badjourn|\bprocedure by-?law\b|\bconsent agenda\b|\bextension of (?:the )?meeting\b|\brecess\b|\bin camera\b|\bclosed meeting\b|\breconsideration of\b|\bleave of absence\b/i],
  // Les sujets.
  ['social', /\bhousing\b|\bhomeless|\bshelter\b|\bsupportive\b|\brental\b|\btenant|\bchild ?care\b|\bseniors?\b|\baccessib|\bindigenous\b|\breconciliation\b|\bequity\b|\bpoverty\b|\bfood security\b|\bsocial\b|\bnon-?profit\b|\bsro\b|\bsingle room\b|\bmental health\b|\boverdose\b|\bdrug (?:policy|user)|\bsafe supply\b|\bdecriminali/i],
  ['urbanisme', /\brezon|\bcd-?1\b|\btext amendment\b|\bzoning\b|\bdevelopment (?:permit|application|cost)|\bheritage (?:designation|revitalization|alteration)\b|\bofficial development plan\b|\bodp\b|\bbroadway plan\b|\bvancouver plan\b|\bcambie corridor\b|\barea plan\b|\bcommunity plan\b|\bland use\b|\bsubdivision\b|\bview cone|\bdensity\b|\bfsr\b|\bfloor (?:space|area)\b|\btower\b|\bstorey|\bsite-specific\b|\bdesign guidelines\b|\bpublic hearing\b|\bby-?law (?:no\.? )?\d+.*(?:zoning|rezon)/i],
  ['transport', /\btransit\b|\bskytrain\b|\bbus\b|\bbike\b|\bcycl|\bbicycle\b|\bgreenway\b|\bparking\b|\bspeed limit\b|\btraffic\b|\bpedestrian|\bsidewalk|\bcrosswalk|\btransportation\b|\bmobility\b|\bride-?hail|\btaxi\b|\bscooter|\bev charging\b|\belectric vehicle|\bbridge\b|\bviaduct/i],
  ['immobilier', /\blease\b|\bsublease\b|\blicence agreement|\blicense agreement|\bsale of (?:city|land|property)|\bland sale\b|\bacqui(?:sition|re) of\b|\bproperty (?:acquisition|disposition|endowment)\b|\bpef\b|\bclosure and exchange\b|\broad closure\b|\bclosure of (?:a )?portion|\bstatutory right of way\b|\beasement\b|\bexpropriat|\bcity-owned\b|\bland exchange\b/i],
  ['environnement', /\bclimate\b|\bemission|\bcarbon\b|\bgreen(?:est|ing)?\b|\btrees?\b|\burban forest\b|\bcanopy\b|\bsewer|\bstorm ?water\b|\bwater (?:conservation|quality|utility)\b|\bflood|\bsea level\b|\bwaste\b|\brecycl|\bcompost|\bplastic|\bsingle-?use\b|\bzero waste\b|\benvironment|\bbiodivers|\bpollinat|\bshoreline\b|\brain ?water\b|\bsolid waste\b|\bgarbage\b/i],
  ['honneurs', /\bproclamation|\bproclaim|\bday\b.*\bmotion\b|\bmotion\b.*\b(?:day|week|month)\b|\bcondolence|\btribute\b|\brecogni[sz]ing\b|\bcongratulat|\bcommemorat|\bemancipation day\b|\bremembrance\b|\bpride\b|\bflag raising\b|\bhonou?ring\b|\bin memory\b/i],
  ['culture', /\barts?\b|\bculture\b|\bcultural\b|\bmuseum\b|\bgallery\b|\btheatre\b|\btheater\b|\bmusic\b|\bfestival\b|\bheritage\b|\bpublic art\b|\bmural\b|\blibrary\b|\barchives\b|\bfilm\b|\bcreative\b|\bchinatown\b|\bpunjabi market\b|\bcivic theatres?\b|\bqueen elizabeth theatre\b|\borpheum\b/i],
  ['loisirs', /\bpark(?:s|land)?\b|\brecreation\b|\bcommunity centre\b|\bcommunity center\b|\bpool\b|\brink\b|\barena\b|\bplayground\b|\bsports? field\b|\bgolf\b|\bbeach\b|\bseawall\b|\bstanley park\b|\bpark board\b|\bplayfield\b|\bskate ?park\b|\bdog park\b/i],
  ['securite', /\bpolice\b|\bvpd\b|\bfire (?:rescue|services?|hall|department|chief)\b|\bfirefighter|\bemergency\b|\bpublic safety\b|\bsafety\b|\bcrime\b|\bviolence\b|\bgang\b|\bbylaw enforcement\b|\bby-?law enforcement\b|\bgraffiti\b|\bstreet disorder\b|\bsecurity\b|\bearthquake\b|\bdisaster\b|\bextreme (?:heat|weather)\b|\bsmoke\b|\bfireworks\b|\bnoise\b/i],
  ['economie', /\bbusiness(?:es)?\b|\beconom|\btourism\b|\bfilm industry\b|\bretail\b|\bpatio|\bliquor\b|\bcannabis\b|\bshort-?term rental|\bairbnb\b|\bempty homes tax\b|\bvacancy tax\b|\bbia\b|\bbusiness improvement area\b|\bcommercial\b|\bindustrial\b|\bemployment lands\b|\bport\b|\bnight ?time economy\b|\bpermit (?:processing|approval)s?\b|\bspecial events?\b|\bevent\b|\bmarket\b|\bfood truck|\bstreet vend/i],
  ['travaux', /\bstreet(?:s)?\b|\broad(?:s|way)?\b|\blane\b|\bpaving\b|\binfrastructure\b|\bcapital project\b|\bconstruction\b|\butility\b|\butilities\b|\bwater main\b|\bsewer main\b|\bstreet lighting\b|\bstreetlight|\bsnow\b|\bengineering services\b|\bplaza\b|\bpublic realm\b|\bstreetscape\b|\bcurb\b/i],
  ['rh', /\bappointment(?:s)? (?:to|of)\b|\bappoint(?:ing|ment)\b|\bre-?appoint|\bcity manager\b|\bauditor general\b.*(?:appoint|contract|term)|\bstaff(?:ing)?\b|\bhiring\b|\bcollective agreement\b|\bunion\b|\bcupe\b|\bemployee|\bsalary|\bsalaries\b|\bremuneration\b|\badvisory (?:committee|body|bod(?:y|ies))\b.*\b(?:appoint|member)|\bcouncil liaison|\bboard (?:appointment|member|representative)/i],
  ['subventions', /\bgrants?\b|\bgranting\b|\bfunding (?:allocation|approval|request)s?\b|\bcommunity services grant|\bcultural grant|\bsocial (?:policy )?grant|\bchildcare grant|\bcapital grant|\bcontribution (?:agreement|to)\b|\bsponsorship\b|\brent (?:subsid|supplement)|\bsubsid/i],
  ['administration', /\bpolicy\b|\bstrategy\b|\bstrategic plan\b|\baction plan\b|\bframework\b|\bterms of reference\b|\bcommittee\b|\btask force\b|\bgovernance\b|\bdelegation (?:of authority|by-?law)\b|\breport back\b|\bannual report\b|\breview of\b|\bconsultation\b|\bengagement\b|\bcharter\b|\bvancouver charter\b|\bbylaw\b|\bby-?law\b|\bamendment|\bregulation|\bcode of conduct\b|\bintegrity commissioner\b|\bfoi\b|\bfreedom of information\b|\bdata\b|\bdigital\b|\btechnology\b/i],
  // ⚠ TOUS LES SUJETS AVANT LES VÉHICULES. « Contrats » dit COMMENT la Ville agit, les
  // autres disent SUR QUOI — et c'est le sur quoi qui intéresse le lecteur.
  ['contrats', /\bcontract(?:s)?\b|\baward of\b|\bawarding\b|\brfp\b|\brequest for proposals?\b|\btender|\bprocurement\b|\bpurchase\b|\bsupply (?:of|and)\b|\bservices? agreement\b|\bagreement(?:s)?\b|\bmemorandum of understanding\b|\bmou\b|\bconsultant/i],
  ['finances', /\bbudget\b|\btax(?:es|ation)?\b|\bproperty tax\b|\btax sale\b|\blevy\b|\blevies\b|\bfees?\b|\brates?\b|\bcapital plan\b|\bfinancial\b|\bfinanc|\bborrowing\b|\bdebenture|\bdcl\b|\bdevelopment cost lev|\bcac\b|\bcommunity amenity contribution|\breserve\b|\bexpenditure|\bquarterly (?:report|update)\b|\bcost\b|\bprice\b|\binvestment|\bendowment fund\b|\bmill rate\b|\butility rates?\b|\bcapital expenditure\b|\boperating\b/i],
  // Dernier recours, après tout le reste : un « motion » tout nu, c'est une motion de membre.
  ['honneurs', /\bmember'?s'? motion\b|\bnotice of motion\b|\bmotion\b/i],
  ['urbanisme', /\b\d{3,5}(?:-\d{3,5})? [A-Z][a-z]+ (?:street|avenue|drive|way|road|boulevard|place|crescent)\b|\bst\.?\b|\bave\.?\b/i],
];

export function classer({ objet }) {
  const texte = String(objet ?? '');
  for (const [theme, regle] of REGLES) {
    if (regle.test(texte)) return { theme, themeSource: 'objet' };
  }
  return { theme: 'administration', themeSource: 'defaut' };
}
