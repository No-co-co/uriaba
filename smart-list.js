// ========================================
// רשימה חכמה - Gemini API + Realtime Database
// המפתח נשמר ב-Firebase ע"י האדמין, לא בקוד
// ========================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

async function getGeminiApiKey() {
    var snapshot = await rtdb.ref('settings/geminiApiKey').once('value');
    return snapshot.val() || null;
}

async function generateSmartList() {
    var btn = document.getElementById('generateSmartListBtn');
    var results = document.getElementById('smartListResults');

    var apiKey = await getGeminiApiKey();
    if (!apiKey) {
        results.innerHTML = '<div class="empty-state"><div class="icon">🔑</div>' +
            '<h3>מפתח API לא הוגדר</h3>' +
            '<p>האדמין צריך להגדיר מפתח Gemini API בפאנל הניהול (הגדרות → מפתח API)</p></div>';
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ מנתח...';
    results.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>מנתח את הרגלי הקנייה שלך...</span></div>';

    try {
        var snapshot = await rtdb.ref('purchaseHistory').orderByChild('completedAt').limitToLast(20).once('value');

        if (!snapshot.exists()) {
            results.innerHTML = '<div class="empty-state"><div class="icon">📊</div>' +
                '<h3>אין מספיק נתונים</h3><p>צריך לפחות קנייה אחת בהיסטוריה כדי ליצור המלצות</p></div>';
            btn.disabled = false;
            btn.textContent = '🔄 צור המלצות';
            return;
        }

        var historyData = [];
        snapshot.forEach(function(child) {
            var data = child.val();
            var items = data.items || [];
            var itemsArray = Array.isArray(items) ? items : Object.values(items);
            historyData.push({
                date: data.completedAt ? new Date(data.completedAt).toISOString().split('T')[0] : 'unknown',
                listName: data.listName,
                items: itemsArray
            });
        });

        var prompt = buildPrompt(historyData);
        var recommendations = await callGeminiAPI(prompt, apiKey);
        renderRecommendations(results, recommendations);
    } catch (e) {
        console.error('Smart list error:', e);
        results.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div>' +
            '<h3>שגיאה</h3><p>' + (e.message || 'לא ניתן ליצור המלצות כרגע.') + '</p></div>';
    }

    btn.disabled = false;
    btn.textContent = '🔄 צור המלצות';
}

function buildPrompt(historyData) {
    var summary = historyData.map(function(h) {
        var items = h.items.map(function(i) {
            return i.name + ' (כמות: ' + i.quantity + ', קטגוריה: ' + i.category + ')';
        }).join(', ');
        return 'תאריך: ' + h.date + ', רשימה: ' + h.listName + ', פריטים: ' + items;
    }).join('\n');

    return 'אתה יועץ קניות חכם למשפחה ישראלית. נתח את היסטוריית הקניות הבאה ותן המלצות לקנייה חכמה וחסכונית.\n\n' +
        'היסטוריית קניות:\n' + summary + '\n\n' +
        'תן בדיוק 5 המלצות קצרות ופרקטיות בעברית. כל המלצה צריכה להיות בפורמט:\n' +
        '💡 [כותרת קצרה]: [הסבר של משפט אחד]\n\n' +
        'התמקד ב:\n' +
        '1. פריטים שנקנים בתדירות גבוהה - המלץ לקנות בכמויות גדולות\n' +
        '2. דפוסי קנייה - מתי כדאי לקנות\n' +
        '3. פריטים שחוזרים על עצמם - הצע רשימה קבועה\n' +
        '4. חיסכון אפשרי - קנייה במבצעים או בכמויות\n' +
        '5. פריטים שכדאי להוסיף לרשימה הבאה\n\n' +
        'ענה רק עם ההמלצות, ללא הקדמה או סיכום.';
}

async function callGeminiAPI(prompt, apiKey) {
    var response = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
    });

    if (!response.ok) {
        var err = await response.json().catch(function() { return {}; });
        throw new Error((err.error && err.error.message) || 'שגיאת API (' + response.status + ')');
    }

    var data = await response.json();
    var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
               data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
               data.candidates[0].content.parts[0].text;
    if (!text) throw new Error('לא התקבלה תשובה מה-API');
    return text;
}

function renderRecommendations(container, text) {
    var lines = text.split('\n').filter(function(line) { return line.trim(); });
    var html = '';

    lines.forEach(function(line) {
        var cleaned = line.trim();
        if (!cleaned) return;

        var iconMatch = cleaned.match(/^([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/u);
        var icon = iconMatch ? iconMatch[0] : '💡';
        var textContent = cleaned.replace(/^[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u, '').trim();

        html += '<div class="recommendation-item">' +
            '<span class="rec-icon">' + icon + '</span>' +
            '<div class="rec-text">' + escapeHtml(textContent) + '</div></div>';
    });

    container.innerHTML = html || '<p class="text-muted text-center">לא התקבלו המלצות</p>';
}
