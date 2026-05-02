// --- Firebase Configuration ---
// ここにFirebaseのコンソールから取得した設定を貼り付けます
const firebaseConfig = {
    apiKey: "AIzaSyBw8uguUACHDst2qUke7jnzPMycLNmmjjA",
    authDomain: "my-kintai-a7b4e.firebaseapp.com",
    projectId: "my-kintai-a7b4e",
    storageBucket: "my-kintai-a7b4e.appspot.com",
    messagingSenderId: "971714645945",
    appId: "1:971714645945:web:d90788aa72db98e232f068"
};

// 状態管理
let state = {
    employees: [],
    logs: [],
    isAdminLoggedIn: false,
    useCloud: false // Firebaseが設定されたら自動でtrueになります
};

const ADMIN_PASSWORD = "admin"; // 社長用パスワード

// DOM Elements
const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const employeeGrid = document.getElementById('employee-grid');
const adminReportBody = document.getElementById('admin-report-body');

// Views
const employeeView = document.getElementById('employee-view');
const adminLoginView = document.getElementById('admin-login-view');
const adminDashboardView = document.getElementById('admin-dashboard-view');

// Initial Load
async function init() {
    setupClock();
    
    // Firebaseの初期化を試みる
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        try {
            // Firebaseライブラリの読み込み待ち（HTML側で読み込む前提）
            if (typeof firebase !== 'undefined') {
                firebase.initializeApp(firebaseConfig);
                state.db = firebase.firestore();
                state.useCloud = true;
                console.log("Cloud sync enabled (Firebase)");
            }
        } catch (e) {
            console.error("Firebase init error:", e);
        }
    }

    await loadData();
    renderEmployees();
    setupEventListeners();
}

function setupClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

// データ読み込み
async function loadData() {
    if (state.useCloud) {
        // クラウド(Firebase)から取得
        try {
            const empSnapshot = await state.db.collection('employees').get();
            state.employees = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const logsSnapshot = await state.db.collection('logs').orderBy('timestamp', 'desc').limit(100).get();
            state.logs = logsSnapshot.docs.map(doc => doc.data());
            
            if (state.employees.length === 0) {
                // 初回のみデフォルト作成
                state.employees = [
                    { id: "1", name: "佐藤 健二", status: "off" },
                    { id: "2", name: "鈴木 美咲", status: "off" }
                ];
                saveInitialData();
            }
        } catch (e) {
            console.error("Cloud load error:", e);
        }
    } else {
        // ローカル保存(これまでの方式)
        const savedEmployees = localStorage.getItem('att_employees');
        const savedLogs = localStorage.getItem('att_logs');
        if (savedEmployees) state.employees = JSON.parse(savedEmployees);
        else {
            state.employees = [
                { id: Date.now(), name: "佐藤 健二", status: "off" },
                { id: Date.now() + 1, name: "鈴木 美咲", status: "off" }
            ];
            saveData();
        }
        if (savedLogs) state.logs = JSON.parse(savedLogs);
    }
}

async function saveData() {
    if (state.useCloud) {
        // クラウド保存は各アクション時に行う
    } else {
        localStorage.setItem('att_employees', JSON.stringify(state.employees));
        localStorage.setItem('att_logs', JSON.stringify(state.logs));
    }
}

async function saveInitialData() {
    for (const emp of state.employees) {
        await state.db.collection('employees').doc(emp.id).set(emp);
    }
}

// Clock logic
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour12: false });
    const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    
    clockTime.textContent = timeStr;
    clockDate.textContent = dateStr;
}

// Render Logic
function renderEmployees() {
    employeeGrid.innerHTML = '';
    state.employees.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'employee-card animate-fade';
        
        const isWorking = emp.status === 'working';
        
        card.innerHTML = `
            <div class="employee-name">${emp.name}</div>
            <div>
                <span class="status-badge ${isWorking ? 'status-working' : 'status-off'}">
                    ${isWorking ? '勤務中' : '退勤済み/未出勤'}
                </span>
            </div>
            <div class="btn-group">
                <button class="btn btn-in" onclick="clockIn(${emp.id})" ${isWorking ? 'disabled' : ''}>
                    出勤
                </button>
                <button class="btn btn-out" onclick="clockOut(${emp.id})" ${!isWorking ? 'disabled' : ''}>
                    退勤
                </button>
            </div>
        `;
        employeeGrid.appendChild(card);
    });
}

function renderAdminReport() {
    adminReportBody.innerHTML = '';
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    state.employees.forEach(emp => {
        const empLogs = state.logs.filter(log => log.employeeId === emp.id);
        
        // Calculate days worked this month
        const daysWorked = new Set(
            empLogs
                .filter(log => {
                    const logDate = new Date(log.timestamp);
                    return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
                })
                .map(log => new Date(log.timestamp).toDateString())
        ).size;

        const lastLog = empLogs.length > 0 ? empLogs[empLogs.length - 1] : null;
        const lastLogTime = lastLog ? new Date(lastLog.timestamp).toLocaleString('ja-JP') : '記録なし';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${emp.name}</td>
            <td>
                <span class="status-badge ${emp.status === 'working' ? 'status-working' : 'status-off'}">
                    ${emp.status === 'working' ? '勤務中' : '退勤'}
                </span>
            </td>
            <td>${daysWorked} 日</td>
            <td>${lastLogTime} (${lastLog ? lastLog.type : '-'})</td>
            <td>
                <button class="btn btn-out" onclick="deleteEmployee(${emp.id})" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; color: var(--accent-red); border-color: var(--accent-red);">削除</button>
            </td>
        `;
        adminReportBody.appendChild(tr);
    });
}

// Attendance Logic
window.clockIn = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp && emp.status !== 'working') {
        emp.status = 'working';
        const log = {
            employeeId: id,
            type: '出勤',
            timestamp: new Date().toISOString()
        };
        state.logs.push(log);
        
        if (state.useCloud) {
            await state.db.collection('employees').doc(String(id)).update({ status: 'working' });
            await state.db.collection('logs').add(log);
        }
        
        saveData();
        renderEmployees();
        alert(`${emp.name}さん、おはようございます！`);
    }
};

window.clockOut = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp && emp.status === 'working') {
        emp.status = 'off';
        const log = {
            employeeId: id,
            type: '退勤',
            timestamp: new Date().toISOString()
        };
        state.logs.push(log);

        if (state.useCloud) {
            await state.db.collection('employees').doc(String(id)).update({ status: 'off' });
            await state.db.collection('logs').add(log);
        }

        saveData();
        renderEmployees();
        alert(`${emp.name}さん、お疲れ様でした！`);
    }
};

window.deleteEmployee = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp && confirm(`${emp.name}さんを削除してもよろしいですか？`)) {
        state.employees = state.employees.filter(e => String(e.id) !== String(id));
        
        if (state.useCloud) {
            await state.db.collection('employees').doc(String(id)).delete();
        }
        
        saveData();
        renderAdminReport();
        renderEmployees();
    }
};

// Admin Logic
function setupEventListeners() {
    document.getElementById('goto-admin').onclick = () => {
        employeeView.classList.add('hidden');
        adminLoginView.classList.remove('hidden');
    };

    document.getElementById('back-to-main-from-login').onclick = () => {
        adminLoginView.classList.add('hidden');
        employeeView.classList.remove('hidden');
    };

    document.getElementById('login-btn').onclick = () => {
        const pass = document.getElementById('admin-password').value;
        if (pass === ADMIN_PASSWORD) {
            state.isAdminLoggedIn = true;
            adminLoginView.classList.add('hidden');
            adminDashboardView.classList.remove('hidden');
            renderAdminReport();
        } else {
            alert('パスワードが正しくありません。');
        }
    };

    document.getElementById('logout-btn').onclick = () => {
        state.isAdminLoggedIn = false;
        adminDashboardView.classList.add('hidden');
        employeeView.classList.remove('hidden');
        document.getElementById('admin-password').value = '';
    };

    document.getElementById('add-employee-btn').onclick = async () => {
        const nameInput = document.getElementById('new-employee-name');
        const name = nameInput.value.trim();
        if (name) {
            const id = String(Date.now());
            const newEmp = { id, name, status: 'off' };
            state.employees.push(newEmp);
            
            if (state.useCloud) {
                await state.db.collection('employees').doc(id).set(newEmp);
            }
            
            saveData();
            nameInput.value = '';
            renderAdminReport();
            renderEmployees();
            alert(`${name}さんを登録しました。`);
        }
    };
}

init();
