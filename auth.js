// ========================================
// מערכת אימות והתחברות - Realtime Database
// ========================================

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function requireAuth(callback) {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        const snapshot = await rtdb.ref('users/' + user.uid).once('value');
        if (!snapshot.exists()) {
            auth.signOut();
            window.location.href = 'index.html';
            return;
        }
        const userData = { uid: user.uid, ...snapshot.val() };
        callback(userData);
    });
}

function requireAdmin(callback) {
    requireAuth((user) => {
        if (user.role !== 'admin') {
            window.location.href = 'app.html';
            return;
        }
        callback(user);
    });
}

function hasPermission(user, permission) {
    if (user.role === 'admin') return true;
    return user.permissions && user.permissions.includes(permission);
}

function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

function setupNavbar(user) {
    const userNameEl = document.querySelector('.navbar-user .user-name');
    const avatarEl = document.querySelector('.navbar-user .avatar');
    if (userNameEl) userNameEl.textContent = user.displayName || user.username;
    if (avatarEl) avatarEl.textContent = (user.displayName || user.username || '?').charAt(0);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const adminLink = document.getElementById('adminLink');
    if (adminLink) {
        if (user.role === 'admin') {
            adminLink.classList.remove('hidden');
        } else {
            adminLink.classList.add('hidden');
        }
    }
}
