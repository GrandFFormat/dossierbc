// La langue du volet Vancouver : l'anglais par défaut, le français en option (Martin, 15 nov. 2026).
//
// Le pendant de /commun/langue.js de DossierQuébec, à l'envers : là-bas le français est la langue de
// départ et data-en="…" porte l'anglais ; ici, comme sur tout DossierBC (commun/dq.js, langueDeDepart),
// les pages sont écrites en anglais et data-fr="…" porte le français. Même clé que le reste du site
// (localStorage dvq:langue) : un choix fait sur dossierbc.ca suit le visiteur dans Vancouver, et
// « ?lang=fr » ou « ?lang=en » dans une adresse l'impose.
//
// Trois façons de traduire :
//   - le HTML : data-fr="…" remplace le contenu d'un élément ; data-fr-placeholder, data-fr-title,
//     data-fr-aria-label, data-fr-content, data-fr-href pour les attributs ;
//   - le JavaScript : tr('français', 'English') rend l'un ou l'autre ;
//   - les données : data/lexique-fr.json pour le lexique, libelles-en.js pour les libellés.
// Ce que la Ville écrit (ligne d'ordre du jour, nom des membres, type de séance) reste en anglais :
// c'est le texte du registre, et on ne le traduit pas.

const CLE = 'dvq:langue';

function lireLangue() {
  try {
    const demandee = new URLSearchParams(location.search).get('lang');
    if (demandee === 'en' || demandee === 'fr') {
      localStorage.setItem(CLE, demandee);
      return demandee;
    }
    return localStorage.getItem(CLE) === 'fr' ? 'fr' : 'en';
  } catch {
    return new URLSearchParams(location.search).get('lang') === 'fr' ? 'fr' : 'en';
  }
}

export const LANGUE = lireLangue();
export const PAGE_BILINGUE = true;
export const EN = LANGUE === 'en';
export const tr = (fr, en) => (EN ? en : fr);

// Le HTML de la page, une fois. Idempotent : un élément déjà traduit est marqué.
export function traduirePage(racine = document) {
  if (EN) return;
  document.documentElement.lang = 'fr';
  for (const el of racine.querySelectorAll('[data-fr]:not([data-fr-fait])')) {
    el.innerHTML = el.dataset.fr;
    el.setAttribute('data-fr-fait', '');
  }
  const ATTRIBUTS = { 'data-fr-placeholder': 'placeholder', 'data-fr-title': 'title', 'data-fr-aria-label': 'aria-label', 'data-fr-content': 'content', 'data-fr-href': 'href' };
  for (const [source, cible] of Object.entries(ATTRIBUTS)) {
    for (const el of racine.querySelectorAll(`[${source}]`)) el.setAttribute(cible, el.getAttribute(source));
  }
}

// La pastille FR / EN, au bout des outils de l'en-tête. Un clic garde le choix et recharge la page
// dans l'autre langue : toutes les parties dynamiques se redessinent d'elles-mêmes.
export function pastilleLangue() {
  const a = document.createElement('a');
  const vers = EN ? 'fr' : 'en';
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  a.href = url.pathname + url.search + url.hash;
  a.className = 'ab-langue';
  a.textContent = vers.toUpperCase();
  a.lang = vers;
  a.hreflang = vers;
  a.title = EN ? 'Afficher en français' : 'View in English';
  a.setAttribute('aria-label', a.title);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    try { localStorage.setItem(CLE, vers); } catch {}
    location.assign(a.href);
  });
  return a;
}

// Au chargement de chaque page (ce module est importé par toutes, directement ou par app.js).
if (typeof document !== 'undefined' && !document.documentElement.dataset.langueFaite) {
  document.documentElement.dataset.langueFaite = '1';
  traduirePage();
  const outils = document.querySelector('header nav .outils');
  if (outils && !outils.querySelector('.ab-langue')) outils.append(pastilleLangue());
  // L'en-tête cache la page le temps de la traduire (script en ligne du <head>) : on la montre.
  document.documentElement.classList.add('dvq-pret');
}

// L'en-tête comme celui de Montréal (Martin, 15 nov. 2026) : la pastille de DossierBC à côté du
// logo (lien vers le site provincial), qui se retourne de côté au chargement puis toutes les 20 s,
// et le menu « Town: Vancouver » à droite. Une seule ville pour l'instant en C.-B.
function enteteVancouver() {
  const ligne = document.querySelector('.titre-ligne');
  if (!ligne || ligne.querySelector('#villes')) return;
  const d = document.createElement('details');
  d.className = 'ab-villes';
  d.id = 'villes';
  d.innerHTML = `<summary><span class="ab-villes-libelle">${tr('Ville : ', 'Town: ')}</span>Vancouver</summary>
    <ul class="ab-villes-menu">
      <li><a href="/vancouver/" aria-current="true">Vancouver</a></li>
      <li class="ab-villes-rtv"><a href="/represente-ta-ville${EN ? '' : '?lang=fr'}">${tr('+ Représentez votre ville', '+ Represent your city')}</a></li>
      <li class="ab-villes-dq"><a href="/">DossierBC <span>(${tr('provincial', 'B.C. province')})</span></a></li>
    </ul>`;
  ligne.append(d);
  // Toute la barre d'outils (taille du texte, thème, langue) passe juste à gauche du bouton de la
  // ville, en haut à droite (Martin, 15 nov. 2026).
  const outils = document.querySelector('header nav .outils');
  if (outils) d.before(outils);
  document.addEventListener('click', (e) => { if (d.open && !d.contains(e.target)) d.open = false; });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.open) { d.open = false; d.querySelector('summary').focus(); } });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const retourner = () => { for (const f of document.querySelectorAll('.titre-ligne .lien-dq')) f.classList.toggle('retournee'); };
    setTimeout(retourner, 400);
    setInterval(retourner, 20000);
  }
}
if (typeof document !== 'undefined') enteteVancouver();
