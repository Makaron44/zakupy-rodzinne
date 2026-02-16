import './style.css';
import { supabase } from './supabase';
import JsBarcode from 'jsbarcode';
import Toastify from 'toastify-js';

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW failed:', err));
  });
}

// --- State ---
let items = [];
let cards = [];
let activeTab = 'list';
let currentUser = null;
let userFamily = null;
let recentItems = JSON.parse(localStorage.getItem('recentItems') || '[]');
let realtimeChannel = null;

// --- Selectors ---
const getSelectors = () => ({
  itemInput: document.getElementById('item-input'),
  quantityInput: document.getElementById('quantity-input'),
  addButton: document.getElementById('add-button'),
  shoppingListContainer: document.getElementById('shopping-list-container'),
  navItems: document.querySelectorAll('.nav-item'),
  tabs: document.querySelectorAll('.tab-content'),
  cardsGrid: document.getElementById('cards-grid'),
  addCardForm: document.getElementById('add-card-form'),
  showAddCardBtn: document.getElementById('show-add-card-btn'),
  saveCardBtn: document.getElementById('save-card-btn'),
  cardNameInput: document.getElementById('card-name-input'),
  cardCodeInput: document.getElementById('card-code-input'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  btnLogin: document.getElementById('btn-login'),
  btnSignup: document.getElementById('btn-signup'),
  btnLogout: document.getElementById('btn-logout'),
  authLoggedOut: document.getElementById('auth-logged-out'),
  authLoggedIn: document.getElementById('auth-logged-in'),
  userDisplay: document.getElementById('user-email-display'),
  noFamilySection: document.getElementById('no-family-section'),
  hasFamilySection: document.getElementById('has-family-section'),
  newFamilyName: document.getElementById('new-family-name'),
  btnCreateFamily: document.getElementById('btn-create-family'),
  inviteCodeInput: document.getElementById('invite-code-input'),
  btnJoinFamily: document.getElementById('btn-join-family'),
  btnShareCode: document.getElementById('btn-share-code'),
  displayFamilyName: document.getElementById('display-family-name'),
  displayInviteCode: document.getElementById('display-invite-code'),
  historySection: document.getElementById('history-section'),
  historyChips: document.getElementById('history-chips'),
  basketSection: document.getElementById('basket-section'),
  basketContainer: document.getElementById('basket-container'),
  btnClearBasket: document.getElementById('btn-clear-basket'),
  priceInput: document.getElementById('price-input'),
  totalSumContainer: document.getElementById('total-sum-container'),
  totalSumValue: document.getElementById('total-sum-value'),
  btnAtStore: document.getElementById('btn-at-store'),
});

// --- Utils ---
function showToast(text, color = 'var(--primary)') {
  Toastify({
    text,
    duration: 3000,
    gravity: "top",
    position: "right",
    stopOnFocus: true,
    style: { background: color, borderRadius: '12px' }
  }).showToast();
}

// --- Category Logic ---
const categoryMap = {
  'Nabiał': ['mleko', 'ser', 'jajka', 'jogurt', 'masło', 'śmietana', 'twaróg'],
  'Pieczywo': ['chleb', 'bułki', 'rogal', 'bagietka', 'drożdżówka'],
  'Warzywa & Owoce': ['pomidor', 'ziemniak', 'jabłko', 'banan', 'ogórek', 'cebula', 'marchew', 'papryka'],
  'Mięso & Wędliny': ['szynka', 'kiełbasa', 'mięso', 'kurczak', 'parówki', 'boczek'],
  'Napoje': ['woda', 'sok', 'kawa', 'herbata', 'cola', 'piwo', 'wino'],
  'Chemia & Dom': ['papier', 'mydło', 'proszek', 'płyn', 'tabletki', 'gąbka', 'ręcznik']
};

function autoSuggestCategory(text) {
  const lowerText = text.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(kw => lowerText.includes(kw))) return category;
  }
  return 'Inne';
}

// --- Tab Management ---
function switchTab(tabId) {
  const s = getSelectors();
  activeTab = tabId;

  // Update nav items
  s.navItems.forEach(nav => {
    nav.classList.toggle('active', nav.dataset.tab === tabId);
  });

  // Update tab content
  s.tabs.forEach(tab => {
    if (tab.id === `tab-${tabId}`) {
      tab.style.display = 'block';
      tab.classList.add('active');
    } else {
      tab.style.display = 'none';
      tab.classList.remove('active');
    }
  });

  if (tabId === 'cards') fetchCards();
  if (tabId === 'list') fetchItems();
}

// --- Auth & Profile ---
async function handleAuthStateChange(user) {
  currentUser = user;
  const s = getSelectors();

  if (user) {
    s.authLoggedOut.style.display = 'none';
    s.authLoggedIn.style.display = 'block';
    s.userDisplay.innerText = `Konto: ${user.email}`;
    await syncProfile();
    setupSubscriptions(); // Uruchom subskrypcje po zalogowaniu
    refreshData();
  } else {
    s.authLoggedOut.style.display = 'block';
    s.authLoggedIn.style.display = 'none';
    s.noFamilySection.style.display = 'none';
    s.hasFamilySection.style.display = 'none';
    userFamily = null;
    items = [];
    cards = [];
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
    renderItems();
    renderCards();
  }
}

async function syncProfile() {
  if (!currentUser) return;
  try {
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('*, family_groups(*)')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{ id: currentUser.id, email: currentUser.email }])
        .select()
        .single();
      profile = newProfile;
    }

    userFamily = profile?.family_groups || null;
    updateFamilyUI();
  } catch (err) {
    console.error('Profile sync error:', err);
  }
}

function updateFamilyUI() {
  const s = getSelectors();
  if (!userFamily) {
    s.noFamilySection.style.display = 'block';
    s.hasFamilySection.style.display = 'none';
  } else {
    s.noFamilySection.style.display = 'none';
    s.hasFamilySection.style.display = 'block';
    s.displayFamilyName.innerText = userFamily.name;
    s.displayInviteCode.innerText = userFamily.invite_code;
  }
}

function refreshData() {
  if (activeTab === 'list') fetchItems();
  if (activeTab === 'cards') fetchCards();
}

// --- Data Operations ---
async function fetchItems() {
  if (!userFamily) return renderItems();
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('family_id', userFamily.id)
    .order('created_at', { ascending: false });

  if (!error) {
    items = data;
    renderItems();
  }
}

function renderItems() {
  const s = getSelectors();
  s.shoppingListContainer.innerHTML = '';
  s.basketContainer.innerHTML = '';

  if (!currentUser) {
    s.shoppingListContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Zaloguj się w zakładce Rodzina, aby zobaczyć listę.</p>';
    return;
  }

  if (!userFamily) {
    s.shoppingListContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Stwórz lub dołącz do rodziny w zakładce Rodzina.</p>';
    return;
  }

  // Update History UI
  renderHistory();

  const activeItems = items.filter(i => !i.checked);
  const checkedItems = items.filter(i => i.checked);

  // Render Active List
  if (activeItems.length === 0) {
    s.shoppingListContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Lista jest pusta</p>';
  } else {
    const grouped = activeItems.reduce((acc, item) => {
      const cat = item.category || 'Inne';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});

    for (const [category, categoryItems] of Object.entries(grouped)) {
      const section = document.createElement('div');
      section.innerHTML = `<h3 class="category-header">${category}</h3><ul class="shopping-list"></ul>`;
      const list = section.querySelector('ul');
      categoryItems.forEach(item => list.appendChild(createItemElement(item)));
      s.shoppingListContainer.appendChild(section);
    }
  }

  // Render Basket
  if (checkedItems.length > 0) {
    s.basketSection.style.display = 'block';
    const list = document.createElement('ul');
    list.className = 'shopping-list';
    checkedItems.forEach(item => list.appendChild(createItemElement(item)));
    s.basketContainer.appendChild(list);
  } else {
    s.basketSection.style.display = 'none';
  }

  // Calculate Total Sum (Active Items)
  const total = activeItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
  if (total > 0) {
    s.totalSumContainer.style.display = 'block';
    s.totalSumValue.innerText = total.toFixed(2);
  } else {
    s.totalSumContainer.style.display = 'none';
  }
}

function createItemElement(item) {
  const li = document.createElement('li');
  li.className = `shopping-item glass-card ${item.checked ? 'checked' : ''}`;
  li.innerHTML = `
        <div class="checkbox-custom" data-id="${item.id}">
            ${item.checked ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
        <div class="item-meta">
            <span class="item-quantity">${item.quantity || '1'}</span>
            <span class="item-text">${item.text}</span>
            ${item.price ? `<span class="item-category" style="margin-left:auto; background:var(--accent); color:white;">${parseFloat(item.price).toFixed(2)} zł</span>` : ''}
        </div>
        <button class="btn-delete" data-id="${item.id}">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
    `;
  return li;
}

function renderHistory() {
  const s = getSelectors();

  if (recentItems.length > 0) {
    s.historySection.style.display = 'block';
    s.historyChips.innerHTML = '';
    recentItems.forEach(name => {
      const chip = document.createElement('div');
      chip.className = 'history-chip';
      chip.innerText = `+ ${name}`;
      chip.onclick = () => {
        s.itemInput.value = name;
        s.addButton.click();
      };
      s.historyChips.appendChild(chip);
    });
  } else {
    s.historySection.style.display = 'none';
  }
}

function addToRecent(text) {
  const cleanText = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  recentItems = [cleanText, ...recentItems.filter(i => i !== cleanText)].slice(0, 10);
  localStorage.setItem('recentItems', JSON.stringify(recentItems));
}

async function fetchCards() {
  if (!userFamily) return renderCards();
  const { data, error } = await supabase
    .from('loyalty_cards')
    .select('*')
    .eq('family_id', userFamily.id)
    .order('name');
  if (!error) {
    cards = data;
    renderCards();
  }
}

function renderCards() {
  const s = getSelectors();
  s.cardsGrid.innerHTML = '';

  if (!userFamily) {
    s.cardsGrid.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Zaloguj się i dołącz do rodziny, aby zarządzać kartami.</p>';
    return;
  }

  if (cards.length === 0) {
    s.cardsGrid.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Brak zapisanych kart.</p>';
    return;
  }

  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'loyalty-card glass-card';
    div.innerHTML = `
            <div class="card-name">${card.name}</div>
            <div class="barcode-container">
                <svg class="barcode-svg" id="barcode-${card.id}"></svg>
            </div>
            <button class="btn-delete" data-id="${card.id}" style="position: absolute; top: 12px; right: 12px; opacity: 1;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
    s.cardsGrid.appendChild(div);

    try {
      JsBarcode(`#barcode-${card.id}`, card.code, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 50,
        displayValue: true
      });
    } catch (e) {
      console.error('Barcode error:', e);
    }
  });
}

// --- Main Init ---
const init = async () => {
  const s = getSelectors();

  // Event Listeners
  s.navItems.forEach(nav => nav.addEventListener('click', e => {
    e.preventDefault();
    switchTab(nav.dataset.tab);
  }));

  s.addButton.addEventListener('click', async () => {
    if (!userFamily) return showToast('Musisz być w rodzinie!', 'var(--error)');
    const text = s.itemInput.value.trim();
    const quantity = s.quantityInput.value.trim() || '1';
    const price = parseFloat(s.priceInput.value) || null;
    if (text) {
      addToRecent(text); // Zapamiętaj w historii
      const category = autoSuggestCategory(text);
      const { error } = await supabase.from('items').insert([{ text, category, quantity, price, family_id: userFamily.id }]);
      if (error) showToast('Błąd zapisu!', 'var(--error)');
      else {
        s.itemInput.value = '';
        s.quantityInput.value = '1';
        s.priceInput.value = '';
        refreshData();
      }
    }
  });

  s.btnAtStore.addEventListener('click', async () => {
    if (!userFamily || !realtimeChannel) return;
    realtimeChannel.send({
      type: 'broadcast',
      event: 'shopping_status',
      payload: { user: currentUser.email.split('@')[0], message: 'jest właśnie w sklepie!' }
    });
    showToast('Powiadomiono rodzinę! 🔔');
  });

  s.btnSignup.addEventListener('click', async () => {
    const { error } = await supabase.auth.signUp({ email: s.authEmail.value, password: s.authPassword.value });
    if (error) showToast(error.message, 'var(--error)');
    else showToast('Sprawdź maila lub zaloguj się!');
  });

  s.btnLogin.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: s.authEmail.value, password: s.authPassword.value });
    if (error) showToast(error.message, 'var(--error)');
    else showToast('Witaj ponownie!');
  });

  s.btnLogout.addEventListener('click', () => supabase.auth.signOut());

  s.btnCreateFamily.addEventListener('click', async () => {
    const name = s.newFamilyName.value.trim();
    if (!name) return showToast('Podaj nazwę!', 'var(--error)');
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: family, error } = await supabase.from('family_groups').insert([{ name, invite_code: inviteCode }]).select().single();
    if (error) return showToast('Błąd!', 'var(--error)');
    await supabase.from('profiles').update({ family_id: family.id }).eq('id', currentUser.id);
    await syncProfile();
    refreshData();
  });

  s.btnJoinFamily.addEventListener('click', async () => {
    const code = s.inviteCodeInput.value.trim().toUpperCase();
    const { data: family, error } = await supabase.from('family_groups').select('id').eq('invite_code', code).single();
    if (error) return showToast('Zły kod!', 'var(--error)');
    await supabase.from('profiles').update({ family_id: family.id }).eq('id', currentUser.id);
    await syncProfile();
    refreshData();
  });

  s.showAddCardBtn.addEventListener('click', () => {
    s.addCardForm.style.display = s.addCardForm.style.display === 'none' ? 'block' : 'none';
  });

  s.saveCardBtn.addEventListener('click', async () => {
    if (!userFamily) return showToast('Musisz być w rodzinie!', 'var(--error)');
    const name = s.cardNameInput.value.trim();
    const code = s.cardCodeInput.value.trim();
    if (name && code) {
      const { error } = await supabase.from('loyalty_cards').insert([{ name, code, family_id: userFamily.id }]);
      if (!error) {
        s.cardNameInput.value = '';
        s.cardCodeInput.value = '';
        s.addCardForm.style.display = 'none';
        refreshData(); // Odśwież natychmiast u siebie
      }
    }
  });

  s.displayInviteCode.addEventListener('click', () => {
    navigator.clipboard.writeText(s.displayInviteCode.innerText);
    showToast('Skopiowano kod!');
  });

  s.btnShareCode.addEventListener('click', async () => {
    const code = s.displayInviteCode.innerText;
    const shareData = {
      title: 'Dołącz do moich zakupów!',
      text: `Hej! Dołącz do mojej listy zakupów w aplikacji. Mój kod rodziny to: ${code}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        navigator.clipboard.writeText(code);
        showToast('Kod skopiowany!');
      }
    } catch (err) {
      console.log('Share failed', err);
    }
  });

  s.btnClearBasket.addEventListener('click', async () => {
    if (confirm('Czy na pewno wyczyścić cały koszyk?')) {
      const { error } = await supabase.from('items').delete().eq('family_id', userFamily.id).eq('checked', true);
      if (!error) {
        showToast('Koszyk wyczyszczony!');
        refreshData();
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const del = e.target.closest('.btn-delete');
    const check = e.target.closest('.checkbox-custom');
    if (del) {
      const table = activeTab === 'list' ? 'items' : 'loyalty_cards';
      await supabase.from(table).delete().eq('id', del.dataset.id);
      refreshData(); // Proaktywne odświeżenie po usunięciu
    }
    if (check) {
      const id = check.dataset.id;
      const item = items.find(i => i.id === id);
      await supabase.from('items').update({ checked: !item.checked }).eq('id', id);
      refreshData(); // Proaktywne odświeżenie po zaznaczeniu
    }
  });

  // Obsługa sesji na starcie
  const { data: { session } } = await supabase.auth.getSession();
  handleAuthStateChange(session?.user || null);
  supabase.auth.onAuthStateChange((_event, session) => handleAuthStateChange(session?.user || null));
};

// --- Real-time & Visibility ---
function setupSubscriptions() {
  if (!userFamily) return;

  // Cleanup old channel
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
  }

  realtimeChannel = supabase.channel('shopping-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `family_id=eq.${userFamily.id}` }, (payload) => {
      console.log('Realtime update:', payload);
      fetchItems();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_cards', filter: `family_id=eq.${userFamily.id}` }, () => {
      fetchCards();
    })
    .on('broadcast', { event: 'shopping_status' }, ({ payload }) => {
      showToast(`🛒 ${payload.user} ${payload.message}`, 'var(--accent)');
    })
    .subscribe((status) => {
      console.log('Realtime status:', status);
    });
}

// Obsługa powrotu do aplikacji (Visibility API)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('App visible - refreshing data and subscriptions...');
    if (currentUser) {
      refreshData();
      setupSubscriptions(); // Odśwież połączenie WebSocket
    }
  }
});

init();
