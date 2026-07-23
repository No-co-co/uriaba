// ========================================
// לוגיקת פאנל ניהול - Realtime Database
// ========================================

let currentAdmin = null;
let allUsers = [];
let selectedUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    requireAdmin((user) => {
        currentAdmin = user;
        setupNavbar(user);
        loadUsers();
        loadApiKey();
    });
});

// ===== API Key Management =====
async function loadApiKey() {
    var snapshot = await rtdb.ref('settings/geminiApiKey').once('value');
    var key = snapshot.val();
    if (key) {
        document.getElementById('apiKeyInput').value = key;
    }
}

async function saveApiKey() {
    var key = document.getElementById('apiKeyInput').value.trim();
    if (!key) {
        showToast('נא להזין מפתח API', 'error');
        return;
    }
    try {
        await rtdb.ref('settings/geminiApiKey').set(key);
        showToast('מפתח API נשמר בהצלחה', 'success');
    } catch (e) {
        showToast('שגיאה בשמירת המפתח', 'error');
    }
}

function toggleApiKeyVisibility() {
    var input = document.getElementById('apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function loadUsers() {
    rtdb.ref('users').on('value', (snapshot) => {
        allUsers = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allUsers.push({ uid: child.key, ...child.val() });
            });
        }
        allUsers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderUsersList();
        if (selectedUserId) {
            const user = allUsers.find(u => u.uid === selectedUserId);
            if (user) showUserDetail(user);
        }
    });
}

function renderUsersList() {
    const container = document.getElementById('usersList');
    let html = '';

    allUsers.forEach(user => {
        const initial = (user.displayName || user.username || '?').charAt(0);
        const isAdmin = user.role === 'admin';
        html += '<div class="user-list-item ' + (selectedUserId === user.uid ? 'active' : '') + '" onclick="selectUser(\'' + user.uid + '\')">' +
            '<div class="user-avatar">' + initial + '</div>' +
            '<div class="user-info">' +
            '<div class="name">' + escapeHtml(user.displayName || user.username) + '</div>' +
            '<div class="role"><span class="badge ' + (isAdmin ? 'badge-admin' : 'badge-user') + '">' + (isAdmin ? 'אדמין' : 'משתמש') + '</span></div>' +
            '</div></div>';
    });

    container.innerHTML = html;
}

function selectUser(uid) {
    selectedUserId = uid;
    const user = allUsers.find(u => u.uid === uid);
    if (user) showUserDetail(user);
    renderUsersList();
}

function showUserDetail(user) {
    document.getElementById('userDetailEmpty').classList.add('hidden');
    document.getElementById('userDetailContent').classList.remove('hidden');

    document.getElementById('detailUserName').textContent = user.displayName || user.username;
    document.getElementById('detailUserEmail').textContent = user.username || '';
    document.getElementById('detailDisplayName').value = user.displayName || '';
    document.getElementById('detailRole').value = user.role || 'user';

    if (user.uid === currentAdmin.uid) {
        document.getElementById('deleteUserBtn').classList.add('hidden');
    } else {
        document.getElementById('deleteUserBtn').classList.remove('hidden');
    }

    renderPermissions(user.permissions || []);
}

function renderPermissions(activePermissions) {
    const grid = document.getElementById('permissionsGrid');
    let html = '';

    PERMISSIONS.forEach(perm => {
        const isActive = activePermissions.includes(perm.id);
        html += '<label class="permission-item ' + (isActive ? 'active' : '') + '">' +
            '<input type="checkbox" value="' + perm.id + '" ' + (isActive ? 'checked' : '') + ' onchange="togglePermissionStyle(this)">' +
            '<span class="perm-icon">' + perm.icon + '</span>' +
            '<span class="perm-name">' + perm.name + '</span></label>';
    });

    grid.innerHTML = html;
}

function togglePermissionStyle(checkbox) {
    checkbox.closest('.permission-item').classList.toggle('active', checkbox.checked);
}

async function saveUserDetails() {
    if (!selectedUserId) return;

    const displayName = document.getElementById('detailDisplayName').value.trim();
    const role = document.getElementById('detailRole').value;
    const checkboxes = document.querySelectorAll('#permissionsGrid input[type="checkbox"]');
    const permissions = [];
    checkboxes.forEach(cb => {
        if (cb.checked) permissions.push(cb.value);
    });

    if (!displayName) {
        showToast('נא להזין שם תצוגה', 'error');
        return;
    }

    try {
        await rtdb.ref('users/' + selectedUserId).update({
            displayName: displayName,
            role: role,
            permissions: permissions
        });
        showToast('פרטי המשתמש עודכנו', 'success');
    } catch (e) {
        showToast('שגיאה בעדכון המשתמש', 'error');
    }
}

async function addUser() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;

    if (!name || !email || !password) {
        showToast('נא למלא את כל השדות', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('הסיסמה חייבת להכיל לפחות 6 תווים', 'error');
        return;
    }

    try {
        // שמירת פרטי האדמין הנוכחי לפני יצירת משתמש חדש
        const adminEmail = currentAdmin.username;
        const adminUid = currentAdmin.uid;

        // יצירת המשתמש החדש (Firebase מחליף אוטומטית למשתמש החדש)
        const cred = await auth.createUserWithEmailAndPassword(email, password);

        // שמירת פרטי המשתמש ב-Database
        await rtdb.ref('users/' + cred.user.uid).set({
            username: email,
            displayName: name,
            role: role,
            permissions: role === 'admin' ? PERMISSIONS.map(p => p.id) : ['view', 'add', 'check'],
            createdAt: Date.now(),
            createdBy: adminUid
        });

        // התנתקות מהמשתמש החדש
        await auth.signOut();

        // בקשת סיסמה מהאדמין להתחברות מחדש
        showReconnectModal(adminEmail, name, email);

    } catch (e) {
        showToast(getFirebaseErrorMessage(e), 'error');
    }
}

function showReconnectModal(adminEmail, newUserName, newUserEmail) {
    let overlay = document.getElementById('reconnectModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.id = 'reconnectModal';
        overlay.innerHTML = '<div class="modal">' +
            '<div class="modal-header"><h3>המשתמש נוצר בהצלחה!</h3></div>' +
            '<div class="modal-body">' +
            '<p style="color: var(--success); font-weight: 600; margin-bottom: 12px;">✅ המשתמש "' + escapeHtml(newUserName) + '" נוצר</p>' +
            '<p class="text-sm text-muted mb-2">האימייל: ' + escapeHtml(newUserEmail) + '</p>' +
            '<hr style="margin: 16px 0; border: none; border-top: 1px solid var(--gray-200);">' +
            '<p class="mb-2">הזן את הסיסמה שלך כדי להתחבר מחדש כאדמין:</p>' +
            '<div class="form-group"><label>אימייל אדמין</label>' +
            '<input type="email" id="reconnectEmail" value="' + escapeHtml(adminEmail) + '" readonly style="background: var(--gray-100);"></div>' +
            '<div class="form-group"><label>סיסמה</label>' +
            '<input type="password" id="reconnectPassword" placeholder="הסיסמה שלך" onkeydown="if(event.key===\'Enter\')reconnectAdmin()"></div>' +
            '</div>' +
            '<div class="modal-footer"><button class="btn btn-primary" onclick="reconnectAdmin()">התחבר מחדש</button></div>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
    closeModal('addUserModal');

    setTimeout(() => {
        document.getElementById('reconnectPassword').focus();
    }, 200);
}

async function reconnectAdmin() {
    const email = document.getElementById('reconnectEmail').value;
    const password = document.getElementById('reconnectPassword').value;

    if (!password) {
        showToast('נא להזין סיסמה', 'error');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        const overlay = document.getElementById('reconnectModal');
        if (overlay) overlay.remove();
        showToast('התחברת מחדש בהצלחה', 'success');
    } catch (e) {
        showToast('סיסמה שגויה', 'error');
    }
}

function resetPassword() {
    if (!selectedUserId) return;
    const user = allUsers.find(u => u.uid === selectedUserId);
    if (!user) return;

    document.getElementById('resetPasswordEmail').textContent = user.username;
    openModal('resetPasswordModal');
}

async function confirmResetPassword() {
    const user = allUsers.find(u => u.uid === selectedUserId);
    if (!user || !user.username) return;

    try {
        await auth.sendPasswordResetEmail(user.username);
        showToast('אימייל לאיפוס סיסמה נשלח', 'success');
        closeModal('resetPasswordModal');
    } catch (e) {
        showToast('שגיאה בשליחת אימייל איפוס', 'error');
    }
}

async function deleteSelectedUser() {
    if (!selectedUserId || selectedUserId === currentAdmin.uid) return;

    const user = allUsers.find(u => u.uid === selectedUserId);
    if (!user) return;

    if (!confirm('למחוק את המשתמש "' + user.displayName + '"? הפעולה בלתי הפיכה.')) return;

    try {
        await rtdb.ref('users/' + selectedUserId).remove();
        showToast('המשתמש נמחק מהמערכת', 'success');
        selectedUserId = null;
        document.getElementById('userDetailEmpty').classList.remove('hidden');
        document.getElementById('userDetailContent').classList.add('hidden');
    } catch (e) {
        showToast('שגיאה במחיקת המשתמש', 'error');
    }
}

function getFirebaseErrorMessage(error) {
    const messages = {
        'auth/email-already-in-use': 'כתובת האימייל כבר בשימוש',
        'auth/invalid-email': 'כתובת אימייל לא תקינה',
        'auth/weak-password': 'הסיסמה חלשה מדי (מינימום 6 תווים)'
    };
    return messages[error.code] || 'שגיאה: ' + error.message;
}

// ===== Modals & Utilities =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
