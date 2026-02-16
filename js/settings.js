import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = user;
    
    // Load user data
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
        const data = userDoc.data();
        document.getElementById('avatarPreview').src = data.avatar;
        document.getElementById('fullName').value = data.name;
        document.getElementById('email').value = data.email;
    }
    
    // Load store config
    const configDoc = await getDoc(doc(db, "config", "store"));
    if (configDoc.exists()) {
        document.getElementById('storeLogo').src = configDoc.data().logo;
        document.getElementById('storeName').textContent = configDoc.data().name;
    }
});

window.changeAvatar = function() {
    document.getElementById('avatarInput').click();
};

document.getElementById('avatarInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('avatarPreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

window.saveSettings = async function() {
    const name = document.getElementById('fullName').value;
    const avatarFile = document.getElementById('avatarInput').files[0];
    
    try {
        let avatarUrl = document.getElementById('avatarPreview').src;
        
        // Upload new avatar if selected
        if (avatarFile) {
            const storageRef = ref(storage, `avatars/${currentUser.uid}_${Date.now()}`);
            await uploadBytes(storageRef, avatarFile);
            avatarUrl = await getDownloadURL(storageRef);
            
            // Update Firebase Auth profile
            await updateProfile(currentUser, {
                photoURL: avatarUrl
            });
        }
        
        // Update Firestore
        await updateDoc(doc(db, "users", currentUser.uid), {
            name: name,
            avatar: avatarUrl
        });
        
        alert("Data berhasil disimpan!");
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error("Error saving settings:", error);
        alert("Gagal menyimpan data");
    }
};