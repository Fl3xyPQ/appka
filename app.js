'use strict';

/* ═══════════════════════════════════════════
   CONFIG  —  edit this to personalize
═══════════════════════════════════════════ */
const CONFIG = {
  people: {
    ari: { id: 'ari', name: 'Ari', color: '#C87941', initial: 'A',
           bio: 'Making the ordinary feel like an adventure.' },
    noa: { id: 'noa', name: 'Noa', color: '#9B7AB5', initial: 'N',
           bio: 'Collector of small moments and big feelings.' },
  },
  startDate: '2024-02-14',
  locale: 'en-GB',
  keys: {
    posts:     'ours-posts-v3',
    messages:  'ours-msgs-v3',
    memories:  'ours-mems-v3',
    user:      'ours-user-v3',
    liked:     'ours-liked-v3',
    reactions: 'ours-rxns-v3',
    chatVisit: 'ours-chatvisit-v3',
    avatars:   'ours-avatars-v3',
    profiles:  'ours-profiles-v3',
    checkins:  'ours-checkins-v3',
    bucket:    'ours-bucket-v3',
    songs:     'ours-songs-v3',
  },
};

/* ═══════════════════════════════════════════
   SEED DATA
═══════════════════════════════════════════ */
const SEED_POSTS = [
  {
    id: 'p-s1', author: 'noa',
    imageUrl: '',
    caption: 'this morning was so good I don\'t have words for it.\ncoffee, you, the light through the curtain.\nstayed in bed until it was embarrassing.',
    date: new Date(Date.now() - 4 * 86400000).toISOString(),
    likes: 2,
    comments: [{ id: 'c-s1', author: 'ari', text: 'should have stayed even longer honestly' }],
  },
  {
    id: 'p-s2', author: 'ari',
    imageUrl: 'https://images.unsplash.com/photo-1511994298241-608e28f14fde?w=700&q=80',
    caption: 'that soup you made',
    date: new Date(Date.now() - 3 * 86400000).toISOString(),
    likes: 1,
    comments: [],
  },
  {
    id: 'p-s3', author: 'noa',
    imageUrl: '',
    caption: 'I keep thinking about that random tuesday. we didn\'t do anything at all and it was somehow perfect.',
    date: new Date(Date.now() - 86400000).toISOString(),
    likes: 1,
    comments: [{ id: 'c-s2', author: 'ari', text: '❤️' }],
  },
];

const SEED_MESSAGES = [
  { id: 'm-s1', author: 'ari',  text: 'hey',                             date: new Date(Date.now() - 2 * 86400000 + 3600000).toISOString() },
  { id: 'm-s2', author: 'noa',  text: 'hey you',                         date: new Date(Date.now() - 2 * 86400000 + 3700000).toISOString() },
  { id: 'm-s3', author: 'ari',  text: 'what do you want for dinner',     date: new Date(Date.now() - 2 * 86400000 + 65700000).toISOString() },
  { id: 'm-s4', author: 'noa',  text: 'you',                             date: new Date(Date.now() - 2 * 86400000 + 65760000).toISOString() },
  { id: 'm-s5', author: 'ari',  text: 'be serious',                      date: new Date(Date.now() - 2 * 86400000 + 65820000).toISOString() },
  { id: 'm-s6', author: 'noa',  text: 'pasta? we always have pasta',     date: new Date(Date.now() - 2 * 86400000 + 65940000).toISOString() },
  { id: 'm-s7', author: 'ari',  text: 'fine, but you stir this time',    date: new Date(Date.now() - 2 * 86400000 + 66000000).toISOString() },
  { id: 'm-s8', author: 'noa',  text: '...deal ❤️',                     date: new Date(Date.now() - 2 * 86400000 + 66060000).toISOString() },
];

const SEED_MEMORIES = [
  { id: 'mm-s1', title: 'Kitchen Dance',      details: 'Pasta almost burned. Turned it into a midnight dance break instead.',  mood: 'playful',  date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), createdAt: Date.now() - 5 * 86400000 },
  { id: 'mm-s2', title: 'Balcony Sunrise',    details: 'Two mugs, one blanket. Silence that felt louder than music.',           mood: 'calm',     date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), createdAt: Date.now() - 2 * 86400000 },
  { id: 'mm-s3', title: 'The Terrible Movie', details: 'Neither of us could remember what was funny. We cried anyway.',          mood: 'silly',    date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),     createdAt: Date.now() - 86400000 },
];

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const state = {
  currentUser: 'ari',
  view: 'feed',
  posts:          [],
  messages:       [],
  memories:       [],
  likedPosts:     new Set(),
  openComments:   new Set(),
  reactions:      {},
  lastChatOpenMs: { ari: 0, noa: 0 },
  avatars:        {},
  checkins:       {},   // 'YYYY-MM-DD:personId' → { mood, note }
  bucket:         [],   // { id, text, done, createdAt }
  songs:          [],   // { id, author, spotifyUrl, embedId, embedType, note, date }
  // Spotify SDK runtime state (not persisted)
  spDeviceId:    null,
  spPlayer:      null,
  spPlayerState: null,
};

/* ═══════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════ */
function persist(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

function retrieve(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function loadState() {
  state.currentUser = retrieve(CONFIG.keys.user) || 'ari';

  const posts = retrieve(CONFIG.keys.posts);
  state.posts = Array.isArray(posts) ? posts : [...SEED_POSTS];
  if (!Array.isArray(posts)) persist(CONFIG.keys.posts, state.posts);

  const msgs = retrieve(CONFIG.keys.messages);
  state.messages = Array.isArray(msgs) ? msgs : [...SEED_MESSAGES];
  if (!Array.isArray(msgs)) persist(CONFIG.keys.messages, state.messages);

  const mems = retrieve(CONFIG.keys.memories);
  state.memories = Array.isArray(mems) ? mems : [...SEED_MEMORIES];
  if (!Array.isArray(mems)) persist(CONFIG.keys.memories, state.memories);

  const liked = retrieve(CONFIG.keys.liked);
  state.likedPosts = new Set(Array.isArray(liked) ? liked : []);

  const rxns = retrieve(CONFIG.keys.reactions);
  state.reactions = (rxns && typeof rxns === 'object' && !Array.isArray(rxns)) ? rxns : {};

  const chatVisit = retrieve(CONFIG.keys.chatVisit);
  state.lastChatOpenMs = (chatVisit && typeof chatVisit === 'object') ? { ari: 0, noa: 0, ...chatVisit } : { ari: 0, noa: 0 };

  const avatars = retrieve(CONFIG.keys.avatars);
  state.avatars = (avatars && typeof avatars === 'object' && !Array.isArray(avatars)) ? avatars : {};

  const checkins = retrieve(CONFIG.keys.checkins);
  state.checkins = (checkins && typeof checkins === 'object' && !Array.isArray(checkins)) ? checkins : {};

  const bucket = retrieve(CONFIG.keys.bucket);
  state.bucket = Array.isArray(bucket) ? bucket : [];

  const songs = retrieve(CONFIG.keys.songs);
  state.songs = Array.isArray(songs) ? songs : [];

  // Merge saved profile edits into CONFIG.people
  const profiles = retrieve(CONFIG.keys.profiles);
  if (profiles && typeof profiles === 'object') {
    for (const [id, data] of Object.entries(profiles)) {
      if (CONFIG.people[id]) {
        if (data.name)  CONFIG.people[id].name = data.name;
        if (data.bio != null) CONFIG.people[id].bio = data.bio;
      }
    }
  }
}

function saveAll() {
  persist(CONFIG.keys.posts,      state.posts);
  persist(CONFIG.keys.messages,   state.messages);
  persist(CONFIG.keys.memories,   state.memories);
  persist(CONFIG.keys.user,       state.currentUser);
  persist(CONFIG.keys.liked,      [...state.likedPosts]);
  persist(CONFIG.keys.reactions,  state.reactions);
  persist(CONFIG.keys.chatVisit,  state.lastChatOpenMs);
  persist(CONFIG.keys.avatars,    state.avatars);
  persist(CONFIG.keys.checkins,   state.checkins);
  persist(CONFIG.keys.bucket,     state.bucket);
  persist(CONFIG.keys.songs,      state.songs);
}

/* ═══════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════ */
function byId(id) { return document.getElementById(id); }

function me()   { return CONFIG.people[state.currentUser]; }
function them() { return CONFIG.people[Object.keys(CONFIG.people).find(id => id !== state.currentUser)]; }

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

function mkavatar(personId, size = 'md') {
  const p   = CONFIG.people[personId];
  const src = state.avatars[personId];
  const el  = document.createElement('div');
  el.className = `avatar avatar-${size} avatar-${personId}`;
  el.setAttribute('aria-label', p.name);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = p.name;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:999px;';
    el.append(img);
  } else {
    el.textContent = p.initial;
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
  if (sec < 60)   return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  const d = new Date(dateStr);
  return d.toLocaleDateString(CONFIG.locale, { day: 'numeric', month: 'short' });
}

function formatDay(dateStr) {
  const d   = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
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
  return Math.max(1, Math.floor((Date.now() - new Date(CONFIG.startDate)) / 86400000));
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function navigateTo(view) {
  state.view = view;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

  if (view === 'chat') {
    state.lastChatOpenMs[state.currentUser] = Date.now();
    persist(CONFIG.keys.chatVisit, state.lastChatOpenMs);
  }

  const main = byId('mainArea');
  main.style.overflowY = view === 'chat' ? 'hidden' : 'auto';
  main.innerHTML = '';
  main.scrollTop = 0;

  ({ feed: renderFeed, chat: renderChat, memories: renderMemories, profile: renderProfile, music: renderMusic }[view])(main);
  updateUnreadBadge();
}

/* ═══════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════ */
function renderSidebar() {
  const footer = byId('sidebarFooter');
  footer.innerHTML = '';
  const person = me();
  const other  = them();

  const card = h('button', {
    class: 'sidebar-user-card',
    onClick: switchUser,
    title: `Switch to ${other.name}`,
    'aria-label': `Currently posting as ${person.name}. Click to switch to ${other.name}.`,
  },
    mkavatar(person.id, 'sm'),
    h('div', {},
      h('span', { class: 'sidebar-user-name' }, person.name),
      h('span', { class: 'sidebar-user-hint' }, 'tap to switch'),
    ),
  );

  footer.append(card);
}

function switchUser() {
  const ids = Object.keys(CONFIG.people);
  state.currentUser = ids.find(id => id !== state.currentUser);
  persist(CONFIG.keys.user, state.currentUser);
  renderSidebar();
  navigateTo(state.view);
}

function updateUnreadBadge() {
  const otherId = Object.keys(CONFIG.people).find(id => id !== state.currentUser);
  const since   = state.lastChatOpenMs[state.currentUser] || 0;
  const count   = state.messages.filter(m => m.author === otherId && new Date(m.date).getTime() > since).length;
  document.querySelectorAll('[data-view="chat"]').forEach(btn => {
    let badge = btn.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        btn.append(badge);
      }
      badge.textContent = count > 9 ? '9+' : String(count);
    } else {
      badge?.remove();
    }
  });
}

/* ═══════════════════════════════════════════
   CHECK-IN WIDGET
═══════════════════════════════════════════ */
const MOODS = [
  { emoji: '🌟', label: 'amazing'  },
  { emoji: '😊', label: 'good'     },
  { emoji: '😌', label: 'calm'     },
  { emoji: '😔', label: 'low'      },
  { emoji: '🥱', label: 'tired'    },
  { emoji: '🥰', label: 'in love'  },
];

function todayKey(personId) {
  return `${new Date().toISOString().slice(0, 10)}:${personId}`;
}

function buildCheckinWidget() {
  const meId    = state.currentUser;
  const themId  = Object.keys(CONFIG.people).find(id => id !== meId);
  const meKey   = todayKey(meId);
  const themKey = todayKey(themId);
  const myCI    = state.checkins[meKey];
  const theirCI = state.checkins[themKey];

  const wrap = h('div', { class: 'checkin-card' });

  // Their check-in banner
  if (theirCI) {
    const mood = MOODS.find(m => m.label === theirCI.mood) || MOODS[0];
    const them = CONFIG.people[themId];
    wrap.append(h('div', { class: 'ci-them-row' },
      mkavatar(themId, 'sm'),
      h('div', { class: 'ci-them-info' },
        h('span', { class: 'ci-them-name' }, them.name),
        h('span', { class: 'ci-them-mood' }, `feeling ${mood.emoji} ${mood.label}`),
        theirCI.note ? h('span', { class: 'ci-them-note' }, `"${theirCI.note}"`) : null,
      ),
    ));
  }

  if (myCI) {
    // Already checked in
    const mood = MOODS.find(m => m.label === myCI.mood) || MOODS[0];
    wrap.append(h('div', { class: 'ci-me-done' },
      h('span', { class: 'ci-me-emoji' }, mood.emoji),
      h('div', { class: 'ci-me-text' },
        h('span', { class: 'ci-me-label' }, `you're feeling ${mood.label}`),
        myCI.note ? h('span', { class: 'ci-me-note' }, `"${myCI.note}"`) : null,
      ),
      h('button', { class: 'ci-change', onClick: () => { delete state.checkins[meKey]; saveAll(); navigateTo('feed'); } }, 'change'),
    ));
  } else {
    // Picker
    let selectedMood = null;
    const noteWrap  = h('div', { class: 'ci-note-wrap' });
    const noteIn    = h('input', { class: 'ci-note-in', type: 'text', maxlength: '80', placeholder: 'add a note… (optional)' });
    noteWrap.append(noteIn);

    const submitBtn = h('button', { class: 'ci-submit', onClick: submit }, 'how are you feeling today?');

    const moodPicker = h('div', { class: 'checkin-moods' });
    MOODS.forEach(m => {
      const btn = h('button', {
        class: 'checkin-mood-btn',
        onClick: () => {
          moodPicker.querySelectorAll('.checkin-mood-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedMood = m.label;
          noteWrap.classList.add('visible');
          submitBtn.textContent = `check in as ${m.emoji} ${m.label}`;
          submitBtn.classList.add('ready');
          noteIn.focus();
        },
      }, h('span', { class: 'ci-emoji' }, m.emoji), h('span', { class: 'ci-label' }, m.label));
      moodPicker.append(btn);
    });

    function submit() {
      if (!selectedMood) return;
      state.checkins[meKey] = { mood: selectedMood, note: noteIn.value.trim() };
      saveAll();
      navigateTo('feed');
    }
    noteIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    wrap.append(moodPicker, noteWrap, submitBtn);
  }

  return wrap;
}

/* ═══════════════════════════════════════════
   VIEW: FEED
═══════════════════════════════════════════ */
function renderFeed(container) {
  const wrap = h('div', { class: 'view-wrap' });

  wrap.append(h('div', { class: 'feed-header' },
    h('h1', { class: 'view-title' }, 'feed'),
  ));

  wrap.append(buildCheckinWidget());
  wrap.append(buildComposer());

  const sorted = [...state.posts].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!sorted.length) {
    wrap.append(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-icon' }, '📷'),
      h('h3', {}, 'Nothing here yet'),
      h('p',  {}, 'Add your first moment above.'),
    ));
  } else {
    sorted.forEach((post, i) => {
      const card = buildPostCard(post);
      card.style.animationDelay = `${i * 45}ms`;
      wrap.append(card);
    });
  }

  container.append(wrap);
}

function buildComposer() {
  const body = h('div', { class: 'composer-body' });

  const imgInput = h('input', { class: 'field-input', type: 'url', placeholder: 'Image URL (optional)', id: 'compImg' });
  const txtInput = h('textarea', { class: 'field-input', rows: '3', maxlength: '500', placeholder: 'What happened today?', id: 'compTxt' });
  const postingAs = h('p', { class: 'composer-posting-as' }, `Posting as ${me().name}`);

  function open() {
    body.classList.add('open');
    postingAs.textContent = `Posting as ${me().name}`;
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
    state.posts.unshift({ id: crypto.randomUUID(), author: state.currentUser, imageUrl: imgInput.value.trim(), caption, date: new Date().toISOString(), likes: 0, comments: [] });
    saveAll();
    close();
    navigateTo('feed');
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
    h('div', { class: 'composer-trigger' }, mkavatar(state.currentUser, 'sm'), placeholder),
    body,
  );
}

function buildPostCard(post) {
  const person  = CONFIG.people[post.author];
  const isLiked = state.likedPosts.has(post.id);
  const isOwn   = post.author === state.currentUser;

  const likeCountNode = document.createTextNode(post.likes > 0 ? String(post.likes) : '');
  const heartSvg = mksvg(SVG.heart, '');

  const likeBtn = h('button', {
    class: `like-btn${isLiked ? ' liked' : ''}`,
    'aria-label': isLiked ? 'Unlike' : 'Like',
    onClick: () => handleLike(post.id, likeBtn, likeCountNode),
  }, heartSvg, likeCountNode);

  const commentsSection = buildCommentsSection(post);
  if (state.openComments.has(post.id)) commentsSection.classList.add('open');

  const commentCount = post.comments.length;
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

  return h('article', { class: 'post-card' },
    h('div', { class: 'post-header' },
      mkavatar(post.author, 'sm'),
      h('div', {},
        h('div', { class: 'post-author-name' }, person.name),
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

    post.comments.forEach(c => {
      section.append(h('div', { class: 'comment-item' },
        mkavatar(c.author, 'sm'),
        h('div', { class: 'comment-bubble' },
          h('div', { class: 'comment-author' }, CONFIG.people[c.author].name),
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
      post.comments.push({ id: crypto.randomUUID(), author: state.currentUser, text });
      saveAll();
      render();
    }

    section.append(h('div', { class: 'comment-form' }, mkavatar(state.currentUser, 'sm'), inp, btn));
  }

  render();
  return section;
}

function handleLike(postId, btn, countNode) {
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;

  if (state.likedPosts.has(postId)) {
    state.likedPosts.delete(postId);
    post.likes = Math.max(0, post.likes - 1);
    btn.classList.remove('liked');
  } else {
    state.likedPosts.add(postId);
    post.likes += 1;
    btn.classList.add('liked', 'pop');
    btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
  }

  countNode.textContent = post.likes > 0 ? String(post.likes) : '';
  saveAll();
}

function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  state.posts = state.posts.filter(p => p.id !== postId);
  state.likedPosts.delete(postId);
  state.openComments.delete(postId);
  saveAll();
  navigateTo('feed');
}

/* ═══════════════════════════════════════════
   REACTIONS
═══════════════════════════════════════════ */
const EMOJI_SET = ['❤️', '🔥', '😂', '🥺', '🥹'];

function buildReactionsRow(post) {
  const row = h('div', { class: 'reactions-row' });
  renderReactionBtns(row, post);
  return row;
}

function renderReactionBtns(row, post) {
  row.innerHTML = '';
  const postRxns = state.reactions[post.id] || {};
  EMOJI_SET.forEach(emoji => {
    const users   = postRxns[emoji] || [];
    const reacted = users.includes(state.currentUser);
    const count   = users.length;
    row.append(h('button', {
      class: `reaction-btn${reacted ? ' reacted' : ''}`,
      onClick: () => { toggleReaction(post.id, emoji); renderReactionBtns(row, post); },
      'aria-label': `${emoji}${count ? ' ' + count : ''}`,
    },
      emoji,
      count > 0 ? h('span', { class: 'reaction-count' }, String(count)) : null,
    ));
  });
}

function toggleReaction(postId, emoji) {
  if (!state.reactions[postId]) state.reactions[postId] = {};
  const users = [...(state.reactions[postId][emoji] || [])];
  const idx   = users.indexOf(state.currentUser);
  if (idx >= 0) users.splice(idx, 1); else users.push(state.currentUser);
  if (users.length) state.reactions[postId][emoji] = users;
  else delete state.reactions[postId][emoji];
  saveAll();
}

/* ═══════════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════
   VOICE NOTES
═══════════════════════════════════════════ */
function buildVoicePlayer(audioData) {
  const audio  = new Audio();
  const BARS   = 34;
  let playing  = false;

  // Deterministic-looking waveform seeded by audio length
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

  const btn = h('button', {
    class: 'mic-btn',
    'aria-label': 'Record voice note',
    title: 'Hold to record',
  }, '🎙');

  async function startRecording() {
    if (recording) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access denied.');
      return;
    }
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob   = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      // Cap voice notes at 1MB base64
      if (blob.size > 750000) { alert('Recording too long — keep it under ~30s.'); stream.getTracks().forEach(t => t.stop()); return; }
      const reader = new FileReader();
      reader.onload = e2 => {
        state.messages.push({
          id:        crypto.randomUUID(),
          author:    state.currentUser,
          text:      '🎙 Voice note',
          type:      'voice',
          audioData: e2.target.result,
          date:      new Date().toISOString(),
        });
        saveAll();
        renderMessages(msgList);
        requestAnimationFrame(() => { msgList.scrollTop = msgList.scrollHeight; });
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach(t => t.stop());
      recording = false;
      btn.classList.remove('recording');
      btn.setAttribute('aria-label', 'Record voice note');
    };
    recorder.start();
    recording = true;
    btn.classList.add('recording');
    btn.setAttribute('aria-label', 'Stop recording');
  }

  function stopRecording() {
    if (!recording || !recorder) return;
    recorder.stop();
  }

  // Touch: hold to record
  btn.addEventListener('mousedown',  startRecording);
  btn.addEventListener('touchstart', e => { e.preventDefault(); startRecording(); }, { passive: false });
  btn.addEventListener('mouseup',   stopRecording);
  btn.addEventListener('touchend',  stopRecording);
  btn.addEventListener('mouseleave', stopRecording);

  return btn;
}

/* ═══════════════════════════════════════════
   VIEW: CHAT
═══════════════════════════════════════════ */
function renderChat(container) {
  const layout = h('div', { class: 'chat-layout' });

  // Topbar
  const avs = h('div', { class: 'chat-topbar-avatars' });
  const av1 = mkavatar('ari', 'sm');
  const av2 = mkavatar('noa', 'sm');
  avs.append(av1, av2);

  layout.append(h('div', { class: 'chat-topbar' },
    avs,
    h('div', {},
      h('div', { class: 'chat-topbar-title' }, `${CONFIG.people.ari.name} & ${CONFIG.people.noa.name}`),
      h('div', { class: 'chat-topbar-sub' }, `Posting as ${me().name} · private`),
    ),
  ));

  // Messages
  const msgList = h('div', { class: 'chat-messages', id: 'chatMessages' });
  renderMessages(msgList);
  layout.append(msgList);

  // Input
  const textarea = h('textarea', { class: 'chat-textarea', rows: '1', placeholder: 'Message…' });
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  });
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(textarea, msgList); }
  });

  const sendBtn = h('button', { class: 'chat-send', 'aria-label': 'Send',
    onClick: () => sendMsg(textarea, msgList) });
  sendBtn.append(mksvg(SVG.send, ''));

  // Voice note button
  const micBtn = buildMicButton(msgList);

  // "Thinking of you" quick-send
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

  const thinkBtn = h('button', {
    class: 'btn-thinking',
    title: 'Send a "thinking of you"',
    'aria-label': 'Thinking of you',
    onClick: () => {
      const text = THINKING[Math.floor(Math.random() * THINKING.length)];
      state.messages.push({ id: crypto.randomUUID(), author: state.currentUser, text, date: new Date().toISOString() });
      saveAll();
      renderMessages(msgList);
      requestAnimationFrame(() => { msgList.scrollTop = msgList.scrollHeight; });
    },
  }, '♡');

  layout.append(
    h('div', { class: 'chat-input-area' },
      h('div', { class: 'chat-input-bar' }, mkavatar(state.currentUser, 'sm'), thinkBtn, textarea, micBtn, sendBtn),
    ),
  );

  container.append(layout);
  requestAnimationFrame(() => { msgList.scrollTop = msgList.scrollHeight; textarea.focus(); });
}

function renderMessages(container) {
  container.innerHTML = '';

  let lastDay    = '';
  let lastAuthor = '';

  state.messages.forEach((msg) => {
    const day = formatDay(msg.date);
    if (day !== lastDay) {
      container.append(h('div', { class: 'date-sep' }, day));
      lastDay = day;
      lastAuthor = '';
    }

    const isMe      = msg.author === state.currentUser;
    const newGroup  = msg.author !== lastAuthor;
    const cls       = `msg ${isMe ? 'msg-r' : 'msg-l'}${newGroup ? ' msg-gap' : ''}`;

    // Song message with embed
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

    const meta    = h('div', { class: 'msg-time' }, formatTime(msg.date));
    const spacer  = h('div', { class: 'msg-spacer' });
    const avatarEl = newGroup ? mkavatar(msg.author, 'sm') : spacer;

    let msgEl;
    if (isMe) {
      msgEl = h('div', { class: cls }, h('div', { class: 'msg-row' }, bubbleContent), meta);
    } else {
      msgEl = h('div', { class: cls }, h('div', { class: 'msg-row' }, avatarEl, bubbleContent), meta);
    }

    container.append(msgEl);
    lastAuthor = msg.author;
  });
}

function sendMsg(textarea, msgList) {
  const text = textarea.value.trim();
  if (!text) return;
  state.messages.push({ id: crypto.randomUUID(), author: state.currentUser, text, date: new Date().toISOString() });
  saveAll();
  textarea.value = '';
  textarea.style.height = 'auto';
  renderMessages(msgList);
  requestAnimationFrame(() => { msgList.scrollTop = msgList.scrollHeight; });
}

/* ═══════════════════════════════════════════
   VIEW: MEMORIES
═══════════════════════════════════════════ */
function renderMemories(container) {
  const activeTab = state._memTab || 'memories';
  const wrap = h('div', { class: 'view-wrap-wide' });

  // Tab toggle
  const tabBar = h('div', { class: 'mem-tabs' },
    h('button', {
      class: `mem-tab${activeTab === 'memories' ? ' active' : ''}`,
      onClick: () => { state._memTab = 'memories'; navigateTo('memories'); },
    }, '🌿 Memories'),
    h('button', {
      class: `mem-tab${activeTab === 'bucket' ? ' active' : ''}`,
      onClick: () => { state._memTab = 'bucket'; navigateTo('memories'); },
    }, '✓ Bucket List'),
  );

  wrap.append(tabBar);

  if (activeTab === 'bucket') {
    renderBucketList(wrap);
  } else {
    renderMemoriesTab(wrap);
  }

  container.append(wrap);
}

function renderMemoriesTab(wrap) {
  wrap.append(h('div', { class: 'memories-header' },
    h('h1', { class: 'view-title' }, 'memories'),
  ));

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
    state.bucket.unshift({ id: crypto.randomUUID(), text, done: false, createdAt: Date.now(), author: state.currentUser });
    saveAll();
    inp.value = '';
    renderBucketItems(list);
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
        class: 'bucket-check',
        'aria-label': item.done ? 'Mark undone' : 'Mark done',
        onClick: () => {
          const it = state.bucket.find(b => b.id === item.id);
          if (it) it.done = !it.done;
          saveAll();
          renderBucketItems(list);
        },
      }, item.done ? '✓' : '○'),
      h('span', { class: 'bucket-text' }, item.text),
      h('button', {
        class: 'mem-tile-del',
        onClick: () => {
          state.bucket = state.bucket.filter(b => b.id !== item.id);
          saveAll();
          renderBucketItems(list);
        },
      }, '✕'),
    );
    list.append(row);
  });
}

function buildMemForm() {
  let open = false;
  const formBody = h('div', { class: 'mem-form-body' });

  const titleIn = h('input', { class: 'field-input', type: 'text', maxlength: '72', placeholder: 'Give it a title' });
  const detailsIn = h('textarea', { class: 'field-input', rows: '3', maxlength: '420', placeholder: 'What made this moment unforgettable?' });
  const moodSel = h('select', { class: 'field-input' },
    ...['warm', 'playful', 'calm', 'wild', 'silly', 'grateful'].map(m =>
      h('option', { value: m }, m.charAt(0).toUpperCase() + m.slice(1))),
  );
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
    state.memories.unshift({ id: crypto.randomUUID(), title, details, mood: moodSel.value, date: dateIn.value, createdAt: Date.now() });
    saveAll();
    navigateTo('memories');
  }

  formBody.append(
    h('div', { class: 'mem-form-grid' },
      h('div', { class: 'mem-form-full' }, h('label', { class: 'field-label' }, 'Title'), titleIn),
      h('div', { class: 'mem-form-full' }, h('label', { class: 'field-label' }, 'Details'), detailsIn),
      h('div', {}, h('label', { class: 'field-label' }, 'Mood'), moodSel),
      h('div', {}, h('label', { class: 'field-label' }, 'Date'), dateIn),
    ),
    h('div', { class: 'mem-form-actions' },
      h('button', { class: 'btn btn-primary', onClick: submit }, 'Save memory'),
    ),
  );

  const addBtn = h('button', { class: 'btn btn-primary', onClick: toggle }, '+ Add memory');

  return h('div', { class: 'mem-add-card' },
    h('div', { class: 'mem-add-head' },
      h('h3', {}, 'New memory'), addBtn,
    ),
    formBody,
  );
}

function buildMemTile(mem) {
  const color = moodColor(mem.mood);

  return h('div', { class: 'mem-tile' },
    h('div', { class: 'mem-tile-mood' },
      h('div', { class: 'mood-dot', style: { background: color } }),
      h('span', { class: 'mood-label' }, mem.mood),
    ),
    h('h3', { class: 'mem-tile-title' }, mem.title),
    h('p',  { class: 'mem-tile-details' }, mem.details),
    h('div', { class: 'mem-tile-foot' },
      h('time', { class: 'mem-tile-date', datetime: mem.date },
        new Date(mem.date).toLocaleDateString(CONFIG.locale, { day: 'numeric', month: 'short', year: 'numeric' }),
      ),
      h('button', { class: 'mem-tile-del', onClick: () => deleteMem(mem.id) }, 'Delete'),
    ),
  );
}

function deleteMem(id) {
  if (!confirm('Delete this memory?')) return;
  state.memories = state.memories.filter(m => m.id !== id);
  saveAll();
  navigateTo('memories');
}

/* ═══════════════════════════════════════════
   VIEW: PROFILE
═══════════════════════════════════════════ */
function renderProfile(container) {
  const wrap = h('div', { class: 'view-wrap-wide profile-view' });

  const postsByAri = state.posts.filter(p => p.author === 'ari').length;
  const postsByNoa = state.posts.filter(p => p.author === 'noa').length;
  const totalMsgs  = state.messages.length;

  wrap.append(
    h('div', { class: 'profile-grid' },
      buildProfileCard('ari', postsByAri, Math.floor(totalMsgs / 2)),
      buildProfileCard('noa', postsByNoa, Math.ceil(totalMsgs / 2)),
    ),
    buildTogetherBanner(),
  );

  container.append(wrap);
}

function saveProfiles() {
  const data = {};
  for (const [id, p] of Object.entries(CONFIG.people)) {
    data[id] = { name: p.name, bio: p.bio };
  }
  persist(CONFIG.keys.profiles, data);
}

function buildProfileCard(personId, posts, msgs) {
  const p      = CONFIG.people[personId];
  const isMe   = personId === state.currentUser;

  // Avatar with edit button overlay
  const avatarEl = mkavatar(personId, 'xl');
  const avatarWrap = h('div', { class: 'profile-avatar-wrap' }, avatarEl);

  if (isMe) {
    const editBadge = h('label', {
      class: 'avatar-edit-badge',
      title: 'Change photo',
      'aria-label': 'Change profile photo',
    }, '📷');
    const fileIn = h('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' },
    });
    fileIn.addEventListener('change', () => {
      const file = fileIn.files[0];
      if (!file) return;
      // 2 MB safety cap
      if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2 MB.'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        state.avatars[personId] = e.target.result;
        saveAll();
        navigateTo('profile');
      };
      reader.readAsDataURL(file);
    });
    editBadge.append(fileIn);
    avatarWrap.append(editBadge);

    // Remove photo button
    if (state.avatars[personId]) {
      avatarWrap.append(h('button', {
        class: 'avatar-remove-btn',
        title: 'Remove photo',
        onClick: () => { delete state.avatars[personId]; saveAll(); navigateTo('profile'); },
      }, '✕'));
    }
  }

  // Editable name
  const nameEl = isMe
    ? buildEditableField('h2', p.name, 'profile-name', val => {
        CONFIG.people[personId].name = val || p.initial;
        saveProfiles();
        renderSidebar();
      })
    : h('h2', { class: 'profile-name' }, p.name);

  // Editable bio
  const bioEl = isMe
    ? buildEditableField('p', p.bio, 'profile-bio', val => {
        CONFIG.people[personId].bio = val;
        saveProfiles();
      })
    : h('p', { class: 'profile-bio' }, p.bio);

  return h('div', { class: 'profile-card' },
    avatarWrap,
    nameEl,
    bioEl,
    isMe ? h('div', { class: 'profile-edit-hint' }, 'tap name or bio to edit') : null,
    h('div', { class: 'profile-stats' },
      h('div', { class: 'profile-stat' },
        h('span', { class: 'profile-stat-n' }, String(posts)),
        h('span', { class: 'profile-stat-l' }, 'posts'),
      ),
      h('div', { class: 'profile-stat' },
        h('span', { class: 'profile-stat-n' }, String(msgs)),
        h('span', { class: 'profile-stat-l' }, 'messages'),
      ),
    ),
  );
}

function buildEditableField(tag, value, className, onSave) {
  const el = h(tag, { class: `${className} editable-field`, title: 'Tap to edit' }, value);
  el.addEventListener('click', () => {
    if (el.querySelector('input, textarea')) return; // already editing
    const isMultiline = tag === 'p';
    const inp = isMultiline
      ? h('textarea', { class: 'inline-edit-input', rows: '3' })
      : h('input',    { class: 'inline-edit-input', type: 'text' });
    inp.value = value;
    el.innerHTML = '';
    el.append(inp);
    inp.focus();
    inp.select();

    function commit() {
      const val = inp.value.trim() || value;
      value = val;
      el.innerHTML = '';
      el.textContent = val;
      onSave(val);
    }
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
  const start  = new Date(CONFIG.startDate);
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
  const av1 = mkavatar('ari', 'md');
  const av2 = mkavatar('noa', 'md');
  av2.style.cssText = 'margin-left:-12px;border:2px solid var(--surface)';

  const anniv = nextAnniversaryInfo();
  const anniversaryEl = anniv.isToday
    ? h('div', { class: 'anniv-chip anniv-today' }, `🎉 Happy ${anniv.num}${ordinal(anniv.num)} anniversary!`)
    : h('div', { class: 'anniv-chip' }, `${anniv.days}d until anniversary #${anniv.num}`);

  return h('div', { class: 'together-banner' },
    h('div', { class: 'together-avs' }, av1, av2),
    h('div', { class: 'together-info' },
      h('h3', {}, `${CONFIG.people.ari.name} & ${CONFIG.people.noa.name}`),
      h('p',  {}, `${state.memories.length} memories saved together`),
      anniversaryEl,
    ),
    h('div', { class: 'together-days' },
      h('div', { class: 'together-days-n' }, String(daysTogether())),
      h('div', { class: 'together-days-l' }, 'days together'),
    ),
  );
}

/* ═══════════════════════════════════════════
   SPOTIFY PREMIUM — PKCE AUTH + SEARCH + SDK
═══════════════════════════════════════════ */
const SP = {
  SCOPES:  'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
  SDK_URL: 'https://sdk.scdn.co/spotify-player.js',
  API:     'https://api.spotify.com/v1',
  AUTH:    'https://accounts.spotify.com',
};

function spClientId()   { return '268bd358b5b0411aacd9c8ae3dc29205'; }
function spRedirectUri() {
  const base = location.pathname.endsWith('index.html')
    ? location.pathname.slice(0, -10)
    : location.pathname;
  // Spotify forbids 'localhost' — use explicit 127.0.0.1 loopback instead
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
  state.songs.unshift({
    id:        crypto.randomUUID(),
    author:    state.currentUser,
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
    embedId:   track.id,
    embedType: 'track',
    note:      '',
    date:      new Date().toISOString(),
    trackName: track.name,
    trackArtists: track.artists.map(a => a.name).join(', '),
  });
  saveAll();
  navigateTo('music');
}

function buildSongComposer() {
  const body = h('div', { class: 'composer-body' });
  let parsed = null;
  let previewEl = null;

  const linkIn = h('input', { class: 'field-input', type: 'url', placeholder: 'Paste Spotify link or URI…' });
  const noteIn = h('textarea', { class: 'field-input', rows: '2', maxlength: '200', placeholder: 'Say something about it (optional)' });
  const previewWrap = h('div', { class: 'song-preview-wrap' });
  const errorEl = h('p', { class: 'song-error', style: { display: 'none' } }, 'Not a valid Spotify link.');

  linkIn.addEventListener('input', () => {
    parsed = parseSpotifyUrl(linkIn.value);
    previewWrap.innerHTML = '';
    errorEl.style.display = 'none';
    if (linkIn.value.trim() && !parsed) {
      errorEl.style.display = '';
    } else if (parsed) {
      previewEl = buildSpotifyEmbed(parsed.type, parsed.id);
      previewWrap.append(previewEl);
    }
  });

  function open() { body.classList.add('open'); linkIn.focus(); }
  function close() { body.classList.remove('open'); linkIn.value = ''; noteIn.value = ''; previewWrap.innerHTML = ''; parsed = null; }

  function submit() {
    if (!parsed) { linkIn.focus(); return; }
    state.songs.unshift({
      id:        crypto.randomUUID(),
      author:    state.currentUser,
      spotifyUrl: linkIn.value.trim(),
      embedId:   parsed.id,
      embedType: parsed.type,
      note:      noteIn.value.trim(),
      date:      new Date().toISOString(),
    });
    saveAll();
    close();
    navigateTo('music');
  }

  body.append(
    h('div', {}, h('label', { class: 'field-label' }, 'Spotify link'), linkIn, errorEl),
    previewWrap,
    h('div', {}, h('label', { class: 'field-label' }, 'Note'), noteIn),
    h('div', { class: 'composer-actions' },
      h('p', { class: 'composer-posting-as' }, `Sharing as ${me().name}`),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn-ghost', onClick: close }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onClick: submit }, 'Share'),
      ),
    ),
  );

  const placeholder = h('div', { class: 'composer-placeholder', role: 'button', tabindex: '0',
    onClick: open, onKeydown: e => { if (e.key === 'Enter') open(); } }, '🎵 Share a song…');

  return h('div', { class: 'composer-card' },
    h('div', { class: 'composer-trigger' }, mkavatar(state.currentUser, 'sm'), placeholder),
    body,
  );
}

function buildSongCard(song) {
  const person  = CONFIG.people[song.author] || {};
  const isOwn   = song.author === state.currentUser;
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
      state.songs = state.songs.filter(s => s.id !== song.id);
      saveAll(); navigateTo('music');
    }}, 'Delete'));
  }

  return h('article', { class: 'post-card song-card' },
    h('div', { class: 'post-header' },
      mkavatar(song.author, 'sm'),
      h('div', {},
        h('div', { class: 'post-author-name' }, person.name || song.author),
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
  state.messages.push({
    id:        crypto.randomUUID(),
    author:    state.currentUser,
    text,
    type:      'song',
    embedId:   song.embedId,
    embedType: song.embedType,
    date:      new Date().toISOString(),
  });
  saveAll();
  navigateTo('chat');
}

/* ═══════════════════════════════════════════
   SPLASH
═══════════════════════════════════════════ */
function runSplash(onDone) {
  const splash = byId('splash');
  if (!splash) { onDone(); return; }

  // Show for 1.8s then fade out
  setTimeout(() => {
    splash.classList.add('splash-exit');
    splash.addEventListener('transitionend', () => {
      splash.remove();
      onDone();
    }, { once: true });
  }, 1800);
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
async function init() {
  // Handle Spotify OAuth callback
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('state') === 'sp') {
    history.replaceState({}, '', location.pathname);
    if (urlParams.get('error')) {
      // Spotify rejected the request — show a helpful error after load
      setTimeout(() => navigateTo('music'), 100);
      localStorage.setItem('sp-auth-error', urlParams.get('error'));
    } else if (urlParams.get('code')) {
      const ok = await spExchangeCode(urlParams.get('code')).catch(() => false);
      if (!ok) localStorage.setItem('sp-auth-error', 'token_exchange_failed');
    }
  }

  // Start Spotify player in background (needs Premium)
  if (spIsAuthed()) spInitPlayer().catch(() => {});
  loadState();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Lightbox
  byId('lightboxClose').addEventListener('click', closeLightbox);
  byId('lightboxBg').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  // PWA — register service worker (requires HTTP/HTTPS, not file://)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* file:// — skip */ });
  }

  // Hide bottom nav when keyboard opens (visual viewport shrinks significantly)
  if (window.visualViewport) {
    const bottomNav = byId('bottomNav');
    const threshold = 0.75; // if viewport is less than 75% of screen height, keyboard is up
    window.visualViewport.addEventListener('resize', () => {
      const ratio = window.visualViewport.height / window.screen.height;
      if (bottomNav) bottomNav.style.display = ratio < threshold ? 'none' : '';
    });
  }

  runSplash(() => {
    renderSidebar();
    navigateTo('feed');
    updateUnreadBadge();
  });
}

init();