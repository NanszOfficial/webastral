import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";  // ✅ Harus ada GoogleAuthProvider
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// 🔥 GANTI DENGAN KONFIGURASI FIREBASE KAMU!
const firebaseConfig = {
    apiKey: "AIzaSyAYgqXLTahTAnDPpoTaKhu5siwznIaTkcE",
    authDomain: "aastralshopid.firebaseapp.com",
    projectId: "astralshopid",
    storageBucket: "astralshopid.firebasestorage.app",
    messagingSenderId: "922128055018",
    appId: "1:922128055018:web:2452768a1a3921eb05f593"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider(); // ✅ Ini baru bisa jalan