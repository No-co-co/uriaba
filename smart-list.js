// ========================================
// רשימה חכמה - Gemini API + Realtime Database
// ========================================

const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function generateSmartList() {
    const btn = document.getElementById('generateSmartListBtn');
    const results = document.getElementById('smartListResults');

    btn.disabled = true;
    btn.textContent = '⏳ מנתח...';
    results.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>מנתח את הרגלי הקנייה שלך...</span></div>';

    try {
        const snapshot = await rtdb.ref('purchaseHistory').orderByChild('completedAt').limitToLast(20).once('value');

        if (!snapshot.exists()) {
            results.innerHTML = '<div class="empty-state"><div class="icon">📊</div>' +
                '<h3>אין מספיק נתונים</h3><p>צריך לפחות קנייה אחת בהיסטוריה כדי ליצור המלצות</p></div>';
            btn.disabled = false;
            btn.textContent = '🔄 צור המלצות';
            return;
        }

        const historyData = [];
        snapshot.forEach(child => {
            const data = child.val();
            const items = data.items || [];
            const itemsArray = Array.isArray(items) ? items : Object.values(items);
            historyData.push({
                date: data.completedAt ? new Date(data.completedAt).toISOString().split('T')[0] : 'unknown',
                listName: data.listName,
                items: itemsArray
            });
        });

        const prompt = buildPrompt(historyData);
        const recommendations = await callGeminiAPI(prompt);
        renderRecommendations(results, recommendations);
    } catch (e) {
        console.error('Smart list error:', e);
        results.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div>' +
            '<h3>שגיאה</h3><p>' + (e.message || 'לא ניתן ליצור המלצות כרגע. בדוק את מפתח ה-API.') + '</p></div>';
    }

    btn.disabled = false;
    btn.textContent = '🔄 צור המלצות';
}

function buildPrompt(historyData) {
    const summary = historyData.map(h => {
        const items = h.items.map(i => i.name + ' (כמות: ' + i.quantity + ', קטגוריה: ' + i.category + ')').join(', ');
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

async function callGeminiAPI(prompt) {
    const response = await fetch(GEMINI_API_URL + '?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'שגיאת API (' + response.status + ')');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('לא התקבלה תשובה מה-API');
    return text;
}

function renderRecommendations(container, text) {
    const lines = text.split('\n').filter(line => line.trim());
    let html = '';

    lines.forEach(line => {
        const cleaned = line.trim();
        if (!cleaned) return;

        const iconMatch = cleaned.match(/^([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/u);
        const icon = iconMatch ? iconMatch[0] : '💡';
        const textContent = cleaned.replace(/^[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u, '').trim();

        html += '<div class="recommendation-item">' +
            '<span class="rec-icon">' + icon + '</span>' +
            '<div class="rec-text">' + escapeHtml(textContent) + '</div></div>';
    });

    container.innerHTML = html || '<p class="text-muted text-center">לא התקבלו המלצות</p>';
}
