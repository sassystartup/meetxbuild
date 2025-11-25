/*
  Upload chosen file to Firebase Storage and set hidden input photoUrl.
  Requires app.js to run first and expose window.auth, window.db, window.storage.
  Include in profile.html as: <script type="module" src="profile-photo.js"></script>
*/
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const form = document.getElementById('profileForm');
const photoInput = document.getElementById('photo');
const preview = document.getElementById('photoPreview');
const hiddenUrl = form.querySelector('input[name="photoUrl"]');

const MAX_BYTES = 4 * 1024 * 1024;

function fileToJpegFile(file, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Not an image'));
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') return resolve(file);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Conversion failed'));
          resolve(new File([blob], (file.name.replace(/\.[^.]+$/, '') + '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

photoInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > MAX_BYTES) { alert('File too large (max 4MB)'); photoInput.value = ''; return; }
  preview.src = URL.createObjectURL(f);
  preview.style.display = 'block';
});

// upload to Storage, save URL to hidden input
async function uploadPhotoToFirebase(file) {
  if (!window.auth || !window.db || !window.storage) throw new Error('Firebase not initialized (app.js must load first)');
  const user = window.auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const jpegFile = await fileToJpegFile(file, 0.85);
  const path = `profiles/${user.uid}/photo.jpg`;
  const sRef = storageRef(window.storage, path);
  const uploadTask = uploadBytesResumable(sRef, jpegFile);

  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed',
      () => { /* progress if needed */ },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      });
  });
}

form.addEventListener('submit', async (e) => {
  const file = photoInput.files[0];
  // if no new file selected, just continue (photoUrl may already be set)
  if (!file) return;
  e.preventDefault();
  try {
    // ensure user signed in (app.js provides window.ensureSignedIn)
    if (typeof window.ensureSignedIn === 'function') await window.ensureSignedIn();
    const url = await uploadPhotoToFirebase(file);
    hiddenUrl.value = url;
    // call the central save handler if available so the same logic runs (handles auth + Firestore write)
    if (typeof window.saveProfile === 'function') {
      await window.saveProfile();
    } else {
      // fallback to native submit
      form.submit();
    }
  } catch (err) {
    console.error('Upload error', err);
    alert('Upload failed: ' + (err.message || err));
  }
});