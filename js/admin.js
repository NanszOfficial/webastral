import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Global Variables
let currentAdmin = null;
let currentAdminData = null;
let selectedUserId = null;
let selectedItemForSold = null;
let unsubscribeChats = null;
let unsubscribeMessages = null;

// ==================== AUTH CHECK ====================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'admin') {
        alert("Akses ditolak!");
        window.location.href = 'index.html';
        return;
    }
    
    currentAdmin = user;
    currentAdminData = userDoc.data();
    
    // Load store config
    const configDoc = await getDoc(doc(db, "config", "store"));
    if (configDoc.exists()) {
        document.getElementById('storeLogo').src = configDoc.data().logo;
        document.getElementById('storeName').textContent = configDoc.data().name;
    }
    
    document.getElementById('adminAvatar').src = currentAdminData.avatar;
    document.getElementById('adminName').textContent = currentAdminData.name;
    
    loadStats();
    loadChats();
    loadItems();
    loadTransactions();
    loadBlockedUsers();
});

// ==================== LOGOUT ====================
window.logout = async function() {
    await signOut(auth);
    window.location.href = 'index.html';
};

// ==================== TOGGLE DROPDOWN ====================
window.toggleDropdown = function() {
    document.getElementById('dropdownMenu').classList.toggle('show');
};

// ==================== STATS ====================
async function loadStats() {
    try {
        // Load saldo dari config
        const configDoc = await getDoc(doc(db, "config", "store"));
        const saldo = configDoc.exists() ? configDoc.data().saldo || 0 : 0;
        document.getElementById('saldoTotal').textContent = `Rp ${saldo.toLocaleString()}`;
        
        // Hitung total terjual
        const transactionsSnap = await getDocs(collection(db, "transactions"));
        document.getElementById('totalTerjual').textContent = transactionsSnap.size;
        
        // Hitung total users
        const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "user")));
        document.getElementById('totalUsers').textContent = usersSnap.size;
        
        // Hitung total stok
        const itemsSnap = await getDocs(collection(db, "shopItems"));
        let totalStok = 0;
        itemsSnap.forEach(doc => totalStok += doc.data().stock);
        document.getElementById('totalStok').textContent = totalStok;
        
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

// ==================== CHAT WHATSAPP LIKE ====================
function loadChats() {
    if (unsubscribeChats) unsubscribeChats();
    
    const q = query(
        collection(db, "messages"),
        orderBy("timestamp", "desc")
    );
    
    unsubscribeChats = onSnapshot(q, (snapshot) => {
        const chats = new Map();
        
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const otherId = msg.senderId === 'admin' ? msg.receiverId : msg.senderId;
            
            if (otherId !== 'admin' && otherId !== currentAdmin.uid) {
                if (!chats.has(otherId) || new Date(msg.timestamp) > new Date(chats.get(otherId).timestamp)) {
                    chats.set(otherId, {
                        userId: otherId,
                        lastMessage: msg.content,
                        timestamp: msg.timestamp,
                        unread: !msg.read && msg.receiverId === 'admin'
                    });
                }
            }
        });
        
        displayChatList(Array.from(chats.values()));
    });
}

async function displayChatList(chats) {
    const container = document.getElementById('chatList');
    if (!container) return;
    
    if (chats.length === 0) {
        container.innerHTML = '<div class="loading">Belum ada chat</div>';
        return;
    }
    
    container.innerHTML = '';
    
    for (const chat of chats) {
        const userDoc = await getDoc(doc(db, "users", chat.userId));
        if (!userDoc.exists()) continue;
        
        const user = userDoc.data();
        if (user.blocked) continue; // Skip blocked users
        
        const div = document.createElement('div');
        div.className = `chat-item ${selectedUserId === chat.userId ? 'active' : ''}`;
        div.onclick = () => selectChat(chat.userId, user);
        
        div.innerHTML = `
            <img src="${user.avatar}" class="chat-item-avatar">
            <div class="chat-item-info">
                <div class="chat-item-name">${user.name}</div>
                <div class="chat-item-last">${chat.lastMessage.substring(0, 30)}...</div>
            </div>
            ${chat.unread ? '<span class="chat-item-badge">new</span>' : ''}
        `;
        
        container.appendChild(div);
    }
}

async function selectChat(userId, user) {
    selectedUserId = userId;
    
    // Update UI
    document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    // Show chat area
    document.getElementById('chatPlaceholder').style.display = 'none';
    document.getElementById('chatArea').style.display = 'flex';
    
    // Update header
    document.getElementById('chatUserAvatar').src = user.avatar;
    document.getElementById('chatUserName').textContent = user.name;
    document.getElementById('chatUserStatus').innerHTML = user.isOnline ? 
        '<i class="fas fa-circle"></i> Online' : 
        '<i class="fas fa-circle"></i> Offline';
    
    // Load messages
    loadMessages(userId);
}

function loadMessages(userId) {
    if (unsubscribeMessages) unsubscribeMessages();
    
    const q = query(
        collection(db, "messages"),
        where("participants", "array-contains", userId),
        orderBy("timestamp", "asc")
    );
    
    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
            
            // Mark as read
            if (doc.data().receiverId === 'admin' && !doc.data().read) {
                updateDoc(doc.ref, { read: true });
            }
        });
        displayMessages(messages);
    });
}

function displayMessages(messages) {
    const container = document.getElementById('chatMessagesArea');
    if (!container) return;
    
    container.innerHTML = '';
    
    messages.forEach(msg => {
        const isAdmin = msg.senderId === 'admin';
        const div = document.createElement('div');
        div.className = `message ${isAdmin ? 'admin' : 'user'}`;
        
        const time = new Date(msg.timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        div.innerHTML = `
            <div class="message-sender">${isAdmin ? 'Admin' : msg.senderName}</div>
            <div class="message-content">${msg.content.replace(/\n/g, '<br>')}</div>
            <div class="message-time">${time}</div>
        `;
        
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

window.sendAdminMessage = async function() {
    const input = document.getElementById('adminChatInput');
    const content = input.value.trim();
    
    if (!content || !selectedUserId) return;
    
    try {
        await addDoc(collection(db, "messages"), {
            senderId: 'admin',
            senderName: 'Admin',
            senderAvatar: currentAdminData.avatar,
            receiverId: selectedUserId,
            content: content,
            type: 'admin',
            participants: [selectedUserId, 'admin'],
            timestamp: new Date().toISOString(),
            read: false
        });
        
        input.value = '';
    } catch (error) {
        console.error("Error sending message:", error);
    }
};

// ==================== BLOCK USER ====================
window.blockUser = async function() {
    if (!selectedUserId) return;
    
    if (confirm('Blokir user ini?')) {
        await updateDoc(doc(db, "users", selectedUserId), {
            blocked: true
        });
        
        document.getElementById('blockBtn').classList.add('blocked');
        document.getElementById('blockBtn').innerHTML = '<i class="fas fa-ban"></i>';
        showToast('User diblokir');
    }
};

// ==================== CLEAR CHAT ====================
window.clearChat = async function() {
    if (!selectedUserId) return;
    
    if (confirm('Hapus semua chat dengan user ini?')) {
        const q = query(
            collection(db, "messages"),
            where("participants", "array-contains", selectedUserId)
        );
        
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => deleteDoc(doc.ref));
        
        showToast('Chat dihapus');
    }
};

// ==================== ITEMS MANAGEMENT ====================
async function loadItems() {
    const snapshot = await getDocs(collection(db, "shopItems"));
    const container = document.getElementById('itemsGrid');
    
    container.innerHTML = '';
    
    snapshot.forEach((doc) => {
        const item = doc.data();
        const div = document.createElement('div');
        div.className = 'admin-item-card';
        div.innerHTML = `
            <img src="${item.image || 'https://via.placeholder.com/150/6c5ce7/ffffff?text=FF'}">
            <h4>${item.name}</h4>
            <div class="admin-item-price">Rp ${item.price.toLocaleString()}</div>
            <div class="admin-item-stock">Stok: ${item.stock}</div>
            <div class="admin-item-actions">
                <button class="edit-stock-btn" onclick="editStock('${doc.id}', '${item.name}', ${item.stock})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="sold-btn" onclick="prepareSold('${doc.id}', '${item.name}', '${selectedUserId || ''}')">
                    <i class="fas fa-check"></i>
                </button>
                <button class="delete-btn" onclick="deleteItem('${doc.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==================== ADD ITEM ====================
window.showAddItemModal = function() {
    document.getElementById('addItemModal').style.display = 'flex';
};

window.closeAddItemModal = function() {
    document.getElementById('addItemModal').style.display = 'none';
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemStock').value = '';
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemImage').value = '';
};

window.addItem = async function() {
    const name = document.getElementById('itemName').value;
    const price = parseInt(document.getElementById('itemPrice').value);
    const stock = parseInt(document.getElementById('itemStock').value);
    const desc = document.getElementById('itemDesc').value;
    const image = document.getElementById('itemImage').value;
    
    if (!name || !price || !stock) {
        alert("Isi semua field!");
        return;
    }
    
    await addDoc(collection(db, "shopItems"), {
        name, price, stock,
        description: desc,
        image: image || "https://via.placeholder.com/200/6c5ce7/ffffff?text=FF",
        createdAt: new Date().toISOString()
    });
    
    closeAddItemModal();
    loadItems();
    loadStats();
    showToast('Item ditambahkan');
};

// ==================== EDIT STOCK ====================
window.editStock = function(id, name, currentStock) {
    document.getElementById('editItemId').value = id;
    document.getElementById('editItemName').textContent = name;
    document.getElementById('editStock').value = currentStock;
    document.getElementById('editStockModal').style.display = 'flex';
};

window.closeEditStockModal = function() {
    document.getElementById('editStockModal').style.display = 'none';
};

window.updateStock = async function() {
    const id = document.getElementById('editItemId').value;
    const newStock = parseInt(document.getElementById('editStock').value);
    
    await updateDoc(doc(db, "shopItems", id), {
        stock: newStock
    });
    
    closeEditStockModal();
    loadItems();
    loadStats();
    showToast('Stock diupdate');
};

// ==================== SOLD ====================
window.prepareSold = function(itemId, itemName, buyerId) {
    if (!buyerId) {
        alert("Pilih user dulu di chat!");
        return;
    }
    
    selectedItemForSold = { id: itemId, name: itemName };
    document.getElementById('soldItemName').textContent = itemName;
    document.getElementById('soldBuyerName').textContent = document.getElementById('chatUserName').textContent;
    document.getElementById('soldModal').style.display = 'flex';
};

window.closeSoldModal = function() {
    document.getElementById('soldModal').style.display = 'none';
    selectedItemForSold = null;
};

window.confirmSold = async function() {
    if (!selectedItemForSold || !selectedUserId) return;
    
    const price = parseInt(document.getElementById('soldPrice').value);
    if (!price) {
        alert("Masukkan harga jual!");
        return;
    }
    
    try {
        // Update stock
        const itemRef = doc(db, "shopItems", selectedItemForSold.id);
        const itemDoc = await getDoc(itemRef);
        const currentStock = itemDoc.data().stock;
        
        await updateDoc(itemRef, {
            stock: currentStock - 1
        });
        
        // Update saldo admin
        const configRef = doc(db, "config", "store");
        const configDoc = await getDoc(configRef);
        const currentSaldo = configDoc.exists() ? configDoc.data().saldo || 0 : 0;
        
        await updateDoc(configRef, {
            saldo: currentSaldo + price
        }, { merge: true });
        
        // Add transaction
        await addDoc(collection(db, "transactions"), {
            itemId: selectedItemForSold.id,
            itemName: selectedItemForSold.name,
            buyerId: selectedUserId,
            buyerName: document.getElementById('chatUserName').textContent,
            price: price,
            timestamp: new Date().toISOString()
        });
        
        // Send confirmation message
        await addDoc(collection(db, "messages"), {
            senderId: 'admin',
            senderName: 'Admin',
            senderAvatar: currentAdminData.avatar,
            receiverId: selectedUserId,
            content: `✅ **TRANSAKSI SELESAI**\n\nItem: ${selectedItemForSold.name}\nHarga: Rp ${price.toLocaleString()}\n\nTerima kasih sudah berbelanja!`,
            type: 'admin',
            participants: [selectedUserId, 'admin'],
            timestamp: new Date().toISOString(),
            read: false
        });
        
        closeSoldModal();
        loadStats();
        loadItems();
        showToast('Penjualan dicatat');
        
    } catch (error) {
        console.error("Error processing sold:", error);
        showToast('Gagal memproses', 'error');
    }
};

// ==================== DELETE ITEM ====================
window.deleteItem = async function(id) {
    if (confirm('Yakin hapus item ini?')) {
        await deleteDoc(doc(db, "shopItems", id));
        loadItems();
        loadStats();
        showToast('Item dihapus');
    }
};

// ==================== TRANSACTIONS ====================
async function loadTransactions() {
    const snapshot = await getDocs(query(collection(db, "transactions"), orderBy("timestamp", "desc")));
    const container = document.getElementById('transactionsList');
    
    container.innerHTML = '';
    
    snapshot.forEach((doc) => {
        const t = doc.data();
        const time = new Date(t.timestamp).toLocaleString('id-ID');
        container.innerHTML += `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-item-name">${t.itemName}</div>
                    <div class="transaction-details">${t.buyerName} • ${time}</div>
                </div>
                <div class="transaction-price">Rp ${t.price.toLocaleString()}</div>
            </div>
        `;
    });
}

// ==================== BLOCKED USERS ====================
async function loadBlockedUsers() {
    const snapshot = await getDocs(query(collection(db, "users"), where("blocked", "==", true)));
    const container = document.getElementById('blockedList');
    
    container.innerHTML = '';
    
    snapshot.forEach((doc) => {
        const user = doc.data();
        container.innerHTML += `
            <div class="blocked-item">
                <div>
                    <strong>${user.name}</strong><br>
                    <small>${user.email}</small>
                </div>
                <button class="unblock-btn" onclick="unblockUser('${doc.id}')">
                    <i class="fas fa-check"></i> Unblock
                </button>
            </div>
        `;
    });
}

window.unblockUser = async function(userId) {
    await updateDoc(doc(db, "users", userId), {
        blocked: false
    });
    loadBlockedUsers();
    showToast('User diunblock');
};

// ==================== TAB SWITCHING ====================
window.switchTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tab + 'Tab').classList.add('active');
    
    if (tab === 'transactions') loadTransactions();
    if (tab === 'blocked') loadBlockedUsers();
};

// ==================== TOAST ====================
function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.borderLeftColor = type === "success" ? "#4caf50" : "#ff4444";
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// ==================== CLOSE MODALS ====================
window.onclick = function(event) {
    const modals = ['addItemModal', 'editStockModal', 'soldModal'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
};

// ==================== GLOBAL VARIABLES TAMBAHAN ====================
let selectedAddFile = null;
let selectedEditFile = null;

// ==================== TRIGGER FILE UPLOAD ====================
window.triggerAddFileUpload = function() {
    document.getElementById('addImageFile').click();
};

window.triggerEditFileUpload = function() {
    document.getElementById('editImageFile').click();
};

// ==================== HANDLE FILE SELECT ====================
document.getElementById('addImageFile')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        selectedAddFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('addImagePreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
            document.getElementById('itemImage').value = ''; // Clear URL input
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('editImageFile')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        selectedEditFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('editImagePreview').src = e.target.result;
            document.getElementById('editItemImage').value = ''; // Clear URL input
        };
        reader.readAsDataURL(file);
    }
});

// Preview URL input
document.getElementById('itemImage')?.addEventListener('input', function(e) {
    if (e.target.value) {
        selectedAddFile = null;
        document.getElementById('addImageFile').value = '';
        document.getElementById('addImagePreview').src = e.target.value;
        document.getElementById('addImagePreview').style.display = 'block';
    }
});

document.getElementById('editItemImage')?.addEventListener('input', function(e) {
    if (e.target.value) {
        selectedEditFile = null;
        document.getElementById('editImageFile').value = '';
        document.getElementById('editImagePreview').src = e.target.value;
    }
});

// ==================== UPDATE LOADITEMS FUNCTION ====================
async function loadItems() {
    const snapshot = await getDocs(collection(db, "shopItems"));
    const container = document.getElementById('itemsGrid');
    
    container.innerHTML = '';
    
    snapshot.forEach((doc) => {
        const item = doc.data();
        const div = document.createElement('div');
        div.className = 'admin-item-card';
        div.innerHTML = `
            <img src="${item.image || 'https://ui-avatars.com/api/?name=FF+Akun&background=6c5ce7&color=fff&size=200'}" 
                 alt="${item.name}"
                 onclick="window.open('${item.image || '#'}', '_blank')">
            <h4>${item.name}</h4>
            <div class="admin-item-price">Rp ${item.price.toLocaleString()}</div>
            <div class="admin-item-stock">Stok: ${item.stock}</div>
            <div class="admin-item-actions">
                <button class="edit-full-btn" onclick="openEditModal('${doc.id}')" title="Edit Lengkap">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="edit-stock-btn" onclick="editStock('${doc.id}', '${item.name}', ${item.stock})" title="Edit Stok">
                    <i class="fas fa-boxes"></i>
                </button>
                <button class="sold-btn" onclick="prepareSold('${doc.id}', '${item.name}', '${selectedUserId || ''}')" title="Tandai Terjual">
                    <i class="fas fa-check"></i>
                </button>
                <button class="delete-btn" onclick="deleteItem('${doc.id}')" title="Hapus">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==================== OPEN EDIT MODAL ====================
window.openEditModal = async function(itemId) {
    try {
        showLoading();
        const itemDoc = await getDoc(doc(db, "shopItems", itemId));
        if (itemDoc.exists()) {
            const item = itemDoc.data();
            
            document.getElementById('editItemId').value = itemId;
            document.getElementById('editItemName').value = item.name || '';
            document.getElementById('editItemPrice').value = item.price || '';
            document.getElementById('editItemStock').value = item.stock || '';
            document.getElementById('editItemDesc').value = item.description || '';
            document.getElementById('editItemImage').value = item.image || '';
            
            // Set preview
            const preview = document.getElementById('editImagePreview');
            if (item.image) {
                preview.src = item.image;
            } else {
                preview.src = 'https://ui-avatars.com/api/?name=FF+Akun&background=6c5ce7&color=fff&size=200';
            }
            
            // Reset file
            selectedEditFile = null;
            document.getElementById('editImageFile').value = '';
            
            document.getElementById('editItemModal').style.display = 'flex';
        }
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Error loading item:", error);
        showToast("Gagal memuat item", "error");
    }
};

window.closeEditItemModal = function() {
    document.getElementById('editItemModal').style.display = 'none';
    selectedEditFile = null;
};

// ==================== UPDATE ITEM ====================
window.updateItem = async function() {
    const id = document.getElementById('editItemId').value;
    const name = document.getElementById('editItemName').value;
    const price = parseInt(document.getElementById('editItemPrice').value);
    const stock = parseInt(document.getElementById('editItemStock').value);
    const desc = document.getElementById('editItemDesc').value;
    const imageUrl = document.getElementById('editItemImage').value;
    
    if (!name || !price || !stock) {
        showToast("Nama, harga, dan stock harus diisi!", "error");
        return;
    }
    
    try {
        showLoading();
        
        let finalImageUrl = imageUrl;
        
        // Upload file jika ada
        if (selectedEditFile) {
            // Simulasi upload (di real project, upload ke Firebase Storage)
            finalImageUrl = URL.createObjectURL(selectedEditFile);
            showToast("Gambar akan diupload (simulasi)", "success");
        }
        
        await updateDoc(doc(db, "shopItems", id), {
            name: name,
            price: price,
            stock: stock,
            description: desc,
            image: finalImageUrl || "https://ui-avatars.com/api/?name=FF+Akun&background=6c5ce7&color=fff&size=200"
        });
        
        hideLoading();
        closeEditItemModal();
        loadItems();
        showToast("Item berhasil diupdate!");
        
    } catch (error) {
        hideLoading();
        console.error("Error updating item:", error);
        showToast("Gagal mengupdate item", "error");
    }
};

// ==================== UPDATE ADD ITEM ====================
window.addItem = async function() {
    const name = document.getElementById('itemName').value;
    const price = parseInt(document.getElementById('itemPrice').value);
    const stock = parseInt(document.getElementById('itemStock').value);
    const desc = document.getElementById('itemDesc').value;
    const imageUrl = document.getElementById('itemImage').value;
    
    if (!name || !price || !stock) {
        showToast("Nama, harga, dan stock harus diisi!", "error");
        return;
    }
    
    try {
        showLoading();
        
        let finalImageUrl = imageUrl;
        
        // Upload file jika ada
        if (selectedAddFile) {
            // Simulasi upload (di real project, upload ke Firebase Storage)
            finalImageUrl = URL.createObjectURL(selectedAddFile);
        }
        
        await addDoc(collection(db, "shopItems"), {
            name: name,
            price: price,
            stock: stock,
            description: desc,
            image: finalImageUrl || "https://ui-avatars.com/api/?name=FF+Akun&background=6c5ce7&color=fff&size=200",
            createdAt: new Date().toISOString()
        });
        
        hideLoading();
        closeAddItemModal();
        loadItems();
        loadStats();
        showToast("Item berhasil ditambahkan!");
        
    } catch (error) {
        hideLoading();
        console.error("Error adding item:", error);
        showToast("Gagal menambah item", "error");
    }
};

// ==================== UPDATE CLOSE ADD MODAL ====================
window.closeAddItemModal = function() {
    document.getElementById('addItemModal').style.display = 'none';
    // Reset form
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemStock').value = '';
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemImage').value = '';
    document.getElementById('addImagePreview').src = '';
    document.getElementById('addImagePreview').style.display = 'none';
    document.getElementById('addImageFile').value = '';
    selectedAddFile = null;
};

// ==================== UPDATE LOAD STATS ====================
async function loadStats() {
    try {
        // Load saldo dari config
        const configDoc = await getDoc(doc(db, "config", "store"));
        const saldo = configDoc.exists() ? configDoc.data().saldo || 0 : 0;
        document.getElementById('saldoTotal').textContent = `Rp ${saldo.toLocaleString()}`;
        
        // Hitung total terjual dari transaksi
        const transactionsSnap = await getDocs(collection(db, "transactions"));
        document.getElementById('totalTerjual').textContent = transactionsSnap.size;
        
        // Hitung total users (kecuali admin)
        const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "user")));
        document.getElementById('totalUsers').textContent = usersSnap.size;
        
        // Hitung total stok semua item
        const itemsSnap = await getDocs(collection(db, "shopItems"));
        let totalStok = 0;
        itemsSnap.forEach(doc => totalStok += doc.data().stock || 0);
        document.getElementById('totalStok').textContent = totalStok;
        
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}