// ===== Panel Tolloche · Cálculos hidráulicos =====
// Agrega al menú lateral el grupo "Cálculos hidráulicos" con dos pestañas.
// Cada herramienta vive en su propia página (hidraulica/*.html) dentro de un iframe,
// así no comparte estilos ni variables con el resto del panel.
(function () {
  const TABS = [
    { id: 't-hbomba', label: 'Selección de bomba', src: 'hidraulica/bombas.html' },
    { id: 't-hcartas', label: 'Cartas de aspersión', src: 'hidraulica/cartas.html' },
  ];

  function ajustarAltura(fr) {
    try {
      const d = fr.contentDocument; if (!d || !d.documentElement) return;
      fr.style.height = Math.max(600, d.documentElement.scrollHeight) + 'px';
    } catch (e) { /* distinto origen: queda la altura mínima */ }
  }

  function montar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('main.mainarea');
    if (!sidebar || !main || document.getElementById(TABS[0].id)) return;

    const css = document.createElement('style');
    css.textContent = '.hid-frame{display:block;width:100%;min-height:600px;border:0;background:transparent}';
    document.head.appendChild(css);

    const grupo = document.createElement('div');
    grupo.className = 'navgroup';
    grupo.innerHTML = '<div class="navgroup-title">Cálculos hidráulicos</div>' +
      TABS.map(t => `<button class="tab" onclick="showTab('${t.id}',this)">${t.label}</button>`).join('');
    const grupos = sidebar.querySelectorAll('.navgroup');
    const despuesDe = grupos[1] || grupos[grupos.length - 1];          // después de "Equipos"
    despuesDe ? despuesDe.after(grupo) : sidebar.appendChild(grupo);

    TABS.forEach(t => {
      const p = document.createElement('div');
      p.id = t.id; p.className = 'panel';
      p.innerHTML = `<iframe class="hid-frame" title="${t.label}" data-src="${t.src}" loading="lazy"></iframe>`;
      main.appendChild(p);
      const fr = p.querySelector('iframe');
      fr.addEventListener('load', () => {
        ajustarAltura(fr);
        try {
          const ro = new ResizeObserver(() => ajustarAltura(fr));
          ro.observe(fr.contentDocument.documentElement);
        } catch (e) { setInterval(() => ajustarAltura(fr), 1500); }
      });
    });

    // Cargar cada página recién la primera vez que se abre su pestaña
    const showOriginal = window.showTab;
    window.showTab = function (id, btn) {
      showOriginal(id, btn);
      const t = TABS.find(x => x.id === id);
      if (t) {
        const fr = document.querySelector(`#${id} iframe`);
        if (fr && !fr.src) fr.src = fr.dataset.src; else if (fr) ajustarAltura(fr);
      }
    };

    // Si la última pestaña usada era una de estas, volver a abrirla
    try {
      const last = localStorage.getItem('panelTollocheLastTab');
      if (TABS.some(t => t.id === last)) {
        const btn = grupo.querySelector(`[onclick*="'${last}'"]`);
        window.showTab(last, btn);
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
