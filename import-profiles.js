/*
  Unified import script for MeetXBuild
  Usage examples (PowerShell):
    # quick import (no image uploads)
    $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\sa.json"
    node import-profiles.js

    # full import: download remote images and upload to Storage, make public
    $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\sa.json"
    $env:UPLOAD_IMAGES="true"; $env:MAKE_PUBLIC="true"
    node import-profiles.js --input=profiles.json --bucket=meetxbuild.firebasestorage.app

  Options (env or CLI flags):
    UPLOAD_IMAGES=true         (env) or --upload-images
    MAKE_PUBLIC=true           (env) or --make-public
    USE_NAME_AS_ID=true        (env) or --use-name-as-id
    BUCKET_NAME=...            (env) or --bucket=name
    INPUT_FILE=profiles.json   (env) or --input=path
    PREFIX=profiles            (env) or --prefix=profiles
*/

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// fetch: use global if available (node18+), otherwise try node-fetch
let fetchFn;
try {
  fetchFn = globalThis.fetch.bind(globalThis);
} catch {
  try {
    const nodeFetch = await import("node-fetch");
    fetchFn = nodeFetch.default;
  } catch (e) {
    console.error("fetch not available and node-fetch not installed. Install: npm i node-fetch");
    process.exit(1);
  }
}

// simple argv -> opts
const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? "true" : v];
}));

const env = process.env;
const KEY_PATH = env.GOOGLE_APPLICATION_CREDENTIALS;
if (!KEY_PATH) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path and retry.");
  process.exit(1);
}

const UPLOAD_IMAGES = (env.UPLOAD_IMAGES || argv["upload-images"] || "false").toLowerCase() === "true";
const MAKE_PUBLIC = (env.MAKE_PUBLIC || argv["make-public"] || "false").toLowerCase() === "true";
const USE_NAME_AS_ID = (env.USE_NAME_AS_ID || argv["use-name-as-id"] || "false").toLowerCase() === "true";
const BUCKET_NAME = (env.BUCKET_NAME || argv["bucket"] || "meetxbuild.firebasestorage.app");
const INPUT_FILE = (env.INPUT_FILE || argv["input"] || "profiles.json");
const PREFIX = (env.PREFIX || argv["prefix"] || "profiles");

// initialize admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: BUCKET_NAME
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// small helpers
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

async function uploadFromUrl(url, destPath) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buf = await res.arrayBuffer();
  const buffer = Buffer.from(buf);

  const file = bucket.file(destPath);
  await file.save(buffer, { metadata: { contentType } });

  if (MAKE_PUBLIC) {
    try { await file.makePublic(); } catch (err) { console.warn("makePublic failed:", err.message || err); }
    return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destPath)}`;
  } else {
    // return gs:// path as fallback
    return `gs://${bucket.name}/${destPath}`;
  }
}

function normalizeProfile(p) {
  return {
    fullName: p.name || p.fullName || "",
    age: p.age || null,
    photo: p.photo || p.photoURL || null,
    status: p.status || "",
    location: p.location || "",
    occupation: p.occupation || p.role || "",
    skills: (typeof p.skills === "string") ? p.skills.split(",").map(s => s.trim()).filter(Boolean) : (p.skills || []),
    interests: p.interests || "",
  };
}

async function run() {
  const dataPath = path.resolve(process.cwd(), INPUT_FILE);
  if (!fs.existsSync(dataPath)) {
    console.error("Input file not found:", dataPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, "utf8");
  let list;
  try { list = JSON.parse(raw); } catch (e) { console.error("Invalid JSON in", dataPath, e.message); process.exit(1); }

  console.log(`Importing ${list.length} profiles -> Firestore collection "profiles" (bucket: ${BUCKET_NAME})`);
  for (const p of list) {
    try {
      const np = normalizeProfile(p);
      const docId = USE_NAME_AS_ID ? slugify(np.fullName || `u-${Date.now()}`) : db.collection("profiles").doc().id;
      const docRef = db.collection("profiles").doc(docId);

      let photoURL = np.photo || null;
      if (UPLOAD_IMAGES && np.photo) {
        const dest = `${PREFIX}/${docId}/photo.jpg`;
        try {
          photoURL = await uploadFromUrl(np.photo, dest);
          console.log("Uploaded photo for", np.fullName, "->", photoURL);
        } catch (err) {
          console.warn("Photo upload failed for", np.fullName, err.message || err);
          photoURL = np.photo; // fallback to original
        }
      }

      const doc = {
        fullName: np.fullName,
        age: np.age,
        photoURL,
        status: np.status,
        location: np.location,
        occupation: np.occupation,
        skills: np.skills,
        interests: np.interests,
        visible: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await docRef.set(doc);
      console.log("Imported:", doc.fullName || "(no name)", "->", docRef.id);
    } catch (err) {
      console.error("Failed to import profile", p && (p.name || p.fullName), err.message || err);
    }
  }

  console.log("Import finished.");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });