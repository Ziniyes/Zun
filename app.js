cat > /mnt/user-data/outputs/app.js << 'ENDOFFILE'
// Firebase Config - SỬA LẠI ĐOẠN NÀY
const firebaseConfig = {
    apiKey: "AIzaSy...",  // Lấy từ Firebase Console
    authDomain: "proxy-62231.firebaseapp.com",
    databaseURL: "https://proxy-62231-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "proxy-62231",
    storageBucket: "proxy-62231.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;
const DEPLOY_COST = 10;

// DOM
const loadingScreen = document.getElementById('loading-screen');
const loginBtn = document.getElementById('login-btn');
const loginModal = document.getElementById('login-modal');
const googleLoginBtn = document.getElementById('google-login-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userPoints = document.getElementById('user-points');
const deployBtn = document.getElementById('deploy-btn');
const deployModal = document.getElementById('deploy-modal');
const confirmDeployBtn = document.getElementById('confirm-deploy-btn');
const serversList = document.getElementById('servers-list');
const serversSection = document.getElementById('servers');
const logoutBtn = document.getElementById('logout-btn');
const notification = document.getElementById('notification');

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => loadingScreen.classList.add('hidden'), 1500);

    auth.onAuthStateChanged(user => {
        if (user) {
            handleUserLogin(user);
        } else {
            handleUserLogout();
        }
    });

    loginBtn.addEventListener('click', () => openModal(loginModal));
    googleLoginBtn.addEventListener('click', loginWithGoogle);
    deployBtn.addEventListener('click', openDeployModal);
    confirmDeployBtn.addEventListener('click', deployServer);
    logoutBtn.addEventListener('click', logout);

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal')));
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });
});

async function loginWithGoogle() {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        
        const userRef = database.ref(`users/${user.uid}`);
        const snapshot = await userRef.once('value');
        
        if (!snapshot.exists()) {
            await userRef.set({
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                role: 'user',
                points: 100,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                lastPointsReset: firebase.database.ServerValue.TIMESTAMP
            });
        }
        
        closeModal(loginModal);
        showNotification('Đăng nhập thành công!', 'success');
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

async function logout() {
    await auth.signOut();
    showNotification('Đã đăng xuất', 'success');
}

async function handleUserLogin(user) {
    currentUser = user;
    
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    userAvatar.src = user.photoURL;
    userName.textContent = user.displayName.split(' ')[0];
    deployBtn.disabled = false;
    
    const userRef = database.ref(`users/${user.uid}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();
    
    if (userData) {
        userPoints.textContent = userData.points || 0;
    }
    
    loadUserServers();
    
    userRef.child('points').on('value', snap => {
        userPoints.textContent = snap.val() || 0;
    });
}

function handleUserLogout() {
    currentUser = null;
    loginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    deployBtn.disabled = true;
    serversSection.style.display = 'none';
    serversList.innerHTML = '';
}

async function openDeployModal() {
    if (!currentUser) {
        showNotification('Vui lòng đăng nhập!', 'error');
        return;
    }
    
    const serversRef = database.ref('servers');
    const snapshot = await serversRef.orderByChild('userId').equalTo(currentUser.uid).once('value');
    
    let hasActiveServer = false;
    snapshot.forEach(child => {
        if (child.val().status === 'running' || child.val().status === 'deploying') {
            hasActiveServer = true;
        }
    });
    
    if (hasActiveServer) {
        showNotification('Bạn đã có server đang chạy!', 'error');
        return;
    }
    
    const userRef = database.ref(`users/${currentUser.uid}`);
    const userSnap = await userRef.once('value');
    const userData = userSnap.val();
    
    if (userData.points < DEPLOY_COST) {
        showNotification('Không đủ điểm! Cần ' + DEPLOY_COST + ' điểm.', 'error');
        return;
    }
    
    document.getElementById('deploy-points').textContent = userData.points;
    openModal(deployModal);
}

async function deployServer() {
    try {
        closeModal(deployModal);
        showNotification('Đang tạo server...', 'success');
        
        const userRef = database.ref(`users/${currentUser.uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();
        
        await userRef.update({
            points: userData.points - DEPLOY_COST
        });
        
        const serverRef = database.ref('servers').push();
        const serverId = serverRef.key;
        const adminPassword = 'Admin-' + Math.random().toString(36).substring(2, 10);
        
        await serverRef.set({
            id: serverId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            status: 'deploying',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: Date.now() + (6 * 3600000),
            adminPassword: adminPassword,
            publicIP: null,
            publicURL: null,
            rdpPort: null
        });
        
        // Gọi GitHub Actions để deploy
        await triggerGitHubDeploy(serverId, adminPassword);
        
        loadUserServers();
        showNotification('Server đang được triển khai!', 'success');
        
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

async function triggerGitHubDeploy(serverId, adminPassword) {
    // TODO: Gọi GitHub API để trigger workflow
    // Hiện tại giả lập deployment
    
    setTimeout(async () => {
        const serverRef = database.ref(`servers/${serverId}`);
        await serverRef.update({
            status: 'running',
            publicIP: '20.' + Math.floor(Math.random() * 255) + '.' + 
                     Math.floor(Math.random() * 255) + '.' + 
                     Math.floor(Math.random() * 255),
            publicURL: 'http://tunnel-' + serverId.substring(0, 6) + '.kami.io:' + 
                      (30000 + Math.floor(Math.random() * 10000)),
            rdpPort: '3389'
        });
        
        setTimeout(async () => {
            await serverRef.update({ status: 'expired' });
        }, 6 * 3600000);
        
    }, 120000);
}

async function loadUserServers() {
    if (!currentUser) return;
    
    serversList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Đang tải...</div>';
    serversSection.style.display = 'block';
    
    const serversRef = database.ref('servers');
    const snapshot = await serversRef.orderByChild('userId').equalTo(currentUser.uid).once('value');
    
    serversList.innerHTML = '';
    
    if (!snapshot.exists()) {
        serversList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Bạn chưa có server nào</div>';
        return;
    }
    
    snapshot.forEach(child => {
        const server = child.val();
        if (server.status !== 'expired') {
            createServerCard(server);
        }
    });
}

function createServerCard(server) {
    const card = document.createElement('div');
    card.className = 'server-card';
    
    const statusClass = server.status === 'running' ? 'running' : 'stopped';
    const statusText = server.status.toUpperCase();
    
    const timeLeft = server.expiresAt ? Math.max(0, Math.floor((server.expiresAt - Date.now()) / 60000)) : 0;
    const hours = Math.floor(timeLeft / 60);
    const minutes = timeLeft % 60;
    
    card.innerHTML = `
        <div class="server-header">
            <h3>Server #${server.id.substring(0, 8)}</h3>
            <div class="server-status ${statusClass}">
                <span class="status-dot"></span>
                ${statusText}
            </div>
        </div>
        <div class="server-info">
            <div class="server-info-item">
                <span>IP Address:</span>
                <strong>${server.publicIP || 'Đang tạo...'}</strong>
            </div>
            <div class="server-info-item">
                <span>Tunnel URL:</span>
                <strong>${server.publicURL || 'Đang tạo...'}</strong>
            </div>
            <div class="server-info-item">
                <span>Username:</span>
                <strong>Administrator</strong>
            </div>
            <div class="server-info-item">
                <span>Password:</span>
                <strong>${server.adminPassword}</strong>
            </div>
            <div class="server-info-item">
                <span>Time Left:</span>
                <strong>${hours}h ${minutes}m</strong>
            </div>
        </div>
        <div class="server-actions">
            ${server.status === 'running' ? 
                `<button class="btn-server" onclick="copyServerInfo('${server.publicURL || server.publicIP}', '${server.adminPassword}')">📋 Copy Info</button>` : 
                `<button class="btn-server" disabled>Đang khởi tạo...</button>`
            }
            <button class="btn-server danger" onclick="deleteServer('${server.id}')">🗑️ Delete</button>
        </div>
    `;
    
    serversList.appendChild(card);
}

async function deleteServer(serverId) {
    if (!confirm('Bạn có chắc muốn xóa server này?')) return;
    
    try {
        await database.ref(`servers/${serverId}`).remove();
        showNotification('Đã xóa server', 'success');
        loadUserServers();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

function copyServerInfo(url, password) {
    const info = `URL: ${url}\nUser: Administrator\nPass: ${password}`;
    navigator.clipboard.writeText(info);
    showNotification('Đã copy thông tin!', 'success');
}

function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove('show'), 3000);
}

window.deleteServer = deleteServer;
window.copyServerInfo = copyServerInfo;
ENDOFFILE
echo "✅ File app.js đã tạo"
