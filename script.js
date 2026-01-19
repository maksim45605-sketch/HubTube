// HubTube - Основной скрипт с локальным режимом

// Глобальные переменные
let currentUser = null;
let currentUserData = null;
let currentVideo = null;
let videos = [];
let subscriptions = [];
let notifications = [];
let demoMode = false;
let usingLocalStorage = false;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('HubTube начал загрузку...');
    
    // Проверяем, не заблокирован ли Firebase
    const isFirebaseBlocked = localStorage.getItem('firebase_blocked') === 'true';
    
    if (isFirebaseBlocked) {
        console.log('Firebase заблокирован - принудительный локальный режим');
        usingLocalStorage = true;
        demoMode = true;
        setupLocalStorageFallback();
        loadSampleData();
        addModeToggleButton();
    } else {
        initFirebase();
    }
    
    initEventListeners();
    checkAuthState();
    loadVideos();
    updateUI();
    
    // Добавить кнопку переключения режима
    addModeToggleButton();
});

// Инициализация Firebase (с обработкой ошибок)
function initFirebase() {
    try {
        if (!firebase.apps.length) {
            console.warn('Firebase не инициализирован');
            setupLocalStorageFallback();
            return;
        }
        
        console.log('Firebase инициализирован');
        
        // Инициализируем глобальные переменные
        auth = firebase.auth ? firebase.auth() : null;
        db = firebase.firestore ? firebase.firestore() : null;
        storage = firebase.storage ? firebase.storage() : null;
        
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
        
        // Если ошибка блокировки, помечаем как заблокированный
        if (error.code === 'auth/too-many-requests' || error.message.includes('too-many-requests')) {
            localStorage.setItem('firebase_blocked', 'true');
            showToast('Firebase временно заблокирован. Используем локальный режим.', 'warning');
        }
        
        setupLocalStorageFallback();
    }
}

// Fallback на localStorage если Firebase недоступен
function setupLocalStorageFallback() {
    console.log('Настройка локального хранилища...');
    usingLocalStorage = true;
    demoMode = true;
    
    // Mock Firebase Auth
    window.firebase = window.firebase || {};
    window.firebase.auth = window.firebase.auth || {
        onAuthStateChanged: (callback) => {
            const userStr = localStorage.getItem('currentUser');
            const user = userStr ? JSON.parse(userStr) : null;
            callback(user);
            return () => {};
        },
        
        signInWithEmailAndPassword: async (email, password) => {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    const user = users.find(u => u.email === email && u.password === password);
                    
                    if (user) {
                        const userData = {
                            uid: user.uid,
                            email: user.email,
                            displayName: user.username
                        };
                        localStorage.setItem('currentUser', JSON.stringify(userData));
                        resolve({ user: userData });
                    } else {
                        reject(new Error('auth/user-not-found'));
                    }
                }, 500);
            });
        },
        
        createUserWithEmailAndPassword: async (email, password) => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    const uid = 'local_' + Date.now();
                    const user = {
                        uid: uid,
                        email: email,
                        password: password,
                        username: email.split('@')[0],
                        handle: email.split('@')[0].toLowerCase(),
                        avatarColor: getRandomColor(),
                        createdAt: new Date().toISOString()
                    };
                    
                    users.push(user);
                    localStorage.setItem('users', JSON.stringify(users));
                    localStorage.setItem('currentUser', JSON.stringify({
                        uid: uid,
                        email: email,
                        displayName: user.username
                    }));
                    
                    resolve({ user: { uid: uid, email: email } });
                }, 500);
            });
        },
        
        signOut: async () => {
            return new Promise((resolve) => {
                localStorage.removeItem('currentUser');
                setTimeout(() => resolve(), 300);
            });
        }
    };
    
    // Mock Firestore
    window.firebase.firestore = window.firebase.firestore || {
        collection: (name) => {
            return {
                doc: (id) => {
                    const collection = JSON.parse(localStorage.getItem(name) || '[]');
                    const item = collection.find(item => item.id === id);
                    
                    return {
                        get: () => Promise.resolve({
                            exists: !!item,
                            data: () => item ? { ...item } : null,
                            id: item ? item.id : id
                        }),
                        
                        set: (data) => {
                            return new Promise((resolve) => {
                                const collection = JSON.parse(localStorage.getItem(name) || '[]');
                                const index = collection.findIndex(item => item.id === id);
                                
                                if (index > -1) {
                                    collection[index] = { ...data, id: id };
                                } else {
                                    collection.push({ ...data, id: id });
                                }
                                
                                localStorage.setItem(name, JSON.stringify(collection));
                                resolve();
                            });
                        },
                        
                        update: (data) => {
                            return new Promise((resolve) => {
                                const collection = JSON.parse(localStorage.getItem(name) || '[]');
                                const index = collection.findIndex(item => item.id === id);
                                
                                if (index > -1) {
                                    collection[index] = { ...collection[index], ...data };
                                    localStorage.setItem(name, JSON.stringify(collection));
                                }
                                resolve();
                            });
                        },
                        
                        delete: () => {
                            return new Promise((resolve) => {
                                const collection = JSON.parse(localStorage.getItem(name) || '[]');
                                const filtered = collection.filter(item => item.id !== id);
                                localStorage.setItem(name, JSON.stringify(filtered));
                                resolve();
                            });
                        }
                    };
                },
                
                add: (data) => {
                    return new Promise((resolve) => {
                        const id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        const collection = JSON.parse(localStorage.getItem(name) || '[]');
                        collection.push({ ...data, id: id });
                        localStorage.setItem(name, JSON.stringify(collection));
                        resolve({ id: id });
                    });
                },
                
                where: (field, op, value) => {
                    return {
                        get: () => {
                            return new Promise((resolve) => {
                                const collection = JSON.parse(localStorage.getItem(name) || '[]');
                                const filtered = collection.filter(item => {
                                    if (op === '==') return item[field] === value;
                                    if (op === '>=') return item[field] >= value;
                                    if (op === '<=') return item[field] <= value;
                                    return true;
                                });
                                
                                resolve({
                                    forEach: (callback) => {
                                        filtered.forEach(doc => {
                                            callback({
                                                id: doc.id,
                                                data: () => ({ ...doc })
                                            });
                                        });
                                    },
                                    size: filtered.length
                                });
                            });
                        }
                    };
                },
                
                orderBy: (field, direction = 'desc') => {
                    return {
                        limit: (limit) => {
                            return {
                                get: () => {
                                    return new Promise((resolve) => {
                                        const collection = JSON.parse(localStorage.getItem(name) || '[]');
                                        const sorted = [...collection].sort((a, b) => {
                                            if (direction === 'desc') {
                                                return new Date(b[field]) - new Date(a[field]);
                                            } else {
                                                return new Date(a[field]) - new Date(b[field]);
                                            }
                                        }).slice(0, limit);
                                        
                                        resolve({
                                            forEach: (callback) => {
                                                sorted.forEach(doc => {
                                                    callback({
                                                        id: doc.id,
                                                        data: () => ({ ...doc })
                                                    });
                                                });
                                            },
                                            size: sorted.length
                                        });
                                    });
                                }
                            };
                        },
                        
                        get: () => {
                            return new Promise((resolve) => {
                                const collection = JSON.parse(localStorage.getItem(name) || '[]');
                                const sorted = [...collection].sort((a, b) => {
                                    if (direction === 'desc') {
                                        return new Date(b[field]) - new Date(a[field]);
                                    } else {
                                        return new Date(a[field]) - new Date(b[field]);
                                    }
                                });
                                
                                resolve({
                                    forEach: (callback) => {
                                        sorted.forEach(doc => {
                                            callback({
                                                id: doc.id,
                                                data: () => ({ ...doc })
                                            });
                                        });
                                    },
                                    size: sorted.length
                                });
                            });
                        }
                    };
                }
            };
        }
    };
    
    // Mock Storage
    window.firebase.storage = window.firebase.storage || {
        ref: () => ({
            put: () => Promise.resolve(),
            getDownloadURL: () => Promise.resolve('https://via.placeholder.com/300x169')
        })
    };
    
    // Инициализируем глобальные переменные
    auth = firebase.auth ? firebase.auth() : null;
    db = firebase.firestore ? firebase.firestore() : null;
    storage = firebase.storage ? firebase.storage() : null;
    
    console.log('Локальное хранилище настроено');
    showToast('Используется локальный режим', 'info');
}

// Проверка состояния авторизации
function checkAuthState() {
    if (!auth) {
        console.warn('Auth не доступен, использую локальное хранилище');
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            currentUser = JSON.parse(userStr);
            loadUserData(currentUser.uid);
        }
        updateUI();
        return;
    }
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log('Пользователь вошел:', user.email);
            currentUser = user;
            await loadUserData(user.uid);
            await loadSubscriptions();
            await loadNotifications();
            showToast('Вы успешно вошли!', 'success');
        } else {
            console.log('Пользователь вышел');
            currentUser = null;
            currentUserData = null;
        }
        updateUI();
    });
}

// Загрузка данных пользователя
async function loadUserData(uid) {
    try {
        if (!db) {
            // Локальное хранилище
            const users = JSON.parse(localStorage.getItem('users') || '[]');
            const user = users.find(u => u.uid === uid);
            if (user) {
                currentUserData = {
                    id: user.uid,
                    username: user.username || user.email.split('@')[0],
                    handle: user.handle || user.email.split('@')[0].toLowerCase(),
                    email: user.email,
                    avatarColor: user.avatarColor || getRandomColor(),
                    subscribers: user.subscribers || 0,
                    videos: user.videos || 0,
                    views: user.views || 0,
                    likes: user.likes || 0,
                    isVerified: user.isVerified || false,
                    bio: user.bio || '',
                    links: user.links || [],
                    createdAt: user.createdAt ? new Date(user.createdAt) : new Date()
                };
            }
            updateUserUI();
            return;
        }
        
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            currentUserData = {
                id: doc.id,
                ...doc.data()
            };
            updateUserUI();
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        if (error.code === 'auth/too-many-requests') {
            localStorage.setItem('firebase_blocked', 'true');
            showToast('Firebase заблокирован. Перезагрузка...', 'error');
            setTimeout(() => location.reload(), 2000);
            return;
        }
        showToast('Ошибка загрузки профиля', 'error');
    }
}

// Загрузка видео
async function loadVideos() {
    try {
        if (!db) {
            // Локальное хранилище
            const localVideos = JSON.parse(localStorage.getItem('videos') || '[]');
            if (localVideos.length > 0) {
                videos = localVideos;
            } else {
                videos = getSampleVideos();
                localStorage.setItem('videos', JSON.stringify(videos));
            }
            renderVideos();
            renderShorts();
            return;
        }
        
        const snapshot = await db.collection('videos')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        
        videos = [];
        snapshot.forEach(doc => {
            videos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        renderVideos();
        renderShorts();
    } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        if (error.code === 'auth/too-many-requests') {
            localStorage.setItem('firebase_blocked', 'true');
            showToast('Firebase заблокирован. Перезагрузка...', 'error');
            setTimeout(() => location.reload(), 2000);
            return;
        }
        
        // Fallback на тестовые видео
        videos = getSampleVideos();
        renderVideos();
        renderShorts();
        showToast('Демо-режим: показаны тестовые видео', 'info');
    }
}

// Рендеринг видео
function renderVideos() {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const normalVideos = videos.filter(v => v.type !== 'short');
    
    if (normalVideos.length === 0) {
        grid.innerHTML = `
            <div class="no-videos">
                <i class="fas fa-video-slash"></i>
                <h3>Видео не найдены</h3>
                <p>Будьте первым, кто загрузит видео!</p>
                <button class="btn btn-primary" id="uploadFirstVideoBtn">
                    <i class="fas fa-upload"></i> Загрузить первое видео
                </button>
            </div>
        `;
        
        const uploadFirstBtn = document.getElementById('uploadFirstVideoBtn');
        if (uploadFirstBtn) {
            uploadFirstBtn.addEventListener('click', () => {
                if (!currentUser) {
                    showModal('authModal');
                } else {
                    showModal('uploadModal');
                }
            });
        }
        return;
    }
    
    normalVideos.forEach(video => {
        const card = createVideoCard(video);
        grid.appendChild(card);
    });
}

// Создание карточки видео
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = video.id;
    
    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="${video.title}" 
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/300x169/333/fff?text=HubTube'">
            <div class="video-duration">${video.duration || '0:00'}</div>
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <div class="video-meta">
                <span class="channel-name">${video.username}</span>
                <span>•</span>
                <span>${formatViews(video.views)} просмотров</span>
                <span>•</span>
                <span>${formatDate(video.createdAt)}</span>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => openVideo(video));
    return card;
}

// Открытие видео
function openVideo(video) {
    currentVideo = video;
    
    // Увеличить счетчик просмотров
    if (db) {
        db.collection('videos').doc(video.id).update({
            views: (video.views || 0) + 1
        }).catch(console.error);
    } else {
        // Локальное хранилище
        const videos = JSON.parse(localStorage.getItem('videos') || '[]');
        const videoIndex = videos.findIndex(v => v.id === video.id);
        if (videoIndex > -1) {
            videos[videoIndex].views = (videos[videoIndex].views || 0) + 1;
            localStorage.setItem('videos', JSON.stringify(videos));
        }
    }
    
    // Обновить информацию в модальном окне
    document.getElementById('videoModalTitle').textContent = video.title;
    document.getElementById('videoChannelName').textContent = video.username;
    document.getElementById('videoViews').textContent = formatViews((video.views || 0) + 1) + ' просмотров';
    document.getElementById('videoDate').textContent = formatDate(video.createdAt);
    document.getElementById('videoModalDescription').textContent = video.description || 'Нет описания';
    document.getElementById('likeCount').textContent = formatNumber(video.likes || 0);
    
    // Установить проверку канала
    const verifiedBadge = document.getElementById('videoChannelVerified');
    if (verifiedBadge) {
        verifiedBadge.style.display = video.isVerified ? 'inline' : 'none';
    }
    
    // Установить аватар канала
    const avatar = document.getElementById('videoChannelAvatar');
    if (avatar) {
        avatar.textContent = (video.username || 'U').charAt(0).toUpperCase();
        avatar.style.backgroundColor = video.avatarColor || '#666';
    }
    
    // Обновить плеер
    const player = document.getElementById('videoPlayer');
    if (player) {
        player.innerHTML = createVideoPlayer(video.url);
    }
    
    // Загрузить комментарии
    loadComments(video.id);
    
    // Показать модальное окно
    showModal('videoModal');
}

// Создание видеоплеера
function createVideoPlayer(url) {
    if (!url) {
        return '<div class="player-error">Ссылка на видео не найдена</div>';
    }
    
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = getYouTubeId(url);
        if (videoId) {
            return `
                <iframe 
                    src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        }
    }
    
    // Прямая ссылка на видео
    if (url.match(/\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i)) {
        return `
            <video controls autoplay style="width:100%;height:100%;">
                <source src="${url}" type="video/mp4">
                Ваш браузер не поддерживает видео.
            </video>
        `;
    }
    
    // Если формат не поддерживается
    return `
        <div class="player-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Неподдерживаемый формат видео</p>
            <a href="${url}" target="_blank" class="btn btn-secondary">Открыть ссылку</a>
        </div>
    `;
}

// Получение ID YouTube видео
function getYouTubeId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

// Инициализация обработчиков событий
function initEventListeners() {
    console.log('Инициализация обработчиков событий...');
    
    // Навигация
    document.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const page = btn.dataset.page;
            showPage(page);
        });
    });
    
    // Авторизация
    const userBtn = document.getElementById('userBtn');
    if (userBtn) {
        userBtn.addEventListener('click', () => {
            if (currentUser) {
                showPage('profile');
            } else {
                showModal('authModal');
            }
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Форма входа
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail')?.value || '';
            const password = document.getElementById('loginPassword')?.value || '';
            
            try {
                await auth.signInWithEmailAndPassword(email, password);
                hideModal('authModal');
                showToast('Вход выполнен успешно!', 'success');
            } catch (error) {
                if (error.code === 'auth/too-many-requests') {
                    localStorage.setItem('firebase_blocked', 'true');
                    showToast('Firebase заблокирован. Переключаемся в локальный режим.', 'error');
                    setTimeout(() => location.reload(), 2000);
                    return;
                }
                showToast(getAuthError(error.message || error.code), 'error');
            }
        });
    }
    
    // Форма регистрации
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('registerUsername')?.value || 'Пользователь';
            const handle = document.getElementById('registerHandle')?.value || '';
            const email = document.getElementById('registerEmail')?.value || '';
            const password = document.getElementById('registerPassword')?.value || '';
            const confirmPassword = document.getElementById('registerConfirmPassword')?.value || '';
            
            if (password !== confirmPassword) {
                showToast('Пароли не совпадают', 'error');
                return;
            }
            
            if (handle && !/^[a-zA-Z0-9_]+$/.test(handle)) {
                showToast('Имя пользователя может содержать только буквы, цифры и нижнее подчеркивание', 'error');
                return;
            }
            
            try {
                // Создание пользователя
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                
                // Сохранение данных пользователя
                const userData = {
                    username: username,
                    handle: handle.toLowerCase() || email.split('@')[0].toLowerCase(),
                    email: email,
                    avatarColor: getRandomColor(),
                    subscribers: 0,
                    videos: 0,
                    views: 0,
                    likes: 0,
                    isVerified: false,
                    bio: '',
                    links: [],
                    createdAt: new Date().toISOString()
                };
                
                if (db) {
                    await db.collection('users').doc(user.uid).set(userData);
                } else {
                    // Локальное хранилище
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    users.push({
                        uid: user.uid,
                        ...userData,
                        password: password
                    });
                    localStorage.setItem('users', JSON.stringify(users));
                }
                
                hideModal('authModal');
                showToast('Регистрация успешна!', 'success');
                
            } catch (error) {
                if (error.code === 'auth/too-many-requests') {
                    localStorage.setItem('firebase_blocked', 'true');
                    showToast('Firebase заблокирован. Переключаемся в локальный режим.', 'error');
                    setTimeout(() => location.reload(), 2000);
                    return;
                }
                showToast(getAuthError(error.message || error.code), 'error');
            }
        });
    }
    
    // Загрузка видео
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            if (!currentUser) {
                showModal('authModal');
                return;
            }
            showModal('uploadModal');
        });
    }
    
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('videoTitle')?.value || 'Без названия';
            const description = document.getElementById('videoDescription')?.value || '';
            const type = document.getElementById('videoType')?.value || 'video';
            const category = document.getElementById('videoCategory')?.value || 'entertainment';
            const url = document.getElementById('videoUrl')?.value || '';
            const thumbnail = document.getElementById('thumbnailUrl')?.value || '';
            const tags = (document.getElementById('videoTags')?.value || '').split(',').map(tag => tag.trim());
            
            if (!url) {
                showToast('Введите ссылку на видео', 'error');
                return;
            }
            
            try {
                const videoData = {
                    title: title,
                    description: description,
                    type: type,
                    category: category,
                    url: url,
                    thumbnail: thumbnail || getDefaultThumbnail(category, type),
                    tags: tags,
                    userId: currentUser.uid,
                    username: currentUserData?.username || 'Пользователь',
                    handle: currentUserData?.handle || 'user',
                    avatarColor: currentUserData?.avatarColor || getRandomColor(),
                    views: 0,
                    likes: 0,
                    comments: 0,
                    subscribers: currentUserData?.subscribers || 0,
                    duration: '0:00',
                    isVerified: currentUserData?.isVerified || false,
                    createdAt: new Date().toISOString()
                };
                
                let videoId;
                if (db) {
                    const result = await db.collection('videos').add(videoData);
                    videoId = result.id;
                } else {
                    // Локальное хранилище
                    videoId = 'local_video_' + Date.now();
                    videoData.id = videoId;
                    
                    const videos = JSON.parse(localStorage.getItem('videos') || '[]');
                    videos.push(videoData);
                    localStorage.setItem('videos', JSON.stringify(videos));
                }
                
                hideModal('uploadModal');
                showToast('Видео успешно загружено!', 'success');
                
                // Обновление списка видео
                loadVideos();
                
            } catch (error) {
                console.error('Ошибка загрузки видео:', error);
                if (error.code === 'auth/too-many-requests') {
                    localStorage.setItem('firebase_blocked', 'true');
                    showToast('Firebase заблокирован. Переключаемся в локальный режим.', 'error');
                    setTimeout(() => location.reload(), 2000);
                    return;
                }
                showToast('Ошибка загрузки видео', 'error');
            }
        });
    }
    
    // Закрытие модальных окон
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
    
    // Закрытие модальных окон при клике вне
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Поиск
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', searchVideos);
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchVideos();
        });
    }
    
    console.log('Обработчики событий инициализированы');
}

// Загрузка тестовых данных
function loadSampleData() {
    console.log('Загрузка тестовых данных...');
    
    // Тестовые видео
    if (videos.length === 0) {
        videos = getSampleVideos();
        localStorage.setItem('videos', JSON.stringify(videos));
    }
    
    // Тестовые пользователи
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.length === 0) {
        const sampleUsers = [
            {
                uid: 'demo_user_1',
                username: 'HubTube Team',
                handle: 'hubtube',
                email: 'team@hubtube.com',
                password: 'demo123',
                avatarColor: '#ff0000',
                subscribers: 1250,
                videos: 15,
                views: 150000,
                likes: 12000,
                isVerified: true,
                bio: 'Официальный канал HubTube. Делимся новостями и обновлениями.',
                links: ['https://twitter.com/hubtube', 'https://instagram.com/hubtube'],
                createdAt: '2024-01-01T10:00:00Z'
            },
            {
                uid: 'demo_user_2',
                username: 'Tech Reviews',
                handle: 'techreviews',
                email: 'tech@demo.com',
                password: 'demo123',
                avatarColor: '#54a0ff',
                subscribers: 850,
                videos: 42,
                views: 85000,
                likes: 6500,
                isVerified: false,
                bio: 'Обзоры новейших технологий и гаджетов.',
                links: [],
                createdAt: '2024-02-15T14:30:00Z'
            }
        ];
        
        localStorage.setItem('users', JSON.stringify(sampleUsers));
    }
    
    renderVideos();
}

// Получение тестовых видео
function getSampleVideos() {
    return [
        {
            id: 'demo_video_1',
            title: 'Добро пожаловать в HubTube!',
            description: 'Официальное приветственное видео от команды HubTube. Узнайте о возможностях нашей платформы.',
            type: 'video',
            category: 'entertainment',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
            userId: 'demo_user_1',
            username: 'HubTube Team',
            handle: 'hubtube',
            avatarColor: '#ff0000',
            views: 12543,
            likes: 567,
            comments: 23,
            subscribers: 1250,
            duration: '9:56',
            isVerified: true,
            tags: ['hubtube', 'добро пожаловать', 'обзор'],
            createdAt: '2024-03-01T12:00:00Z'
        },
        {
            id: 'demo_video_2',
            title: 'Обзор нового смартфона 2024',
            description: 'Полный обзор флагманского смартфона этого года. Камера, производительность, дисплей и многое другое.',
            type: 'video',
            category: 'tech',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
            userId: 'demo_user_2',
            username: 'Tech Reviews',
            handle: 'techreviews',
            avatarColor: '#54a0ff',
            views: 8567,
            likes: 234,
            comments: 12,
            subscribers: 850,
            duration: '10:53',
            isVerified: false,
            tags: ['смартфон', 'обзор', 'технологии', '2024'],
            createdAt: '2024-03-05T15:30:00Z'
        },
        {
            id: 'demo_video_3',
            title: 'Смешные коты за 60 секунд',
            description: 'Самые смешные моменты с котами. Поднимает настроение!',
            type: 'short',
            category: 'entertainment',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
            thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg',
            userId: 'demo_user_1',
            username: 'HubTube Team',
            handle: 'hubtube',
            avatarColor: '#ff0000',
            views: 45678,
            likes: 1234,
            comments: 45,
            subscribers: 1250,
            duration: '0:15',
            isVerified: true,
            tags: ['коты', 'смешно', 'short', 'развлечения'],
            createdAt: '2024-03-10T09:15:00Z'
        }
    ];
}

// Показать страницу
function showPage(pageId) {
    // Скрыть все страницы
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Показать выбранную страницу
    const pageElement = document.getElementById(pageId + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
    }
}

// Показать модальное окно
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

// Скрыть модальное окно
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Выход из системы
async function logout() {
    try {
        await auth.signOut();
        currentUser = null;
        currentUserData = null;
        updateUI();
        showToast('Вы успешно вышли', 'success');
        showPage('home');
    } catch (error) {
        console.error('Ошибка выхода:', error);
        showToast('Ошибка выхода', 'error');
    }
}

// Обновление UI
function updateUI() {
    const usernameElement = document.getElementById('username');
    const userBtn = document.getElementById('userBtn');
    
    if (!usernameElement || !userBtn) return;
    
    if (currentUser) {
        usernameElement.textContent = currentUserData?.username || 'Профиль';
        userBtn.innerHTML = `
            <i class="fas fa-user-circle"></i>
            <span>${currentUserData?.username || 'Профиль'}</span>
            <i class="fas fa-chevron-down"></i>
        `;
        
        // Показать элементы для авторизованных пользователей
        document.querySelectorAll('.auth-only').forEach(el => {
            el.style.display = '';
        });
        
        // Скрыть элементы для неавторизованных пользователей
        document.querySelectorAll('.guest-only').forEach(el => {
            el.style.display = 'none';
        });
        
    } else {
        usernameElement.textContent = 'Войти';
        userBtn.innerHTML = `
            <i class="fas fa-user-circle"></i>
            <span>Войти</span>
            <i class="fas fa-chevron-down"></i>
        `;
        
        // Скрыть элементы для авторизованных пользователей
        document.querySelectorAll('.auth-only').forEach(el => {
            el.style.display = 'none';
        });
        
        // Показать элементы для неавторизованных пользователей
        document.querySelectorAll('.guest-only').forEach(el => {
            el.style.display = '';
        });
    }
}

// Обновление UI пользователя
function updateUserUI() {
    if (!currentUserData) return;
    
    // Обновить имя пользователя в навигации
    const usernameElement = document.getElementById('username');
    if (usernameElement) {
        usernameElement.textContent = currentUserData.username;
    }
}

// Добавить кнопку переключения режима
function addModeToggleButton() {
    // Удалить старую кнопку если есть
    const oldBtn = document.getElementById('modeToggleBtn');
    if (oldBtn) oldBtn.remove();
    
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'modeToggleBtn';
    toggleBtn.className = 'btn btn-small';
    toggleBtn.innerHTML = demoMode ? 
        '<i class="fas fa-cloud"></i> Переключиться на Firebase' : 
        '<i class="fas fa-hdd"></i> Локальный режим';
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.bottom = '20px';
    toggleBtn.style.right = '20px';
    toggleBtn.style.zIndex = '9999';
    toggleBtn.style.backgroundColor = demoMode ? '#4CAF50' : '#ff9800';
    
    toggleBtn.addEventListener('click', () => {
        if (demoMode) {
            // Переключиться на Firebase
            localStorage.removeItem('firebase_blocked');
            showToast('Переключаемся на Firebase...', 'info');
            location.reload();
        } else {
            // Переключиться на локальный режим
            localStorage.setItem('firebase_blocked', 'true');
            showToast('Переключаемся в локальный режим...', 'info');
            location.reload();
        }
    });
    
    document.body.appendChild(toggleBtn);
}

// Показать уведомление (тост)
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // Создать контейнер если его нет
        const toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    const containerEl = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : ''}
            ${type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : ''}
            ${type === 'warning' ? '<i class="fas fa-exclamation-triangle"></i>' : ''}
            ${type === 'info' ? '<i class="fas fa-info-circle"></i>' : ''}
        </div>
        <div class="toast-message">${message}</div>
    `;
    
    containerEl.appendChild(toast);
    
    // Автоматическое удаление
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
    
    // Клик для закрытия
    toast.addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    });
}

// Форматирование чисел
function formatNumber(num) {
    if (typeof num !== 'number') num = parseInt(num) || 0;
    
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
}

// Форматирование просмотров
function formatViews(views) {
    return formatNumber(views);
}

// Форматирование даты
function formatDate(date) {
    if (!date) return 'Недавно';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return 'Недавно';
    
    const now = new Date();
    const diff = now - dateObj;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' дн назад';
    if (diff < 2592000000) return Math.floor(diff / 604800000) + ' нед назад';
    if (diff < 31536000000) return Math.floor(diff / 2592000000) + ' мес назад';
    
    return dateObj.toLocaleDateString('ru-RU');
}

// Получение случайного цвета
function getRandomColor() {
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
        '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Получение обложки по умолчанию
function getDefaultThumbnail(category, type) {
    if (type === 'short') {
        return 'https://via.placeholder.com/1080x1920/ff0000/ffffff?text=SHORTS';
    }
    
    const thumbnails = {
        music: 'https://via.placeholder.com/1280x720/4ecdc4/ffffff?text=Музыка',
        gaming: 'https://via.placeholder.com/1280x720/5f27cd/ffffff?text=Игры',
        education: 'https://via.placeholder.com/1280x720/00d2d3/ffffff?text=Образование',
        sports: 'https://via.placeholder.com/1280x720/ff9f43/ffffff?text=Спорт',
        tech: 'https://via.placeholder.com/1280x720/54a0ff/ffffff?text=Технологии',
        entertainment: 'https://via.placeholder.com/1280x720/feca57/ffffff?text=Развлечения'
    };
    
    return thumbnails[category] || 'https://via.placeholder.com/1280x720/666666/ffffff?text=HubTube';
}

// Получение сообщения об ошибке авторизации
function getAuthError(errorCode) {
    const errors = {
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/email-already-in-use': 'Email уже используется',
        'auth/invalid-email': 'Неверный формат email',
        'auth/weak-password': 'Пароль слишком простой',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
        'auth/network-request-failed': 'Ошибка сети. Проверьте подключение',
        'auth/operation-not-allowed': 'Этот метод входа отключен'
    };
    
    return errors[errorCode] || 'Произошла ошибка: ' + errorCode;
}

// Поиск видео
async function searchVideos() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        loadVideos();
        return;
    }
    
    // Поиск в локальных видео
    const searchResults = videos.filter(video => 
        video.title.toLowerCase().includes(query) ||
        video.description.toLowerCase().includes(query) ||
        (video.tags && video.tags.some(tag => tag.toLowerCase().includes(query)))
    );
    
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (searchResults.length === 0) {
        grid.innerHTML = `
            <div class="no-videos">
                <i class="fas fa-search"></i>
                <h3>По запросу "${query}" ничего не найдено</h3>
                <p>Попробуйте другие ключевые слова</p>
            </div>
        `;
        return;
    }
    
    const normalVideos = searchResults.filter(v => v.type !== 'short');
    normalVideos.forEach(video => {
        const card = createVideoCard(video);
        grid.appendChild(card);
    });
}

// Рендеринг Shorts
function renderShorts() {
    const grid = document.getElementById('shortsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const shorts = videos.filter(v => v.type === 'short');
    
    if (shorts.length === 0) {
        grid.innerHTML = `
            <div class="no-shorts">
                <i class="fas fa-film"></i>
                <h3>Shorts не найдены</h3>
                <p>Загрузите первое короткое видео!</p>
            </div>
        `;
        return;
    }
    
    shorts.forEach(video => {
        const card = createShortCard(video);
        grid.appendChild(card);
    });
}

// Создание карточки Short
function createShortCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card short-card';
    card.dataset.videoId = video.id;
    
    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="${video.title}" 
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/169x300/ff0000/fff?text=SHORTS'">
            <div class="short-badge">SHORTS</div>
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <div class="video-meta">
                <span>${formatViews(video.views)} просмотров</span>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => openVideo(video));
    return card;
}

// Загрузка комментариев
async function loadComments(videoId) {
    try {
        let comments = [];
        
        if (db) {
            const snapshot = await db.collection('comments')
                .where('videoId', '==', videoId)
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
            
            snapshot.forEach(doc => {
                comments.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } else {
            // Локальное хранилище
            const allComments = JSON.parse(localStorage.getItem('comments') || '[]');
            comments = allComments.filter(c => c.videoId === videoId);
        }
        
        const list = document.getElementById('commentsList');
        if (!list) return;
        
        list.innerHTML = '';
        
        if (comments.length === 0) {
            list.innerHTML = `
                <div class="no-comments">
                    <i class="fas fa-comment"></i>
                    <p>Комментариев пока нет</p>
                    <p class="small">Будьте первым, кто оставит комментарий!</p>
                </div>
            `;
            document.getElementById('commentsCount').textContent = '0';
            return;
        }
        
        comments.forEach(comment => {
            const commentElement = createCommentElement(comment);
            list.appendChild(commentElement);
        });
        
        document.getElementById('commentsCount').textContent = comments.length.toString();
        
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
        const list = document.getElementById('commentsList');
        if (list) {
            list.innerHTML = '<div class="error">Ошибка загрузки комментариев</div>';
        }
    }
}

// Создание элемента комментария
function createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = 'comment-item';
    
    div.innerHTML = `
        <div class="comment-avatar" style="background-color: ${comment.avatarColor || '#666'}">
            ${(comment.username || 'Аноним').charAt(0).toUpperCase()}
        </div>
        <div class="comment-content">
            <div class="comment-header">
                <span class="comment-author">${comment.username || 'Аноним'}</span>
                <span class="comment-time">${formatDate(comment.createdAt)}</span>
            </div>
            <div class="comment-text">${formatCommentText(comment.text)}</div>
        </div>
    `;
    
    return div;
}

// Форматирование текста комментария
function formatCommentText(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

// Добавляем CSS для уведомлений
const toastCSS = `
.toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 400px;
}

.toast {
    background: var(--surface-color);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 15px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
    cursor: pointer;
    transition: all 0.3s ease;
}

.toast:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.toast.success {
    border-left: 4px solid #10b981;
}

.toast.error {
    border-left: 4px solid #ef4444;
}

.toast.warning {
    border-left: 4px solid #f59e0b;
}

.toast.info {
    border-left: 4px solid #3b82f6;
}

.toast-icon {
    font-size: 20px;
}

.toast.success .toast-icon {
    color: #10b981;
}

.toast.error .toast-icon {
    color: #ef4444;
}

.toast.warning .toast-icon {
    color: #f59e0b;
}

.toast.info .toast-icon {
    color: #3b82f6;
}

.toast-message {
    flex: 1;
    font-size: 14px;
    line-height: 1.4;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.no-videos, .no-shorts, .no-comments {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
}

.no-videos i, .no-shorts i, .no-comments i {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

.no-videos h3, .no-shorts h3, .no-comments h3 {
    margin-bottom: 8px;
    color: var(--text-primary);
}

.no-videos p, .no-shorts p, .no-comments p {
    margin-bottom: 16px;
}

.short-card .video-thumbnail {
    aspect-ratio: 9/16;
}

.short-card .video-title {
    font-size: 14px;
    line-height: 1.3;
}

.small {
    font-size: 12px;
    opacity: 0.7;
}
`;

// Добавляем стили
const style = document.createElement('style');
style.textContent = toastCSS;
document.head.appendChild(style);

// Экспорт функций для глобального использования
window.showPage = showPage;
window.showModal = showModal;
window.hideModal = hideModal;
window.logout = logout;
window.searchVideos = searchVideos;
window.showToast = showToast;

console.log('HubTube script загружен и готов к работе!');
