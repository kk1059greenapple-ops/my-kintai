// --- Firebase Configuration ---
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
    adminPassword: "admin",
    isAdminLoggedIn: false,
    useCloud: false
};

// DOM Elements
const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const employeeGrid = document.getElementById('employee-grid');
const adminReportBody = document.getElementById('admin-report-body');
const employeeView = document.getElementById('employee-view');
const adminLoginView = document.getElementById('admin-login-view');
const adminDashboardView = document.getElementById('admin-dashboard-view');

// 初期化
async function init() {
    setupClock();
    loadLocalData(); // 起動時にとりあえず手元のデータを出す
    
    // ログイン状態の復元
    if (localStorage.getItem('att_is_admin_logged_in') === 'true') {
        state.isAdminLoggedIn = true;
        employeeView.classList.add('hidden');
        adminDashboardView.classList.remove('hidden');
    }

    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        try {
            if (typeof firebase !== 'undefined') {
                firebase.initializeApp(firebaseConfig);
                state.db = firebase.firestore();
                
                // オフライン対応
                try {
                    await state.db.enablePersistence({ synchronizeTabs: true });
                } catch (e) { console.warn("Persistence failed"); }

                state.useCloud = true;
                setupRealtimeListeners();
            }
        } catch (e) {
            console.error("Firebase init error:", e);
        }
    }
    
    setupEventListeners();
    renderEmployees();
}

function setupRealtimeListeners() {
    // 従業員の監視
    state.db.collection('employees').onSnapshot((snapshot) => {
        if (snapshot.empty) {
            // クラウドが空っぽなら、最初の社員を作成（動作確認用）
            const initialEmp = { id: String(Date.now()), name: "テスト社員", status: "off" };
            state.db.collection('employees').doc(initialEmp.id).set(initialEmp);
        } else {
            state.employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem('att_employees', JSON.stringify(state.employees));
            renderEmployees();
            if (state.isAdminLoggedIn) renderAdminReport();
        }
    }, (error) => {
        if (error.code === 'permission-denied') {
            alert("クラウドの保存に失敗しました。Firebaseの『ルール』を公開設定にしてください。");
        }
    });

    // ログの監視
    state.db.collection('logs').orderBy('timestamp', 'desc').limit(100).onSnapshot((snapshot) => {
        state.logs = snapshot.docs.map(doc => doc.data());
        localStorage.setItem('att_logs', JSON.stringify(state.logs));
        if (state.isAdminLoggedIn) renderAdminReport();
    });

    // パスワードの監視
    state.db.collection('settings').doc('admin').onSnapshot((doc) => {
        if (doc.exists) {
            state.adminPassword = doc.data().password;
            localStorage.setItem('att_admin_pw', state.adminPassword);
        } else {
            state.db.collection('settings').doc('admin').set({ password: "admin" });
        }
    });
}

function loadLocalData() {
    const savedEmployees = localStorage.getItem('att_employees');
    const savedLogs = localStorage.getItem('att_logs');
    const savedPw = localStorage.getItem('att_admin_pw');
    if (savedEmployees) state.employees = JSON.parse(savedEmployees);
    if (savedLogs) state.logs = JSON.parse(savedLogs);
    if (savedPw) state.adminPassword = savedPw;
}

function setupClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour12: false });
    const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    clockTime.textContent = timeStr;
    clockDate.textContent = dateStr;
}

function renderEmployees() {
    employeeGrid.innerHTML = '';
    if (state.employees.length === 0) {
        employeeGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:var(--text-muted);">従業員が登録されていません。社長管理ページから追加してください。</p>';
        return;
    }
    state.employees.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'employee-card animate-fade';
        const isWorking = emp.status === 'working';
        card.innerHTML = `
            <div class="employee-name">${emp.name}</div>
            <div>
                <span class="status-badge ${isWorking ? 'status-working' : 'status-off'}">
                    ${isWorking ? '勤務中' : '退勤済み'}
                </span>
            </div>
            <div class="btn-group">
                <button class="btn btn-in" onclick="clockIn('${emp.id}')" ${isWorking ? 'disabled' : ''}>出勤</button>
                <button class="btn btn-out" onclick="clockOut('${emp.id}')" ${!isWorking ? 'disabled' : ''}>退勤</button>
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
        const empLogs = state.logs.filter(log => String(log.employeeId) === String(emp.id));
        const daysWorked = new Set(
            empLogs.filter(log => {
                const logDate = new Date(log.timestamp);
                return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
            }).map(log => new Date(log.timestamp).toDateString())
        ).size;

        const lastLog = empLogs.length > 0 ? empLogs[0] : null;
        const lastLogTime = lastLog ? new Date(lastLog.timestamp).toLocaleString('ja-JP') : 'なし';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${emp.name}</td>
            <td><span class="status-badge ${emp.status === 'working' ? 'status-working' : 'status-off'}">${emp.status === 'working' ? '勤務中' : '退勤'}</span></td>
            <td>${daysWorked} 日</td>
            <td>${lastLogTime}</td>
            <td><button class="btn btn-out" onclick="deleteEmployee('${emp.id}')" style="padding: 0.25rem 0.5rem; color: var(--accent-red); border-color: var(--accent-red);">削除</button></td>
        `;
        adminReportBody.appendChild(tr);
    });
}

window.clockIn = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp) {
        const log = { employeeId: id, type: '出勤', timestamp: new Date().toISOString() };
        if (state.useCloud) {
            try {
                await state.db.collection('employees').doc(String(id)).update({ status: 'working' });
                await state.db.collection('logs').add(log);
            } catch (e) { alert("保存失敗。ネット接続か設定を確認してください。"); }
        } else {
            emp.status = 'working';
            state.logs.unshift(log);
            localStorage.setItem('att_employees', JSON.stringify(state.employees));
            localStorage.setItem('att_logs', JSON.stringify(state.logs));
            renderEmployees();
        }
    }
};

window.clockOut = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp) {
        const log = { employeeId: id, type: '退勤', timestamp: new Date().toISOString() };
        if (state.useCloud) {
            try {
                await state.db.collection('employees').doc(String(id)).update({ status: 'off' });
                await state.db.collection('logs').add(log);
            } catch (e) { alert("保存失敗"); }
        } else {
            emp.status = 'off';
            state.logs.unshift(log);
            localStorage.setItem('att_employees', JSON.stringify(state.employees));
            localStorage.setItem('att_logs', JSON.stringify(state.logs));
            renderEmployees();
        }
    }
};

window.deleteEmployee = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp && confirm(`${emp.name}さんを削除しますか？`)) {
        if (state.useCloud) {
            try {
                await state.db.collection('employees').doc(String(id)).delete();
            } catch (e) { alert("削除に失敗しました"); }
        } else {
            state.employees = state.employees.filter(e => String(e.id) !== String(id));
            localStorage.setItem('att_employees', JSON.stringify(state.employees));
            renderAdminReport();
            renderEmployees();
        }
    }
};

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
        if (document.getElementById('admin-password').value === state.adminPassword) {
            state.isAdminLoggedIn = true;
            localStorage.setItem('att_is_admin_logged_in', 'true');
            adminLoginView.classList.add('hidden');
            adminDashboardView.classList.remove('hidden');
            renderAdminReport();
        } else { alert('違います'); }
    };
    document.getElementById('logout-btn').onclick = () => {
        state.isAdminLoggedIn = false;
        localStorage.setItem('att_is_admin_logged_in', 'false');
        adminDashboardView.classList.add('hidden');
        employeeView.classList.remove('hidden');
    };
    document.getElementById('add-employee-btn').onclick = async () => {
        const nameInput = document.getElementById('new-employee-name');
        const name = nameInput.value.trim();
        if (name) {
            const id = String(Date.now());
            const newEmp = { id, name, status: 'off' };
            if (state.useCloud) {
                try {
                    await state.db.collection('employees').doc(id).set(newEmp);
                    nameInput.value = '';
                } catch (e) { alert("追加に失敗しました。設定を確認してください。"); }
            } else {
                state.employees.push(newEmp);
                localStorage.setItem('att_employees', JSON.stringify(state.employees));
                renderAdminReport();
                renderEmployees();
                nameInput.value = '';
            }
        }
    };
    document.getElementById('change-pw-btn').onclick = async () => {
        const newPw = document.getElementById('new-admin-password').value.trim();
        if (newPw && confirm("変更しますか？")) {
            if (state.useCloud) {
                await state.db.collection('settings').doc('admin').set({ password: newPw });
            } else {
                state.adminPassword = newPw;
                localStorage.setItem('att_admin_pw', newPw);
            }
            alert("完了");
            document.getElementById('new-admin-password').value = '';
        }
    };
}

init();
