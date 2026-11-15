// Section paused, like Laval and Longueuil on DossierQuébec (commun/navigation.js, avisPause, 11 Nov. 2026).
// Martin, 15 Nov. 2026: Vancouver goes online already inactive — "c'est juste pour montrer".
// The banner tops every page: without it, frozen data would read as today's data. It offers the
// family's reactivation: $150 once (catching up on the last two months plus the current month), then
// $50 a month. Same GoHighLevel link as Laval ("Réactivation d'une ville"), which redirects to the
// after-sale form where the city is chosen.
// English by default, French when chosen — the same reading as assets/langue.js (this file is a
// classic script, so it reads the choice itself instead of importing it).
(function avisPause() {
  if (document.getElementById('avis-pause')) return;
  const REACTIVER = 'https://promo.dafrsolution.com/payment-link/6af4eaec906a8b62055d5b71';
  const PAUSE = { nom: 'Vancouver', depuis: '2026-11-15' };
  let fr = false;
  try {
    const l = new URLSearchParams(location.search).get('lang') || localStorage.getItem('dvq:langue');
    fr = l === 'fr';
  } catch (e) {}
  const jour = new Date(PAUSE.depuis + 'T12:00:00').toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  const bouton = 'display:inline-block;margin-top:8px;padding:5px 12px;border:2px solid #131313;color:#131313;font-weight:700;text-decoration:none';
  const avis = document.createElement('div');
  avis.id = 'avis-pause';
  avis.setAttribute('role', 'note');
  avis.style.cssText = 'background:#FFD24D;color:#131313;border-bottom:3px solid #131313;padding:12px 18px;font-size:15px;line-height:1.5;text-align:center;';
  avis.innerHTML = fr
    ? `<strong>Ce volet est présentement désactivé.</strong> Les données de ${PAUSE.nom} ne sont plus mises à jour depuis le ${jour} : ce que vous lisez date de ce jour-là ou d’avant.<br>Pour un particulier, le réactiver coûte <strong>150 $</strong> : le rattrapage des deux derniers mois et le mois en cours. Ensuite, <strong>50 $ par mois</strong>, avec votre nom ou anonymement. <a href="/" style="color:#131313;font-weight:700">Retour à DossierBC</a><br><a class="bouton-reactiver" href="${REACTIVER}" rel="noopener" style="${bouton}">Réactiver pour 150&nbsp;$ →</a>`
    : `<strong>This section is currently inactive.</strong> ${PAUSE.nom} data has not been updated since ${jour}: what you are reading dates from that day or earlier.<br>For an individual, reactivating it costs <strong>$150</strong>: catching up on the last two months plus the current month. Then <strong>$50 a month</strong>, with your name or anonymously. <a href="/" style="color:#131313;font-weight:700">Back to DossierBC</a><br><a class="bouton-reactiver" href="${REACTIVER}" rel="noopener" style="${bouton}">Reactivate for $150 →</a>`;
  document.body.prepend(avis);
  // A paused section takes no email sign-up.
  document.getElementById('infolettre')?.remove();
})();
