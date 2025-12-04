/*
  Reactive, live swipe deck with profile-completion gate.
  - Requires app.js to run first and expose window.auth and window.db
*/
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const auth = window.auth;
const db = window.db;
const meUid = window.meUid;

if (!auth || !db) {
  console.error("swipe.js: window.auth/window.db not found — ensure app.js loads before swipe.js");
}

// UI
const blockedEl = document.getElementById("swipeBlocked");
const container = document.getElementById("swipe-card-container");
const fabButtons = Array.from(
  document.querySelectorAll(".fab, #btnLike, #btnNope, #btnSuperlike")
).filter(Boolean);
const goProfileBtn = document.getElementById("goProfileBtn");

// ---------- FIX 1: Correct profile completeness check ----------
function profileIsComplete(data) {
  if (!data) return false;

  const hasName = !!(data.fullName && String(data.fullName).trim());

  // Accept ANY photo field (photoURL, photoUrl, photo)
  const photo =
    data.photoURL ||
    data.photoUrl ||
    data.photo ||
    "";

  const hasPhoto = !!String(photo).trim();

  const skills = data.skills;
  const hasSkills = Array.isArray(skills)
    ? skills.length > 0
    : typeof skills === "string" && skills.trim().length > 0;

  return hasName && hasPhoto && hasSkills;
}

// Block/unblock
function setBlocked(blocked) {
  if (!blockedEl) return;
  blockedEl.style.display = blocked ? "flex" : "none";
  if (container) container.classList.toggle("blocked", blocked);
  fabButtons.forEach((b) => {
    try {
      b.disabled = blocked;
      b.style.opacity = blocked ? "0.45" : "1";
    } catch (e) {}
  });
  if (blocked) document.documentElement.classList.add("swipe-blocked");
  else document.documentElement.classList.remove("swipe-blocked");
}

// Styles for blocking
const style = document.createElement("style");
style.textContent = `
  .swipe-blocked #swipe-card-container,
  .swipe-blocked #swipe-card-container * {
    pointer-events: none !important;
  }
  .swipe-blocked .swipe-actions { pointer-events: auto; }
`;
document.head.appendChild(style);

// Go to profile
if (goProfileBtn) {
  goProfileBtn.addEventListener("click", () => {
    if (goProfileBtn.tagName.toLowerCase() !== "a") {
      window.location.href = "profile.html";
    }
  });
}

let unsubscribeMyProfile = null;

// ---------- FIX 2: Listen to my profile + check completeness ----------
onAuthStateChanged(auth, async (user) => {
  if (unsubscribeMyProfile) {
    try {
      unsubscribeMyProfile();
    } catch (e) {}
    unsubscribeMyProfile = null;
  }

  if (!user) {
    setBlocked(true);
    return;
  }

  const myRef = doc(db, "profiles", user.uid);

  unsubscribeMyProfile = onSnapshot(
    myRef,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const ok = profileIsComplete(data);
      setBlocked(!ok);
    },
    (err) => {
      console.error("swipe: my profile snapshot error", err);
      setBlocked(true);
    }
  );

  try {
    const snap = await getDoc(myRef);
    const ok = snap.exists() && profileIsComplete(snap.data());
    setBlocked(!ok);
  } catch (err) {
    console.error("swipe: my profile get error", err);
    setBlocked(true);
  }
});

// ---------- Notification system ----------
const _notifyRoot = document.createElement("div");
_notifyRoot.id = "liveNotifications";
_notifyRoot.style.position = "fixed";
_notifyRoot.style.left = "50%";
_notifyRoot.style.top = "14px";
_notifyRoot.style.transform = "translateX(-50%)";
_notifyRoot.style.zIndex = "140";
_notifyRoot.style.display = "flex";
_notifyRoot.style.flexDirection = "column";
_notifyRoot.style.gap = "10px";
_notifyRoot.style.alignItems = "center";
document.body.appendChild(_notifyRoot);

function showNotification(title, subtitle = "", img) {
  const n = document.createElement("div");
  n.className = "live-notify";
  n.style.display = "flex";
  n.style.alignItems = "center";
  n.style.gap = "10px";
  n.style.minWidth = "220px";
  n.style.maxWidth = "420px";
  n.style.padding = "10px 14px";
  n.style.borderRadius = "12px";
  n.style.background = "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(0,0,0,0.06))";
  n.style.boxShadow = "0 12px 30px rgba(2,6,23,0.6)";
  n.style.backdropFilter = "blur(6px)";
  n.style.opacity = "0";
  n.style.transform = "translateY(-8px)";
  n.style.transition =
    "transform .28s cubic-bezier(.2,.9,.3,1), opacity .28s";

  const avatar = document.createElement("div");
  avatar.style.width = "44px";
  avatar.style.height = "44px";
  avatar.style.borderRadius = "10px";
  avatar.style.background = "#0b1220";
  avatar.style.display = "grid";
  avatar.style.placeItems = "center";
  avatar.style.overflow = "hidden";
  avatar.style.flex = "0 0 44px";

  if (img) {
    const im = document.createElement("img");
    im.src = img;
    im.style.width = "100%";
    im.style.height = "100%";
    im.style.objectFit = "cover";
    avatar.appendChild(im);
  } else {
    avatar.textContent = "👤";
  }

  const txt = document.createElement("div");
  const t = document.createElement("div");
  t.style.fontWeight = "800";
  t.textContent = title;

  const s = document.createElement("div");
  s.style.fontSize = "0.82rem";
  s.style.color = "var(--muted)";
  s.textContent = subtitle;

  txt.appendChild(t);
  txt.appendChild(s);

  n.appendChild(avatar);
  n.appendChild(txt);
  _notifyRoot.appendChild(n);

  requestAnimationFrame(() => {
    n.style.opacity = "1";
    n.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    n.style.opacity = "0";
    n.style.transform = "translateY(-8px)";
    setTimeout(() => n.remove(), 420);
  }, 4200);
}

// ---------- Likes listener ----------
let _unsubLikes = null;
const _seenLikeIds = new Set();

window.startLikesListener = function () {
  if (!window.meUid) return;

  if (_unsubLikes) {
    try {
      _unsubLikes();
    } catch (e) {}
    _unsubLikes = null;
    _seenLikeIds.clear();
  }

  const q = query(
    collection(db, "likes"),
    where("to", "==", window.meUid),
    where("liked", "==", true)
  );

  _unsubLikes = onSnapshot(
    q,
    async (snap) => {
      snap.docChanges().forEach(async (chg) => {
        if (chg.type !== "added") return;
        const id = chg.doc.id;
        if (_seenLikeIds.has(id)) return;
        _seenLikeIds.add(id);

        let title = "Someone liked you";
        let photo = null;

        const data = chg.doc.data();
        if (data && data.from) {
          try {
            const pSnap = await getDoc(doc(db, "profiles", data.from));
            if (pSnap.exists()) {
              const p = pSnap.data();
              title = p.fullName || title;
              photo = p.photoURL || p.photoUrl || null;
            }
          } catch (e) {}
        }

        showNotification(title, "Liked your profile", photo);
      });
    },
    (err) => console.error("likes listener error", err)
  );
};

window.stopLikesListener = function () {
  if (_unsubLikes) {
    try {
      _unsubLikes();
    } catch (e) {}
    _unsubLikes = null;
  }
  _seenLikeIds.clear();
};

// ---------- Swipe Deck ----------
let unsubProfiles = null;
let deck = [];
let topIndex = 0;

function renderDeck() {
  if (!Array.isArray(deck)) deck = [];

  const frag = document.createDocumentFragment();
  const preloadList = [];

  deck.slice(topIndex, topIndex + 3).forEach((item, i) => {
    const el = document.createElement("div");
    el.className = "swipe-card";
    el.style.zIndex = `${deck.length - i}`;

    const data = item.data;
    const name = (data.fullName || "").trim();
    const photo = (data.photoURL || data.photoUrl || "").trim();
    const skills = Array.isArray(data.skills)
      ? data.skills.join(", ")
      : (data.skills || "").trim();

    el.dataset.docId = item.id;
    el.dataset.index = `${topIndex + i}`;

    el.innerHTML = `
      <div class="card-bg" aria-hidden="true" style="background-image:url('${photo}')"></div>
      <div class="card-content">
        <div class="card-header">
          <div class="card-title">${name}</div>
          <div class="card-subtitle">${skills}</div>
        </div>
        <div class="card-actions">
          <button class="fab" data-action="superlike"><img src="assets/svgs/star.svg"></button>
          <button class="fab" data-action="like"><img src="assets/svgs/heart.svg"></button>
          <button class="fab" data-action="nope"><img src="assets/svgs/xmark.svg"></button>
        </div>
      </div>
    `;

    frag.appendChild(el);

    if (photo) preloadList.push(photo);
  });

  container.innerHTML = "";
  container.appendChild(frag);

  preloadImages(preloadList);
}

function preloadImages(urls) {
  if (!Array.isArray(urls)) return;
  const div = document.createElement("div");
  div.style.display = "none";
  document.body.appendChild(div);
  urls.forEach((u) => {
    const img = document.createElement("img");
    img.src = u;
    div.appendChild(img);
  });
}

// ---------- Card Actions ----------
async function handleCardAction(action, cardEl) {
  const targetId = cardEl.dataset.docId;
  if (!targetId) return;

  if (action === "like") {
    await window.handleSwipe(window.meUid, targetId, true);
  } else if (action === "superlike") {
    await window.handleSwipe(window.meUid, targetId, true);
  } else if (action === "nope") {
    await window.handleSwipe(window.meUid, targetId, false);
  }

  topIndex++;
  if (topIndex >= deck.length) {
    topIndex = 0;
    shuffleDeck();
  }
  renderDeck();
}

function shuffleDeck() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// ---------- Fetch Profiles ----------
async function startProfilesListener() {
  if (unsubProfiles) {
    try {
      unsubProfiles();
    } catch (e) {}
    unsubProfiles = null;
  }

  const colRef = collection(db, "profiles");

  let q;
  try {
    q = query(
      colRef,
      where("visible", "==", true),
      orderBy("updatedAt", "desc"),
      limit(80)
    );
  } catch {
    q = query(colRef, where("visible", "==", true), limit(80));
  }

  unsubProfiles = onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => {
        const data = d.data();

        const name = data.fullName || "";
        const photo = data.photoURL || data.photoUrl || "";
        const skills = data.skills || [];

        if (!name || !photo || !skills) return;
        if (d.id === window.meUid) return;

        items.push({
          id: d.id,
          data: {
            ...data,
            fullName: name,
            photoURL: photo,
            skills
          }
        });
      });

      deck = items;
      topIndex = 0;
      renderDeck();
    },
    (err) => console.error("profiles snapshot failed", err)
  );
}

startProfilesListener();
