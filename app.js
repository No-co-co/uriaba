// ========================================
// לוגיקת רשימות קניות - Realtime Database
// ========================================

let currentUser = null;
let activeListId = null;
let activeFilter = 'all';
let editingItemId = null;

document.addEventListener('DOMContentLoaded', () => {
    requireAuth((user) => {
        currentUser = user;
        setupNavbar(user);
        populateCategorySelects();
        buildCategoryFilter();
        loadLists();
        loadHistory();
        hideUIByPermissions();
    });
});

function hideUIByPermissions() {
    if (!hasPermission(currentUser, 'add')) {
        document.getElementById('addItemForm').classList.add('hidden');
    }
    if (!hasPermission(currentUser, 'manage_lists')) {
        document.getElementById('finishShoppingBtn').classList.add('hidden');
    }
}

function populateCategorySelects() {
    const selects = [document.getElementById('itemCategorySelect'), document.getElementById('editItemCategory')];
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.icon + ' ' + cat.name;
            select.appendChild(opt);
        });
    });
}

function buildCategoryFilter() {
    const container = document.getElementById('categoryFilter');
    let html = '<button class="category-chip active" onclick="filterCategory(\'all\')">הכל</button>';
    CATEGORIES.forEach(cat => {
        html += '<button class="category-chip" data-cat="' + cat.id + '" onclick="filterCategory(\'' + cat.id + '\')">' + cat.icon + ' ' + cat.name + '</button>';
    });
    container.innerHTML = html;
}

function filterCategory(catId) {
    activeFilter = catId;
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.cat === catId || (catId === 'all' && !chip.dataset.cat));
    });
    renderItems();
}

// ===== Tabs =====
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('listsTab').classList.toggle('hidden', tab !== 'lists');
    document.getElementById('historyTab').classList.toggle('hidden', tab !== 'history');
    document.getElementById('smartTab').classList.toggle('hidden', tab !== 'smart');
}

// ===== Lists =====
let allLists = [];

function loadLists() {
    rtdb.ref('lists').on('value', (snapshot) => {
        allLists = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allLists.push({ id: child.key, ...child.val() });
            });
        }
        allLists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderLists();
    });
}

function renderLists() {
    const grid = document.getElementById('listsGrid');
    let html = '';

    allLists.forEach(list => {
        html += '<div class="list-card ' + (activeListId === list.id ? 'active' : '') + '" onclick="openList(\'' + list.id + '\')">' +
            '<h3>📋 ' + escapeHtml(list.name) + '</h3>' +
            '<div class="list-meta"><span>' + formatDate(list.createdAt) + '</span></div>';

        if (hasPermission(currentUser, 'manage_lists')) {
            html += '<div class="list-actions">' +
                '<button class="btn btn-icon btn-outline btn-sm" onclick="event.stopPropagation(); deleteList(\'' + list.id + '\')" title="מחק רשימה">🗑️</button>' +
                '</div>';
        }
        html += '</div>';
    });

    if (hasPermission(currentUser, 'manage_lists')) {
        html += '<div class="list-card new-list-card" onclick="openModal(\'newListModal\')">' +
            '<span style="font-size: 32px">➕</span>' +
            '<span>רשימה חדשה</span></div>';
    }

    grid.innerHTML = html;
}

async function createList() {
    const name = document.getElementById('newListName').value.trim();
    if (!name) {
        showToast('נא להזין שם לרשימה', 'error');
        return;
    }

    try {
        const newRef = rtdb.ref('lists').push();
        await newRef.set({
            name: name,
            createdBy: currentUser.uid,
            createdAt: Date.now()
        });
        document.getElementById('newListName').value = '';
        closeModal('newListModal');
        showToast('הרשימה נוצרה בהצלחה', 'success');
    } catch (e) {
        showToast('שגיאה ביצירת הרשימה', 'error');
    }
}

async function deleteList(listId) {
    if (!confirm('למחוק את הרשימה? הפעולה בלתי הפיכה.')) return;

    try {
        await rtdb.ref('lists/' + listId).remove();
        await rtdb.ref('items/' + listId).remove();
        if (activeListId === listId) closeActiveList();
        showToast('הרשימה נמחקה', 'success');
    } catch (e) {
        showToast('שגיאה במחיקת הרשימה', 'error');
    }
}

// ===== Active List & Items =====
let allItems = [];
let itemsListener = null;

function openList(listId) {
    activeListId = listId;
    const list = allLists.find(l => l.id === listId);
    document.getElementById('activeListName').textContent = list ? list.name : '';
    document.getElementById('activeListSection').classList.remove('hidden');
    renderLists();
    subscribeToItems();
    document.getElementById('itemNameInput').focus();
}

function closeActiveList() {
    if (itemsListener) {
        rtdb.ref('items/' + activeListId).off('value', itemsListener);
        itemsListener = null;
    }
    activeListId = null;
    document.getElementById('activeListSection').classList.add('hidden');
    allItems = [];
    renderLists();
}

function subscribeToItems() {
    if (itemsListener && activeListId) {
        rtdb.ref('items/' + activeListId).off('value', itemsListener);
    }

    itemsListener = rtdb.ref('items/' + activeListId).on('value', (snapshot) => {
        allItems = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allItems.push({ id: child.key, ...child.val() });
            });
        }
        allItems.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        renderItems();
    });
}

function renderItems() {
    const list = document.getElementById('itemsList');
    const emptyState = document.getElementById('emptyItems');

    let filtered = activeFilter === 'all' ? allItems : allItems.filter(i => i.category === activeFilter);

    if (filtered.length === 0) {
        list.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    const unchecked = filtered.filter(i => !i.checked);
    const checked = filtered.filter(i => i.checked);

    const grouped = {};
    unchecked.forEach(item => {
        const cat = item.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    let html = '';

    for (const catId of Object.keys(grouped)) {
        const cat = CATEGORIES.find(c => c.id === catId) || { icon: '📦', name: 'אחר' };
        html += '<div class="category-group-header">' + cat.icon + ' ' + cat.name + '</div>';
        grouped[catId].forEach(item => {
            html += renderItemRow(item);
        });
    }

    if (checked.length > 0) {
        html += '<div class="category-group-header" style="color: var(--success);">✅ נקנו (' + checked.length + ')</div>';
        checked.forEach(item => {
            html += renderItemRow(item);
        });
    }

    list.innerHTML = html;
}

function renderItemRow(item) {
    const cat = CATEGORIES.find(c => c.id === item.category) || { icon: '📦' };
    const canCheck = hasPermission(currentUser, 'check');
    const canEdit = hasPermission(currentUser, 'edit');
    const canDelete = hasPermission(currentUser, 'delete');

    let html = '<li class="item-row ' + (item.checked ? 'checked' : '') + '">';
    html += '<div class="item-checkbox ' + (item.checked ? 'checked' : '') + '"';
    if (canCheck) {
        html += ' onclick="toggleCheck(\'' + item.id + '\', ' + !item.checked + ')" style="cursor:pointer"';
    } else {
        html += ' style="cursor:default"';
    }
    html += '>' + (item.checked ? '✓' : '') + '</div>';
    html += '<span class="item-category-icon">' + cat.icon + '</span>';
    html += '<span class="item-name">' + escapeHtml(item.name) + '</span>';
    if (item.quantity > 1) {
        html += '<span class="item-quantity">×' + item.quantity + '</span>';
    }
    html += '<span class="item-info">' + (item.checked ? 'נקנה' : '') + '</span>';
    html += '<div class="item-actions">';
    if (canEdit) {
        html += '<button class="btn btn-icon btn-outline btn-sm" onclick="openEditItem(\'' + item.id + '\')" title="ערוך">✏️</button>';
    }
    if (canDelete) {
        html += '<button class="btn btn-icon btn-outline btn-sm" onclick="deleteItem(\'' + item.id + '\')" title="מחק">🗑️</button>';
    }
    html += '</div></li>';
    return html;
}

async function addItem() {
    if (!hasPermission(currentUser, 'add')) return;

    const name = document.getElementById('itemNameInput').value.trim();
    const category = document.getElementById('itemCategorySelect').value;
    const quantity = parseInt(document.getElementById('itemQuantityInput').value) || 1;

    if (!name) {
        showToast('נא להזין שם פריט', 'error');
        return;
    }

    try {
        await rtdb.ref('items/' + activeListId).push().set({
            name: name,
            category: category,
            quantity: quantity,
            checked: false,
            addedBy: currentUser.uid,
            addedAt: Date.now()
        });
        document.getElementById('itemNameInput').value = '';
        document.getElementById('itemQuantityInput').value = '1';
        document.getElementById('itemNameInput').focus();
    } catch (e) {
        showToast('שגיאה בהוספת הפריט', 'error');
    }
}

async function toggleCheck(itemId, checked) {
    try {
        const update = { checked: checked };
        if (checked) {
            update.checkedBy = currentUser.uid;
            update.checkedAt = Date.now();
        } else {
            update.checkedBy = null;
            update.checkedAt = null;
        }
        await rtdb.ref('items/' + activeListId + '/' + itemId).update(update);
    } catch (e) {
        showToast('שגיאה בעדכון הפריט', 'error');
    }
}

async function deleteItem(itemId) {
    try {
        await rtdb.ref('items/' + activeListId + '/' + itemId).remove();
    } catch (e) {
        showToast('שגיאה במחיקת הפריט', 'error');
    }
}

function openEditItem(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    editingItemId = itemId;
    document.getElementById('editItemName').value = item.name;
    document.getElementById('editItemCategory').value = item.category;
    document.getElementById('editItemQuantity').value = item.quantity || 1;
    openModal('editItemModal');
}

async function saveEditItem() {
    if (!editingItemId) return;

    const name = document.getElementById('editItemName').value.trim();
    const category = document.getElementById('editItemCategory').value;
    const quantity = parseInt(document.getElementById('editItemQuantity').value) || 1;

    if (!name) {
        showToast('נא להזין שם פריט', 'error');
        return;
    }

    try {
        await rtdb.ref('items/' + activeListId + '/' + editingItemId).update({
            name: name, category: category, quantity: quantity
        });
        closeModal('editItemModal');
        editingItemId = null;
        showToast('הפריט עודכן', 'success');
    } catch (e) {
        showToast('שגיאה בעדכון הפריט', 'error');
    }
}

// ===== Finish Shopping =====
async function finishShopping() {
    if (!activeListId) return;
    const checkedItems = allItems.filter(i => i.checked);
    if (checkedItems.length === 0) {
        showToast('אין פריטים שנקנו לסיום', 'error');
        return;
    }

    if (!confirm('לסיים קניות? ' + checkedItems.length + ' פריטים שנקנו יועברו להיסטוריה.')) return;

    try {
        const list = allLists.find(l => l.id === activeListId);
        const historyItems = checkedItems.map(i => ({
            name: i.name,
            category: i.category,
            quantity: i.quantity || 1
        }));

        await rtdb.ref('purchaseHistory').push().set({
            listId: activeListId,
            listName: list ? list.name : '',
            items: historyItems,
            completedAt: Date.now(),
            completedBy: currentUser.uid
        });

        const updates = {};
        checkedItems.forEach(item => {
            updates[item.id] = null;
        });
        await rtdb.ref('items/' + activeListId).update(updates);

        showToast('הקניות הושלמו ונשמרו בהיסטוריה', 'success');
    } catch (e) {
        showToast('שגיאה בסיום הקניות', 'error');
    }
}

// ===== History =====
function loadHistory() {
    rtdb.ref('purchaseHistory').orderByChild('completedAt').limitToLast(50).on('value', (snapshot) => {
        const container = document.getElementById('historyList');
        const emptyState = document.getElementById('emptyHistory');

        if (!snapshot.exists()) {
            emptyState.classList.remove('hidden');
            container.querySelectorAll('.history-item').forEach(el => el.remove());
            return;
        }
        emptyState.classList.add('hidden');

        const entries = [];
        snapshot.forEach(child => {
            entries.push({ id: child.key, ...child.val() });
        });
        entries.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

        let html = '';
        entries.forEach(data => {
            const date = data.completedAt ? formatDate(data.completedAt) : '';
            const items = data.items || [];
            const itemCount = Array.isArray(items) ? items.length : Object.keys(items).length;
            const itemsArray = Array.isArray(items) ? items : Object.values(items);

            html += '<div class="history-item">' +
                '<div class="history-item-header" onclick="toggleHistory(this)">' +
                '<div><strong>' + escapeHtml(data.listName || 'רשימה') + '</strong>' +
                '<span class="text-sm text-muted" style="margin-right: 12px">' + date + ' · ' + itemCount + ' פריטים</span></div>' +
                '<span>◀</span></div>' +
                '<div class="history-item-body"><ul>';

            itemsArray.forEach(i => {
                const cat = CATEGORIES.find(c => c.id === i.category) || { icon: '📦' };
                html += '<li>' + cat.icon + ' ' + escapeHtml(i.name) + (i.quantity > 1 ? ' ×' + i.quantity : '') + '</li>';
            });

            html += '</ul></div></div>';
        });
        container.innerHTML = html;
    });
}

function toggleHistory(header) {
    const body = header.nextElementSibling;
    body.classList.toggle('open');
    header.querySelector('span:last-child').textContent = body.classList.contains('open') ? '▼' : '◀';
}

// ===== Modals =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ===== Utilities =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ===== קלט קולי =====
let recognition = null;
let isListening = false;
let voiceTimeout = null;
let accumulatedText = '';

function toggleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('הדפדפן שלך לא תומך בזיהוי קולי. נסה Chrome.', 'error');
        return;
    }

    if (isListening) {
        stopVoice();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = function() {
        isListening = true;
        accumulatedText = '';
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('voiceStatus').classList.remove('hidden');
        document.getElementById('voiceStatus').textContent = '🎤 מקשיב... דבר בעברית';
    };

    recognition.onresult = function(event) {
        let interimText = '';
        let finalText = '';

        for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalText += event.results[i][0].transcript;
            } else {
                interimText += event.results[i][0].transcript;
            }
        }

        if (interimText) {
            document.getElementById('voiceStatus').textContent = '🎤 ' + interimText + '...';
        }

        if (finalText) {
            accumulatedText = finalText.trim();
            document.getElementById('voiceStatus').textContent = '✅ זוהה: ' + accumulatedText;
        }
    };

    recognition.onerror = function(event) {
        if (event.error === 'no-speech') {
            document.getElementById('voiceStatus').textContent = '🎤 לא שמעתי... לחץ שוב על המיקרופון';
        } else if (event.error !== 'aborted') {
            showToast('שגיאה בזיהוי קולי: ' + event.error, 'error');
        }
        stopVoice();
    };

    recognition.onend = function() {
        if (accumulatedText) {
            processVoiceInput(accumulatedText);
            accumulatedText = '';
        }
        if (isListening) {
            setTimeout(function() {
                if (isListening) {
                    try {
                        recognition.start();
                        document.getElementById('voiceStatus').textContent = '🎤 מקשיב... אמור פריט נוסף או לחץ לעצירה';
                    } catch(e) {}
                }
            }, 300);
        }
    };

    recognition.start();
}

function stopVoice() {
    isListening = false;
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
        recognition = null;
    }
    document.getElementById('voiceBtn').classList.remove('listening');
    document.getElementById('voiceStatus').classList.add('hidden');
}

function processVoiceInput(text) {
    var hebrewNumbers = {
        'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתי': 2,
        'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
        'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
        'עשר': 10, 'עשרה': 10, 'חצי': 0.5
    };

    var items = text.split(/\s*(?:,|\.)\s*/).filter(function(s) { return s.trim(); });

    items.forEach(function(itemText) {
        var subItems = itemText.split(/\s+ו(?=[א-ת])/);

        subItems.forEach(function(sub) {
            var name = sub.trim();
            if (!name) return;
            var quantity = 1;

            var qtyMatch = name.match(/^(\d+)\s+(.+)/);
            if (qtyMatch) {
                quantity = parseInt(qtyMatch[1]);
                name = qtyMatch[2];
            } else {
                var qtyMatchEnd = name.match(/(.+?)\s+(\d+)$/);
                if (qtyMatchEnd) {
                    name = qtyMatchEnd[1];
                    quantity = parseInt(qtyMatchEnd[2]);
                } else {
                    for (var word in hebrewNumbers) {
                        var re = new RegExp('^' + word + '\\s+(.+)');
                        var m = name.match(re);
                        if (m) {
                            quantity = hebrewNumbers[word];
                            name = m[1];
                            break;
                        }
                        re = new RegExp('(.+?)\\s+' + word + '$');
                        m = name.match(re);
                        if (m) {
                            name = m[1];
                            quantity = hebrewNumbers[word];
                            break;
                        }
                    }
                }
            }

            name = name.trim();
            var category = guessCategory(name);

            if (name && name.length > 0 && activeListId && hasPermission(currentUser, 'add')) {
                rtdb.ref('items/' + activeListId).push().set({
                    name: name,
                    category: category,
                    quantity: quantity,
                    checked: false,
                    addedBy: currentUser.uid,
                    addedAt: Date.now()
                });
                showToast('נוסף: ' + name + (quantity > 1 ? ' ×' + quantity : ''), 'success');
            }
        });
    });
}

function guessCategory(name) {
    const categoryKeywords = {
        'fruits_vegetables': ['עגבניה', 'מלפפון', 'בצל', 'תפוח', 'בננה', 'גזר', 'פלפל', 'חסה', 'לימון', 'תפוז', 'אבוקדו', 'ירקות', 'פירות', 'שום', 'כוסברה', 'פטרוזיליה', 'נענע', 'תירס', 'חציל', 'קישוא', 'ברוקולי', 'כרוב', 'סלרי', 'אפרסק', 'שזיף', 'ענבים', 'אשכולית', 'קלמנטינה', 'אננס', 'מנגו', 'תות', 'אבטיח'],
        'dairy': ['חלב', 'גבינה', 'יוגורט', 'שמנת', 'קוטג', 'לבן', 'חמאה', 'מוצרלה', 'שמנת', 'קשקבל', 'עמק', 'בולגרית'],
        'meat': ['עוף', 'בשר', 'שניצל', 'סטייק', 'קציצות', 'המבורגר', 'נקניק', 'נקניקיות', 'חזה עוף', 'כרעיים', 'טחון', 'דג', 'סלמון', 'טונה', 'פילה'],
        'bakery': ['לחם', 'פיתה', 'חלה', 'לחמניה', 'באגט', 'טורטייה', 'מאפה', 'בורקס', 'עוגה', 'עוגיות'],
        'drinks': ['מים', 'קולה', 'מיץ', 'בירה', 'יין', 'סודה', 'שתייה', 'קפה', 'תה', 'חלב שקדים', 'חלב סויה'],
        'cleaning': ['אקונומיקה', 'סבון', 'נוזל כלים', 'מרכך', 'אבקת כביסה', 'מגבונים', 'שקיות אשפה', 'ספוג', 'מטאטא'],
        'snacks': ['חטיף', 'שוקולד', 'במבה', 'ביסלי', 'צ\'יפס', 'עוגיות', 'סוכריות', 'גלידה', 'אגוזים', 'שקדים'],
        'frozen': ['קפוא', 'פיצה', 'שניצל קפוא', 'ירקות קפואים', 'גלידה', 'בורקס קפוא'],
        'canned': ['שימורים', 'טונה', 'תירס', 'אורז', 'פסטה', 'רסק', 'עדשים', 'חומוס', 'שעועית', 'קטשופ', 'מיונז', 'חרדל', 'שמן', 'חומץ', 'סוכר', 'מלח', 'קמח'],
        'hygiene': ['שמפו', 'מרכך שיער', 'סבון', 'משחת שיניים', 'מברשת שיניים', 'דאודורנט', 'נייר טואלט', 'טישו', 'קרם', 'תחבושות']
    };

    const lower = name.toLowerCase();
    for (const [catId, keywords] of Object.entries(categoryKeywords)) {
        for (const keyword of keywords) {
            if (lower.includes(keyword)) {
                return catId;
            }
        }
    }
    return 'other';
}
