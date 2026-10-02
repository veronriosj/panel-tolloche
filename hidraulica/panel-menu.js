// ===== Panel Tolloche · menú lateral desplegable =====
// · Cada grupo del menú (Riego, Equipos, Cálculos hidráulicos…) se abre y cierra tocando su título.
// · Queda abierto el grupo de la pestaña activa; lo demás recuerda cómo lo dejaste.
// · En PC la barra verde ocupa todo el alto y acompaña al hacer scroll (sin huecos vacíos abajo).
// Se carga desde hidraulica/hidraulica.js: no hace falta tocar index.html.
(function () {
  const KEY = 'panelTollocheMenu';
  const leer = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const guardar = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  const css = `
  @media (min-width: 901px) {
    .layout { align-items: stretch !important; background: linear-gradient(to right, var(--vo) 220px, transparent 220px); }
    .sidebar { position: sticky; top: 0; align-self: flex-start; height: 100vh; min-height: 0 !important; padding: 10px 0 18px !important; }
  }
  .sidebar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; }
  .sidebar .navgroup { margin: 0 0 2px !important; }
  .sidebar .navgroup-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
    margin: 0 !important; padding: 10px 14px 10px 18px !important; cursor: pointer; user-select: none; border: 0; background: none;
    font-family: inherit; text-align: left; border-radius: 0; transition: background .15s, color .15s; }
  .sidebar .navgroup-title:hover { background: rgba(255,255,255,.07); color: #b5e6c7; }
  .sidebar .navgroup-title:focus-visible { outline: 2px solid var(--vc); outline-offset: -2px; }
  .sidebar .navgroup-title .chev { width: 8px; height: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor;
    transform: rotate(45deg) translateY(-2px); transition: transform .2s ease; flex-shrink: 0; opacity: .8; }
  .sidebar .navgroup.cerrado .navgroup-title .chev { transform: rotate(-45deg); }
  .sidebar .navgroup .ng-items { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .22s ease; }
  .sidebar .navgroup.cerrado .ng-items { grid-template-rows: 0fr; }
  .sidebar .navgroup .ng-items > div { overflow: hidden; }
  .sidebar .navgroup.tiene-activa .navgroup-title { color: #d4f0df; }
  .sidebar .navgroup + .navgroup { border-top: 1px solid rgba(255,255,255,.08); }
  .sidebar .tab { padding: 8px 18px 8px 26px !important; }
  `;

  function montar() {
    const sb = document.getElementById('sidebar');
    if (!sb || sb.dataset.menu) return;
    sb.dataset.menu = '1';
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const estado = leer();

    const grupos = [...sb.querySelectorAll('.navgroup')];
    grupos.forEach(g => {
      const t = g.querySelector('.navgroup-title'); if (!t || g.querySelector('.ng-items')) return;
      const nombre = t.textContent.trim();
      // envolver los botones para poder plegarlos con animación
      const caja = document.createElement('div'); caja.className = 'ng-items';
      const inner = document.createElement('div'); caja.appendChild(inner);
      [...g.children].filter(el => el !== t).forEach(el => inner.appendChild(el));
      g.appendChild(caja);
      // título como botón
      t.setAttribute('role', 'button'); t.tabIndex = 0;
      t.insertAdjacentHTML('beforeend', '<i class="chev" aria-hidden="true"></i>');
      const activa = !!g.querySelector('.tab.active');
      const abierto = activa || estado[nombre] === true;
      g.classList.toggle('cerrado', !abierto);
      g.classList.toggle('tiene-activa', activa);
      t.setAttribute('aria-expanded', abierto);
      const alternar = () => {
        const cerrar = !g.classList.contains('cerrado');
        g.classList.toggle('cerrado', cerrar); t.setAttribute('aria-expanded', !cerrar);
        const o = leer(); o[nombre] = !cerrar; guardar(o);
      };
      t.addEventListener('click', alternar);
      t.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } });
    });

    // al cambiar de pestaña: abrir su grupo y marcarlo
    const marcar = () => grupos.forEach(g => {
      const a = !!g.querySelector('.tab.active');
      g.classList.toggle('tiene-activa', a);
      if (a && g.classList.contains('cerrado')) { g.classList.remove('cerrado'); g.querySelector('.navgroup-title').setAttribute('aria-expanded', true); }
    });
    const prev = window.showTab;
    if (typeof prev === 'function' && !prev._menu) {
      window.showTab = function (id, btn) { const r = prev.apply(this, arguments); marcar(); return r; };
      window.showTab._menu = true;
    }
    marcar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  window.HIDmenu = { montar };
})();
