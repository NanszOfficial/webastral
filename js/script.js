import { auth, db, googleProvider } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Global Variables
let currentUser = null;
let currentUserData = null;
let messagesUnsubscribe = null;

// ==================== AUTH ====================
window.loginWithGoogle = async function() {
    try {
        showLoading();
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
            const newUser = {
                uid: user.uid,
                email: user.email,
                name: user.displayName || user.email.split('@')[0],
                avatar: user.photoURL || "https://via.placeholder.com/100/6c5ce7/ffffff?text=User",
                role: "user",
                createdAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                isOnline: true,
                blocked: false
            };
            await setDoc(doc(db, "users", user.uid), newUser);
        } else {
            await updateDoc(doc(db, "users", user.uid), {
                lastSeen: new Date().toISOString(),
                isOnline: true
            });
        }
        
        hideLoading();
        closeLoginModal();
        
    } catch (error) {
        hideLoading();
        showToast("Gagal login: " + error.message, "error");
    }
};

window.logout = async function() {
    try {
        showLoading();
        if (currentUser) {
            await updateDoc(doc(db, "users", currentUser.uid), {
                isOnline: false,
                lastSeen: new Date().toISOString()
            });
        }
        if (messagesUnsubscribe) messagesUnsubscribe();
        await signOut(auth);
        hideLoading();
        showLoginModal();
    } catch (error) {
        hideLoading();
        showToast("Gagal logout", "error");
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
            
            // Cek apakah user diblokir
            if (currentUserData.blocked) {
                await signOut(auth);
                showToast("Akun Anda telah diblokir oleh admin", "error");
                showLoginModal();
                return;
            }
            
            closeLoginModal();
            initApp();
        }
    } else {
        showLoginModal();
    }
});

// ==================== UI FUNCTIONS ====================
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'grid';
    updateNavbar();
    loadShopItems();
    initChat();
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'none';
}

function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.borderLeftColor = type === "success" ? "#4caf50" : "#ff4444";
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// Update time
function updateTime() {
    const now = new Date();
    const options = { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    };
    document.getElementById('timeDisplay').textContent = now.toLocaleTimeString('id-ID', options);
}
setInterval(updateTime, 1000);
updateTime();

// ==================== NAVBAR ====================
function updateNavbar() {
    const navRight = document.getElementById('navRight');
    if (currentUserData) {
        navRight.innerHTML = `
            <a href="#" class="nav-link">Home</a>
            <a href="#" class="nav-link">Cek Pesanan</a>
            <div class="user-menu" onclick="toggleDropdown()">
                <img src="${currentUserData.avatar}" class="user-avatar">
                <span class="user-name">${currentUserData.name}</span>
                <i class="fas fa-chevron-down dropdown-icon"></i>
                <div class="dropdown-menu" id="dropdownMenu">
                    <a href="settings.html" class="dropdown-item"><i class="fas fa-user-cog"></i> Settings</a>
                    ${currentUserData.role === 'admin' ? 
                        '<a href="admin.html" class="dropdown-item"><i class="fas fa-shield-alt"></i> Admin Panel</a>' : ''}
                    <a href="#" class="dropdown-item" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>
                </div>
            </div>
        `;
    }
}

window.toggleDropdown = function() {
    document.getElementById('dropdownMenu').classList.toggle('show');
};

// Close dropdown
document.addEventListener('click', function(e) {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('dropdownMenu')?.classList.remove('show');
    }
});

// Mobile menu
document.getElementById('mobileMenuBtn')?.addEventListener('click', function() {
    document.getElementById('mobileMenu').classList.toggle('show');
});

// ==================== SHOP ====================
async function loadShopItems() {
    try {
        const querySnapshot = await getDocs(collection(db, "shopItems"));
        const items = [];
        querySnapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
        });
        displayShopItems(items);
    } catch (error) {
        console.error("Error loading shop:", error);
    }
}

function displayShopItems(items) {
    const container = document.getElementById('shopItems');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<div class="loading">Tidak ada item</div>';
        return;
    }
    
    container.innerHTML = '';
    items.forEach(item => {
        if (item.stock > 0) {
            const card = document.createElement('div');
            card.className = 'shop-card';
            card.onclick = () => buyItem(item);
            card.innerHTML = `
                <img src="${item.image || 'https://via.placeholder.com/200/6c5ce7/ffffff?text=FF'}" class="shop-card-image">
                <div class="shop-card-content">
                    <h3>${item.name}</h3>
                    <div class="price">Rp ${item.price.toLocaleString()}</div>
                    <div class="stock ${item.stock < 5 ? 'low' : ''}">Stok: ${item.stock}</div>
                    <div class="desc">${item.description || '-'}</div>
                    <button class="buy-btn">Beli</button>
                </div>
            `;
            container.appendChild(card);
        }
    });
}

window.buyItem = async function(item) {
    if (!currentUser) {
        showToast("Login dulu!", "error");
        return;
    }
    
    try {
        showLoading();
        
        // Kurangi stock
        await updateDoc(doc(db, "shopItems", item.id), {
            stock: item.stock - 1
        });
        
        // Kirim pesan ke admin
        await addDoc(collection(db, "messages"), {
            senderId: currentUser.uid,
            senderName: currentUserData.name,
            senderAvatar: currentUserData.avatar,
            receiverId: "admin",
            content: `🛒 **PEMBELIAN BARU**\n\nSaya ingin membeli:\n📦 ${item.name}\n💰 Rp ${item.price.toLocaleString()}\n\nMohon info pembayaran`,
            type: "user",
            participants: [currentUser.uid, "admin"],
            timestamp: new Date().toISOString(),
            read: false,
            itemId: item.id,
            itemName: item.name,
            price: item.price
        });
        
        hideLoading();
        showToast("Pesanan dikirim! Cek chat");
        
    } catch (error) {
        hideLoading();
        showToast("Gagal membeli", "error");
    }
};

// ==================== CHAT ====================
function initChat() {
    if (!currentUser) return;
    
    listenToMessages();
}

function listenToMessages() {
    if (messagesUnsubscribe) messagesUnsubscribe();
    
    const q = query(
        collection(db, "messages"),
        where("participants", "array-contains", currentUser.uid),
        orderBy("timestamp", "asc")
    );
    
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        displayMessages(messages);
    });
}

function displayMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="loading">Belum ada pesan</div>';
        return;
    }
    
    container.innerHTML = '';
    
    messages.forEach(msg => {
        const isUser = msg.senderId === currentUser.uid;
        const div = document.createElement('div');
        div.className = `message ${isUser ? 'user' : 'admin'}`;
        
        const time = new Date(msg.timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        div.innerHTML = `
            <div class="message-sender">${isUser ? 'Anda' : msg.senderName}</div>
            <div class="message-content">${msg.content.replace(/\n/g, '<br>')}</div>
            <div class="message-time">${time}</div>
        `;
        
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

window.sendMessage = async function() {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        await addDoc(collection(db, "messages"), {
            senderId: currentUser.uid,
            senderName: currentUserData.name,
            senderAvatar: currentUserData.avatar,
            receiverId: "admin",
            content: content,
            type: "user",
            participants: [currentUser.uid, "admin"],
            timestamp: new Date().toISOString(),
            read: false
        });
        
        input.value = '';
    } catch (error) {
        showToast("Gagal kirim pesan", "error");
    }
};

window.handleKeyPress = function(e) {
    if (e.key === 'Enter') sendMessage();
};

// Initialize
function initApp() {
    updateNavbar();
    loadShopItems();
    initChat();
}