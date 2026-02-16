import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Load existing config
async function loadConfig() {
    const configDoc = await getDoc(doc(db, "config", "store"));
    if (configDoc.exists()) {
        const config = configDoc.data();
        document.getElementById('storeNameInput').value = config.name || '';
        document.getElementById('storeLogoInput').value = config.logo || '';
        document.getElementById('saldoInput').value = config.saldo || 0;
        document.getElementById('logoPreview').src = config.logo || 'https://via.placeholder.com/80/6c5ce7/ffffff?text=Logo';
    }
}

// Preview logo
document.getElementById('storeLogoInput').addEventListener('input', function(e) {
    document.getElementById('logoPreview').src = e.target.value || 'https://via.placeholder.com/80/6c5ce7/ffffff?text=Logo';
});

// Save config
window.saveConfig = async function() {
    const name = document.getElementById('storeNameInput').value;
    const logo = document.getElementById('storeLogoInput').value;
    const saldo = parseInt(document.getElementById('saldoInput').value) || 0;
    const firebaseConfig = document.getElementById('firebaseConfig').value;
    
    if (!name) {
        alert("Nama toko harus diisi!");
        return;
    }
    
    // Save to Firestore
    await setDoc(doc(db, "config", "store"), {
        name: name,
        logo: logo || "https://via.placeholder.com/45/6c5ce7/ffffff?text=FF",
        saldo: saldo,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    
    // Save Firebase config to localStorage (for demo)
    if (firebaseConfig) {
        try {
            const config = JSON.parse(firebaseConfig);
            localStorage.setItem('firebaseConfig', JSON.stringify(config));
        } catch (e) {
            alert("Format JSON tidak valid!");
            return;
        }
    }
    
    alert("Konfigurasi disimpan!");
    window.location.href = 'admin.html';
};

loadConfig();