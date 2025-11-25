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

// Helper: ensure user signed in via Google popup
export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}
window.ensureSignedIn = ensureSignedIn;

// Central save handler used by profile page
export async function saveProfile(evt) {
  if (evt && evt.preventDefault) evt.preventDefault();
  try {
    const user = await ensureSignedIn();
    if (!user) throw new Error("Not signed in");

    const form = document.getElementById("profileForm");
    if (!form) throw new Error("profileForm not found");

    const fd = new FormData(form);

    // City: prefer manual input if visible
    let city = fd.get("city") || "";
    const cityManual = document.getElementById("cityManual");
    const citySelect = document.getElementById("citySelect");

    if (cityManual && cityManual.style.display !== "none" && cityManual.value.trim()) {
      city = cityManual.value.trim();
    } else if (citySelect && citySelect.style.display !== "none" && citySelect.value) {
      city = citySelect.value;
    }

    // tech skills hidden input (comma-separated string → array)
    const techHidden = (fd.get("techSkills") || "").toString();
    const techSkills = techHidden
      ? techHidden.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // general skills (textarea)
    const skillsRaw = (fd.get("skills") || "").toString();
    const skills = skillsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // photoUrl may be set by profile-photo.js; if not and a file is selected, upload now
    let photoURL = (fd.get("photoUrl") || "").toString().trim() || null;
    const photoInput = document.getElementById("photo");
    if (!photoURL && photoInput && photoInput.files && photoInput.files[0]) {
      const file = photoInput.files[0];
      const destRef = storageRef(storage, `profiles/${user.uid}/photo.jpg`);
      await uploadBytes(destRef, file);
      photoURL = await getDownloadURL(destRef);

      // update hidden field so UI reflects it
      const hidden = document.querySelector('input[name="photoUrl"]');
      if (hidden) hidden.value = photoURL;
      console.log("Uploaded photo, url=", photoURL);
    }

    const payload = {
      fullName: (fd.get("fullName") || "").toString().trim(),
      role: (fd.get("role") || "").toString(),
      visaStatus: (fd.get("visaStatus") || "").toString(),
      occupation: (fd.get("occupation") || "").toString(),
      state: (fd.get("state") || "").toString(),
      city,
      skills,
      techSkills,
      photoURL,
      visible: true,
      updatedAt: serverTimestamp()
    };

    // Basic validation
    if (!payload.fullName) {
      alert("Please enter your full name.");
      return;
    }
    if (!payload.photoURL) {
      alert("Please choose and upload a profile photo.");
      return;
    }
    if (!payload.skills || payload.skills.length === 0) {
      alert("Please add at least one skill (comma separated).");
      return;
    }

    // Save to Firestore under profiles/{uid}
    const ref = doc(db, "profiles", user.uid);
    await setDoc(ref, payload, { merge: true });
    console.log("Profile saved for", user.uid);

    // Redirect to swipe page
    window.location.href = "swipe.html";
  } catch (err) {
    console.error("saveProfile failed", err);
    alert("Failed to save profile: " + (err.message || err));
    throw err;
  }
}
window.saveProfile = saveProfile;

// Optional sign-out helper
window.signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn(e);
  }
};

// Auth state watcher — keep global meUid, notify swipe.js if present
onAuthStateChanged(auth, (user) => {
  window.meUid = user ? user.uid : null;
  console.log("auth changed", window.meUid);
  try {
    if (window.meUid) {
      if (typeof window.startLikesListener === "function") window.startLikesListener();
    } else {
      if (typeof window.stopLikesListener === "function") window.stopLikesListener();
    }
  } catch (e) {
    console.warn(e);
  }
});

// ---------- Helpers ----------
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
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// ---------- Router ----------
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page; // set in each HTML: <body data-page="login"> etc.

  switch (page) {
    case "signup":
      initSignupPage();
      break;
    case "login":
      initLoginPage();
      break;
    case "profile":
      initProfilePage();
      break;
    case "swipe":
      // swipe logic is handled by swipe.js (which uses window.auth/db)
      break;
    case "matches":
      initMatchesPage();
      break;
    case "chats":
      initChatsPage();
      break;
    case "chat":
      initChatPage();
      break;
    default:
      break;
  }
});

// ================= SIGNUP =================
function initSignupPage() {
  const form =
    document.getElementById("signupForm") ||
    document.getElementById("signup-form");

  if (!form) {
    console.warn("Signup form not found");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email =
      form.email?.value.trim() ||
      document.getElementById("signup-email")?.value?.trim();
    const password =
      form.password?.value.trim() ||
      document.getElementById("signup-password")?.value?.trim();

    if (!email || !password) {
      alert("Email and password are required.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      console.log("User created:", cred.user.uid);
      window.location.href = "profile.html";
    } catch (err) {
      console.error("Signup error:", err);
      alert(err.message);
    }
  });
}

// ================= LOGIN =================
function initLoginPage() {
  const form =
    document.getElementById("loginForm") ||
    document.getElementById("login-form");

  if (!form) {
    console.warn("Login form not found (Google login may be handled inline)");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email =
      form.email?.value.trim() ||
      document.getElementById("login-email")?.value?.trim();
    const password =
      form.password?.value.trim() ||
      document.getElementById("login-password")?.value?.trim();

    if (!email || !password) {
      alert("Email and password are required.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Logged in");
      window.location.href = "swipe.html";
    } catch (err) {
      console.error("Login error:", err);
      alert(err.message);
    }
  });
}

// ================= PROFILE (prefill only) =================
function initProfilePage() {
  requireAuth(async (user) => {
    const form =
      document.getElementById("profile-form") ||
      document.getElementById("profileForm");
    if (!form) {
      console.warn("Profile form not found");
      return;
    }

    const profileRef = doc(db, "profiles", user.uid);
    const snap = await getDoc(profileRef);

    if (snap.exists()) {
      const d = snap.data();
      if (form.fullName) form.fullName.value = d.fullName || "";

      // Support both immigrantStatus and visaStatus (for older profiles)
      const immInput = form.immigrantStatus || form.visaStatus;
      if (immInput) immInput.value = d.immigrantStatus || d.visaStatus || "";

      if (form.occupation) form.occupation.value = d.occupation || "";
      if (form.skills)
        form.skills.value = Array.isArray(d.skills) ? d.skills.join(", ") : d.skills || "";
      if (form.role) form.role.value = d.role || "";
      if (form.state) form.state.value = d.state || "";
      if (form.city) form.city.value = d.city || "";

      if (form.photoUrl) {
        form.photoUrl.value = d.photoURL || d.photoUrl || "";
      }
    }
  });
}

// ================= SWIPE (legacy – swipe.js now handles UI) =================
async function initSwipePage() {
  // left intentionally minimal; real swipe deck logic lives in swipe.js
  console.log("Swipe page: using swipe.js for card logic");
}

// ---------- swipe storage helpers (for old flow / chat & matches) ----------
async function handleSwipe(myId, targetId, liked) {
  const swipeRef = doc(db, "swipes", `${myId}_${targetId}`);
  await setDoc(swipeRef, {
    from: myId,
    to: targetId,
    liked,
    timestamp: serverTimestamp()
  });

  if (!liked) return;

  // Check if they liked me back
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

// ================= MATCHES =================
async function fetchMatchesForUser(userId) {
  const qLikes = query(
    collection(db, "swipes"),
    where("from", "==", userId),
    where("liked", "==", true)
  );

  const likeSnap = await getDocs(qLikes);
  const matches = [];

  for (const likeDoc of likeSnap.docs) {
    const toId = likeDoc.data().to;
    const backRef = doc(db, "swipes", `${toId}_${userId}`);
    const backSnap = await getDoc(backRef);

    if (backSnap.exists() && backSnap.data().liked) {
      const profSnap = await getDoc(doc(db, "profiles", toId));
      if (profSnap.exists()) {
        matches.push({ id: toId, ...profSnap.data() });
      }
    }
  }
  return matches;
}

function initMatchesPage() {
  const listEl = document.getElementById("matchesList");
  if (!listEl) return;

  requireAuth(async (user) => {
    const matches = await fetchMatchesForUser(user.uid);

    if (!matches.length) {
      listEl.innerHTML = "<p>No matches yet. Keep swiping!</p>";
      return;
    }

    matches.forEach((m) => {
      const li = document.createElement("li");
      li.className = "match-item";
      li.innerHTML = `
        ${
          m.photoURL
            ? `<img src="${m.photoURL}" class="avatar">`
            : `<div class="avatar placeholder">${(m.fullName || "U")[0]}</div>`
        }
        <div class="match-main">
          <div class="match-name">${m.fullName || "User"}</div>
          <div class="match-meta">${m.immigrantStatus || m.visaStatus || ""}</div>
        </div>
        <a href="chat.html?with=${m.id}" class="match-chat-link">Chat →</a>
      `;
      listEl.appendChild(li);
    });
  });
}

// ================= CHATS LIST =================
function initChatsPage() {
  const listEl = document.getElementById("chatsList");
  if (!listEl) return;

  requireAuth(async (user) => {
    const matches = await fetchMatchesForUser(user.uid);

    if (!matches.length) {
      listEl.innerHTML =
        "<p>No chats yet. Match with someone to start talking.</p>";
      return;
    }

    matches.forEach((m) => {
      const li = document.createElement("li");
      li.className = "chat-list-item";
      li.innerHTML = `
        ${
          m.photoURL
            ? `<img src="${m.photoURL}" class="avatar">`
            : `<div class="avatar placeholder">${(m.fullName || "U")[0]}</div>`
        }
        <div class="chat-list-main">
          <div class="chat-list-name">${m.fullName || "User"}</div>
          <div class="chat-list-meta">${m.immigrantStatus || m.visaStatus || ""}</div>
        </div>
        <a href="chat.html?with=${m.id}" class="chat-list-arrow">›</a>
      `;
      listEl.appendChild(li);
    });
  });
}

// ================= CHAT =================
function initChatPage() {
  const headerEl = document.getElementById("chatHeader");
  const msgsEl = document.getElementById("messages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  if (!headerEl || !msgsEl || !form || !input) return;

  const otherId = getQueryParam("with");
  if (!otherId) {
    headerEl.textContent = "No user selected";
    return;
  }

  requireAuth(async (user) => {
    const meId = user.uid;

    // Get other user's profile
    const otherSnap = await getDoc(doc(db, "profiles", otherId));
    const other = otherSnap.exists()
      ? otherSnap.data()
      : { fullName: "User" };

    headerEl.textContent = `Chat with ${other.fullName || "User"}`;

    const convoId = meId < otherId ? `${meId}_${otherId}` : `${otherId}_${meId}`;
    const messagesCol = collection(db, "conversations", convoId, "messages");
    const qMsgs = query(messagesCol, orderBy("createdAt"));

    // realtime listener
    onSnapshot(qMsgs, (snap) => {
      msgsEl.innerHTML = "";
      snap.forEach((docSnap) => {
        const msg = docSnap.data();
        const div = document.createElement("div");
        div.className = "message " + (msg.from === meId ? "me" : "them");
        const ts =
          msg.createdAt && msg.createdAt.toDate
            ? msg.createdAt
                .toDate()
                .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";
        div.innerHTML = `
          <div class="bubble">${msg.text || ""}</div>
          <div class="meta">${ts}</div>
        `;
        msgsEl.appendChild(div);
      });
      msgsEl.scrollTop = msgsEl.scrollHeight;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      await addDoc(messagesCol, {
        from: meId,
        to: otherId,
        text,
        createdAt: serverTimestamp()
      });
      input.value = "";
    });
  });
}
