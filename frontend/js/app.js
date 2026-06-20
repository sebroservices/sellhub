const PAGE_LOADERS = {
  dashboard:     loadDashboard,
  orders:        loadOrders,
  inventory:     loadInventory,
  cogs:          loadCogs,
  suppliers:     loadSuppliers,
  profit:        loadProfit,
  goals:         loadGoals,
  reports:       loadReports,
  emailschedule: loadEmailSchedule,
  calculator:    loadCalculator,
  settings:      loadSettings,
};

const App = {
  currentPage: null,

  async init() {
    const params     = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    const auth       = await API.me().catch(() => ({ authenticated: false }));

    if (!auth.authenticated) {
      document.getElementById('login-screen').classList.remove('hidden');
      if (oauthError) {
        const errEl = document.getElementById('login-error');
        errEl.textContent = decodeURIComponent(oauthError);
        errEl.classList.remove('hidden');
      }
      return;
    }

    document.getElementById('app').classList.remove('hidden');
    document.getElementById('sidebar-footer').innerHTML =
      `<i class="ti ti-user" style="font-size:14px;vertical-align:-2px"></i> ${auth.username}`;

    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.addEventListener('click', () => App.navigate(btn.dataset.page));
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      window.location.href = '/auth/logout';
    });

    document.getElementById('sync-btn').addEventListener('click', async () => {
      UI.toast('Syncing eBay data…', 'info');
      await API.syncAll().catch(err => UI.toast(err.message, 'danger'));
    });

    const hash = window.location.hash.slice(1) || 'dashboard';
    App.navigate(hash);
  },

  navigate(pageId) {
    if (!PAGE_LOADERS[pageId]) return;
    window.location.hash = pageId;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    App.currentPage = pageId;
    PAGE_LOADERS[pageId]();
  },
};

App.init();
