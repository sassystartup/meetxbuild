/*
  Final Tinder-style swipe deck for MeetXBuild
  Uses full-screen cards with photo background
*/

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const auth = window.auth;
const db = window.db;

// UI elements
const container = document.getElementById("swipe-card-container");
const blockedEl = document.getElementById("swipeBlocked");

// Buttons
const btnLike = document.querySelector("[data-action='like']");
const btnNope = document.querySelector("[data-action='nope']");
const btnSuper = document.querySelector("[data-action='superlike']");

// ----------------------- PROFILE COMPLETENESS CHECK -----------------------
function profileIsComplete(d) {
  if (!d) return false;
  return (
    d.fullName &&
    (d.photoURL || d.photoUrl) &&
    Array.isArray(d.skills) &&
    d.skills.length > 0
  );
}

function setBlocked(isBlocked) {
  if (!blockedEl) return;
  blockedEl.style.display = isBlocked ? "flex" : "none";
  document.body.classList.toggle("blocked", isBlocked);
}

// ----------------------- LISTEN FOR MY PROFILE -----------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setBlocked(true);
    return;
  }

  // Check my profile completeness
  const snap = await getDoc(doc(db, "profiles", user.uid));
  const ok = snap.exists() && profileIsComplete(snap.data());
  setBlocked(!ok);
});

// ----------------------- CARD DECK STATE -----------------------
let deck = [];
let index = 0;

// ----------------------- RENDER CARD -----------------------
function renderCard(item) {
  if (!item) {
    container.innerHTML = `<div style="text-align:center;color:#ccc;margin-top:50px;">No more profiles</div>`;
    return;
  }

  const d = item.data;
  const photo = d.photoURL || d.photoUrl || "";
  const name = d.fullName || "";
  const skills = Array.isArray(d.skills) ? d.skills.join(", ") : "";

  container.innerHTML = `
    <div class="swipe-card" style="
      position:absolute;
      top:0; left:0; right:0; bottom:0;
      border-radius:22px;
      overflow:hidden;
      background:#000;
      display:flex;
      justify-content:flex-end;
      flex-direction:column;
      box-shadow:0 12px 40px rgba(0,0,0,.55);
      background-image:url('${photo}');
      background-size:cover;
      background-position:center;
    ">
      <div style="
        background:linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0));
        padding:22px;
        color:white;
      ">
        <div style="font-size:1.6rem;font-weight:800;">${name}</div>
        <div style="opacity:0.85;margin-top:4px;font-size:1rem;">${skills}</div>
      </div>
    </div>
  `;
}

// ----------------------- SWIPE ACTIONS -----------------------
async function doSwipe(action) {
  const item = deck[index];
  if (!item) return;

  const myId = window.meUid;
  const targetId = item.id;

  const liked = action !== "nope";

  await window.handleSwipe(myId, targetId, liked);

  index++;
  if (index >= deck.length) {
    container.innerHTML = `<div style="margin-top:3rem;text-align:center;color:white;">You're all caught up! 🔥</div>`;
  } else {
    renderCard(deck[index]);
  }
}

// Buttons → actions
btnLike?.addEventListener("click", () => doSwipe("like"));
btnSuper?.addEventListener("click", () => doSwipe("superlike"));
btnNope?.addEventListener("click", () => doSwipe("nope"));

// ----------------------- FETCH & LISTEN FOR PROFILES -----------------------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function startProfiles() {
  const col = collection(db, "profiles");

  let q;
  try {
    q = query(col, where("visible", "==", true), orderBy("updatedAt", "desc"), limit(80));
  } catch {
    q = query(col, where("visible", "==", true), limit(80));
  }

  onSnapshot(q, (snap) => {
    const myId = window.meUid;
    const items = [];

    snap.forEach((docSnap) => {
      if (docSnap.id === myId) return; // exclude myself
      const d = docSnap.data();
      if (!profileIsComplete(d)) return;

      items.push({
        id: docSnap.id,
        data: d
      });
    });

    shuffle(items);
    deck = items;
    index = 0;

    renderCard(deck[index]);
  });
}

startProfiles();
