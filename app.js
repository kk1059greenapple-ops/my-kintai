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
    useCloud: false,
    editingLogId: null,
    filterEmpId: ""
};

// DOM Elements
const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const employeeGrid = document.getElementById('employee-grid');
const adminReportBody = document.getElementById('admin-report-body');
const adminLogListBody = document.getElementById('admin-log-list-body');
const manualEmployeeSelect = document.getElementById('manual-employee-select');
const filterEmployeeSelect = document.getElementById('filter-employee-select');
const manualTypeSelect = document.getElementById('manual-type-select');
const manualDatetime = document.getElementById('manual-datetime');
const addManualLogBtn = document.getElementById('add-manual-log-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const resetLastMonthBtn = document.getElementById('reset-last-month-btn');
const forceRefreshBtn = document.getElementById('force-refresh-btn');

const employeeView = document.getElementById('employee-view');
const adminLoginView = document.getElementById('admin-login-view');
const adminDashboardView = document.getElementById('admin-dashboard-view');

// 初期化
async function init() {
    setupClock();
    loadLocalData();
    
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
                state.useCloud = true;
                setupRealtimeListeners();
            }
        } catch (e) { console.error("Firebase error", e); }
    }
    
    setupEventListeners();
    renderEmployees();
    if (state.isAdminLoggedIn) {
        setTimeout(updateAdminUI, 1000);
    }
}

function setupRealtimeListeners() {
    state.db.collection('employees').onSnapshot((snapshot) => {
        state.employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localStorage.setItem('att_employees', JSON.stringify(state.employees));
        renderEmployees();
        if (state.isAdminLoggedIn) updateAdminUI();
    });

    state.db.collection('logs').orderBy('timestamp', 'desc').limit(500).onSnapshot((snapshot) => {
        state.logs = snapshot.docs.map(doc => ({ logId: doc.id, ...doc.data() }));
        localStorage.setItem('att_logs', JSON.stringify(state.logs));
        if (state.isAdminLoggedIn) updateAdminUI();
    });

    state.db.collection('settings').doc('admin').onSnapshot((doc) => {
        if (doc.exists) {
            state.adminPassword = doc.data().password;
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
    clockTime.textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
    clockDate.textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function renderEmployees() {
    employeeGrid.innerHTML = '';
    state.employees.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'employee-card animate-fade';
        const isWorking = emp.status === 'working';
        card.innerHTML = `
            <div class="employee-name">${emp.name}</div>
            <div><span class="status-badge ${isWorking ? 'status-working' : 'status-off'}">${isWorking ? '勤務中' : '退勤済み'}</span></div>
            <div class="btn-group">
                <button class="btn btn-in" onclick="clockIn('${emp.id}')" ${isWorking ? 'disabled' : ''}>出勤</button>
                <button class="btn btn-out" onclick="clockOut('${emp.id}')" ${!isWorking ? 'disabled' : ''}>退勤</button>
            </div>
        `;
        employeeGrid.appendChild(card);
    });
}

function updateAdminUI() {
    if (!state.isAdminLoggedIn) return;
    renderAdminReport();
    renderLogList();
    updateEmployeeSelects();
}

function renderAdminReport() {
    adminReportBody.innerHTML = '';
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    state.employees.forEach(emp => {
        const empLogs = state.logs.filter(log => String(log.employeeId) === String(emp.id));
        const monthLogs = empLogs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
        });
        const daysWorked = new Set(monthLogs.map(log => new Date(log.timestamp).toDateString())).size;
        const lastLog = empLogs.length > 0 ? empLogs[0] : null;
        const lastLogTime = lastLog ? new Date(lastLog.timestamp).toLocaleString('ja-JP') : 'なし';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${emp.name}</td>
            <td><span class="status-badge ${emp.status === 'working' ? 'status-working' : 'status-off'}">${emp.status === 'working' ? '勤務中' : '退勤'}</span></td>
            <td>${daysWorked} 日</td>
            <td>${lastLogTime}</td>
            <td><button class="btn btn-out" onclick="deleteEmployee('${emp.id}')" style="padding: 0.25rem 0.5rem; color: var(--accent-red);">削除</button></td>
        `;
        adminReportBody.appendChild(tr);
    });
}

function renderLogList() {
    adminLogListBody.innerHTML = '';
    let filteredLogs = state.logs;
    if (state.filterEmpId) {
        filteredLogs = state.logs.filter(log => String(log.employeeId) === String(state.filterEmpId));
    }
    if (filteredLogs.length === 0) {
        adminLogListBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">記録がありません</td></tr>';
        return;
    }
    filteredLogs.forEach(log => {
        const emp = state.employees.find(e => String(e.id) === String(log.employeeId));
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(log.timestamp).toLocaleString('ja-JP')}</td>
            <td>${emp ? emp.name : '不明'}</td>
            <td>${log.type}</td>
            <td>
                <button class="btn btn-in" onclick="prepareEditLog('${log.logId}')" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; margin-right: 5px;">修正</button>
                <button class="btn btn-out" onclick="deleteLog('${log.logId}')" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; color: var(--accent-red);">消去</button>
            </td>
        `;
        adminLogListBody.appendChild(tr);
    });
}

function updateEmployeeSelects() {
    const curManual = manualEmployeeSelect.value;
    const curFilter = filterEmployeeSelect.value;

    let manualHTML = '<option value="">従業員を選択</option>';
    let filterHTML = '<option value="">全員表示</option>';

    state.employees.forEach(emp => {
        manualHTML += `<option value="${emp.id}">${emp.name}</option>`;
        filterHTML += `<option value="${emp.id}">${emp.name}</option>`;
    });

    manualEmployeeSelect.innerHTML = manualHTML;
    filterEmployeeSelect.innerHTML = filterHTML;

    if (curManual) manualEmployeeSelect.value = curManual;
    if (curFilter) filterEmployeeSelect.value = curFilter;
    else if (state.filterEmpId) filterEmployeeSelect.value = state.filterEmpId;
}

window.clockIn = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp) {
        const log = { employeeId: id, type: '出勤', timestamp: new Date().toISOString() };
        if (state.useCloud) {
            await state.db.collection('employees').doc(String(id)).update({ status: 'working' });
            await state.db.collection('logs').add(log);
        } else {
            emp.status = 'working';
            state.logs.unshift(log);
            saveData();
            renderEmployees();
        }
    }
};

window.clockOut = async (id) => {
    const emp = state.employees.find(e => String(e.id) === String(id));
    if (emp) {
        const log = { employeeId: id, type: '退勤', timestamp: new Date().toISOString() };
        if (state.useCloud) {
            await state.db.collection('employees').doc(String(id)).update({ status: 'off' });
            await state.db.collection('logs').add(log);
        } else {
            emp.status = 'off';
            state.logs.unshift(log);
            saveData();
            renderEmployees();
        }
    }
};

window.deleteEmployee = async (id) => {
    if (confirm("この従業員を削除しますか？")) {
        if (state.useCloud) await state.db.collection('employees').doc(String(id)).delete();
        else {
            state.employees = state.employees.filter(e => String(e.id) !== String(id));
            saveData();
            updateAdminUI();
            renderEmployees();
        }
    }
};

window.deleteLog = async (logId) => {
    if (confirm("この記録を消去しますか？")) {
        if (state.useCloud) await state.db.collection('logs').doc(logId).delete();
        else {
            state.logs = state.logs.filter(l => l.logId !== logId);
            saveData();
            updateAdminUI();
        }
    }
};

window.prepareEditLog = (logId) => {
    const log = state.logs.find(l => l.logId === logId);
    if (log) {
        state.editingLogId = logId;
        manualEmployeeSelect.value = log.employeeId;
        manualTypeSelect.value = log.type;
        const d = new Date(log.timestamp);
        const pad = (n) => n.toString().padStart(2, '0');
        manualDatetime.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        addManualLogBtn.textContent = "保存";
        addManualLogBtn.classList.replace('btn-in', 'btn-out');
        cancelEditBtn.classList.remove('hidden');
        document.querySelector('#admin-dashboard-view section:nth-of-type(2)').scrollIntoView({ behavior: 'smooth' });
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
            updateAdminUI();
        } else { alert('違います'); }
    };
    document.getElementById('logout-btn').onclick = () => {
        state.isAdminLoggedIn = false;
        localStorage.setItem('att_is_admin_logged_in', 'false');
        adminDashboardView.classList.add('hidden');
        employeeView.classList.remove('hidden');
    };
    document.getElementById('add-employee-btn').onclick = async () => {
        const name = document.getElementById('new-employee-name').value.trim();
        if (name) {
            const id = String(Date.now());
            if (state.useCloud) await state.db.collection('employees').doc(id).set({ id, name, status: 'off' });
            else { state.employees.push({ id, name, status: 'off' }); saveData(); updateAdminUI(); renderEmployees(); }
            document.getElementById('new-employee-name').value = '';
        }
    };
    document.getElementById('change-pw-btn').onclick = async () => {
        const newPw = document.getElementById('new-admin-password').value.trim();
        if (newPw && confirm("変更しますか？")) {
            if (state.useCloud) await state.db.collection('settings').doc('admin').set({ password: newPw });
            else { state.adminPassword = newPw; saveData(); }
            alert("完了");
            document.getElementById('new-admin-password').value = '';
        }
    };
    addManualLogBtn.onclick = async () => {
        const empId = manualEmployeeSelect.value;
        const type = manualTypeSelect.value;
        const dt = manualDatetime.value;
        if (!empId || !dt) { alert("正しく入力してください"); return; }
        const logData = { employeeId: empId, type: type, timestamp: new Date(dt).toISOString() };
        if (state.editingLogId) {
            if (state.useCloud) await state.db.collection('logs').doc(state.editingLogId).update(logData);
            else {
                const idx = state.logs.findIndex(l => l.logId === state.editingLogId);
                state.logs[idx] = { logId: state.editingLogId, ...logData };
                saveData();
                updateAdminUI();
            }
            resetManualForm();
            alert("修正しました");
        } else {
            if (state.useCloud) await state.db.collection('logs').add(logData);
            else { state.logs.unshift({ logId: Date.now(), ...logData }); saveData(); updateAdminUI(); }
            alert("追加しました");
        }
        manualDatetime.value = '';
    };
    cancelEditBtn.onclick = resetManualForm;
    filterEmployeeSelect.onchange = () => {
        state.filterEmpId = filterEmployeeSelect.value;
        renderLogList();
    };
    resetLastMonthBtn.onclick = async () => {
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (confirm("先月分を消去しますか？")) {
            const lastMonthLogs = state.logs.filter(log => new Date(log.timestamp) < startOfThisMonth);
            if (lastMonthLogs.length === 0) { alert("記録なし"); return; }
            if (state.useCloud) {
                for (const log of lastMonthLogs) { await state.db.collection('logs').doc(log.logId).delete(); }
            } else { state.logs = state.logs.filter(log => new Date(log.timestamp) >= startOfThisMonth); saveData(); updateAdminUI(); }
            alert("完了");
        }
    };
    forceRefreshBtn.onclick = () => {
        updateAdminUI();
        alert("リストを更新しました。");
    };
}

function resetManualForm() {
    state.editingLogId = null;
    manualDatetime.value = '';
    addManualLogBtn.textContent = "保存";
    addManualLogBtn.classList.replace('btn-out', 'btn-in');
    cancelEditBtn.classList.add('hidden');
}

function saveData() {
    localStorage.setItem('att_employees', JSON.stringify(state.employees));
    localStorage.setItem('att_logs', JSON.stringify(state.logs));
    localStorage.setItem('att_admin_pw', state.adminPassword);
}

init();
