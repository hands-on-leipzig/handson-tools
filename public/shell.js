/* Chrome behaviour for the Glass app shell (no Vue). */
(function () {
  var THEME_KEY = 'hands-on-theme';
  var COLLAPSE_KEY = 'hands-on-sidebar-collapsed';
  var app = document.querySelector('.glass-app');
  var sidebar = document.querySelector('.glass-sidebar');
  if (!app || !sidebar) return;

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      var on = btn.getAttribute('data-theme-set') === theme;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTheme(btn.getAttribute('data-theme-set'));
    });
  });
  applyTheme(currentTheme());

  function setCollapsed(on) {
    app.classList.toggle('glass-app--sidebar-collapsed', on);
    sidebar.classList.toggle('glass-sidebar--collapsed', on);
    var toggle = document.querySelector('[data-collapse]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      toggle.setAttribute('aria-label', on ? 'Sidebar ausklappen' : 'Sidebar einklappen');
      toggle.setAttribute('title', on ? 'Sidebar ausklappen' : 'Sidebar einklappen');
      var icon = toggle.querySelector('.bi');
      if (icon) {
        icon.classList.toggle('bi-chevron-right', on);
        icon.classList.toggle('bi-chevron-left', !on);
      }
    }
    try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch (e) {}
  }

  try {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
  } catch (e) {}

  var collapseBtn = document.querySelector('[data-collapse]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function () {
      setCollapsed(!sidebar.classList.contains('glass-sidebar--collapsed'));
    });
  }

  function setDrawer(open) {
    app.classList.toggle('glass-app--drawer-open', open);
    sidebar.classList.toggle('glass-sidebar--open', open);
    var menuBtn = document.querySelector('[data-menu-toggle]');
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      var icon = menuBtn.querySelector('.bi');
      if (icon) {
        icon.classList.toggle('bi-x-lg', open);
        icon.classList.toggle('bi-list', !open);
      }
    }
  }

  var menuBtn = document.querySelector('[data-menu-toggle]');
  if (menuBtn) {
    menuBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      setDrawer(!sidebar.classList.contains('glass-sidebar--open'));
    });
  }

  var backdrop = document.querySelector('.glass-app__backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', function () { setDrawer(false); });
  }

  function closeFooterMenus() {
    document.querySelectorAll('[data-menu]').forEach(function (menu) {
      menu.hidden = true;
    });
    document.querySelectorAll('[data-menu-btn]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('glass-sidebar-footer__icon-btn--active');
    });
    var footer = document.querySelector('.glass-sidebar-footer');
    if (footer) footer.classList.remove('glass-sidebar-footer--menu-open');
  }

  document.querySelectorAll('[data-menu-btn]').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      var name = btn.getAttribute('data-menu-btn');
      var menu = document.querySelector('[data-menu="' + name + '"]');
      if (!menu) return;
      var willOpen = menu.hidden;
      closeFooterMenus();
      if (willOpen) {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('glass-sidebar-footer__icon-btn--active');
        var footer = document.querySelector('.glass-sidebar-footer');
        if (footer) footer.classList.add('glass-sidebar-footer--menu-open');
      }
    });
  });

  document.addEventListener('pointerdown', function (event) {
    if (!event.target.closest('.glass-sidebar-footer')) closeFooterMenus();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeFooterMenus();
      setDrawer(false);
    }
  });
})();
