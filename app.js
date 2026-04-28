'use strict';

/* ════════════════════════════════════════════
   FIREBASE INIT
════════════════════════════════════════════ */
firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();
let messaging = null;
try { messaging = firebase.messaging(); } catch { /* unsupported */ }

/* ════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════ */
const CONFIG = {
  locale: 'en-GB',
  colors: [
    { id: 'amber',    hex: '#C87941' },
    { id: 'lavender', hex: '#9B7AB5' },
    { id: 'rose',     hex: '#C45F7A' },
    { id: 'sage',     hex: '#5A8A70' },
    { id: 'sky',      hex: '#4A7B9D' },
    { id: 'coral',    hex: '#D4724A' },
  ],
};

/* ════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════ */
const MOODS = [
  { emoji: '🌟', label: 'amazing'  },
  { emoji: '😊', label: 'good'     },
  { emoji: '😌', label: 'calm'     },
  { emoji: '😔', label: 'low'      },
  { emoji: '🥱', label: 'tired'    },
  { emoji: '🥰', label: 'in love'  },
];

const EMOJI_SET = ['❤️', '🔥', '😂', '🥺', '🥹'];

const THINKING = [
  'thinking of you right now ♡',
  'hi, just you',
  'missing you a little bit',
  'you just crossed my mind and I smiled',
  'just wanted you to know ♡',
  'wish you were here',
  'can\'t stop thinking about you',
  'hi ♡',
];

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
const state = {
  // Auth & profiles
  authUser:       null,
  myProfile:      null,
  partnerProfile: null,
  coupleDoc:      null,

  view: 'feed',

  // Realtime data (Firestore)
  posts:         [],
  messages:      [],
  memories:      [],
  bucket:        [],
  songs:         [],
  checkins:      {},
  notifications: [],

  // UI
  openComments:   new Set(),
  lastChatOpenAt: 0,

  // Spotify SDK
  spDeviceId:    null,
  spPlayer:      null,
  spPlayerState: null,

  // Firestore cleanup
  _unsubs: [],
  _memTab: 'memories',
};

/* ════════════════════════════════════════════
   DOM HELPERS
════════════════════════════════════════════ */
const byId = id => document.getElementById(id);
const me   = ()  => state.myProfile;
const them = ()  => state.partnerProfile;
const myId = ()  => state.authUser?.uid ?? null;

function coupleId()    { return state.coupleDoc?.id ?? null; }
function personById(uid) {
  if (!uid) return null;
  if (uid === myId()) return state.myProfile;
  return state.partnerProfile;
}

const FieldValue = firebase.firestore.FieldValue;

// Returns a Promise that rejects with a network-failed error after `ms` milliseconds.
// Used with Promise.race to surface connection hangs as user-visible errors.
function mkTimeout(ms) {
  return new Promise((_, rej) =>
    setTimeout(() => rej({ code: 'auth/network-request-failed' }), ms)
  );
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'class') {
        el.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function mkavatar(uid, size = 'md') {
  const p  = personById(uid);
  const el = document.createElement('div');
  el.className = `avatar avatar-${size}`;
  el.setAttribute('aria-label', p?.name ?? '?');
  if (p?.avatarData) {
    const img = document.createElement('img');
    img.src = p.avatarData;
    img.alt = p?.name ?? '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:999px;';
    el.append(img);
  } else {
    el.style.setProperty('--av-bg', p?.color ?? '#888');
    el.textContent = p?.initial ?? '?';
  }
  return el;
}

function mksvg(paths, extraClass) {
  const div = document.createElement('div');
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="${extraClass || ''}">${paths}</svg>`;
  return div.firstElementChild;
}

const SVG = {
  heart:   '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send:    '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
};

function timeAgo(dateStr) {
  const sec = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (sec < 60)    return 'just now';
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString(CONFIG.locale, { day: 'numeric', month: 'short' });
}

function formatDay(dateStr) {
  const d    = new Date(dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(CONFIG.locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString(CONFIG.locale, { hour: '2-digit', minute: '2-digit' });
}

function moodColor(mood) {
  const map = { warm: '#C87941', playful: '#C45F7A', calm: '#7B9BB5', wild: '#9B7AB5', silly: '#7BAA85', grateful: '#B5A07B' };
  return map[mood] || '#888';
}

function daysTogether() {
  const start = state.coupleDoc?.startDate;
  if (!start) return 1;
  return Math.max(1, Math.floor((Date.now() - new Date(start)) / 86400000));
}

/* ════════════════════════════════════════════
   FIRESTORE HELPERS
════════════════════════════════════════════ */
async function sendNotif(type, preview, targetView = null) {
  const partner = them();
  if (!partner) return;
  try {
    await db.collection('notifications').add({
      toUid: partner.id, fromUid: myId(), coupleId: coupleId(),
      type, preview, targetView, read: false, date: new Date().toISOString(),
    });
  } catch {}
}

/* ════════════════════════════════════════════
   REALTIME LISTENERS
════════════════════════════════════════════ */
function stopListeners() {
  state._unsubs.forEach(fn => fn());
  state._unsubs = [];
}

function startListeners() {
  stopListeners();
  const cid = coupleId();
  if (!cid) return;

  state._unsubs.push(
    db.collection('posts').where('coupleId','==',cid).orderBy('date','desc')
      .onSnapshot(snap => {
        state.posts = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (state.view === 'feed') { const m = byId('mainArea'); if (m) navigateTo('feed'); }
      }),
    db.collection('messages').where('coupleId','==',cid).orderBy('date','asc')
      .onSnapshot(snap => {
        state.messages = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (state.view === 'chat') {
          const ml = document.querySelector('.msg-list');
          if (ml) { renderMessages(ml); requestAnimationFrame(() => { ml.scrollTop = ml.scrollHeight; }); }
        }
        updateUnreadBadge();
      }),
    db.collection('memories').where('coupleId','==',cid).orderBy('createdAt','desc')
      .onSnapshot(snap => {
        state.memories = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (state.view === 'memories' && state._memTab === 'memories') navigateTo('memories');
      }),
    db.collection('bucket').where('coupleId','==',cid).orderBy('createdAt','asc')
      .onSnapshot(snap => {
        state.bucket = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (state.view === 'memories' && state._memTab === 'bucket') navigateTo('memories');
      }),
    db.collection('songs').where('coupleId','==',cid).orderBy('date','desc')
      .onSnapshot(snap => {
        state.songs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (state.view === 'music') navigateTo('music');
      }),
    db.collection('checkins').where('coupleId','==',cid)
      .onSnapshot(snap => {
        state.checkins = {};
        snap.docs.forEach(d => { const data = d.data(); state.checkins[`${data.date}:${data.author}`] = data; });
        if (state.view === 'feed') {
          const widget = document.querySelector('.checkin-card');
          if (widget) widget.replaceWith(buildCheckinWidget());
        }
      }),
    db.collection('notifications').where('toUid','==',myId()).orderBy('date','desc').limit(50)
      .onSnapshot(snap => {
        state.notifications = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        updateNotifBadge();
        if (byId('notifPanel') && !byId('notifPanel').hidden) renderNotifPanel();
      }),
  );

  if (state.partnerProfile?.id) {
    state._unsubs.push(
      db.collection('users').doc(state.partnerProfile.id).onSnapshot(snap => {
        if (snap.exists) { state.partnerProfile = { id: snap.id, ...snap.data() }; renderSidebar(); }
      })
    );
  }
}

/* ════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════ */
function navigateTo(view) {
  state.view = view;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

  if (view === 'chat') {
    state.lastChatOpenAt = Date.now();
    updateUnreadBadge();
    if (myId()) db.collection('users').doc(myId()).update({ lastChatOpenAt: Date.now() }).catch(() => {});
  }

  const main = byId('mainArea');
  main.style.overflowY = view === 'chat' ? 'hidden' : 'auto';
  main.innerHTML = '';
  main.scrollTop = 0;

  ({ feed: renderFeed, chat: renderChat, memories: renderMemories, profile: renderProfile, music: renderMusic }[view])(main);
  updateUnreadBadge();
}

/* ════════════════════════════════════════════
   BADGES
════════════════════════════════════════════ */
function updateUnreadBadge() {
  const partnerId = them()?.id;
  const since     = state.lastChatOpenAt || 0;
  const count     = state.messages.filter(m => m.author === partnerId && new Date(m.date).getTime() > since).length;
  document.querySelectorAll('[data-view="chat"]').forEach(btn => {
    let badge = btn.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; btn.append(badge); }
      badge.textContent = count > 9 ? '9+' : String(count);
    } else {
      badge?.remove();
    }
  });
}

function updateNotifBadge() {
  const count = state.notifications.filter(n => !n.read).length;
  const el = byId('notifBadge');
  if (el) {
    el.hidden = count === 0;
    if (count > 0) el.textContent = count > 9 ? '9+' : String(count);
  }
  // Also update sidebar bell
  const sidebarBell = document.querySelector('.sidebar-notif-btn .nav-badge');
  if (sidebarBell) sidebarBell.textContent = count > 9 ? '9+' : String(count);
  const sidebarBellBtn = document.querySelector('.sidebar-notif-btn');
  if (sidebarBellBtn) {
    let badge = sidebarBellBtn.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; sidebarBellBtn.append(badge); }
      badge.textContent = count > 9 ? '9+' : String(count);
    } else { badge?.remove(); }
  }
}

/* ════════════════════════════════════════════
   AUTH FLOW
════════════════════════════════════════════ */
function showAuthOverlay(content) {
  const panel = byId('authPanel');
  panel.innerHTML = '';
  panel.append(content);
  byId('authOverlay').hidden = false;
}
function hideAuthOverlay() { byId('authOverlay').hidden = true; }

function showTerms() {
  const card = h('div', { class: 'terms-card' },
    h('div', { class: 'terms-logo' }, '♡'),
    h('h1', { class: 'terms-title' }, 'ours.'),
    h('p', { class: 'terms-sub' }, 'Terms & Conditions of Love'),
    h('ul', { class: 'terms-list' },
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '🎵'), h('span', {}, h('strong', {}, '§1 Songs. '), 'All songs discovered after midnight shall be shared immediately, regardless of the hour.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '🍝'), h('span', {}, h('strong', {}, '§2 Pasta. '), 'No person shall stir pasta for more than two consecutive evenings without fair rotation.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '🫶'), h('span', {}, h('strong', {}, '§3 Thinking of You. '), 'A thinking-of-you message cannot be left unread for longer than one reasonable nap.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '📸'), h('span', {}, h('strong', {}, '§4 Photos. '), 'Any photo where the other person looks objectively wonderful must be shared before sunset.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '🌅'), h('span', {}, h('strong', {}, '§5 Mornings. '), '"Good morning" is a legally binding promise that the day will be at least marginally better together.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '🎬'), h('span', {}, h('strong', {}, '§6 Bad Movies. '), 'All terrible movies watched together shall be remembered fondly, regardless of quality.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '☕'), h('span', {}, h('strong', {}, '§7 Bad Days. '), 'On bad days, hot beverages shall be offered before opinions.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '🔒'), h('span', {}, h('strong', {}, '§8 Privacy. '), 'What is shared here, stays here. This space belongs to you two alone.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '✍️'), h('span', {}, h('strong', {}, '§9 Amendments. '), 'These terms may be amended at any time by mutual giggling.')),
      h('li', { class: 'terms-item' }, h('span', { class: 'terms-item-icon' }, '∞'), h('span', {}, h('strong', {}, '§10 Duration. '), 'This agreement is effective for: forever.')),
    ),
    h('button', { class: 'terms-accept', onClick: () => {
      localStorage.setItem('ours-terms-v1', '1');
      setupAuthListener();
    }}, 'I Accept ♡'),
  );
  showAuthOverlay(card);
}

function showAuth(mode = 'login', startError = null) {
  let currentMode = mode;
  function render() {
    const isReg = currentMode === 'register';
    const errorEl = h('div', { class: 'auth-error', style: startError ? {} : { display: 'none' } });
    if (startError) { errorEl.textContent = startError; startError = null; }
    const emailIn = h('input', { class: 'auth-input', type: 'email', placeholder: 'your@email.com', autocomplete: 'email' });
    const passIn  = h('input', { class: 'auth-input', type: 'password', placeholder: '••••••••', autocomplete: isReg ? 'new-password' : 'current-password' });
    const nameIn  = isReg ? h('input', { class: 'auth-input', type: 'text', placeholder: 'Your name', maxlength: '24' }) : null;

    let selectedColor = CONFIG.colors[0].hex;
    const colorRow = isReg ? h('div', { class: 'auth-color-row' }) : null;
    if (isReg && colorRow) {
      CONFIG.colors.forEach(c => {
        const sw = h('button', { class: `auth-color-swatch${selectedColor === c.hex ? ' selected' : ''}`, style: { background: c.hex }, onClick: () => {
          selectedColor = c.hex;
          colorRow.querySelectorAll('.auth-color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
        }});
        colorRow.append(sw);
      });
    }

    const btn = h('button', { class: 'auth-submit', onClick: submit }, isReg ? 'Create account' : 'Sign in');

    async function submit() {
      const email = emailIn.value.trim();
      const pass  = passIn.value;
      if (!email || !pass) { showErr('Please fill in all fields.'); return; }
      if (isReg && !nameIn?.value.trim()) { showErr('Please enter your name.'); return; }
      btn.disabled = true;
      btn.textContent = isReg ? 'Creating…' : 'Signing in…';
      errorEl.style.display = 'none';
      let succeeded = false;
      try {
        if (isReg) {
          const cred = await Promise.race([
            auth.createUserWithEmailAndPassword(email, pass),
            mkTimeout(20000),
          ]);
          const name = nameIn.value.trim();
          await Promise.race([
            db.collection('users').doc(cred.user.uid).set({
              name, bio: '', color: selectedColor, initial: name[0].toUpperCase(),
              inviteCode: genCode(), partnerId: null, coupleId: null,
              avatarData: null, lastChatOpenAt: 0, createdAt: Date.now(),
            }),
            mkTimeout(15000),
          ]);
        } else {
          await Promise.race([
            auth.signInWithEmailAndPassword(email, pass),
            mkTimeout(20000),
          ]);
        }
        succeeded = true;
        // Auth succeeded — replace the frozen button with a loading indicator so
        // the user knows something is happening while Firestore loads.
        showAuthOverlay(h('div', { class: 'auth-card', style: { alignItems: 'center', gap: '1rem' } },
          h('div', { class: 'auth-loading-spinner' }),
          h('p', { style: { color: 'var(--c-muted, #888)', fontSize: '0.9rem', margin: '0' } }, 'Loading…'),
        ));
      } catch (err) {
        console.error('Firebase auth error:', err);
        const msg = authErrMsg(err.code);
        // Show the raw Firebase error code/message in dev so we can diagnose
        showErr(`${msg}\n[${err.code ?? 'no-code'}${err.message ? ': ' + err.message : ''}]`);
      } finally {
        if (!succeeded) {
          btn.disabled = false;
          btn.textContent = isReg ? 'Create account' : 'Sign in';
        }
      }
    }
    function showErr(msg) { errorEl.textContent = msg; errorEl.style.display = ''; }
    [emailIn, passIn, nameIn].filter(Boolean).forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));

    const card = h('div', { class: 'auth-card' },
      h('span', { class: 'auth-brand' }, 'ours.'),
      h('p', { class: 'auth-subtitle' }, 'a private space for two'),
      h('div', { class: 'auth-tab-row' },
        h('button', { class: `auth-tab${!isReg ? ' active' : ''}`, onClick: () => { currentMode = 'login'; render(); } }, 'Sign in'),
        h('button', { class: `auth-tab${isReg ? ' active' : ''}`, onClick: () => { currentMode = 'register'; render(); } }, 'Create account'),
      ),
      errorEl,
      isReg ? h('div', { class: 'auth-field' }, h('label', { class: 'auth-label' }, 'Your name'), nameIn) : null,
      h('div', { class: 'auth-field' }, h('label', { class: 'auth-label' }, 'Email'), emailIn),
      h('div', { class: 'auth-field' }, h('label', { class: 'auth-label' }, 'Password'), passIn),
      isReg ? h('div', { class: 'auth-field' }, h('label', { class: 'auth-label' }, 'Your colour'), colorRow) : null,
      btn,
    );
    showAuthOverlay(card);
  }
  render();
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function authErrMsg(code) {
  const m = {
    'auth/wrong-password':            'Incorrect password.',
    'auth/user-not-found':            'No account with that email.',
    'auth/invalid-email':             'Enter a valid email.',
    'auth/email-already-in-use':      'That email is already registered.',
    'auth/weak-password':             'Password must be at least 6 characters.',
    'auth/too-many-requests':         'Too many attempts. Try again later.',
    'auth/invalid-credential':        'Email or password incorrect.',
    'auth/invalid-login-credentials': 'Email or password incorrect.',
    'auth/network-request-failed':    'Network error. Check your connection.',
    'auth/operation-not-allowed':     'Email/password sign-in is not enabled for this project.',
    'auth/user-disabled':             'This account has been disabled.',
    'auth/internal-error':            'An internal error occurred. Please try again.',
  };
  return m[code] || `Something went wrong (${code ?? 'unknown'}). Please try again.`;
}

async function showPairing(userDoc) {
  const code     = userDoc.inviteCode;
  const codeIn   = h('input', { class: 'auth-input', type: 'text', maxlength: '6', placeholder: 'Enter their code',
    style: { textAlign: 'center', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '1.2rem' } });
  const connectBtn = h('button', { class: 'auth-submit', style: { marginTop: '0' }, onClick: connect }, 'Connect ♡');
  const errorEl  = h('div', { class: 'auth-error', style: { display: 'none' } });

  async function connect() {
    const entered = codeIn.value.trim().toUpperCase();
    if (entered.length < 4) { showErr('Enter your partner\'s invite code.'); return; }
    connectBtn.disabled = true; connectBtn.textContent = 'Connecting…'; errorEl.style.display = 'none';
    try {
      const snap = await Promise.race([
        db.collection('users').where('inviteCode','==',entered).get(),
        mkTimeout(15000),
      ]);
      if (snap.empty) throw new Error('not-found');
      const partnerDoc = snap.docs[0];
      if (partnerDoc.id === myId()) throw new Error('own');
      if (partnerDoc.data().partnerId) throw new Error('taken');
      const coupleRef = await Promise.race([
        db.collection('couples').add({
          userA: myId(), userB: partnerDoc.id,
          startDate: new Date().toISOString().slice(0,10), createdAt: Date.now(),
        }),
        mkTimeout(15000),
      ]);
      const batch = db.batch();
      batch.update(db.collection('users').doc(myId()),         { partnerId: partnerDoc.id, coupleId: coupleRef.id });
      batch.update(db.collection('users').doc(partnerDoc.id),  { partnerId: myId(),        coupleId: coupleRef.id });
      await Promise.race([ batch.commit(), mkTimeout(15000) ]);
      // Directly populate state and start the app — don't rely solely on the
      // watchUserDoc onSnapshot to fire, which can be unreliable after a batch write.
      const coupleSnap = await Promise.race([
        db.collection('couples').doc(coupleRef.id).get(),
        mkTimeout(15000),
      ]);
      if (!coupleSnap.exists) throw new Error('couple-missing');
      state.myProfile      = { ...(state.myProfile || {}), coupleId: coupleRef.id, partnerId: partnerDoc.id };
      state.coupleDoc      = { id: coupleSnap.id, ...coupleSnap.data() };
      state.partnerProfile = { id: partnerDoc.id, ...partnerDoc.data() };
      await startApp();
    } catch (err) {
      connectBtn.disabled = false; connectBtn.textContent = 'Connect ♡';
      const msgs = {
        'not-found':                    "That code doesn't exist.",
        'own':                          "That's your own code 😊 Share it with your partner.",
        'taken':                        'That person is already paired.',
        'couple-missing':              'Pairing failed. Please try again.',
        'auth/network-request-failed': 'Network error — check your connection and try again.',
      };
      showErr(msgs[err.message] || msgs[err.code] || 'Something went wrong. Try again.');
    }
  }
  function showErr(msg) { errorEl.textContent = msg; errorEl.style.display = ''; }

  let copyLabel = 'Copy code';
  const copyBtn = h('button', { class: 'pair-code-copy', onClick: () => {
    navigator.clipboard?.writeText(code).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = copyLabel; }, 2000); }).catch(()=>{});
  }}, copyLabel);

  showAuthOverlay(h('div', { class: 'pair-card' },
    h('h2', { class: 'pair-title' }, 'find your person'),
    h('p', { class: 'pair-sub' }, 'Share your invite code, or enter your partner\'s.'),
    h('div', { class: 'pair-code-box' },
      h('div', { class: 'pair-code-label' }, 'your invite code'),
      h('div', { class: 'pair-code-value' }, code),
      copyBtn,
    ),
    h('p', { class: 'pair-divider' }, 'or enter theirs'),
    errorEl,
    codeIn,
    connectBtn,
    h('div', { class: 'pair-logout' }, h('button', { onClick: () => auth.signOut() }, 'Sign out')),
  ));

  codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') connect(); });
  codeIn.addEventListener('input',   () => { codeIn.value = codeIn.value.toUpperCase(); });
}

async function startApp() {
  console.log('[startApp] hiding auth overlay...');
  hideAuthOverlay();
  console.log('[startApp] showing appLayout...');
  byId('appLayout').hidden = false;
  console.log('[startApp] renderSidebar...');
  try { renderSidebar(); } catch(e) { console.error('[startApp] renderSidebar threw:', e); }
  console.log('[startApp] startListeners...');
  if (myId() !== 'dev-user') { try { startListeners(); } catch(e) { console.error('[startApp] startListeners threw:', e); } requestPushPermission(); }

  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('state') === 'sp') {
    history.replaceState({}, '', location.pathname);
    if (urlParams.get('error')) {
      localStorage.setItem('sp-auth-error', urlParams.get('error'));
    } else if (urlParams.get('code')) {
      const ok = await spExchangeCode(urlParams.get('code')).catch(() => false);
      if (!ok) localStorage.setItem('sp-auth-error', 'token_exchange_failed');
    }
    console.log('[startApp] navigating to music...');
    navigateTo('music');
  } else {
    console.log('[startApp] navigating to feed...');
    navigateTo('feed');
  }
  console.log('[startApp] done');
  if (spIsAuthed()) spInitPlayer().catch(() => {});
}

async function requestPushPermission() {
  if (!messaging || !VAPID_KEY || VAPID_KEY === 'YOUR_VAPID_KEY') return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const token = await messaging.getToken({ vapidKey: VAPID_KEY });
    if (token && myId()) db.collection('users').doc(myId()).update({ fcmToken: token }).catch(() => {});
  } catch {}
}

/* ════════════════════════════════════════════
   NOTIFICATION PANEL
════════════════════════════════════════════ */
function openNotifPanel() {
  renderNotifPanel();
  const panel    = byId('notifPanel');
  const backdrop = byId('notifBackdrop');
  panel.hidden = false; backdrop.hidden = false;
  requestAnimationFrame(() => { panel.classList.add('open'); backdrop.classList.add('visible'); });
}

function closeNotifPanel() {
  const panel = byId('notifPanel'), backdrop = byId('notifBackdrop');
  panel.classList.remove('open'); backdrop.classList.remove('visible');
  setTimeout(() => { panel.hidden = true; backdrop.hidden = true; }, 320);
}

function renderNotifPanel() {
  const list = byId('notifList');
  if (!list) return;
  list.innerHTML = '';
  if (!state.notifications.length) {
    list.append(h('div', { class: 'notif-empty' }, '✉️ Nothing yet —\nyour partner hasn\'t done anything interesting.'));
    return;
  }
  const icons = { message: '💬', comment: '💬', post: '📸', reaction: '❤️', thinking: '🫶', memory: '🌿', song: '🎵' };
  state.notifications.forEach(n => {
    const from  = personById(n.fromUid);
    const names = { message: `${from?.name ?? 'Someone'} sent a message`, comment: `${from?.name ?? 'Someone'} commented`,
      post: `${from?.name ?? 'Someone'} shared a moment`,
      reaction: `${from?.name ?? 'Someone'} reacted`, thinking: `${from?.name ?? 'Someone'} is thinking of you`,
      memory: `${from?.name ?? 'Someone'} added a memory`, song: `${from?.name ?? 'Someone'} shared a song` };
    const item = h('div', { class: `notif-item${n.read ? '' : ' unread'}` },
      h('div', { class: 'notif-item-icon' }, icons[n.type] ?? '📩'),
      h('div', { class: 'notif-item-body' },
        h('div', { class: 'notif-item-text' }, names[n.type] ?? 'New activity'),
        n.preview ? h('div', { class: 'notif-item-preview' }, n.preview) : null,
      ),
      h('div', { class: 'notif-item-time' }, timeAgo(n.date)),
      !n.read ? h('div', { class: 'notif-dot' }) : null,
    );
    item.addEventListener('click', () => {
      db.collection('notifications').doc(n.id).update({ read: true }).catch(() => {});
      closeNotifPanel();
      if (n.targetView) navigateTo(n.targetView);
    });
    list.append(item);
  });
}

function markAllNotifsRead() {
  const batch = db.batch();
  state.notifications.filter(n => !n.read).forEach(n =>
    batch.update(db.collection('notifications').doc(n.id), { read: true }));
  batch.commit().catch(() => {});
}

/* ════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════ */
function renderSidebar() {
  const footer = byId('sidebarFooter');
  if (!footer) return;
  footer.innerHTML = '';
  const person = me();
  if (!person) return;
  const count = state.notifications.filter(n => !n.read).length;
  const bellBtn = h('button', { class: 'sidebar-notif-btn', title: 'Notifications', onClick: openNotifPanel },
    h('span', {}, '🔔'),
    h('span', {}, 'Notifications'),
    count > 0 ? h('span', { class: 'nav-badge' }, count > 9 ? '9+' : String(count)) : null,
  );
  const profileBtn = h('button', { class: 'sidebar-user-card', onClick: () => navigateTo('profile') },
    mkavatar(myId(), 'sm'),
    h('div', {},
      h('span', { class: 'sidebar-user-name' }, person.name),
      h('span', { class: 'sidebar-user-hint' }, them() ? `with ${them().name}` : 'waiting for partner'),
    ),
  );
  footer.append(bellBtn, profileBtn);
}

/* ════════════════════════════════════════════
   CHECK-IN WIDGET
════════════════════════════════════════════ */
function todayKey(uid) { return `${new Date().toISOString().slice(0, 10)}:${uid}`; }

function buildCheckinWidget() {
  const meUid   = myId();
  const themUid = them()?.id;
  const myCI    = state.checkins[todayKey(meUid)];
  const theirCI = themUid ? state.checkins[todayKey(themUid)] : null;
  const wrap    = h('div', { class: 'checkin-card' });

  if (theirCI) {
    const mood = MOODS.find(m => m.label === theirCI.mood) || MOODS[0];
    wrap.append(h('div', { class: 'ci-them-row' },
      mkavatar(themUid, 'sm'),
      h('div', { class: 'ci-them-info' },
        h('span', { class: 'ci-them-name' }, them()?.name ?? ''),
        h('span', { class: 'ci-them-mood' }, `feeling ${mood.emoji} ${mood.label}`),
        theirCI.note ? h('span', { class: 'ci-them-note' }, `"${theirCI.note}"`) : null,
      ),
    ));
  }

  if (myCI) {
    const mood = MOODS.find(m => m.label === myCI.mood) || MOODS[0];
    wrap.append(h('div', { class: 'ci-me-done' },
      h('span', { class: 'ci-me-emoji' }, mood.emoji),
      h('div', { class: 'ci-me-text' },
        h('span', { class: 'ci-me-label' }, `you're feeling ${mood.label}`),
        myCI.note ? h('span', { class: 'ci-me-note' }, `"${myCI.note}"`) : null,
      ),
      h('button', { class: 'ci-change', onClick: () => {
        const today = new Date().toISOString().slice(0,10);
        db.collection('checkins').where('coupleId','==',coupleId()).where('author','==',meUid).where('date','==',today)
          .get().then(snap => snap.forEach(d => d.ref.delete())).catch(() => {});
      }}, 'change'),
    ));
  } else {
    let selectedMood = null;
    const noteWrap  = h('div', { class: 'ci-note-wrap' });
    const noteIn    = h('input', { class: 'ci-note-in', type: 'text', maxlength: '80', placeholder: 'add a note… (optional)' });
    noteWrap.append(noteIn);
    const submitBtn = h('button', { class: 'ci-submit', onClick: submit }, 'how are you feeling today?');
    const picker    = h('div', { class: 'checkin-moods' });
    MOODS.forEach(m => {
      const btn = h('button', { class: 'checkin-mood-btn', onClick: () => {
        picker.querySelectorAll('.checkin-mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMood = m.label;
        noteWrap.classList.add('visible');
        submitBtn.textContent = `check in as ${m.emoji} ${m.label}`;
        submitBtn.classList.add('ready');
        noteIn.focus();
      }}, h('span', { class: 'ci-emoji' }, m.emoji), h('span', { class: 'ci-label' }, m.label));
      picker.append(btn);
    });
    function submit() {
      if (!selectedMood) return;
      db.collection('checkins').add({
        coupleId: coupleId(), author: meUid, mood: selectedMood,
        note: noteIn.value.trim(), date: new Date().toISOString().slice(0,10),
      }).catch(() => {});
    }
    noteIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    wrap.append(picker, noteWrap, submitBtn);
  }
  return wrap;
}

/* ════════════════════════════════════════════
   VIEW: FEED
════════════════════════════════════════════ */
function renderFeed(container) {
  const wrap = h('div', { class: 'view-wrap' });
  wrap.append(h('div', { class: 'feed-header' }, h('h1', { class: 'view-title' }, 'feed')));
  wrap.append(buildCheckinWidget());
  wrap.append(buildComposer());

  if (!state.posts.length) {
    wrap.append(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-icon' }, '📷'),
      h('h3', {}, 'Nothing here yet'),
      h('p',  {}, 'Add your first moment above.'),
    ));
  } else {
    state.posts.forEach((post, i) => {
      const card = buildPostCard(post);
      card.style.animationDelay = `${i * 45}ms`;
      wrap.append(card);
    });
  }
  container.append(wrap);
}

function buildComposer() {
  const body     = h('div', { class: 'composer-body' });
  const imgInput = h('input', { class: 'field-input', type: 'url', placeholder: 'Image URL (optional)' });
  const txtInput = h('textarea', { class: 'field-input', rows: '3', maxlength: '500', placeholder: 'What happened today?' });
  const postingAs = h('p', { class: 'composer-posting-as' }, `Posting as ${me()?.name ?? ''}`);

  function open() {
    body.classList.add('open');
    postingAs.textContent = `Posting as ${me()?.name ?? ''}`;
    txtInput.focus();
  }

  function close() {
    body.classList.remove('open');
    imgInput.value = '';
    txtInput.value = '';
  }

  function submit() {
    const caption = txtInput.value.trim();
    if (!caption) { txtInput.focus(); return; }
    db.collection('posts').add({
      coupleId: coupleId(), author: myId(),
      imageUrl: imgInput.value.trim(), caption,
      date: new Date().toISOString(), likes: [], reactions: {}, comments: [],
    }).then(() => sendNotif('post', caption.slice(0, 60), 'feed')).catch(() => {});
    close();
  }

  body.append(
    h('div', {}, h('label', { class: 'field-label' }, 'Image'), imgInput),
    h('div', {}, h('label', { class: 'field-label' }, 'Caption'), txtInput),
    h('div', { class: 'composer-actions' },
      postingAs,
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn-ghost', onClick: close }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onClick: submit }, 'Post'),
      ),
    ),
  );

  const placeholder = h('div', { class: 'composer-placeholder', role: 'button', tabindex: '0',
    onClick: open, onKeydown: e => { if (e.key === 'Enter') open(); } }, 'Share a moment…');

  return h('div', { class: 'composer-card' },
    h('div', { class: 'composer-trigger' }, mkavatar(myId(), 'sm'), placeholder),
    body,
  );
}

function buildPostCard(post) {
  const person = personById(post.author);
  const isOwn  = post.author === myId();
  const likes  = Array.isArray(post.likes) ? post.likes : [];
  const isLiked = likes.includes(myId());

  const likeCountNode = document.createTextNode(likes.length > 0 ? String(likes.length) : '');
  const heartSvg = mksvg(SVG.heart, '');

  const likeBtn = h('button', {
    class: `like-btn${isLiked ? ' liked' : ''}`,
    'aria-label': isLiked ? 'Unlike' : 'Like',
    onClick: () => handleLike(post.id, likeBtn, likeCountNode),
  }, heartSvg, likeCountNode);

  const commentsSection = buildCommentsSection(post);
  if (state.openComments.has(post.id)) commentsSection.classList.add('open');

  const commentCount = (post.comments ?? []).length;
  const commentToggle = h('button', {
    class: 'comment-toggle',
    onClick: () => {
      state.openComments[state.openComments.has(post.id) ? 'delete' : 'add'](post.id);
      commentsSection.classList.toggle('open', state.openComments.has(post.id));
    },
  }, mksvg(SVG.comment, ''), commentCount > 0 ? String(commentCount) : 'Comment');

  const footer = h('div', { class: 'post-footer' },
    h('div', { class: 'post-actions' },
      likeBtn, commentToggle,
      isOwn ? h('button', { class: 'post-delete', onClick: () => deletePost(post.id) }, 'Delete') : null,
    ),
    buildReactionsRow(post),
    commentsSection,
  );

  let imageEl = null;
  if (post.imageUrl) {
    const img = h('img', { class: 'post-image', src: post.imageUrl, alt: '', loading: 'lazy', style: { cursor: 'zoom-in' } });
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'post-image-broken' }, 'Image failed to load')));
    img.addEventListener('click', () => openLightbox(post.imageUrl));
    imageEl = img;
  }

  const hasImage = !!post.imageUrl;
  const captionEl = h('p', { class: hasImage ? 'post-caption' : 'post-caption post-caption-large' }, post.caption);

  return h('article', { class: 'post-card', 'data-post-id': post.id },
    h('div', { class: 'post-header' },
      mkavatar(post.author, 'sm'),
      h('div', {},
        h('div', { class: 'post-author-name' }, person?.name ?? 'Unknown'),
        h('div', { class: 'post-meta' }, timeAgo(post.date)),
      ),
    ),
    imageEl,
    hasImage ? h('div', { class: 'post-body', style: { padding: '14px 18px 6px' } }, captionEl) : captionEl,
    footer,
  );
}

function buildCommentsSection(post) {
  const section = h('div', { class: 'comments-section' });

  function render() {
    section.innerHTML = '';
    (post.comments ?? []).forEach(c => {
      section.append(h('div', { class: 'comment-item' },
        mkavatar(c.author, 'sm'),
        h('div', { class: 'comment-bubble' },
          h('div', { class: 'comment-author' }, personById(c.author)?.name ?? 'Someone'),
          h('div', { class: 'comment-text'   }, c.text),
        ),
      ));
    });
    const inp = h('input', { class: 'comment-input', type: 'text', maxlength: '200', placeholder: 'Write a comment…' });
    const btn = h('button', { class: 'comment-send', onClick: send }, 'Send');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    function send() {
      const text = inp.value.trim();
      if (!text) return;
      const comment = { id: crypto.randomUUID(), author: myId(), text };
      const newComments = [...(post.comments ?? []), comment];
      db.collection('posts').doc(post.id).update({ comments: newComments }).catch(() => {});
      post.comments = newComments;
      if (post.author !== myId()) sendNotif('comment', text.slice(0, 60), 'feed');
      render();
    }
    section.append(h('div', { class: 'comment-form' }, mkavatar(myId(), 'sm'), inp, btn));
  }

  render();
  return section;
}

function handleLike(postId, btn, countNode) {
  const post  = state.posts.find(p => p.id === postId);
  if (!post) return;
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const liked = likes.includes(myId());
  const update = liked
    ? { likes: FieldValue.arrayRemove(myId()) }
    : { likes: FieldValue.arrayUnion(myId()) };
  db.collection('posts').doc(postId).update(update).catch(() => {});
  // Optimistic UI
  if (liked) {
    btn.classList.remove('liked');
    countNode.textContent = likes.length - 1 > 0 ? String(likes.length - 1) : '';
  } else {
    btn.classList.add('liked', 'pop');
    btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
    countNode.textContent = String(likes.length + 1);
    if (post.author !== myId()) sendNotif('reaction', null, 'feed');
  }
}

function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  db.collection('posts').doc(postId).delete().catch(() => {});
}

/* ════════════════════════════════════════════
   REACTIONS
════════════════════════════════════════════ */
function buildReactionsRow(post) {
  const row = h('div', { class: 'reactions-row' });
  renderReactionBtns(row, post);
  return row;
}

function renderReactionBtns(row, post) {
  row.innerHTML = '';
  const rxns = post.reactions || {};
  EMOJI_SET.forEach(emoji => {
    const uids    = Object.entries(rxns).filter(([, e]) => e === emoji).map(([uid]) => uid);
    const reacted = uids.includes(myId());
    const count   = uids.length;
    row.append(h('button', {
      class: `reaction-btn${reacted ? ' reacted' : ''}`,
      onClick: () => toggleReaction(post.id, emoji),
      'aria-label': `${emoji}${count ? ' ' + count : ''}`,
    }, emoji, count > 0 ? h('span', { class: 'reaction-count' }, String(count)) : null));
  });
}

function toggleReaction(postId, emoji) {
  const post  = state.posts.find(p => p.id === postId);
  if (!post) return;
  const rxns   = { ...(post.reactions || {}) };
  const reacted = rxns[myId()] === emoji;
  if (reacted) delete rxns[myId()];
  else { rxns[myId()] = emoji; if (post.author !== myId()) sendNotif('reaction', null, 'feed'); }
  db.collection('posts').doc(postId).update({ reactions: rxns }).catch(() => {});
  // Optimistic
  post.reactions = rxns;
  const row = document.querySelector(`[data-post-id="${postId}"] .reactions-row`);
  if (row) renderReactionBtns(row, post);
}

/* ════════════════════════════════════════════
   LIGHTBOX
════════════════════════════════════════════ */
function openLightbox(src) {
  byId('lightboxImg').src = src;
  byId('lightbox').hidden = false;
  document.documentElement.style.overflow = 'hidden';
}

function closeLightbox() {
  byId('lightbox').hidden = true;
  byId('lightboxImg').src = '';
  document.documentElement.style.overflow = '';
}

/* ════════════════════════════════════════════
   VOICE NOTES
════════════════════════════════════════════ */
function buildVoicePlayer(audioData) {
  const audio  = new Audio();
  const BARS   = 34;
  let playing  = false;

  const seed = audioData.length % 997;
  const heights = Array.from({ length: BARS }, (_, i) =>
    Math.max(14, Math.min(88, Math.round(
      50 + Math.sin((i + seed * 0.07) * 0.65) * 28 + Math.sin(i * 1.4 + 1) * 18,
    ))),
  );

  const waveEl = h('div', { class: 'vn-wave' });
  heights.forEach(pct => waveEl.append(h('div', { class: 'vn-bar', style: { height: `${pct}%` } })));

  const timeEl = h('span', { class: 'vn-time' }, '–:––');
  const playEl = h('button', { class: 'vn-play', 'aria-label': 'Play' });
  playEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M8 5v14l11-7z"/></svg>';

  const player = h('div', { class: 'vn-player' }, playEl, waveEl, timeEl);

  function fmt(s) { return !isFinite(s) || s < 0 ? '–:––' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  function updateBars() {
    const pct = audio.duration ? audio.currentTime / audio.duration : 0;
    waveEl.querySelectorAll('.vn-bar').forEach((b, i) => b.classList.toggle('played', i / BARS < pct));
  }

  function setIcon(pause) {
    playEl.innerHTML = pause
      ? '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M8 5v14l11-7z"/></svg>';
  }

  audio.onloadedmetadata = () => { timeEl.textContent = fmt(audio.duration); };
  audio.ontimeupdate     = () => { if (playing) { timeEl.textContent = fmt(audio.currentTime); updateBars(); } };
  audio.onended = () => {
    playing = false; setIcon(false); playEl.classList.remove('is-playing');
    timeEl.textContent = fmt(audio.duration); updateBars();
  };

  playEl.onclick = () => {
    if (!audio.src) { audio.preload = 'auto'; audio.src = audioData; }
    if (playing) {
      audio.pause(); playing = false; setIcon(false); playEl.classList.remove('is-playing');
    } else {
      audio.play().catch(() => {}); playing = true; setIcon(true); playEl.classList.add('is-playing');
    }
  };

  setTimeout(() => { if (!audio.src) { audio.preload = 'metadata'; audio.src = audioData; } }, 600);
  return player;
}

function buildMicButton(msgList) {
  let recorder    = null;
  let chunks      = [];
  let recording   = false;
  let stream      = null;

  const btn = h('button', { class: 'mic-btn', 'aria-label': 'Record voice note', title: 'Hold to record' }, '🎙');

  async function startRecording() {
    if (recording) return;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { alert('Microphone access denied.'); return; }
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size > 750000) { alert('Recording too long — keep it under ~30s.'); stream.getTracks().forEach(t => t.stop()); return; }
      const reader = new FileReader();
      reader.onload = e2 => {
        db.collection('messages').add({
          coupleId: coupleId(), author: myId(),
          text: '🎙 Voice note', type: 'voice',
          audioData: e2.target.result, date: new Date().toISOString(),
        }).then(() => sendNotif('message', '🎙 Voice note', 'chat')).catch(() => {});
        stream.getTracks().forEach(t => t.stop());
        recording = false; btn.classList.remove('recording'); btn.setAttribute('aria-label', 'Record voice note');
      };
      reader.readAsDataURL(blob);
    };
    recorder.start();
    recording = true; btn.classList.add('recording'); btn.setAttribute('aria-label', 'Stop recording');
  }

  function stopRecording() { if (!recording || !recorder) return; recorder.stop(); }
  btn.addEventListener('mousedown', startRecording);
  btn.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); }, { passive: false });
  btn.addEventListener('mouseup',   stopRecording);
  btn.addEventListener('touchend',  stopRecording);
  btn.addEventListener('mouseleave', stopRecording);
  return btn;
}

/* ════════════════════════════════════════════
   VIEW: CHAT
════════════════════════════════════════════ */
function sendMsg(textarea, msgList) {
  const text = textarea.value.trim();
  if (!text) return;
  textarea.value = '';
  textarea.style.height = 'auto';
  db.collection('messages').add({
    coupleId: coupleId(), author: myId(), text, date: new Date().toISOString(),
  }).then(() => sendNotif('message', text.slice(0, 60), 'chat')).catch(() => {});
}

function renderChat(container) {
  const layout = h('div', { class: 'chat-layout' });
  const avs = h('div', { class: 'chat-topbar-avatars' });
  if (myId())        avs.append(mkavatar(myId(), 'sm'));
  if (them()?.id)    avs.append(mkavatar(them().id, 'sm'));

  layout.append(h('div', { class: 'chat-topbar' },
    avs,
    h('div', {},
      h('div', { class: 'chat-topbar-title' }, me()?.name && them()?.name ? `${me().name} & ${them().name}` : 'chat'),
      h('div', { class: 'chat-topbar-sub' }, `Posting as ${me()?.name ?? '…'} · private`),
    ),
  ));

  const msgList = h('div', { class: 'chat-messages', id: 'chatMessages' });
  renderMessages(msgList);
  layout.append(msgList);

  const textarea = h('textarea', { class: 'chat-textarea', rows: '1', placeholder: 'Message…' });
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  });
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(textarea, msgList); }
  });

  const sendBtn = h('button', { class: 'chat-send', 'aria-label': 'Send', onClick: () => sendMsg(textarea, msgList) });
  sendBtn.append(mksvg(SVG.send, ''));
  const micBtn = buildMicButton(msgList);

  const thinkBtn = h('button', {
    class: 'btn-thinking', title: 'Send a "thinking of you"', 'aria-label': 'Thinking of you',
    onClick: () => {
      const text = THINKING[Math.floor(Math.random() * THINKING.length)];
      db.collection('messages').add({
        coupleId: coupleId(), author: myId(), text, date: new Date().toISOString(),
      }).then(() => sendNotif('thinking', text, 'chat')).catch(() => {});
    },
  }, '♡');

  layout.append(
    h('div', { class: 'chat-input-area' },
      h('div', { class: 'chat-input-bar' }, mkavatar(myId(), 'sm'), thinkBtn, textarea, micBtn, sendBtn),
    ),
  );

  container.append(layout);
  requestAnimationFrame(() => { msgList.scrollTop = msgList.scrollHeight; textarea.focus(); });
}

function renderMessages(container) {
  container.innerHTML = '';
  let lastDay = '', lastAuthor = '';

  state.messages.forEach(msg => {
    const day = formatDay(msg.date);
    if (day !== lastDay) { container.append(h('div', { class: 'date-sep' }, day)); lastDay = day; lastAuthor = ''; }

    const isMe     = msg.author === myId();
    const newGroup = msg.author !== lastAuthor;
    const cls      = `msg ${isMe ? 'msg-r' : 'msg-l'}${newGroup ? ' msg-gap' : ''}`;

    let bubbleContent;
    if (msg.type === 'song' && msg.embedId && msg.embedType) {
      bubbleContent = h('div', { class: 'msg-song-bubble' },
        buildSpotifyEmbed(msg.embedType, msg.embedId, true),
        msg.text && !msg.text.startsWith('🎵 http') ? h('p', { class: 'msg-song-note' }, msg.text) : null,
      );
    } else if (msg.type === 'voice' && msg.audioData) {
      bubbleContent = buildVoicePlayer(msg.audioData);
    } else {
      bubbleContent = h('div', { class: 'msg-bubble' }, msg.text);
    }

    const meta     = h('div', { class: 'msg-time' }, formatTime(msg.date));
    const spacer   = h('div', { class: 'msg-spacer' });
    const avatarEl = newGroup ? mkavatar(msg.author, 'sm') : spacer;

    let msgEl;
    if (isMe) {
      msgEl = h('div', { class: cls },
        h('div', { class: 'msg-row' }, bubbleContent),
        meta,
      );
    } else {
      msgEl = h('div', { class: cls },
        h('div', { class: 'msg-row' }, avatarEl, bubbleContent),
        meta,
      );
    }
    container.append(msgEl);
    lastAuthor = msg.author;
  });
}

/* ════════════════════════════════════════════
   VIEW: MEMORIES
════════════════════════════════════════════ */
function renderMemories(container) {
  const activeTab = state._memTab || 'memories';
  const wrap = h('div', { class: 'view-wrap-wide' });
  const tabBar = h('div', { class: 'mem-tabs' },
    h('button', { class: `mem-tab${activeTab === 'memories' ? ' active' : ''}`,
      onClick: () => { state._memTab = 'memories'; navigateTo('memories'); } }, '🌿 Memories'),
    h('button', { class: `mem-tab${activeTab === 'bucket' ? ' active' : ''}`,
      onClick: () => { state._memTab = 'bucket';   navigateTo('memories'); } }, '✓ Bucket List'),
  );
  wrap.append(tabBar);
  if (activeTab === 'bucket') renderBucketList(wrap);
  else renderMemoriesTab(wrap);
  container.append(wrap);
}

function renderMemoriesTab(wrap) {
  wrap.append(h('div', { class: 'memories-header' }, h('h1', { class: 'view-title' }, 'memories')));
  wrap.append(buildMemForm());

  const sorted = [...state.memories].sort((a, b) => b.createdAt - a.createdAt);

  if (!sorted.length) {
    wrap.append(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-icon' }, '🌿'),
      h('h3', {}, 'No memories yet'),
      h('p', {}, 'Capture a moment above.'),
    ));
  } else {
    const grid = h('div', { class: 'mem-grid' });
    sorted.forEach((mem, i) => {
      const tile = buildMemTile(mem);
      tile.style.setProperty('--d', `${Math.min(i * 40, 400)}ms`);
      grid.append(tile);
    });
    wrap.append(grid);
  }
}

function renderBucketList(wrap) {
  wrap.append(h('div', { class: 'memories-header' },
    h('h1', { class: 'view-title' }, 'bucket list'),
  ));

  // Add item
  const inp = h('input', { class: 'field-input bucket-add-input', type: 'text', maxlength: '140', placeholder: 'Add something to do together…' });
  const addBtn = h('button', { class: 'btn btn-primary', onClick: addBucketItem }, '+ Add');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') addBucketItem(); });

  function addBucketItem() {
    const text = inp.value.trim();
    if (!text) return;
    db.collection('bucket').add({ coupleId: coupleId(), text, done: false, createdAt: Date.now(), author: myId() }).catch(() => {});
    inp.value = '';
  }

  wrap.append(h('div', { class: 'bucket-add-row' }, inp, addBtn));

  const list = h('div', { class: 'bucket-list' });
  renderBucketItems(list);
  wrap.append(list);
}

function renderBucketItems(list) {
  list.innerHTML = '';
  if (!state.bucket.length) {
    list.append(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-icon' }, '🗺️'),
      h('h3', {}, 'Nothing yet'),
      h('p', {}, 'Add the things you want to do together.'),
    ));
    return;
  }

  const todo = state.bucket.filter(i => !i.done);
  const done = state.bucket.filter(i => i.done);

  [...todo, ...done].forEach(item => {
    const row = h('div', { class: `bucket-item${item.done ? ' bucket-done' : ''}` },
      h('button', {
        class: 'bucket-check', 'aria-label': item.done ? 'Mark undone' : 'Mark done',
        onClick: () => db.collection('bucket').doc(item.id).update({ done: !item.done }).catch(() => {}),
      }, item.done ? '✓' : '○'),
      h('span', { class: 'bucket-text' }, item.text),
      h('button', { class: 'mem-tile-del', onClick: () => db.collection('bucket').doc(item.id).delete().catch(() => {}) }, '✕'),
    );
    list.append(row);
  });
}

function buildMemForm() {
  let open = false;
  const formBody = h('div', { class: 'mem-form-body' });
  const titleIn  = h('input', { class: 'field-input', type: 'text', maxlength: '72', placeholder: 'Give it a title' });
  const detailsIn = h('textarea', { class: 'field-input', rows: '3', maxlength: '420', placeholder: 'What made this moment unforgettable?' });
  const moodSel  = h('select', { class: 'field-input' },
    ...['warm', 'playful', 'calm', 'wild', 'silly', 'grateful'].map(m =>
      h('option', { value: m }, m.charAt(0).toUpperCase() + m.slice(1))));
  const dateIn = h('input', { class: 'field-input', type: 'date' });
  dateIn.valueAsDate = new Date();

  function toggle() {
    open = !open;
    formBody.classList.toggle('open', open);
    addBtn.textContent = open ? 'Cancel' : '+ Add memory';
    if (open) titleIn.focus();
    else { titleIn.value = ''; detailsIn.value = ''; }
  }

  function submit() {
    const title   = titleIn.value.trim();
    const details = detailsIn.value.trim();
    if (!title || !details || !dateIn.value) { titleIn.focus(); return; }
    db.collection('memories').add({
      coupleId: coupleId(), author: myId(), title, details,
      mood: moodSel.value, date: dateIn.value, createdAt: Date.now(),
    }).then(() => sendNotif('memory', title, 'memories')).catch(() => {});
    toggle();
  }

  formBody.append(
    h('div', { class: 'mem-form-grid' },
      h('div', { class: 'mem-form-full' }, h('label', { class: 'field-label' }, 'Title'), titleIn),
      h('div', { class: 'mem-form-full' }, h('label', { class: 'field-label' }, 'Details'), detailsIn),
      h('div', {}, h('label', { class: 'field-label' }, 'Mood'), moodSel),
      h('div', {}, h('label', { class: 'field-label' }, 'Date'), dateIn),
    ),
    h('div', { class: 'mem-form-actions' }, h('button', { class: 'btn btn-primary', onClick: submit }, 'Save memory')),
  );

  const addBtn = h('button', { class: 'btn btn-primary', onClick: toggle }, '+ Add memory');
  return h('div', { class: 'mem-add-card' }, h('div', { class: 'mem-add-head' }, h('h3', {}, 'New memory'), addBtn), formBody);
}

function buildMemTile(mem) {
  const color = moodColor(mem.mood);
  return h('div', { class: 'mem-tile' },
    h('div', { class: 'mem-tile-mood' }, h('div', { class: 'mood-dot', style: { background: color } }), h('span', { class: 'mood-label' }, mem.mood)),
    h('h3', { class: 'mem-tile-title' }, mem.title),
    h('p',  { class: 'mem-tile-details' }, mem.details),
    h('div', { class: 'mem-tile-foot' },
      h('time', { class: 'mem-tile-date', datetime: mem.date },
        new Date(mem.date).toLocaleDateString(CONFIG.locale, { day: 'numeric', month: 'short', year: 'numeric' })),
      h('button', { class: 'mem-tile-del', onClick: () => deleteMem(mem.id) }, 'Delete'),
    ),
  );
}

function deleteMem(id) {
  if (!confirm('Delete this memory?')) return;
  db.collection('memories').doc(id).delete().catch(() => {});
}

/* ════════════════════════════════════════════
   VIEW: PROFILE
════════════════════════════════════════════ */
function renderProfile(container) {
  const wrap = h('div', { class: 'view-wrap-wide profile-view' });
  const myPosts    = state.posts.filter(p => p.author === myId()).length;
  const theirPosts = state.posts.filter(p => p.author === them()?.id).length;
  const myMsgs     = state.messages.filter(m => m.author === myId()).length;
  const theirMsgs  = state.messages.filter(m => m.author === them()?.id).length;

  const cards = h('div', { class: 'profile-grid' });
  cards.append(buildProfileCard(myId(), myPosts, myMsgs));
  if (them()) cards.append(buildProfileCard(them().id, theirPosts, theirMsgs));
  wrap.append(cards);
  if (them()) wrap.append(buildTogetherBanner());
  container.append(wrap);
}

function buildProfileCard(uid, posts, msgs) {
  const p    = personById(uid);
  const isMe = uid === myId();

  const avatarEl   = mkavatar(uid, 'xl');
  const avatarWrap = h('div', { class: 'profile-avatar-wrap' }, avatarEl);

  if (isMe) {
    const fileIn = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    fileIn.addEventListener('change', () => {
      const file = fileIn.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2 MB.'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        db.collection('users').doc(uid).update({ avatarData: e.target.result }).catch(() => {});
      };
      reader.readAsDataURL(file);
    });
    const editBadge = h('label', { class: 'avatar-edit-badge', title: 'Change photo' }, '📷');
    editBadge.append(fileIn);
    avatarWrap.append(editBadge);
    if (p?.avatarData) {
      avatarWrap.append(h('button', { class: 'avatar-remove-btn', title: 'Remove photo',
        onClick: () => db.collection('users').doc(uid).update({ avatarData: null }).catch(() => {}) }, '✕'));
    }
  }

  const nameEl = isMe
    ? buildEditableField('h2', p?.name ?? '', 'profile-name', val => {
        db.collection('users').doc(uid).update({ name: val || p?.name }).catch(() => {});
        renderSidebar();
      })
    : h('h2', { class: 'profile-name' }, p?.name ?? '');

  const bioEl = isMe
    ? buildEditableField('p', p?.bio ?? '', 'profile-bio', val => db.collection('users').doc(uid).update({ bio: val }).catch(() => {}))
    : h('p', { class: 'profile-bio' }, p?.bio ?? '');

  const colorDot = h('span', { class: 'profile-color-dot', style: { background: p?.color ?? '#888' } });

  return h('div', { class: 'profile-card' },
    avatarWrap,
    nameEl,
    h('div', { class: 'profile-color-row' }, colorDot, bioEl),
    isMe ? h('div', { class: 'profile-edit-hint' }, 'tap name or bio to edit') : null,
    h('div', { class: 'profile-stats' },
      h('div', { class: 'profile-stat' }, h('span', { class: 'profile-stat-n' }, String(posts)), h('span', { class: 'profile-stat-l' }, 'posts')),
      h('div', { class: 'profile-stat' }, h('span', { class: 'profile-stat-n' }, String(msgs)), h('span', { class: 'profile-stat-l' }, 'messages')),
    ),
    isMe ? h('button', { class: 'profile-signout', onClick: () => { if (confirm('Sign out?')) auth.signOut(); } }, 'Sign out') : null,
  );
}

function buildEditableField(tag, value, className, onSave) {
  const el = h(tag, { class: `${className} editable-field`, title: 'Tap to edit' }, value);
  el.addEventListener('click', () => {
    if (el.querySelector('input, textarea')) return;
    const isMultiline = tag === 'p';
    const inp = isMultiline ? h('textarea', { class: 'inline-edit-input', rows: '3' }) : h('input', { class: 'inline-edit-input', type: 'text' });
    inp.value = value;
    el.innerHTML = '';
    el.append(inp);
    inp.focus(); inp.select();
    function commit() { const val = inp.value.trim() || value; value = val; el.innerHTML = ''; el.textContent = val; onSave(val); }
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = value; inp.blur(); }
    });
  });
  return el;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function nextAnniversaryInfo() {
  const start  = new Date(state.coupleDoc?.startDate ?? new Date().toISOString().slice(0,10));
  const now    = new Date();
  const thisYr = new Date(now.getFullYear(), start.getMonth(), start.getDate());
  const isToday = thisYr.toDateString() === now.toDateString();
  const target  = (!isToday && thisYr < now)
    ? new Date(now.getFullYear() + 1, start.getMonth(), start.getDate())
    : thisYr;
  const num  = target.getFullYear() - start.getFullYear();
  const days = isToday ? 0 : Math.ceil((target - now) / 86400000);
  return { isToday, days, num };
}

function buildTogetherBanner() {
  const av1 = me()   ? mkavatar(myId(),    'md') : null;
  const av2 = them() ? mkavatar(them().id, 'md') : null;
  if (av2) av2.style.cssText = 'margin-left:-12px;border:2px solid var(--surface)';

  const anniv = nextAnniversaryInfo();
  const anniversaryEl = anniv.isToday
    ? h('div', { class: 'anniv-chip anniv-today' }, `🎉 Happy ${anniv.num}${ordinal(anniv.num)} anniversary!`)
    : h('div', { class: 'anniv-chip' }, `${anniv.days}d until anniversary #${anniv.num}`);

  const names = me()?.name && them()?.name ? `${me().name} & ${them().name}` : 'us';

  return h('div', { class: 'together-banner' },
    h('div', { class: 'together-avs' }, av1, av2),
    h('div', { class: 'together-info' },
      h('h3', {}, names),
      h('p',  {}, `${state.memories.length} memories saved together`),
      anniversaryEl,
    ),
    h('div', { class: 'together-days' },
      h('div', { class: 'together-days-n' }, String(daysTogether())),
      h('div', { class: 'together-days-l' }, 'days together'),
    ),
  );
}

/* ════════════════════════════════════════════
   SPOTIFY PREMIUM — PKCE AUTH + SEARCH + SDK
════════════════════════════════════════════ */
const SP = {
  SCOPES:  'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
  SDK_URL: 'https://sdk.scdn.co/spotify-player.js',
  API:     'https://api.spotify.com/v1',
  AUTH:    'https://accounts.spotify.com',
};

function spClientId()   { return '268bd358b5b0411aacd9c8ae3dc29205'; }
function spRedirectUri() {
  const base = location.pathname.endsWith('index.html') ? location.pathname.slice(0, -10) : location.pathname;
  const origin = location.origin.replace('localhost', '127.0.0.1');
  return origin + base;
}
function spStoredTok()   { try { return JSON.parse(localStorage.getItem('sp-token') || 'null'); } catch { return null; } }
function spIsAuthed()    { return !!(spStoredTok()?.access_token); }

async function spGetToken() {
  const t = spStoredTok();
  if (!t) return null;
  if (Date.now() < t.expires_at - 60000) return t.access_token;
  return spRefreshToken(t);
}

async function spRefreshToken(t) {
  const cid = spClientId();
  if (!t?.refresh_token || !cid) { localStorage.removeItem('sp-token'); return null; }
  const res = await fetch(`${SP.AUTH}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  if (!res.ok) { localStorage.removeItem('sp-token'); return null; }
  const d = await res.json();
  const tok = { access_token: d.access_token, refresh_token: d.refresh_token || t.refresh_token, expires_at: Date.now() + d.expires_in * 1000 };
  localStorage.setItem('sp-token', JSON.stringify(tok));
  return tok.access_token;
}

async function spLogin() {
  const cid = spClientId();
  if (!cid) { alert('Enter your Spotify Client ID first.'); return; }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)), b => chars[b % 62]).join('');
  const digest   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  localStorage.setItem('sp-verifier', verifier);
  const params = new URLSearchParams({
    client_id: cid, response_type: 'code', redirect_uri: spRedirectUri(),
    scope: SP.SCOPES, code_challenge_method: 'S256', code_challenge: challenge, state: 'sp',
  });
  location.href = `${SP.AUTH}/authorize?${params}`;
}

async function spExchangeCode(code) {
  const cid = spClientId();
  const verifier = localStorage.getItem('sp-verifier');
  if (!cid || !verifier) return false;
  const res = await fetch(`${SP.AUTH}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, grant_type: 'authorization_code', code, redirect_uri: spRedirectUri(), code_verifier: verifier }),
  });
  if (!res.ok) return false;  // keep verifier so user can retry
  localStorage.removeItem('sp-verifier');  // only remove on success
  const d = await res.json();
  localStorage.setItem('sp-token', JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + d.expires_in * 1000 }));
  return true;
}

async function spFetch(url, opts = {}) {
  const token = await spGetToken();
  if (!token) throw new Error('no-token');
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (res.status === 204) return null;
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `sp-${res.status}`); }
  return res.json();
}

async function spSearch(q) {
  const params = new URLSearchParams({ q, type: 'track', limit: 6 });
  const d = await spFetch(`${SP.API}/search?${params}`);
  return d?.tracks?.items || [];
}

async function spPlay(uri) {
  if (!state.spDeviceId) { alert('Spotify player is warming up — try again in a moment.'); return; }
  await spFetch(`${SP.API}/me/player/play?device_id=${state.spDeviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri] }),
  });
}

function spLoadSDK() {
  return new Promise(resolve => {
    if (window.Spotify) { resolve(); return; }
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement('script');
    s.src = SP.SDK_URL;
    document.head.append(s);
  });
}

async function spInitPlayer() {
  if (!spIsAuthed()) return;
  try {
    await spLoadSDK();
    const player = new Spotify.Player({
      name: 'ours.',
      getOAuthToken: async cb => { const t = await spGetToken(); cb(t || ''); },
      volume: 0.8,
    });
    player.addListener('ready', ({ device_id }) => { state.spDeviceId = device_id; });
    player.addListener('not_ready', () => { state.spDeviceId = null; });
    player.addListener('player_state_changed', s => { state.spPlayerState = s; });
    await player.connect();
    state.spPlayer = player;
  } catch { /* non-premium or SDK blocked */ }
}

/* ═══════════════════════════════════════════
   SPOTIFY HELPERS
═══════════════════════════════════════════ */
// Extracts Spotify embed info from any share URL or URI
// Returns { type: 'track'|'album'|'playlist'|'episode', id } or null
function parseSpotifyUrl(raw) {
  raw = raw.trim();
  // Handle spotify:track:ID URIs
  const uriMatch = raw.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]+)$/);
  if (uriMatch) return { type: uriMatch[1], id: uriMatch[2] };
  // Handle open.spotify.com/... URLs
  try {
    const url = new URL(raw);
    if (!url.hostname.includes('spotify.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    // parts: ['track', 'ID', ...] or ['intl-xy', 'track', 'ID', ...]
    const typeIdx = parts.findIndex(p => ['track','album','playlist','episode'].includes(p));
    if (typeIdx < 0 || !parts[typeIdx + 1]) return null;
    return { type: parts[typeIdx], id: parts[typeIdx + 1].split('?')[0] };
  } catch { return null; }
}

function buildSpotifyEmbed(embedType, embedId, compact = false) {
  const height = compact ? 80 : (embedType === 'track' ? 80 : 352);
  const iframe = h('iframe', {
    src: `https://open.spotify.com/embed/${embedType}/${embedId}?utm_source=generator&theme=0`,
    width: '100%',
    height: String(height),
    frameborder: '0',
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    loading: 'lazy',
    style: { border: 'none', borderRadius: '12px', display: 'block' },
  });
  return iframe;
}

/* ═══════════════════════════════════════════
   VIEW: MUSIC
═══════════════════════════════════════════ */
function renderMusic(container) {
  const wrap = h('div', { class: 'view-wrap' });
  wrap.append(h('div', { class: 'feed-header' }, h('h1', { class: 'view-title' }, 'music')));

  const cid    = spClientId();
  const authed = spIsAuthed();

  if (!cid) {
    wrap.append(buildSpotifySetup());
  } else if (!authed) {
    wrap.append(buildSpotifyReconnect());
    wrap.append(buildSongComposer()); // paste-URL fallback
  } else {
    wrap.append(buildSpotifySearch());
  }

  // Shared songs
  const sorted = [...state.songs].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sorted.length) {
    wrap.append(h('p', { class: 'song-section-label' }, 'shared songs'));
    sorted.forEach((song, i) => {
      const card = buildSongCard(song);
      card.style.animationDelay = `${i * 45}ms`;
      wrap.append(card);
    });
  } else if (authed) {
    wrap.append(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-icon' }, '🎵'),
      h('h3', {}, 'Nothing shared yet'),
      h('p', {}, 'Search a song above and share it.'),
    ));
  }

  container.append(wrap);
}

function buildSpotifySetup() {
  // Client ID is hardcoded — only need redirect URI registered
  const authErr = localStorage.getItem('sp-auth-error');
  if (authErr) localStorage.removeItem('sp-auth-error');

  const currentUri  = spRedirectUri();
  const localhostUri = location.href.replace(location.hostname, 'localhost').split('?')[0].split('#')[0];
  const showBoth = localhostUri !== currentUri;

  function copyUri(uri) { navigator.clipboard?.writeText(uri).catch(() => {}); }

  const uriLines = [
    h('div', { class: 'sp-uri-row' },
      h('code', { class: 'sp-uri-code' }, currentUri),
      h('button', { class: 'sp-uri-copy', title: 'Copy', onClick: () => copyUri(currentUri) }, '⎘'),
    ),
  ];
  if (showBoth) {
    uriLines.push(
      h('div', { class: 'sp-uri-row' },
        h('code', { class: 'sp-uri-code' }, localhostUri),
        h('button', { class: 'sp-uri-copy', title: 'Copy', onClick: () => copyUri(localhostUri) }, '⎘'),
      ),
      h('p', { class: 'sp-uri-hint' }, 'Add both URIs if you open the app from different addresses.'),
    );
  }

  const errorEl = authErr
    ? h('div', { class: 'sp-auth-error' },
        authErr === 'token_exchange_failed'
          ? '⚠️ Token exchange failed — double-check that the redirect URI above is added exactly to your Spotify app settings.'
          : `⚠️ Spotify error: ${authErr}. Make sure the redirect URI is registered and your account is added to the app in development mode.`,
      )
    : null;

  return h('div', { class: 'sp-setup-card' },
    h('div', { class: 'sp-setup-logo' }, '🎵'),
    h('h3', {}, 'Connect Spotify'),
    h('p', { class: 'sp-setup-sub' }, 'One-time setup — add the redirect URI below to the Spotify app in the developer dashboard, then connect.'),
    errorEl,
    h('ol', { class: 'sp-setup-steps' },
      h('li', {},
        h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener noreferrer' }, 'Open your app'),
        ' in the Spotify Developer Dashboard → Edit Settings → Redirect URIs:',
        h('div', { class: 'sp-uri-list' }, ...uriLines),
      ),
      h('li', {}, 'Under "User Management", add your Spotify email address.'),
      h('li', {}, 'Save, then tap Connect below.'),
    ),
    h('button', { class: 'btn btn-primary', style: { marginTop: '4px' }, onClick: spLogin }, 'Connect →'),
  );
}

function buildSpotifyReconnect() {
  const authErr = localStorage.getItem('sp-auth-error');
  if (authErr) localStorage.removeItem('sp-auth-error');

  const errorEl = authErr
    ? h('div', { class: 'sp-auth-error' },
        authErr === 'token_exchange_failed'
          ? '⚠️ Token exchange failed — check that the redirect URI matches exactly in your Spotify app settings.'
          : `⚠️ Spotify error: ${authErr}`,
      )
    : null;

  return h('div', { class: 'sp-reconnect-card' },
    errorEl,
    h('span', { class: 'sp-reconnect-label' }, 'Not connected'),
    h('button', { class: 'sp-connect-btn', onClick: spLogin }, '🔗 Connect'),
    h('button', { class: 'sp-setup-reset', onClick: () => {
      localStorage.removeItem('sp-token');
      localStorage.removeItem('sp-verifier');
      navigateTo('music');
    }}, 'Reset'),
  );
}

function buildSpotifySearch() {
  const statusBar = h('div', { class: 'sp-status-bar' },
    h('span', { class: 'sp-status-dot' }),
    h('span', {}, 'Spotify connected'),
    h('button', { class: 'sp-disconnect', onClick: () => { localStorage.removeItem('sp-token'); navigateTo('music'); } }, 'Disconnect'),
  );

  let timer = null;
  const searchIn  = h('input', { class: 'sp-search-input field-input', type: 'search', placeholder: '🔍 Search a song or artist to share…' });
  const resultsEl = h('div', { class: 'sp-results' });

  searchIn.addEventListener('input', () => {
    clearTimeout(timer);
    resultsEl.innerHTML = '';
    if (!searchIn.value.trim()) return;
    timer = setTimeout(async () => {
      try {
        const tracks = await spSearch(searchIn.value.trim());
        resultsEl.innerHTML = '';
        if (!tracks.length) { resultsEl.append(h('p', { class: 'sp-no-results' }, 'No results found.')); return; }
        tracks.forEach(track => resultsEl.append(buildTrackResult(track)));
      } catch (err) {
        if (err.message === 'no-token') navigateTo('music');
      }
    }, 350);
  });

  return h('div', { class: 'sp-search-wrap' }, statusBar, searchIn, resultsEl);
}

function buildTrackResult(track) {
  const img     = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
  const artists = track.artists.map(a => a.name).join(', ');
  const artEl   = img
    ? h('img', { class: 'sp-res-art', src: img, alt: '', width: '44', height: '44' })
    : h('div', { class: 'sp-res-art sp-res-art-empty' }, '♪');

  return h('div', { class: 'sp-result' },
    artEl,
    h('div', { class: 'sp-res-info' },
      h('div', { class: 'sp-res-title' }, track.name),
      h('div', { class: 'sp-res-artist' }, artists),
    ),
    h('div', { class: 'sp-res-actions' },
      h('button', { class: 'sp-res-play', 'aria-label': 'Play', onClick: () => spPlay(track.uri).catch(() => {}) }, '▶'),
      h('button', { class: 'sp-res-share', onClick: () => shareTrack(track) }, 'Share'),
    ),
  );
}

function shareTrack(track) {
  db.collection('songs').add({
    coupleId: coupleId(), author: myId(),
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
    embedId:    track.id, embedType: 'track', note: '',
    date:       new Date().toISOString(),
    trackName:  track.name,
    trackArtists: track.artists.map(a => a.name).join(', '),
  }).then(() => sendNotif('song', track.name, 'music')).catch(() => {});
  navigateTo('music');
}

function buildSongComposer() {
  const body = h('div', { class: 'composer-body' });
  let parsed = null;
  const linkIn    = h('input', { class: 'field-input', type: 'url', placeholder: 'Paste Spotify link or URI…' });
  const noteIn    = h('textarea', { class: 'field-input', rows: '2', maxlength: '200', placeholder: 'Say something about it (optional)' });
  const previewWrap = h('div', { class: 'song-preview-wrap' });
  const errorEl   = h('p', { class: 'song-error', style: { display: 'none' } }, 'Not a valid Spotify link.');

  linkIn.addEventListener('input', () => {
    parsed = parseSpotifyUrl(linkIn.value);
    previewWrap.innerHTML = ''; errorEl.style.display = 'none';
    if (linkIn.value.trim() && !parsed) errorEl.style.display = '';
    else if (parsed) previewWrap.append(buildSpotifyEmbed(parsed.type, parsed.id));
  });

  function open()  { body.classList.add('open'); linkIn.focus(); }
  function close() { body.classList.remove('open'); linkIn.value = ''; noteIn.value = ''; previewWrap.innerHTML = ''; parsed = null; }

  function submit() {
    if (!parsed) { linkIn.focus(); return; }
    db.collection('songs').add({
      coupleId: coupleId(), author: myId(),
      spotifyUrl: linkIn.value.trim(),
      embedId:   parsed.id, embedType: parsed.type,
      note:      noteIn.value.trim(), date: new Date().toISOString(),
    }).then(() => sendNotif('song', noteIn.value.trim() || parsed.id, 'music')).catch(() => {});
    close();
  }

  body.append(
    h('div', {}, h('label', { class: 'field-label' }, 'Spotify link'), linkIn, errorEl),
    previewWrap,
    h('div', {}, h('label', { class: 'field-label' }, 'Note'), noteIn),
    h('div', { class: 'composer-actions' },
      h('p', { class: 'composer-posting-as' }, `Sharing as ${me()?.name ?? ''}`),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn-ghost', onClick: close }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onClick: submit }, 'Share'),
      ),
    ),
  );

  const placeholder = h('div', { class: 'composer-placeholder', role: 'button', tabindex: '0',
    onClick: open, onKeydown: e => { if (e.key === 'Enter') open(); } }, '🎵 Share a song…');

  return h('div', { class: 'composer-card' },
    h('div', { class: 'composer-trigger' }, mkavatar(myId(), 'sm'), placeholder),
    body,
  );
}

function buildSongCard(song) {
  const person  = personById(song.author) || {};
  const isOwn   = song.author === myId();
  const display = song.trackName
    ? `${song.trackName}${song.trackArtists ? ' · ' + song.trackArtists : ''}`
    : song.embedType;

  const actions = [
    h('button', { class: 'song-send-chat', onClick: () => sendSongToChat(song) }, '💬 Chat'),
  ];
  if (spIsAuthed() && song.embedType === 'track') {
    actions.push(h('button', { class: 'song-send-chat sp-play-btn', onClick: () => spPlay(`spotify:track:${song.embedId}`).catch(() => {}) }, '▶ Play'));
  }
  if (isOwn) {
    actions.push(h('button', { class: 'post-delete', onClick: () => {
      if (!confirm('Remove this song?')) return;
      db.collection('songs').doc(song.id).delete().catch(() => {});
    }}, 'Delete'));
  }

  return h('article', { class: 'post-card song-card' },
    h('div', { class: 'post-header' },
      mkavatar(song.author, 'sm'),
      h('div', {},
        h('div', { class: 'post-author-name' }, person.name ?? song.author),
        h('div', { class: 'post-meta' }, `${display} · ${timeAgo(song.date)}`),
      ),
    ),
    h('div', { class: 'song-embed-wrap' }, buildSpotifyEmbed(song.embedType, song.embedId)),
    song.note ? h('p', { class: 'post-caption' }, song.note) : null,
    h('div', { class: 'post-footer' }, h('div', { class: 'post-actions' }, ...actions)),
  );
}

function sendSongToChat(song) {
  const text = `🎵 ${song.spotifyUrl}${song.note ? ' · ' + song.note : ''}`;
  db.collection('messages').add({
    coupleId: coupleId(), author: myId(), text,
    type: 'song', embedId: song.embedId, embedType: song.embedType,
    date: new Date().toISOString(),
  }).then(() => sendNotif('song', null, 'chat')).catch(() => {});
  navigateTo('chat');
}

/* ════════════════════════════════════════════
   SPLASH
════════════════════════════════════════════ */
function runSplash(onDone) {
  const splash = byId('splash');
  if (!splash) { onDone(() => {}); return; } // no-op removeSplash when element is absent

  // Show for 1.8s then fade out. The splash element stays in the DOM (invisible)
  // until the caller invokes the removeSplash callback, preventing a white-screen
  // gap while Firebase resolves the auth state.
  setTimeout(() => {
    splash.classList.add('splash-exit');
    let called = false;
    const finish = () => {
      if (called) return;
      called = true;
      onDone(() => splash.remove());
    };
    splash.addEventListener('transitionend', finish, { once: true });
    // Fallback: if transitionend never fires (e.g. prefers-reduced-motion disables transitions)
    // ensure the app still initialises after the CSS transition duration (600ms).
    setTimeout(finish, 700);
  }, 1800);
}

/* ═══════════════════════════════════════════
   AUTH STATE MACHINE
═══════════════════════════════════════════ */
function setupAuthListener(onReady) {
  let signOutTimer = null;

  auth.onAuthStateChanged(user => {
    console.log('[auth] onAuthStateChanged fired, user:', user ? user.uid : 'null');
    if (onReady) { onReady(); onReady = null; }

    if (!user) {
      // Firebase often fires null immediately after login during token refresh,
      // followed by the real user event milliseconds later. Debounce sign-out
      // handling so a transient null doesn't flash the login screen.
      signOutTimer = setTimeout(() => {
        state.authUser = null; state.myProfile = null; state.partnerProfile = null; state.coupleDoc = null;
        stopListeners();
        byId('appLayout').hidden = true;
        showAuth();
      }, 2000);
      return;
    }

    // User is present — cancel any pending sign-out.
    if (signOutTimer) { clearTimeout(signOutTimer); signOutTimer = null; }

    // Skip re-loading if the app is already visible for this uid (token refresh).
    if (state.authUser?.uid === user.uid && !byId('appLayout').hidden) {
      console.log('[auth] same user, app already visible — skipping reload');
      return;
    }

    state.authUser = user;
    watchUserDoc(user.uid);
  });
}

async function watchUserDoc(uid, attempt = 0) {
  console.log('[watchUserDoc] start, uid:', uid, 'attempt:', attempt);
  try {
    console.log('[watchUserDoc] fetching user doc...');
    const snap = await Promise.race([
      db.collection('users').doc(uid).get(),
      mkTimeout(12000),
    ]);
    console.log('[watchUserDoc] user doc fetch done, exists:', snap.exists);

    if (!snap.exists) {
      if (attempt < 6) {
        console.log('[watchUserDoc] doc not yet written, retrying in', 800 + attempt * 400, 'ms');
        setTimeout(() => watchUserDoc(uid, attempt + 1), 800 + attempt * 400);
      } else {
        showAuth('login', 'Could not find your profile. Please try signing in again.');
      }
      return;
    }

    const profile = { id: snap.id, ...snap.data() };
    state.myProfile = profile;
    console.log('[watchUserDoc] profile loaded, coupleId:', profile.coupleId, 'partnerId:', profile.partnerId);

    if (!profile.coupleId) {
      console.log('[watchUserDoc] no coupleId → showing pairing screen');
      showPairing(profile);
      const unsub = db.collection('users').doc(uid).onSnapshot(snap2 => {
        if (!snap2.exists) return;
        const updated = { id: snap2.id, ...snap2.data() };
        if (updated.coupleId) {
          console.log('[watchUserDoc] partner linked up via onSnapshot, reloading...');
          unsub();
          state.myProfile = updated;
          watchUserDoc(uid);
        }
      }, () => { /* ignore realtime errors — user can pair manually */ });
      return;
    }

    const appLayout = byId('appLayout');
    if (appLayout && !appLayout.hidden) {
      console.log('[watchUserDoc] appLayout already visible, skipping double-start');
      return;
    }

    console.log('[watchUserDoc] fetching couple + partner docs...');
    const [coupleSnap, partnerSnap] = await Promise.race([
      Promise.all([
        db.collection('couples').doc(profile.coupleId).get(),
        profile.partnerId ? db.collection('users').doc(profile.partnerId).get() : Promise.resolve(null),
      ]),
      mkTimeout(12000),
    ]);
    console.log('[watchUserDoc] couple exists:', coupleSnap.exists, ' partner exists:', partnerSnap?.exists);
    state.coupleDoc      = coupleSnap.exists ? { id: coupleSnap.id, ...coupleSnap.data() } : null;
    state.partnerProfile = (partnerSnap && partnerSnap.exists) ? { id: partnerSnap.id, ...partnerSnap.data() } : null;
    console.log('[watchUserDoc] calling startApp()');
    await startApp();
    console.log('[watchUserDoc] startApp() done');

  } catch (err) {
    console.error('[watchUserDoc] error:', err);
    const msg = err?.message === 'timeout' || err?.code === 'auth/network-request-failed'
      ? 'Connection timed out. Check your internet and try again.'
      : `Could not load your data (${err?.code ?? err?.message ?? 'unknown'}). Please try again.`;
    showAuth('login', msg);
  }
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
function init() {
  // Nav buttons (only buttons that declare a view)
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Lightbox
  byId('lightboxClose')?.addEventListener('click', closeLightbox);
  byId('lightboxBg')?.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  // Notification panel
  byId('notifClose')?.addEventListener('click', closeNotifPanel);
  byId('notifBackdrop')?.addEventListener('click', closeNotifPanel);
  byId('notifMarkAll')?.addEventListener('click', () => { markAllNotifsRead(); renderNotifPanel(); });
  byId('notifNavBtn')?.addEventListener('click', openNotifPanel);

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Hide bottom nav when keyboard opens
  if (window.visualViewport) {
    const bottomNav = byId('bottomNav');
    window.visualViewport.addEventListener('resize', () => {
      const ratio = window.visualViewport.height / window.screen.height;
      if (bottomNav) bottomNav.style.display = ratio < 0.75 ? 'none' : '';
    });
  }

  runSplash((removeSplash) => {
    if (!localStorage.getItem('ours-terms-v1')) {
      removeSplash();
      showTerms();
    } else {
      setupAuthListener(removeSplash);
    }
  });
}

init();
