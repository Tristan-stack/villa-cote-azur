// Seul script du site (amélioration progressive) : sur la fiche d'une villa, le prix total
// est calculé en direct. Sans JavaScript, le formulaire fonctionne normalement, et le
// serveur revérifie tout à l'envoi.
(() => {
  const form = document.querySelector('[data-booking]');
  if (!form) return;
  const price = Number(form.dataset.price);
  const start = form.elements.start_date;
  const end = form.elements.end_date;
  const total = form.querySelector('[data-total]');
  const euros = new Intl.NumberFormat('fr-FR');
  const nextDay = (iso) => {
    const day = new Date(iso);
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
  };
  const update = () => {
    if (start.value) end.min = nextDay(start.value); // le départ est au plus tôt le lendemain
    const nights = start.value && end.value ? Math.round((Date.parse(end.value) - Date.parse(start.value)) / 864e5) : 0;
    total.textContent =
      nights > 0
        ? `${nights} nuit${nights > 1 ? 's' : ''} × ${euros.format(price)} € = ${euros.format(nights * price)} €`
        : 'Choisissez vos dates';
  };
  start.addEventListener('change', update);
  end.addEventListener('change', update);
  update();
})();
