// app.js - MeetXBuild main logic (Firebase v9 modular)
// Load this on every page with: <script type="module" src="app.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";


// ---------- Firebase config ----------
const firebaseConfig = {
  apiKey: "AIzaSyCi-WcNMhWGYX8kS6_1kR2ZsPQT_NwBvhc",
  authDomain: "meetxbuild.firebaseapp.com",
  projectId: "meetxbuild",
  storageBucket: "meetxbuild.firebasestorage.app",
  messagingSenderId: "186859990480",
  appId: "1:186859990480:web:8a548bcf722f173a4dddd5",
  measurementId: "G-FD5SXKZPRG"
};


// ---------- Initialize Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Expose globally
window.auth = auth;
window.db = db;
window.storage = storage;
window.meUid = null;



// 🔥 FIX 1 — expose handleSwipe globally so swipe.js can call it
window.handleSwipe = async function(myId, targetId, liked) {
  const swipeRef = doc(db, "swipes", `${myId}_${targetId}`);
  await setDoc(swipeRef, {
    from: myId,
    to: targetId,
    liked,
    timestamp: serverTimestamp()
  });

  // Check if mutual
  if (liked) {
    const reverseRef = doc(db, "swipes", `${targetId}_${myId}`);
    const reverseSnap = await getDoc(reverseRef);
    if (reverseSnap.exists() && reverseSnap.data().liked) {
      const matchId = [myId, targetId].sort().join("_");
      await setDoc(doc(db, "matches", matchId), {
        users: [myId, targetId],
        createdAt: serverTimestamp()
      });
    }
  }
};




// Helper: ensure user signed in via Google popup
export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);

  // 🔥 FIX 2 — After Google Login → check if profile exists → redirect accordingly
  const user = result.user;
  const ref = doc(db, "profiles", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    window.location.href = "swipe.html";   // returning user
  } else {
    window.location.href = "profile.html"; // new user
  }

  return result.user;
}
window.ensureSignedIn = ensureSignedIn;




// 🔥 FIX 3 — Save BOTH photoURL and photoUrl for swipe.js compatibility
export async function saveProfile(evt) {
  if (evt && evt.preventDefault) evt.preventDefault();

  try {
    const user = await ensureSignedIn();
    if (!user) throw new Error("Not signed in");

    const form = document.getElementById("profileForm");
    if (!form) throw new Error("profileForm not found");

    const fd = new FormData(form);

    let city = fd.get("city") || "";
    const cityManual = document.getElementById("cityManual");
    const citySelect = document.getElementById("citySelect");

    if (cityManual && cityManual.style.display !== "none" && cityManual.value.trim()) {
      city = cityManual.value.trim();
    } else if (citySelect && citySelect.style.display !== "none" && citySelect.value) {
      city = citySelect.value;
    }

    const techSkills = (fd.get("techSkills") || "")
      .toString()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const skills = (fd.get("skills") || "")
      .toString()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let photo = (fd.get("photoUrl") || "").toString().trim() || null;

    const photoInput = document.getElementById("photo");
    if (!photo && photoInput && photoInput.files && photoInput.files[0]) {
      const file = photoInput.files[0];
      const destRef = storageRef(storage, `profiles/${user.uid}/photo.jpg`);
      await uploadBytes(destRef, file);
      photo = await getDownloadURL(destRef);
      const hidden = document.querySelector('input[name="photoUrl"]');
      if (hidden) hidden.value = photo;
    }

    const payload = {
      fullName: (fd.get("fullName") || "").toString().trim(),
      role: fd.get("role") || "",
      visaStatus: fd.get("visaStatus") || "",
      occupation: fd.get("occupation") || "",
      state: fd.get("state") || "",
      city,
      skills,
      techSkills,

      // 🔥 KEY FIX: save under both names
      photoURL: photo,
      photoUrl: photo,

      visible: true,
      updatedAt: serverTimestamp()
    };

    if (!payload.fullName) return alert("Please enter your full name.");
    if (!payload.photoURL) return alert("Please upload a photo.");
    if (!payload.skills.length) return alert("Add at least one skill.");

    await setDoc(doc(db, "profiles", user.uid), payload, { merge: true });

    window.location.href = "swipe.html";

  } catch (err) {
    console.error("saveProfile failed", err);
    alert("Failed to save profile: " + (err.message || err));
  }
}
window.saveProfile = saveProfile;




// ---------- Auth State Observer ----------
onAuthStateChanged(auth, (user) => {
  window.meUid = user ? user.uid : null;

  // Start or stop swipe like listeners
  if (user) {
    if (typeof window.startLikesListener === "function") window.startLikesListener();
  } else {
    if (typeof window.stopLikesListener === "function") window.stopLikesListener();
  }
});




// ---------- Helper ----------
function requireAuth(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      if (!window.location.pathname.endsWith("login.html")) {
        window.location.href = "login.html";
      }
    } else {
      onReady(user);
    }
  });
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}




// ---------- Router ----------
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  switch (page) {
    case "signup": initSignupPage(); break;
    case "login": initLoginPage(); break;
    case "profile": initProfilePage(); break;
    case "matches": initMatchesPage(); break;
    case "chats": initChatsPage(); break;
    case "chat": initChatPage(); break;
    case "swipe": break; // handled by swipe.js
    default: break;
  }
});




// ---------- SIGN UP ----------
function initSignupPage() {
  const form = document.getElementById("signupForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.email.value.trim();
    const password = form.password.value.trim();

    if (!email || !password) return alert("Email & password required");

    await createUserWithEmailAndPassword(auth, email, password);

    window.location.href = "profile.html";
  });
}




// ---------- LOGIN ----------
function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.email.value.trim();
    const password = form.password.value.trim();

    await signInWithEmailAndPassword(auth, email, password);

    // 🔥 FIX 4 — same logic as Google login
    const ref = doc(db, "profiles", auth.currentUser.uid);
    const snap = await getDoc(ref);

    window.location.href = snap.exists() ? "swipe.html" : "profile.html";
  });
}




// ---------- PROFILE (prefill) ----------
function initProfilePage() {
  requireAuth(async (user) => {
    const form = document.getElementById("profileForm");
    if (!form) return;

    const snap = await getDoc(doc(db, "profiles", user.uid));
    if (!snap.exists()) return;

    const d = snap.data();

    form.fullName.value = d.fullName || "";
    form.skills.value = Array.isArray(d.skills) ? d.skills.join(", ") : "";
    form.role.value = d.role || "";
    form.occupation.value = d.occupation || "";
    form.state.value = d.state || "";
    form.city.value = d.city || "";

    form.photoUrl.value = d.photoURL || d.photoUrl || "";
  });
}




// ---------- MATCHES ----------
async function fetchMatchesForUser(uid) {
  const qLikes = query(
    collection(db, "swipes"),
    where("from", "==", uid),
    where("liked", "==", true)
  );

  const likeSnap = await getDocs(qLikes);
  const matches = [];

  for (const docSnap of likeSnap.docs) {
    const targetId = docSnap.data().to;
    const reverseSnap = await getDoc(doc(db, "swipes", `${targetId}_${uid}`));

    if (reverseSnap.exists() && reverseSnap.data().liked) {
      const prof = await getDoc(doc(db, "profiles", targetId));
      if (prof.exists()) matches.push({ id: targetId, ...prof.data() });
    }
  }

  return matches;
}

function initMatchesPage() {
  const list = document.getElementById("matchesList");
  if (!list) return;

  requireAuth(async (user) => {
    const matches = await fetchMatchesForUser(user.uid);

    if (!matches.length) {
      list.innerHTML = "<p>No matches yet</p>";
      return;
    }

    matches.forEach((m) => {
      list.innerHTML += `
        <li class="match-item">
          <img src="${m.photoURL || m.photoUrl}" class="avatar">
          <div>${m.fullName}</div>
          <a href="chat.html?with=${m.id}">Chat →</a>
        </li>
      `;
    });
  });
}




// ---------- CHATS ----------
function initChatsPage() {
  const list = document.getElementById("chatsList");
  if (!list) return;

  requireAuth(async (user) => {
    const matches = await fetchMatchesForUser(user.uid);

    matches.forEach((m) => {
      list.innerHTML += `
        <li class="chat-list-item">
          <img src="${m.photoURL || m.photoUrl}" class="avatar">
          <div>${m.fullName}</div>
          <a href="chat.html?with=${m.id}">›</a>
        </li>
      `;
    });
  });
}




// ---------- CHAT ----------
function initChatPage() {
  const header = document.getElementById("chatHeader");
  const msgsEl = document.getElementById("messages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");

  const otherId = getQueryParam("with");
  if (!otherId) return;

  requireAuth(async (user) => {
    const convoId = user.uid < otherId ? `${user.uid}_${otherId}` : `${otherId}_${user.uid}`;
    const messagesCol = collection(db, "conversations", convoId, "messages");

    const otherSnap = await getDoc(doc(db, "profiles", otherId));
    header.textContent = "Chat with " + (otherSnap.data()?.fullName || "User");

    onSnapshot(query(messagesCol, orderBy("createdAt")), (snap) => {
      msgsEl.innerHTML = "";
      snap.forEach((m) => {
        msgsEl.innerHTML += `
          <div class="message ${m.data().from === user.uid ? "me" : "them"}">
            <div class="bubble">${m.data().text}</div>
          </div>
        `;
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      await addDoc(messagesCol, {
        from: user.uid,
        to: otherId,
        text,
        createdAt: serverTimestamp()
      });

      input.value = "";
    });
  });
}
