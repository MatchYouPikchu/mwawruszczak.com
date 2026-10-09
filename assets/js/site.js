// Small behaviours that do not need the map: top bar, menu, route dots, sound buttons.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (new URLSearchParams(location.search).has('og')) root.classList.add('og');

  // top bar turns solid once the page moves
  const bar = document.getElementById('bar');
  const onScroll = () => bar.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  requestAnimationFrame(onScroll);

  // menu for small screens
  const menuBtn = document.getElementById('menu-btn');
  const sheet = document.getElementById('menu-sheet');
  if (menuBtn && sheet) {
    const setMenu = open => {
      menuBtn.setAttribute('aria-expanded', String(open));
      sheet.hidden = !open;
      menuBtn.textContent = open ? 'Close' : 'Menu';
    };
    menuBtn.addEventListener('click', () => setMenu(sheet.hidden));
    sheet.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { setMenu(false); menuBtn.focus(); } });
    matchMedia('(min-width: 1081px)').addEventListener('change', e => { if (e.matches) setMenu(false); });
  }

  // route dots: centre the chosen stop
  document.querySelectorAll('.route a').forEach(a => a.addEventListener('click', e => {
    const stop = document.querySelector(`.stop[data-stop="${a.dataset.go}"]`);
    if (!stop) return;
    e.preventDefault();
    const r = stop.getBoundingClientRect();
    const y = a.dataset.go === '0' ? 0 : scrollY + r.top + r.height / 2 - innerHeight / 2;
    scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', a.getAttribute('href'));
  }));

  // nav: mark the section in view
  const navLinks = [...document.querySelectorAll('.bar nav a[href^="#"]')];
  const targets = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && targets.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const id = '#' + en.target.id;
        navLinks.forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === id)));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach(t => io.observe(t));
  }

  // sound: loaded only when someone asks for it
  const barBtn = document.getElementById('sound');
  const studioBtn = document.getElementById('play-sound');
  const buttons = [barBtn, studioBtn].filter(Boolean);
  let api = null, on = false, loading = false;
  const reflect = () => {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(on)));
    const barLab = barBtn && barBtn.querySelector('.sound-label');
    if (barLab) barLab.textContent = on ? 'Sound on' : 'Sound off';
    const studioLab = studioBtn && studioBtn.querySelector('.sound-label');
    if (studioLab) studioLab.textContent = on ? 'Stop the sound' : 'Play the sound of the map';
  };
  buttons.forEach(b => b.addEventListener('click', async () => {
    if (loading) return;
    if (!api) {
      loading = true;
      try { api = await import('/assets/js/sound.js'); } catch (e) { loading = false; return; }
      loading = false;
    }
    on = !on;
    on ? api.start() : api.stop();
    reflect();
  }));
})();
