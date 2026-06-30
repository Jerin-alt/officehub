// OfficeHub Client Application Logic

// State management
let currentUser = localStorage.getItem('officehub_user') || '';
let currentTheme = localStorage.getItem('officehub_theme') || 'dark';
let soundEnabled = localStorage.getItem('officehub_sound') !== 'off';
let activeTab = 'panel-chat';
let eventSource = null;
let activeUploadXHR = null;
let audioContext = null;

// DOM Elements
const setupOverlay = document.getElementById('setup-overlay');
const setupForm = document.getElementById('setup-form');
const usernameInput = document.getElementById('setup-username-input');
const displayUsername = document.getElementById('display-username');
const editUsernameBtn = document.getElementById('edit-username-btn');
const userAvatar = document.getElementById('user-avatar');

const connectionStatus = document.getElementById('connection-status');
const navButtons = document.querySelectorAll('.nav-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const fileCountBadge = document.getElementById('file-count-badge');

const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const fileInput = document.getElementById('file-input');
const attachmentBtn = document.getElementById('attachment-btn');
const dropZone = document.getElementById('drop-zone');

const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadFilename = document.getElementById('upload-filename');
const uploadProgressBar = document.getElementById('upload-progress-bar');
const uploadPercentage = document.getElementById('upload-percentage');
const cancelUploadBtn = document.getElementById('cancel-upload-btn');

const fileSearchInput = document.getElementById('file-search');
const filesListBody = document.getElementById('files-list-body');
const noFilesPlaceholder = document.getElementById('no-files-placeholder');

const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const soundToggle = document.getElementById('sound-toggle');
const soundOnIcon = document.getElementById('sound-on-icon');
const soundOffIcon = document.getElementById('sound-off-icon');
const notifyRequestBtn = document.getElementById('notify-request-btn');
const toastContainer = document.getElementById('toast-container');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initUser();
    initTheme();
    initSound();
    initNavigation();
    initSSE();
    loadMessages();
    setupEventListeners();
    setupDragAndDrop();
    updateFileCountBadge();
    
    // Register PWA service worker if supported
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
            .then(reg => console.log('Service Worker registered successfully', reg.scope))
            .catch(err => console.warn('Service Worker registration failed', err));
    }
});

// Sound Synthesis using Web Audio API (No downloads required)
function playNotificationSound() {
    if (!soundEnabled) return;
    
    try {
        // Initialize AudioContext on first play due to browser autoplay policies
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const now = audioContext.currentTime;
        
        // Beautiful ambient double chime
        // First note (E5)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now); // E5
        
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(now);
        osc1.stop(now + 0.65);
        
        // Second note (A5) played 0.12 seconds later
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, now + 0.12); // A5
        
        gain2.gain.setValueAtTime(0, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.15, now + 0.17);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.85);
        
    } catch (e) {
        console.warn('Web Audio synthesis failed:', e);
    }
}

// Push Notifications Setup
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showToast('System Error', 'This browser does not support desktop notifications.', 'error');
        return;
    }
    
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            showToast('Notifications Enabled', 'You will now receive desktop notifications for new messages.', 'success');
            // Play test sound
            playNotificationSound();
        } else if (permission === 'denied') {
            showToast('Notifications Blocked', 'Please enable notifications in your browser settings to receive alerts.', 'warning');
        }
    });
}

function sendDesktopNotification(title, bodyText, iconUrl = '/static/manifest.json') {
    if (document.visibilityState === 'visible') return; // Don't annoy user if active
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: bodyText,
            icon: iconUrl,
            silent: true // We play our own synthesized chime
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}

// User Profile logic
function initUser() {
    if (currentUser) {
        setupOverlay.style.display = 'none';
        displayUsername.textContent = currentUser;
        userAvatar.textContent = currentUser.charAt(0).toUpperCase();
    } else {
        setupOverlay.style.display = 'flex';
    }
}

function changeUsername(newName) {
    newName = newName.trim();
    if (!newName) return;
    
    const oldName = currentUser;
    currentUser = newName;
    localStorage.setItem('officehub_user', newName);
    displayUsername.textContent = newName;
    userAvatar.textContent = newName.charAt(0).toUpperCase();
    
    showToast('Name Updated', `Your name is now set to "${newName}"`, 'success');
    
    // Broadcast status message if connected
    if (oldName && oldName !== newName) {
        sendSystemNotification(`${oldName} changed their name to ${newName}`);
    }
}

function sendSystemNotification(text) {
    // Send a system action message (we can post a text message with format or special text)
    // For simplicity, we just send a text message starting with a bracket or simple system text.
    // In index.html/app.js we handle rendering.
}

// Theme Switcher
function initTheme() {
    if (currentTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

function toggleTheme() {
    if (currentTheme === 'dark') {
        currentTheme = 'light';
    } else {
        currentTheme = 'dark';
    }
    localStorage.setItem('officehub_theme', currentTheme);
    initTheme();
}

// Sound Switcher
function initSound() {
    if (soundEnabled) {
        soundOnIcon.style.display = 'block';
        soundOffIcon.style.display = 'none';
    } else {
        soundOnIcon.style.display = 'none';
        soundOffIcon.style.display = 'block';
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('officehub_sound', soundEnabled ? 'on' : 'off');
    initSound();
    if (soundEnabled) {
        // Initialize sound context
        playNotificationSound();
    }
}

// Navigation Tabs
function initNavigation() {
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            if (targetTab === activeTab) return;
            
            // Toggle Nav Buttons
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Toggle Panels
            tabPanels.forEach(p => p.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
            
            activeTab = targetTab;
            
            if (activeTab === 'panel-files') {
                loadFiles();
            } else if (activeTab === 'panel-chat') {
                scrollToBottom();
            }
        });
    });
}

// Server-Sent Events (SSE) for Real-time
function initSSE() {
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource('/api/stream');
    
    eventSource.onopen = () => {
        connectionStatus.className = 'status-badge status-online';
        connectionStatus.querySelector('.status-text').textContent = 'Online';
    };
    
    eventSource.onerror = (e) => {
        console.error('SSE connection lost. Retrying...', e);
        connectionStatus.className = 'status-badge status-offline';
        connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
    };
    
    eventSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'ping') return; // Keep-alive check
        
        appendMessage(msg);
        
        // Trigger alerts for incoming new messages
        if (msg.user_name !== currentUser) {
            playNotificationSound();
            
            if (msg.type === 'file') {
                sendDesktopNotification(`${msg.user_name} shared a file`, `File: ${msg.file_name}`, msg.content);
                updateFileCountBadge();
                if (activeTab === 'panel-files') {
                    loadFiles();
                }
            } else {
                sendDesktopNotification(`Message from ${msg.user_name}`, msg.content);
            }
        } else {
            // My own file uploads trigger file count update
            if (msg.type === 'file') {
                updateFileCountBadge();
                if (activeTab === 'panel-files') {
                    loadFiles();
                }
            }
        }
    };
}

// Load Chat History
function loadMessages() {
    fetch('/api/messages?limit=100')
        .then(res => res.json())
        .then(messages => {
            chatHistory.innerHTML = '';
            messages.forEach(msg => appendMessage(msg, false));
            scrollToBottom();
        })
        .catch(err => {
            console.error('Failed to load message history:', err);
            showToast('Loading Failed', 'Could not retrieve message history from server.', 'error');
        });
}

// Append a single message to UI
function appendMessage(msg, scroll = true) {
    const isOutgoing = msg.user_name === currentUser;
    const msgElement = document.createElement('div');
    
    if (msg.type === 'system') {
        msgElement.className = 'message system-msg';
        msgElement.innerHTML = `<div class="system-bubble">${escapeHTML(msg.content)}</div>`;
    } else {
        msgElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        const avatarLetter = msg.user_name ? msg.user_name.charAt(0).toUpperCase() : '?';
        const formattedTime = formatTime(msg.timestamp);
        
        let contentHtml = '';
        if (msg.type === 'file') {
            const prettySize = formatBytes(msg.file_size);
            contentHtml = `
                <div class="file-card">
                    <div class="file-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>
                    <div class="file-details">
                        <span class="file-name" title="${escapeHTML(msg.file_name)}">${escapeHTML(msg.file_name)}</span>
                        <span class="file-size">${prettySize}</span>
                    </div>
                    <a href="${msg.content}?download=1" class="file-download-btn" title="Download File" download="${escapeHTML(msg.file_name)}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </a>
                </div>
            `;
        } else {
            contentHtml = `<div class="msg-text">${linkify(escapeHTML(msg.content))}</div>`;
        }
        
        msgElement.innerHTML = `
            <div class="msg-avatar">${avatarLetter}</div>
            <div class="msg-bubble">
                <div class="msg-meta">
                    <span class="msg-sender">${escapeHTML(msg.user_name)}</span>
                    <span class="msg-time">${formattedTime}</span>
                </div>
                ${contentHtml}
            </div>
        `;
    }
    
    chatHistory.appendChild(msgElement);
    if (scroll) {
        scrollToBottom();
    }
}

// Scroll chat history to bottom
function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Event Listeners
function setupEventListeners() {
    // Setup Name Form
    setupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputName = usernameInput.value.trim();
        if (inputName) {
            currentUser = inputName;
            localStorage.setItem('officehub_user', inputName);
            initUser();
            showToast('Connected', `Welcome to OfficeHub, ${currentUser}!`, 'success');
            // Play entry sound
            playNotificationSound();
        }
    });
    
    // Change Username button
    editUsernameBtn.addEventListener('click', () => {
        const newName = prompt('Enter a new display name (max 20 characters):', currentUser);
        if (newName && newName.trim()) {
            changeUsername(newName.trim().substring(0, 20));
        }
    });
    
    // Theme Toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Sound Toggle
    soundToggle.addEventListener('click', toggleSound);
    
    // Desktop Notification permissions request
    notifyRequestBtn.addEventListener('click', requestNotificationPermission);
    
    // Submit Text Message
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const content = chatInput.value.trim();
        if (!content) return;
        
        chatInput.value = '';
        
        // Post message to backend
        fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_name: currentUser,
                content: content
            })
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to send message');
        })
        .catch(err => {
            console.error('Send error:', err);
            showToast('Message Error', 'Could not send message. Connection offline.', 'error');
            // Restore input text
            chatInput.value = content;
        });
    });
    
    // Attachment Button trigger
    attachmentBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File Input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
            fileInput.value = ''; // Reset input
        }
    });
    
    // Cancel Upload Button
    cancelUploadBtn.addEventListener('click', () => {
        if (activeUploadXHR) {
            activeUploadXHR.abort();
            activeUploadXHR = null;
            uploadProgressContainer.style.display = 'none';
            showToast('Upload Cancelled', 'File upload was aborted.', 'warning');
        }
    });
    
    // Live Search shared files
    fileSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const rows = filesListBody.querySelectorAll('tr');
        
        let visibleCount = 0;
        rows.forEach(row => {
            const fileName = row.getAttribute('data-filename').toLowerCase();
            const uploader = row.getAttribute('data-uploader').toLowerCase();
            
            if (fileName.includes(query) || uploader.includes(query)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
        
        if (visibleCount === 0 && rows.length > 0) {
            noFilesPlaceholder.style.display = 'flex';
            noFilesPlaceholder.querySelector('p').textContent = 'No matching files found.';
        } else if (rows.length === 0) {
            noFilesPlaceholder.style.display = 'flex';
            noFilesPlaceholder.querySelector('p').textContent = 'No files shared yet. Drag files into the chat to share!';
        } else {
            noFilesPlaceholder.style.display = 'none';
        }
    });
}

// Drag & Drop Functionality
function setupDragAndDrop() {
    let dragCounter = 0;
    
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (activeTab === 'panel-chat') {
            dropZone.classList.add('active');
        }
    });
    
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dropZone.classList.remove('active');
        }
    });
    
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropZone.classList.remove('active');
        
        if (activeTab !== 'panel-chat') return;
        
        if (e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });
}

// Upload File via XMLHttpRequest (for progress tracking)
function uploadFile(file) {
    if (!currentUser) {
        showToast('Setup Required', 'Please enter your name before sharing files.', 'warning');
        setupOverlay.style.display = 'flex';
        return;
    }
    
    // Check local upload limit (200MB)
    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast('File Too Large', 'Maximum file size permitted is 200MB.', 'error');
        return;
    }
    
    if (activeUploadXHR) {
        showToast('Upload in Progress', 'Please wait for the current upload to finish or cancel it first.', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_name', currentUser);
    
    const xhr = new XMLHttpRequest();
    activeUploadXHR = xhr;
    
    // UI Progress updates
    uploadFilename.textContent = file.name;
    uploadProgressBar.style.width = '0%';
    uploadPercentage.textContent = '0%';
    uploadProgressContainer.style.display = 'flex';
    
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            uploadProgressBar.style.width = `${percentComplete}%`;
            uploadPercentage.textContent = `${percentComplete}%`;
        }
    };
    
    xhr.onload = () => {
        activeUploadXHR = null;
        uploadProgressContainer.style.display = 'none';
        
        if (xhr.status === 200) {
            showToast('Upload Successful', `"${file.name}" has been shared.`, 'success');
        } else {
            let errorMsg = 'Could not upload file to server.';
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.error) errorMsg = response.error;
            } catch (e) {}
            showToast('Upload Failed', errorMsg, 'error');
        }
    };
    
    xhr.onerror = () => {
        activeUploadXHR = null;
        uploadProgressContainer.style.display = 'none';
        showToast('Upload Failed', 'Network connection interrupted during upload.', 'error');
    };
    
    xhr.open('POST', '/api/upload', true);
    xhr.send(formData);
}

// Fetch all Shared Files (Tab Panel 2)
function loadFiles() {
    fetch('/api/files')
        .then(res => res.json())
        .then(files => {
            filesListBody.innerHTML = '';
            
            if (files.length === 0) {
                noFilesPlaceholder.style.display = 'flex';
                return;
            }
            
            noFilesPlaceholder.style.display = 'none';
            
            files.forEach(file => {
                const row = document.createElement('tr');
                row.setAttribute('data-filename', file.file_name);
                row.setAttribute('data-uploader', file.user_name);
                
                const prettySize = formatBytes(file.file_size);
                const prettyDate = formatDate(file.timestamp);
                
                row.innerHTML = `
                    <td>
                        <div class="file-row-name">
                            <div class="file-row-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <span class="file-name-span" title="${escapeHTML(file.file_name)}">${escapeHTML(file.file_name)}</span>
                        </div>
                    </td>
                    <td>${prettySize}</td>
                    <td>${escapeHTML(file.user_name)}</td>
                    <td>${prettyDate}</td>
                    <td class="text-right">
                        <a href="${file.content}?download=1" class="table-action-btn" download="${escapeHTML(file.file_name)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            <span>Download</span>
                        </a>
                    </td>
                `;
                filesListBody.appendChild(row);
            });
            
            // Retrigger filter search in case text is in box
            const searchVal = fileSearchInput.value.trim();
            if (searchVal) {
                fileSearchInput.dispatchEvent(new Event('input'));
            }
        })
        .catch(err => {
            console.error('Failed to load file list:', err);
            showToast('Connection Error', 'Could not refresh file database.', 'error');
        });
}

// Update badges for file count
function updateFileCountBadge() {
    fetch('/api/files')
        .then(res => res.json())
        .then(files => {
            fileCountBadge.textContent = files.length;
        })
        .catch(err => console.warn('Badge update failed:', err));
}

// Toast Notification Engine
function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let borderSvg = '';
    if (type === 'success') {
        borderSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`;
    } else if (type === 'error') {
        borderSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
        borderSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-start)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
    
    toast.innerHTML = `
        ${borderSvg}
        <div class="toast-content">
            <div class="toast-title">${escapeHTML(title)}</div>
            <div class="toast-desc">${escapeHTML(message)}</div>
        </div>
        <button class="toast-close">✕</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto dismiss after 4 seconds
    const timer = setTimeout(() => {
        dismissToast(toast);
    }, 4000);
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(timer);
        dismissToast(toast);
    });
}

function dismissToast(toast) {
    toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}

// Helpers
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
    
    // If different day, prepend date info
    const today = new Date();
    if (date.toDateString() !== today.toDateString()) {
        return `${date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}, ${formattedHours}:${formattedMinutes} ${ampm}`;
    }
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
}

function formatDate(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function linkify(text) {
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`);
}
