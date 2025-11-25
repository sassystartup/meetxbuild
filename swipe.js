/*
  Reactive, live swipe deck with profile-completion gate.
  - Requires app.js to run first and expose window.auth and window.db
*/
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs, doc as firestoreDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const auth = window.auth;
const db = window.db;

if (!auth || !db) {
  console.error('swipe.js: window.auth/window.db not found — ensure app.js loads before swipe.js');
}

// UI
const blockedEl = document.getElementById('swipeBlocked');
const container = document.getElementById('swipe-card-container');
const fabButtons = Array.from(document.querySelectorAll('.fab, #btnLike, #btnNope, #btnSuperlike')).filter(Boolean);
const goProfileBtn = document.getElementById('goProfileBtn');

// live notification UI container (top-center)
const _notifyRoot = document.createElement('div');
_notifyRoot.id = 'liveNotifications';
_notifyRoot.style.position = 'fixed';
_notifyRoot.style.left = '50%';
_notifyRoot.style.top = '14px';
_notifyRoot.style.transform = 'translateX(-50%)';
_notifyRoot.style.zIndex = '140';
_notifyRoot.style.display = 'flex';
_notifyRoot.style.flexDirection = 'column';
_notifyRoot.style.gap = '10px';
_notifyRoot.style.alignItems = 'center';
document.body.appendChild(_notifyRoot);

// helper: profile completeness
function profileIsComplete(data) {
  if (!data) return false;
  const hasName = !!(data.fullName && String(data.fullName).trim());
  const hasPhoto = !!(data.photoURL && String(data.photoURL).trim());
  const skills = data.skills;
  const hasSkills = Array.isArray(skills) ? skills.length > 0 : (typeof skills === 'string' && skills.trim().length > 0);
  return hasName && hasPhoto && hasSkills;
}

// show/hide the blocked overlay and disable interactions
function setBlocked(blocked) {
  if (!blockedEl) return;
  blockedEl.style.display = blocked ? 'flex' : 'none';
  if (container) container.classList.toggle('blocked', blocked);
  fabButtons.forEach(b => { try { b.disabled = blocked; b.style.opacity = blocked ? '0.45' : '1'; } catch(e){} });
  // add CSS guard to prevent pointer interactions on cards when blocked
  if (blocked) document.documentElement.classList.add('swipe-blocked');
  else document.documentElement.classList.remove('swipe-blocked');
}

// optional: prevent card drag handlers by CSS class .blocked on container (your drag handlers should respect this)
const style = document.createElement('style');
style.textContent = `
  /* When swipe blocked, prevent pointer events on card deck and reduce visibility of controls */
  .swipe-blocked #swipe-card-container, .swipe-blocked #swipe-card-container * { pointer-events: none !important; }
  .swipe-blocked .swipe-actions { pointer-events: auto; } /* keep FABs still clickable if you want them disabled visually only */
`;
document.head.appendChild(style);

// ensure goProfileBtn navigates to profile page (if present)
if (goProfileBtn) {
  goProfileBtn.addEventListener('click', (e) => {
    // preserve default anchor behavior; if it's not an anchor, navigate programmatically
    if (goProfileBtn.tagName.toLowerCase() !== 'a') {
      window.location.href = 'profile.html';
    }
  });
}

let unsubscribeMyProfile = null;

// watch auth and current user's profile doc to gate swiping
onAuthStateChanged(auth, async (user) => {
  // cleanup previous listener
  if (unsubscribeMyProfile) { try { unsubscribeMyProfile(); } catch (e) {} unsubscribeMyProfile = null; }

  if (!user) {
    // not signed in => block swipes and show CTA
    setBlocked(true);
    return;
  }

  // listen to user's profile doc for live completeness updates
  const myRef = doc(db, 'profiles', user.uid);
  unsubscribeMyProfile = onSnapshot(myRef, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const ok = profileIsComplete(data);
    setBlocked(!ok);
  }, (err) => {
    console.error('swipe: my profile snapshot error', err);
    setBlocked(true);
  });

  // initial one-off check (in case snapshot delayed)
  try {
    const snap = await getDoc(myRef);
    const ok = snap.exists() && profileIsComplete(snap.data());
    setBlocked(!ok);
  } catch (err) {
    console.error('swipe: my profile get error', err);
    setBlocked(true);
  }
});

// live notification
function showNotification(title, subtitle = '', img) {
  const n = document.createElement('div');
  n.className = 'live-notify';
  n.style.display = 'flex';
  n.style.alignItems = 'center';
  n.style.gap = '10px';
  n.style.minWidth = '220px';
  n.style.maxWidth = '420px';
  n.style.padding = '10px 14px';
  n.style.borderRadius = '12px';
  n.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(0,0,0,0.06))';
  n.style.boxShadow = '0 12px 30px rgba(2,6,23,0.6)';
  n.style.backdropFilter = 'blur(6px)';
  n.style.opacity = '0';
  n.style.transform = 'translateY(-8px)';
  n.style.transition = 'transform .28s cubic-bezier(.2,.9,.3,1), opacity .28s';

  const avatar = document.createElement('div');
  avatar.style.width = '44px';
  avatar.style.height = '44px';
  avatar.style.borderRadius = '10px';
  avatar.style.background = '#0b1220';
  avatar.style.flex = '0 0 44px';
  avatar.style.overflow = 'hidden';
  avatar.style.display = 'grid';
  avatar.style.placeItems = 'center';
  avatar.style.boxShadow = 'inset 0 0 10px rgba(255,255,255,0.02)';
  if (img) {
    const im = document.createElement('img');
    im.src = img;
    im.alt = '';
    im.style.width = '100%';
    im.style.height = '100%';
    im.style.objectFit = 'cover';
    avatar.appendChild(im);
  } else {
    avatar.textContent = '👤';
    avatar.style.fontSize = '20px';
  }

  const txt = document.createElement('div');
  txt.style.lineHeight = '1';
  const t = document.createElement('div');
  t.style.fontWeight = '800';
  t.style.fontSize = '0.95rem';
  t.textContent = title;
  const s = document.createElement('div');
  s.style.fontSize = '0.82rem';
  s.style.color = 'var(--muted)';
  s.textContent = subtitle || 'Someone interacted with you';
  txt.appendChild(t);
  txt.appendChild(s);

  n.appendChild(avatar);
  n.appendChild(txt);
  _notifyRoot.appendChild(n);

  // animate in
  requestAnimationFrame(() => {
    n.style.opacity = '1';
    n.style.transform = 'translateY(0)';
  });

  // auto-hide
  setTimeout(() => {
    n.style.opacity = '0';
    n.style.transform = 'translateY(-8px)';
    setTimeout(() => n.remove(), 420);
  }, 4200);
}

// likes listener (shows notification when new like documents targeting current user appear)
let _unsubLikes = null;
const _seenLikeIds = new Set();

function startLikesListener() {
  if (_unsubLikes) { try { _unsubLikes(); } catch(e){} _unsubLikes = null; _seenLikeIds.clear(); }
  if (!meUid) return;
  try {
    const likesCol = collection(db, 'likes');
    const q = query(likesCol, where('to', '==', meUid), where('liked', '==', true));
    _unsubLikes = onSnapshot(q, async (snap) => {
      snap.docChanges().forEach(async (chg) => {
        if (chg.type !== 'added') return;
        const id = chg.doc.id;
        if (_seenLikeIds.has(id)) return;
        _seenLikeIds.add(id);
        const data = chg.doc.data();
        let title = 'Someone liked you';
        let photo = null;
        // try to show the sender's profile info
        if (data && data.from) {
          try {
            const pSnap = await getProfileDoc(firestoreDoc(db, 'profiles', data.from));
            if (pSnap.exists()) {
              const p = pSnap.data();
              title = (p.fullName ? p.fullName : title);
              if (p.photoURL) photo = p.photoURL;
            }
          } catch (e) {
            console.warn('profile fetch failed', e);
          }
        }
        showNotification(title, 'Liked your profile', photo);
      });
    }, err => console.error('likes listener error', err));
  } catch (e) {
    console.error('startLikesListener failed', e);
  }
}

// stop the likes listener (call on sign-out)
function stopLikesListener() {
  if (_unsubLikes) { try { _unsubLikes(); } catch(e){} _unsubLikes = null; _seenLikeIds.clear(); }
}

// call start/stop where auth state changes (add calls in your auth handler)

let unsubProfiles = null;
let deck = [];
let topIndex = 0;

// render the current deck state
function renderDeck() {
  // debug log
  // console.log('renderDeck', { topIndex, deck });
  if (!Array.isArray(deck)) deck = [];
  const frag = document.createDocumentFragment();
  // preload image URLs
  const toPreload = [];
  deck.slice(topIndex, topIndex + 3).forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'swipe-card';
    el.style.zIndex = `${deck.length - i}`;
    const data = item.data;
    const name = (data.fullName || '').trim();
    const photo = (data.photoURL || '').trim();
    const skills = (data.skills || '').trim();
    // debug info
    el.dataset.docId = item.id;
    el.dataset.index = `${topIndex + i}`;
    el.innerHTML = `
      <div class="card-bg" aria-hidden="true" style="background-image: url(${photo});"></div>
      <div class="card-content">
        <div class="card-header">
          <div class="card-title">${name}</div>
          <div class="card-subtitle">${skills}</div>
        </div>
        <div class="card-actions">
          <button class="fab" id="btnSuperlike" title="Super Like">
            <img src="assets/svgs/star.svg" alt="⭐">
          </button>
          <button class="fab" id="btnLike" title="Like">
            <img src="assets/svgs/heart.svg" alt="❤️">
          </button>
          <button class="fab" id="btnNope" title="Nope">
            <img src="assets/svgs/xmark.svg" alt="❌">
          </button>
        </div>
      </div>
    `;
    frag.appendChild(el);
    // collect image URLs for preloading
    if (photo) toPreload.push(photo);
  });
  // clear existing cards
  container.innerHTML = '';
  // add new cards
  container.appendChild(frag);
  // preload images
  preloadImages(toPreload);
}

// preload image URLs
function preloadImages(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  const div = document.createElement('div');
  div.style.display = 'none';
  div.style.position = 'absolute';
  div.style.width = '0';
  div.style.height = '0';
  document.body.appendChild(div);
  urls.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    div.appendChild(img);
  });
}

// swipe logic
let swipeParams = null;
const minSwipeDistance = 60;
const maxSwipeAngle = 45;
const swipeThreshold = 0.3; // fraction of width
const rotateStrength = 20;
const bounceFactor = 0.2;
const cardDragArea = 40; // px

function initSwipe(el) {
  if (!el) return;
  let pos0, pos1, pos2;
  let isDragging = false;
  let isSwiping = false;
  let swipeDir = 0;
  let startTime = 0;
  let moved = false;
  const rect = el.getBoundingClientRect();
  const cardWidth = rect.width;
  const cardHeight = rect.height;
  const halfWidth = cardWidth / 2;
  const halfHeight = cardHeight / 2;
  const threshold = Math.min(halfWidth, halfHeight) * swipeThreshold;
  const xThreshold = halfWidth * 0.2;
  const yThreshold = halfHeight * 0.2;
  const rotationLimit = maxSwipeAngle * (Math.PI / 180);

  // touch start
  function swipeStart(e) {
    if (isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    pos0 = { x: touch.clientX, y: touch.clientY };
    isDragging = true;
    moved = false;
    startTime = Date.now();
    el.classList.add('dragging');
  }

  // touch move
  function swipeMove(e) {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    pos1 = { x: touch.clientX, y: touch.clientY };
    const dx = pos1.x - pos0.x;
    const dy = pos1.y - pos0.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const rotation = Math.min(rotationLimit, Math.max(-rotationLimit, dx * rotateStrength / cardWidth));
    const bounce = Math.max(0, Math.min(1, 1 - distance / cardWidth)) * bounceFactor;
    const translateX = dx;
    const translateY = dy - bounce * cardHeight;
    // swipe threshold met, determine direction
    if (!isSwiping && absDx > threshold) {
      isSwiping = true;
      swipeDir = dx > 0 ? 1 : -1;
      // snap to edge
      const snapX = swipeDir * halfWidth;
      const snapY = Math.abs(dy) > xThreshold ? (dy > 0 ? halfHeight : -halfHeight) : 0;
      el.animate([
        { transform: `translate(${snapX}px, ${snapY}px) rotate(${rotation}rad)`, opacity: 1 },
      ], { duration: 180, easing: 'ease-out', fill: 'forwards' });
    }
    // apply transform
    el.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${rotation}rad)`;
  }

  // touch end
  function swipeEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('dragging');
    const touch = e.changedTouches ? e.changedTouches[0] : e;
    pos2 = { x: touch.clientX, y: touch.clientY };
    const dx = pos2.x - pos0.x;
    const dy = pos2.y - pos0.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const duration = Date.now() - startTime;
    const speed = distance / duration;
    const isFastSwipe = speed > 0.5;
    const isVerticalSwipe = absDy > absDx && absDy > threshold;
    const isHorizontalSwipe = absDx > absDy && absDx > threshold;
    // determine action
    let action = null;
    if (isHorizontalSwipe) {
      action = (dx > 0) ? 'like' : 'nope';
    } else if (isVerticalSwipe) {
      action = (dy > 0) ? 'superlike' : null;
    }
    // snap back if not a valid swipe
    if (!action) {
      el.animate([
        { transform: `translate(0, 0)`, opacity: 1 },
      ], { duration: 180, easing: 'ease-out', fill: 'forwards' });
      return;
    }
    // handle swipe action
    handleCardAction(action, el);
  }

  // prevent default touch actions (scroll, etc.)
  el.addEventListener('touchstart', (e) => { e.preventDefault(); });
  el.addEventListener('touchmove', (e) => { e.preventDefault(); });
  el.addEventListener('touchend', (e) => { e.preventDefault(); });
  // register touch event handlers
  el.addEventListener('touchstart', swipeStart);
  el.addEventListener('touchmove', swipeMove);
  el.addEventListener('touchend', swipeEnd);
}

// handle card action (like, superlike, nope)
async function handleCardAction(action, cardEl) {
  const docId = cardEl.dataset.docId;
  if (!docId) return;
  // debug log
  console.log('handleCardAction', { action, docId });
  // perform action
  switch (action) {
    case 'like':
      await handleLike(docId);
      break;
    case 'superlike':
      await handleSuperlike(docId);
      break;
    case 'nope':
      await handleNope(docId);
      break;
  }
  // update deck
  topIndex++;
  if (topIndex >= deck.length) {
    topIndex = 0;
    // shuffle or fetch more profiles
    shuffleDeck();
  }
  renderDeck();
}

// shuffle the deck (simple random shuffle)
function shuffleDeck() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// start listening to profiles collection
async function startProfilesListener() {
  if (!db) return console.error('db missing');
  if (unsubProfiles) { try { unsubProfiles(); } catch(e){} unsubProfiles = null; }

  console.log('startProfilesListener — meUid=', meUid);

  // attempt preferred collection first, then fallback to "users"
  const tryCollections = ['profiles','users'];
  for (const colName of tryCollections) {
    const colRef = collection(db, colName);
    // try query with updatedAt; if your docs don't have updatedAt you can remove orderBy
    let q;
    try {
      q = query(colRef, where('visible','==', true), orderBy('updatedAt','desc'), limit(60));
    } catch (err) {
      // fallback: no orderBy
      q = query(colRef, where('visible','==', true), limit(60));
    }

    try {
      unsubProfiles = onSnapshot(q, snap => {
        const items = [];
        snap.forEach(d => {
          const data = d.data();
          // compatibility with both schema variants
          const fullName = data.fullName || data.displayName || data.name;
          const photo = data.photoURL || data.photoUrl || data.photo;
          const skills = data.skills || data.techSkills || data.skillsList;
          const visible = (typeof data.visible === 'boolean') ? data.visible : true;
          // debug log
          // console.log('doc', d.id, { fullName, photo, skills, visible });
          if (!visible) return;
          if (!fullName || !photo || !skills) return; // enforce completeness
          if (meUid && d.id === meUid) return;
          items.push({ id: d.id, data: { fullName, photoURL: photo, skills, ...data } });
        });
        console.log(`snapshot from ${colName}: ${items.length} items`);
        deck = items;
        topIndex = 0;
        renderDeck();
      }, err => {
        console.warn(`onSnapshot error for ${colName}`, err);
      });

      // if listener set successfully, stop trying other collections
      if (unsubProfiles) {
        console.log('listening to collection:', colName);
        return;
      }
    } catch (e) {
      console.warn('query/setup failed for', colName, e);
      if (unsubProfiles) { try { unsubProfiles(); } catch(_){} unsubProfiles = null; }
    }
  }

  console.error('No profiles listener could be started. Check collection names and rules.');
}

// start initial profile listener
startProfilesListener();