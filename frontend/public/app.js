// Améliorations progressives (environ 1 Ko) : le site fonctionne entièrement sans JavaScript.
(() => {
  // Apparition des blocs au défilement
  const blocks = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    blocks.forEach((block) => observer.observe(block));
  } else {
    blocks.forEach((block) => block.classList.add('is-visible'));
  }

  // En-tête : fine ombre dès qu'on fait défiler la page
  const header = document.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Fiche villa : prix total calculé en direct (le serveur revérifie tout à l'envoi)
  const form = document.querySelector('[data-booking]');
  if (form) {
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
      if (start.value) end.min = nextDay(start.value);
      const nights = start.value && end.value ? Math.round((Date.parse(end.value) - Date.parse(start.value)) / 864e5) : 0;
      total.textContent =
        nights > 0
          ? `${nights} nuit${nights > 1 ? 's' : ''} × ${euros.format(price)} € = ${euros.format(nights * price)} €`
          : 'Choisissez vos dates';
    };
    start.addEventListener('change', update);
    end.addEventListener('change', update);
    update();
  }
})();
