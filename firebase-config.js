// ========================================
// הגדרות Firebase - יש להחליף עם הנתונים שלך
// ========================================
const firebaseConfig = {
    apiKey: "AIzaSyCMq5WuTFV3O_zamdaQSvGVX5iUK4dmGpA",
    authDomain: "uri-and-aba-shopping-list.firebaseapp.com",
    databaseURL: "https://uri-and-aba-shopping-list-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "uri-and-aba-shopping-list",
    storageBucket: "uri-and-aba-shopping-list.firebasestorage.app",
    messagingSenderId: "360943255067",
    appId: "1:360943255067:web:8ee265f6fcc047e6c1c2be"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const rtdb = firebase.database();

const CATEGORIES = [
    { id: 'fruits_vegetables', name: 'פירות וירקות', icon: '🥬' },
    { id: 'dairy', name: 'חלבי', icon: '🧀' },
    { id: 'meat', name: 'בשרי', icon: '🥩' },
    { id: 'bakery', name: 'מאפים ולחם', icon: '🍞' },
    { id: 'drinks', name: 'שתייה', icon: '🥤' },
    { id: 'cleaning', name: 'ניקיון', icon: '🧹' },
    { id: 'snacks', name: 'חטיפים ומתוקים', icon: '🍫' },
    { id: 'frozen', name: 'קפואים', icon: '🧊' },
    { id: 'canned', name: 'שימורים ויבשים', icon: '🥫' },
    { id: 'hygiene', name: 'היגיינה', icon: '🧴' },
    { id: 'other', name: 'אחר', icon: '📦' }
];

const PERMISSIONS = [
    { id: 'view', name: 'צפייה ברשימות', icon: '👁️' },
    { id: 'add', name: 'הוספת פריטים', icon: '➕' },
    { id: 'edit', name: 'עריכת פריטים', icon: '✏️' },
    { id: 'check', name: 'סימון נקנה', icon: '✅' },
    { id: 'delete', name: 'מחיקת פריטים', icon: '🗑️' },
    { id: 'manage_lists', name: 'ניהול רשימות', icon: '📋' }
];
