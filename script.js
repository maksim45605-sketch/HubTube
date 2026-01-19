// HubTube - Основной скрипт
// Работает с Firebase или локальным хранилищем

// Глобальные переменные
let currentUser = null;
let currentUserData = null;
let currentVideo = null;
let videos = [];
let subscriptions = [];
let notifications = [];
let demoMode = false;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('HubTube начал загрузку...');
    
    initFirebase();
    initEventListeners();
    checkAuthState();
    loadVideos();
    updateUI();
    
    // Показать демо-режим если Firebase не настроен
    setTimeout(() => {
        if (!firebase.apps.length && videos.length === 0) {
            demoMode = true;
            loadSampleData();
            showToast('🎬 Демо-режим активирован! Используйте тестовые данные.', 'info');
            console.log('Демо-режим: Включен');
        }
    }, 2000);
});

// Инициализация Firebase (с обработкой ошибок)
function initFirebase() {
    try {
        if (!firebase.apps.length) {
            console.warn('Firebase не инициализирован');
            setupLocalStorageFallback();
            return;
        }
        
        console.log('Firebase инициализирован:', {
            apps: firebase.apps.length,
            auth: !!firebase.auth,
            firestore: !!firebase.firestore
        });
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
        setupLocalStorageFallback();
    }
}

// Fallback на localStorage если Firebase недоступен
function setupLocalStorageFallback() {
    console.log('Настройка локального хранилища...');
    demoMode = true;
    
    // Mock Firebase Auth
    window.firebase = window.firebase || {};
    window.firebase.auth = window.firebase.auth || {
        onAuthStateChanged: (callback) => {
            const userStr = localStorage.getItem('currentUser');
            const user = userStr ? JSON.parse(userStr) : null;
            callback(user);
            // Возвращаем функцию unsubscribe
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
        if (demoMode) {
            showToast('Демо-режим: данные загружены из localStorage', 'info');
        } else {
            showToast('Ошибка загрузки профиля', 'error');
        }
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
        
        // Если нет видео, используем тестовые
        if (videos.length === 0 && demoMode) {
            videos = getSampleVideos();
        }
        
        renderVideos();
        renderShorts();
    } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        
        // Fallback на тестовые видео
        videos = getSampleVideos();
        renderVideos();
        renderShorts();
        
        if (demoMode) {
            showToast('Демо-режим: показаны тестовые видео', 'info');
        } else {
            showToast('Ошибка загрузки видео', 'error');
        }
    }
}

// Загрузка подписок
async function loadSubscriptions() {
    if (!currentUser) return;
    
    try {
        if (!db) {
            // Локальное хранилище
            const subs = JSON.parse(localStorage.getItem('subscriptions') || '[]');
            subscriptions = subs.filter(sub => sub.subscriberId === currentUser.uid).map(sub => sub.channelId);
            return;
        }
        
        const snapshot = await db.collection('subscriptions')
            .where('subscriberId', '==', currentUser.uid)
            .get();
        
        subscriptions = [];
        snapshot.forEach(doc => {
            subscriptions.push(doc.data().channelId);
        });
    } catch (error) {
        console.error('Ошибка загрузки подписок:', error);
    }
}

// Загрузка уведомлений
async function loadNotifications() {
    if (!currentUser) return;
    
    try {
        if (!db) {
            // Локальное хранилище
            const notifs = JSON.parse(localStorage.getItem('notifications') || '[]');
            notifications = notifs.filter(n => n.userId === currentUser.uid);
            return;
        }
        
        const snapshot = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        
        notifications = [];
        snapshot.forEach(doc => {
            notifications.push({
                id: doc.id,
                ...doc.data()
            });
        });
    } catch (error) {
        console.error('Ошибка загрузки уведомлений:', error);
    }
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
    
    // Категории видео
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterVideos(btn.dataset.category);
        });
    });
    
    // Вкладки профиля
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
        });
    });
    
    // Вкладки студии
    document.querySelectorAll('.studio-nav').forEach(nav => {
        nav.addEventListener('click', () => {
            document.querySelectorAll('.studio-nav').forEach(n => n.classList.remove('active'));
            nav.classList.add('active');
            
            document.querySelectorAll('.studio-tab').forEach(tab => tab.classList.remove('active'));
            document.getElementById(nav.dataset.studioTab + 'Tab').classList.add('active');
        });
    });
    
    // Вкладки настроек
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
            document.getElementById(tab.dataset.settingsTab + 'Tab').classList.add('active');
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
                // Проверка уникальности имени пользователя (для Firebase)
                if (db) {
                    const snapshot = await db.collection('users')
                        .where('handle', '==', handle.toLowerCase())
                        .get();
                    
                    if (!snapshot.empty) {
                        showToast('Это имя пользователя уже занято', 'error');
                        return;
                    }
                }
                
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
                        password: password // Только для демо!
                    });
                    localStorage.setItem('users', JSON.stringify(users));
                }
                
                hideModal('authModal');
                showToast('Регистрация успешна!', 'success');
                
            } catch (error) {
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
    
    const uploadStudioBtn = document.getElementById('uploadStudioBtn');
    if (uploadStudioBtn) {
        uploadStudioBtn.addEventListener('click', () => {
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
                    
                    // Обновление счетчика видео пользователя
                    await db.collection('users').doc(currentUser.uid).update({
                        videos: (currentUserData?.videos || 0) + 1
                    });
                } else {
                    // Локальное хранилище
                    videoId = 'local_video_' + Date.now();
                    videoData.id = videoId;
                    
                    const videos = JSON.parse(localStorage.getItem('videos') || '[]');
                    videos.push(videoData);
                    localStorage.setItem('videos', JSON.stringify(videos));
                    
                    // Обновление пользователя
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    const userIndex = users.findIndex(u => u.uid === currentUser.uid);
                    if (userIndex > -1) {
                        users[userIndex].videos = (users[userIndex].videos || 0) + 1;
                        localStorage.setItem('users', JSON.stringify(users));
                    }
                }
                
                hideModal('uploadModal');
                showToast('Видео успешно загружено!', 'success');
                
                // Обновление списка видео
                loadVideos();
                
            } catch (error) {
                console.error('Ошибка загрузки видео:', error);
                showToast('Ошибка загрузки видео', 'error');
            }
        });
    }
    
    // Редактирование профиля
    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            if (!currentUser) return;
            
            document.getElementById('editUsername').value = currentUserData?.username || '';
            document.getElementById('editBio').value = currentUserData?.bio || '';
            document.getElementById('editAvatarUrl').value = currentUserData?.avatarUrl || '';
            document.getElementById('editBannerUrl').value = currentUserData?.bannerUrl || '';
            document.getElementById('editLinks').value = currentUserData?.links ? currentUserData.links.join('\n') : '';
            
            showModal('editProfileModal');
        });
    }
    
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('editUsername')?.value || '';
            const bio = document.getElementById('editBio')?.value || '';
            const avatarUrl = document.getElementById('editAvatarUrl')?.value || '';
            const bannerUrl = document.getElementById('editBannerUrl')?.value || '';
            const links = (document.getElementById('editLinks')?.value || '').split('\n').filter(link => link.trim());
            
            try {
                const updates = {
                    username: username,
                    bio: bio,
                    avatarUrl: avatarUrl || null,
                    bannerUrl: bannerUrl || null,
                    links: links,
                    updatedAt: new Date().toISOString()
                };
                
                if (db) {
                    await db.collection('users').doc(currentUser.uid).update(updates);
                } else {
                    // Локальное хранилище
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    const userIndex = users.findIndex(u => u.uid === currentUser.uid);
                    if (userIndex > -1) {
                        users[userIndex] = { ...users[userIndex], ...updates };
                        localStorage.setItem('users', JSON.stringify(users));
                    }
                }
                
                await loadUserData(currentUser.uid);
                hideModal('editProfileModal');
                showToast('Профиль успешно обновлен!', 'success');
                
            } catch (error) {
                console.error('Ошибка обновления профиля:', error);
                showToast('Ошибка обновления профиля', 'error');
            }
        });
    }
    
    // Настройки
    const saveAccountSettings = document.getElementById('saveAccountSettings');
    if (saveAccountSettings) {
        saveAccountSettings.addEventListener('click', async () => {
            if (!currentUser) return;
            
            const username = document.getElementById('settingsUsername')?.value || '';
            const email = document.getElementById('settingsEmail')?.value || '';
            const password = document.getElementById('settingsPassword')?.value || '';
            const confirmPassword = document.getElementById('settingsConfirmPassword')?.value || '';
            
            if (password && password !== confirmPassword) {
                showToast('Пароли не совпадают', 'error');
                return;
            }
            
            try {
                const updates = {
                    username: username,
                    email: email,
                    updatedAt: new Date().toISOString()
                };
                
                if (db) {
                    await db.collection('users').doc(currentUser.uid).update(updates);
                    
                    if (email !== currentUser.email) {
                        await currentUser.updateEmail(email);
                    }
                    if (password) {
                        await currentUser.updatePassword(password);
                    }
                } else {
                    // Локальное хранилище
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    const userIndex = users.findIndex(u => u.uid === currentUser.uid);
                    if (userIndex > -1) {
                        users[userIndex] = { ...users[userIndex], ...updates };
                        if (password) users[userIndex].password = password;
                        localStorage.setItem('users', JSON.stringify(users));
                    }
                }
                
                await loadUserData(currentUser.uid);
                showToast('Настройки сохранены!', 'success');
                
            } catch (error) {
                console.error('Ошибка сохранения настроек:', error);
                showToast('Ошибка сохранения настроек', 'error');
            }
        });
    }
    
    // Удаление аккаунта
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            if (!confirm('Вы уверены, что хотите удалить аккаунт? Это действие нельзя отменить.')) {
                return;
            }
            
            try {
                if (db) {
                    await db.collection('users').doc(currentUser.uid).delete();
                    await currentUser.delete();
                } else {
                    // Локальное хранилище
                    const users = JSON.parse(localStorage.getItem('users') || '[]');
                    const filteredUsers = users.filter(u => u.uid !== currentUser.uid);
                    localStorage.setItem('users', JSON.stringify(filteredUsers));
                    localStorage.removeItem('currentUser');
                }
                
                showToast('Аккаунт успешно удален', 'success');
                setTimeout(() => location.reload(), 2000);
            } catch (error) {
                console.error('Ошибка удаления аккаунта:', error);
                showToast('Ошибка удаления аккаунта', 'error');
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
    
    // Переключение тем
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            
            const theme = option.dataset.theme;
            document.documentElement.className = theme;
            localStorage.setItem('theme', theme);
        });
    });
    
    // Загрузка темы из localStorage
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.className = savedTheme;
    const themeOption = document.querySelector(`.theme-option[data-theme="${savedTheme}"]`);
    if (themeOption) themeOption.classList.add('active');
    
    // Переключение навигации на мобильных устройствах
    const navToggle = document.getElementById('navToggle');
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            const navMenu = document.querySelector('.nav-menu');
            if (navMenu) navMenu.classList.toggle('active');
        });
    }
    
    // Лайки видео
    const likeVideoBtn = document.getElementById('likeVideoBtn');
    if (likeVideoBtn) {
        likeVideoBtn.addEventListener('click', () => {
            if (!currentUser) {
                showModal('authModal');
                return;
            }
            likeVideo();
        });
    }
    
    // Подписка на канал
    const subscribeVideoBtn = document.getElementById('subscribeVideoBtn');
    if (subscribeVideoBtn) {
        subscribeVideoBtn.addEventListener('click', () => {
            if (!currentUser) {
                showModal('authModal');
                return;
            }
            subscribeToChannel();
        });
    }
    
    // Отправка комментария
    const submitCommentBtn = document.getElementById('submitCommentBtn');
    if (submitCommentBtn) {
        submitCommentBtn.addEventListener('click', submitComment);
    }
    
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment();
            }
        });
    }
    
    console.log('Обработчики событий инициализированы');
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
    
    // Обновить активный элемент навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Если есть соответствующий элемент навигации, сделать его активным
    const navItem = document.querySelector(`[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
    
    // Загрузить данные для страницы
    switch (pageId) {
        case 'profile':
            loadProfileData();
            break;
        case 'studio':
            loadStudioData();
            break;
        case 'settings':
            loadSettingsData();
            break;
        case 'subscriptions':
            loadSubscriptionsData();
            break;
    }
    
    // Скрыть меню навигации на мобильных устройствах
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) navMenu.classList.remove('active');
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

// Фильтрация видео по категории
function filterVideos(category) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const filteredVideos = category === 'all' 
        ? videos.filter(v => v.type !== 'short')
        : videos.filter(v => v.type !== 'short' && v.category === category);
    
    if (filteredVideos.length === 0) {
        grid.innerHTML = `
            <div class="no-videos">
                <i class="fas fa-search"></i>
                <h3>Видео не найдены</h3>
                <p>Попробуйте другую категорию или загрузите свое видео</p>
            </div>
        `;
        return;
    }
    
    filteredVideos.forEach(video => {
        const card = createVideoCard(video);
        grid.appendChild(card);
    });
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
    
    // Установить подписчиков
    const subscribers = document.getElementById('videoChannelSubscribers');
    if (subscribers) {
        subscribers.textContent = formatNumber(video.subscribers || 0) + ' подписчиков';
    }
    
    // Обновить плеер
    const player = document.getElementById('videoPlayer');
    if (player) {
        player.innerHTML = createVideoPlayer(video.url);
    }
    
    // Установить аватар для комментариев
    const commentAvatar = document.getElementById('commentUserAvatar');
    if (commentAvatar && currentUserData) {
        commentAvatar.textContent = (currentUserData.username || 'U').charAt(0).toUpperCase();
        commentAvatar.style.backgroundColor = currentUserData.avatarColor || '#666';
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
    
    // Vimeo
    if (url.includes('vimeo.com')) {
        const videoId = getVimeoId(url);
        if (videoId) {
            return `
                <iframe 
                    src="https://player.vimeo.com/video/${videoId}?autoplay=1" 
                    frameborder="0" 
                    allow="autoplay; fullscreen; picture-in-picture" 
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

// Получение ID Vimeo видео
function getVimeoId(url) {
    const regExp = /https?:\/\/(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
    const match = url.match(regExp);
    return match ? match[3] : null;
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
            <div class="comment-actions">
                <button class="comment-action" onclick="likeComment('${comment.id}')">
                    <i class="fas fa-thumbs-up"></i> <span class="like-count">${comment.likes || 0}</span>
                </button>
                <button class="comment-action">
                    <i class="fas fa-reply"></i> Ответить
                </button>
            </div>
        </div>
    `;
    
    return div;
}

// Форматирование текста комментария
function formatCommentText(text) {
    if (!text) return '';
    // Простое форматирование: **жирный** и *курсив*
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

// Отправка комментария
async function submitComment() {
    if (!currentUser) {
        showModal('authModal');
        return;
    }
    
    const input = document.getElementById('commentInput');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) {
        showToast('Введите текст комментария', 'warning');
        return;
    }
    
    try {
        const commentData = {
            videoId: currentVideo.id,
            userId: currentUser.uid,
            username: currentUserData?.username || 'Пользователь',
            avatarColor: currentUserData?.avatarColor || getRandomColor(),
            text: text,
            likes: 0,
            likedBy: [],
            createdAt: new Date().toISOString()
        };
        
        if (db) {
            await db.collection('comments').add(commentData);
            
            // Обновить счетчик комментариев
            await db.collection('videos').doc(currentVideo.id).update({
                comments: (currentVideo.comments || 0) + 1
            });
        } else {
            // Локальное хранилище
            const commentId = 'local_comment_' + Date.now();
            commentData.id = commentId;
            
            const comments = JSON.parse(localStorage.getItem('comments') || '[]');
            comments.push(commentData);
            localStorage.setItem('comments', JSON.stringify(comments));
            
            // Обновить счетчик комментариев в видео
            const videos = JSON.parse(localStorage.getItem('videos') || '[]');
            const videoIndex = videos.findIndex(v => v.id === currentVideo.id);
            if (videoIndex > -1) {
                videos[videoIndex].comments = (videos[videoIndex].comments || 0) + 1;
                localStorage.setItem('videos', JSON.stringify(videos));
            }
        }
        
        // Очистить поле ввода
        input.value = '';
        
        // Перезагрузить комментарии
        loadComments(currentVideo.id);
        
        showToast('Комментарий добавлен', 'success');
        
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        showToast('Ошибка добавления комментария', 'error');
    }
}

// Лайк комментария
function likeComment(commentId) {
    if (!currentUser) {
        showModal('authModal');
        return;
    }
    showToast('Функция лайков в разработке', 'info');
}

// Лайк видео
function likeVideo() {
    if (!currentVideo) return;
    
    // Здесь будет логика лайка видео
    showToast('Видео понравилось!', 'success');
    
    // Обновить счетчик лайков
    const likeCount = document.getElementById('likeCount');
    if (likeCount) {
        const current = parseInt(likeCount.textContent) || 0;
        likeCount.textContent = formatNumber(current + 1);
    }
}

// Подписка на канал
function subscribeToChannel() {
    if (!currentVideo || !currentUser) return;
    
    const subscribeBtn = document.getElementById('subscribeVideoBtn');
    if (subscribeBtn) {
        if (subscribeBtn.textContent.includes('Подписаться')) {
            subscribeBtn.textContent = 'Вы подписаны';
            subscribeBtn.classList.add('subscribed');
            showToast('Вы подписались на канал!', 'success');
        } else {
            subscribeBtn.textContent = 'Подписаться';
            subscribeBtn.classList.remove('subscribed');
            showToast('Вы отписались от канала', 'info');
        }
    }
}

// Загрузка данных профиля
async function loadProfileData() {
    if (!currentUser) {
        showPage('home');
        return;
    }
    
    const user = currentUserData || await loadUserData(currentUser.uid);
    if (!user) return;
    
    // Обновить информацию профиля
    const profileUsername = document.getElementById('profileUsername');
    if (profileUsername) profileUsername.textContent = user.username;
    
    const profileHandle = document.getElementById('profileHandle');
    if (profileHandle) profileHandle.textContent = '@' + user.handle;
    
    const profileBio = document.getElementById('profileBio');
    if (profileBio) profileBio.textContent = user.bio || 'Нет описания';
    
    const profileSubscribers = document.getElementById('profileSubscribers');
    if (profileSubscribers) {
        profileSubscribers.textContent = formatNumber(user.subscribers || 0) + ' подписчиков';
    }
    
    const profileVideos = document.getElementById('profileVideos');
    if (profileVideos) {
        profileVideos.textContent = formatNumber(user.videos || 0) + ' видео';
    }
    
    const profileJoined = document.getElementById('profileJoined');
    if (profileJoined) {
        profileJoined.textContent = formatDate(user.createdAt);
    }
    
    const profileTotalViews = document.getElementById('profileTotalViews');
    if (profileTotalViews) {
        profileTotalViews.textContent = formatNumber(user.views || 0);
    }
    
    const profileTotalLikes = document.getElementById('profileTotalLikes');
    if (profileTotalLikes) {
        profileTotalLikes.textContent = formatNumber(user.likes || 0);
    }
    
    const profileAbout = document.getElementById('profileAbout');
    if (profileAbout) {
        profileAbout.textContent = user.bio || 'Нет описания';
    }
    
    // Проверка аккаунта
    const profileVerified = document.getElementById('profileVerified');
    if (profileVerified) {
        profileVerified.style.display = user.isVerified ? 'inline' : 'none';
    }
    
    // Установить аватар
    const avatar = document.getElementById('profileAvatar');
    if (avatar) {
        const avatarSpan = avatar.querySelector('span');
        if (avatarSpan) {
            avatarSpan.textContent = (user.username || 'U').charAt(0).toUpperCase();
        }
        avatar.style.backgroundColor = user.avatarColor || '#666';
        
        if (user.avatarUrl) {
            avatar.innerHTML = `<img src="${user.avatarUrl}" alt="${user.username}">`;
        }
    }
    
    // Установить баннер
    const banner = document.getElementById('profileBanner');
    if (banner && user.bannerUrl) {
        banner.style.backgroundImage = `url(${user.bannerUrl})`;
    }
    
    // Загрузить ссылки
    const linksContainer = document.getElementById('profileLinks');
    if (linksContainer) {
        linksContainer.innerHTML = '';
        
        if (user.links && user.links.length > 0) {
            user.links.forEach(link => {
                const linkElement = document.createElement('a');
                linkElement.href = link;
                linkElement.textContent = link;
                linkElement.target = '_blank';
                linkElement.className = 'profile-link';
                linkElement.rel = 'noopener noreferrer';
                linksContainer.appendChild(linkElement);
            });
        } else {
            linksContainer.innerHTML = '<p>Нет ссылок</p>';
        }
    }
    
    // Загрузить видео пользователя
    loadUserVideos();
}

// Загрузка видео пользователя
async function loadUserVideos() {
    if (!currentUser) return;
    
    try {
        let userVideos = [];
        
        if (db) {
            const snapshot = await db.collection('videos')
                .where('userId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();
            
            snapshot.forEach(doc => {
                userVideos.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } else {
            // Локальное хранилище
            userVideos = videos.filter(v => v.userId === currentUser.uid);
        }
        
        const grid = document.getElementById('profileVideosGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (userVideos.length === 0) {
            grid.innerHTML = `
                <div class="no-videos">
                    <i class="fas fa-video"></i>
                    <h3>У вас еще нет видео</h3>
                    <p>Загрузите свое первое видео!</p>
                    <button class="btn btn-primary" onclick="showModal('uploadModal')">
                        <i class="fas fa-upload"></i> Загрузить видео
                    </button>
                </div>
            `;
            return;
        }
        
        userVideos.forEach(video => {
            const card = createVideoCard(video);
            grid.appendChild(card);
        });
        
    } catch (error) {
        console.error('Ошибка загрузки видео пользователя:', error);
    }
}

// Загрузка данных студии
async function loadStudioData() {
    if (!currentUser) {
        showPage('home');
        return;
    }
    
    const user = currentUserData || await loadUserData(currentUser.uid);
    if (!user) return;
    
    // Обновить статистику студии
    const studioViews = document.getElementById('studioViews');
    if (studioViews) studioViews.textContent = formatNumber(user.views || 0);
    
    const studioSubscribers = document.getElementById('studioSubscribers');
    if (studioSubscribers) studioSubscribers.textContent = formatNumber(user.subscribers || 0);
    
    const studioVideos = document.getElementById('studioVideos');
    if (studioVideos) studioVideos.textContent = formatNumber(user.videos || 0);
    
    const studioLikes = document.getElementById('studioLikes');
    if (studioLikes) studioLikes.textContent = formatNumber(user.likes || 0);
    
    // Загрузить видео для студии
    loadStudioVideos();
}

// Загрузка видео для студии
async function loadStudioVideos() {
    if (!currentUser) return;
    
    try {
        let studioVideos = [];
        
        if (db) {
            const snapshot = await db.collection('videos')
                .where('userId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();
            
            snapshot.forEach(doc => {
                studioVideos.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } else {
            // Локальное хранилище
            studioVideos = videos.filter(v => v.userId === currentUser.uid);
        }
        
        const grid = document.getElementById('studioVideosGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (studioVideos.length === 0) {
            grid.innerHTML = `
                <div class="no-videos">
                    <i class="fas fa-video"></i>
                    <h3>У вас еще нет видео</h3>
                    <p>Начните загружать видео, чтобы управлять ими здесь</p>
                </div>
            `;
            return;
        }
        
        studioVideos.forEach(video => {
            const card = createStudioVideoCard(video);
            grid.appendChild(card);
        });
        
    } catch (error) {
        console.error('Ошибка загрузки видео для студии:', error);
    }
}

// Создание карточки видео для студии
function createStudioVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card studio-video-card';
    
    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="${video.title}" 
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/300x169/333/fff?text=HubTube'">
            ${video.type === 'short' ? '<div class="short-badge">SHORTS</div>' : ''}
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <div class="video-meta">
                <span>${formatViews(video.views || 0)} просмотров</span>
                <span>•</span>
                <span>${formatNumber(video.likes || 0)} лайков</span>
                <span>•</span>
                <span>${formatDate(video.createdAt)}</span>
            </div>
            <div class="video-actions">
                <button class="btn btn-secondary btn-sm" onclick="editVideo('${video.id}')">
                    <i class="fas fa-edit"></i> Редактировать
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteVideo('${video.id}')">
                    <i class="fas fa-trash"></i> Удалить
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// Редактирование видео
function editVideo(videoId) {
    showToast('Редактирование видео в разработке', 'info');
}

// Удаление видео
function deleteVideo(videoId) {
    if (!confirm('Вы уверены, что хотите удалить это видео?')) return;
    
    // Здесь будет логика удаления видео
    showToast('Видео удалено', 'success');
    
    // Обновить список видео
    setTimeout(() => {
        loadVideos();
        if (document.getElementById('studioVideosGrid')) {
            loadStudioVideos();
        }
    }, 500);
}

// Загрузка данных настроек
function loadSettingsData() {
    if (!currentUser) {
        showPage('home');
        return;
    }
    
    const settingsUsername = document.getElementById('settingsUsername');
    if (settingsUsername) {
        settingsUsername.value = currentUserData?.username || '';
    }
    
    const settingsEmail = document.getElementById('settingsEmail');
    if (settingsEmail) {
        settingsEmail.value = currentUser?.email || '';
    }
}

// Загрузка данных подписок
async function loadSubscriptionsData() {
    if (!currentUser) {
        showPage('home');
        return;
    }
    
    const channelsGrid = document.getElementById('channelsGrid');
    if (!channelsGrid) return;
    
    channelsGrid.innerHTML = '<div class="loading">Загрузка подписок...</div>';
    
    // Здесь будет загрузка подписок
    setTimeout(() => {
        channelsGrid.innerHTML = `
            <div class="no-subscriptions">
                <i class="fas fa-users"></i>
                <h3>У вас нет подписок</h3>
                <p>Начните подписываться на каналы, чтобы они отображались здесь</p>
            </div>
        `;
    }, 1000);
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
    
    try {
        let searchResults = [];
        
        if (db) {
            const snapshot = await db.collection('videos')
                .where('title', '>=', query)
                .where('title', '<=', query + '\uf8ff')
                .get();
            
            snapshot.forEach(doc => {
                searchResults.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } else {
            // Локальное хранилище
            searchResults = videos.filter(video => 
                video.title.toLowerCase().includes(query) ||
                video.description.toLowerCase().includes(query) ||
                video.tags.some(tag => tag.toLowerCase().includes(query))
            );
        }
        
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
        
    } catch (error) {
        console.error('Ошибка поиска:', error);
        showToast('Ошибка поиска', 'error');
    }
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

// Показать уведомление (тост)
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // Создать контейнер если его нет
        const toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
        container = toastContainer;
    }
    
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
    
    container.appendChild(toast);
    
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
        '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43',
        '#5f27cd', '#ff9ff3', '#54a0ff', '#00d2d3', '#ff9f43'
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
        news: 'https://via.placeholder.com/1280x720/ff9ff3/ffffff?text=Новости',
        cartoons: 'https://via.placeholder.com/1280x720/96ceb4/ffffff?text=Мультфильмы',
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
        'auth/operation-not-allowed': 'Этот метод входа отключен',
        'auth/user-disabled': 'Аккаунт отключен',
        'auth/user-mismatch': 'Неверные учетные данные',
        'auth/requires-recent-login': 'Требуется повторный вход'
    };
    
    return errors[errorCode] || 'Произошла ошибка: ' + errorCode;
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
    renderShorts();
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
        },
        {
            id: 'demo_video_4',
            title: 'Как быстро выучить английский',
            description: 'Эффективные методики изучения английского языка за короткий срок.',
            type: 'video',
            category: 'education',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
            userId: 'demo_user_2',
            username: 'Tech Reviews',
            handle: 'techreviews',
            avatarColor: '#54a0ff',
            views: 12500,
            likes: 890,
            comments: 67,
            subscribers: 850,
            duration: '15:22',
            isVerified: false,
            tags: ['английский', 'обучение', 'образование', 'языки'],
            createdAt: '2024-03-08T11:45:00Z'
        },
        {
            id: 'demo_video_5',
            title: 'Лучшие моменты матча',
            description: 'Обзор самого захватывающего футбольного матча сезона.',
            type: 'video',
            category: 'sports',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
            thumbnail: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg',
            userId: 'demo_user_1',
            username: 'HubTube Team',
            handle: 'hubtube',
            avatarColor: '#ff0000',
            views: 23456,
            likes: 1456,
            comments: 89,
            subscribers: 1250,
            duration: '12:18',
            isVerified: true,
            tags: ['футбол', 'спорт', 'матч', 'голы'],
            createdAt: '2024-03-12T19:20:00Z'
        }
    ];
}

// Проверка достижений
async function checkAchievements() {
    if (!currentUser) return;
    
    const user = currentUserData;
    if (!user) return;
    
    const achievements = [];
    
    // Проверка подписчиков
    if (user.subscribers >= 10 && !user.achieved10) {
        achievements.push({
            type: 'subscribers',
            count: 10,
            message: '🎉 Вы набрали 10 подписчиков!'
        });
    }
    
    if (user.subscribers >= 50 && !user.achieved50) {
        achievements.push({
            type: 'subscribers',
            count: 50,
            message: '🎉 Вы набрали 50 подписчиков!'
        });
    }
    
    if (user.subscribers >= 100 && !user.achieved100) {
        achievements.push({
            type: 'subscribers',
            count: 100,
            message: '🎉 Вы набрали 100 подписчиков! Вы получили галочку от HubTube!'
        });
        
        // Верификация канала
        try {
            if (db) {
                await db.collection('users').doc(currentUser.uid).update({
                    isVerified: true,
                    achieved100: true
                });
            } else {
                // Локальное хранилище
                const users = JSON.parse(localStorage.getItem('users') || '[]');
                const userIndex = users.findIndex(u => u.uid === currentUser.uid);
                if (userIndex > -1) {
                    users[userIndex].isVerified = true;
                    users[userIndex].achieved100 = true;
                    localStorage.setItem('users', JSON.stringify(users));
                }
            }
        } catch (error) {
            console.error('Ошибка верификации:', error);
        }
    }
    
    // Сохранение достижений и показ уведомлений
    for (const achievement of achievements) {
        try {
            const notificationData = {
                userId: currentUser.uid,
                type: 'achievement',
                title: 'Достижение!',
                message: achievement.message,
                read: false,
                createdAt: new Date().toISOString()
            };
            
            if (db) {
                await db.collection('notifications').add(notificationData);
            } else {
                // Локальное хранилище
                const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
                notificationData.id = 'local_notif_' + Date.now();
                notifications.push(notificationData);
                localStorage.setItem('notifications', JSON.stringify(notifications));
            }
            
            showToast(achievement.message, 'success');
        } catch (error) {
            console.error('Ошибка сохранения достижения:', error);
        }
    }
}

// Периодическая проверка достижений
setInterval(() => {
    if (currentUser) {
        checkAchievements();
    }
}, 30000); // Каждые 30 секунд

// Добавление CSS для уведомлений
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

.no-videos, .no-shorts, .no-comments, .no-subscriptions {
    text-align: center;
    padding: 40px 20px;
    grid-column: 1 / -1;
    color: var(--text-secondary);
}

.no-videos i, .no-shorts i, .no-comments i, .no-subscriptions i {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

.no-videos h3, .no-shorts h3, .no-comments h3, .no-subscriptions h3 {
    margin-bottom: 8px;
    color: var(--text-primary);
}

.no-videos p, .no-shorts p, .no-comments p, .no-subscriptions p {
    margin-bottom: 16px;
}

.loading {
    text-align: center;
    padding: 40px;
    grid-column: 1 / -1;
    color: var(--text-secondary);
}

.player-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    background: var(--surface-color-light);
    color: var(--text-secondary);
    padding: 40px;
    text-align: center;
}

.player-error i {
    font-size: 48px;
    margin-bottom: 16px;
    color: var(--error-color);
}

.player-error p {
    margin-bottom: 16px;
}

.short-card .video-thumbnail {
    aspect-ratio: 9/16;
}

.short-card .video-title {
    font-size: 14px;
    line-height: 1.3;
}

.subscribed {
    background-color: #666 !important;
    color: #ccc !important;
}

.btn-sm {
    padding: 6px 12px;
    font-size: 12px;
}

.studio-video-card .video-actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
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
window.submitComment = submitComment;
window.likeComment = likeComment;
window.editVideo = editVideo;
window.deleteVideo = deleteVideo;
window.searchVideos = searchVideos;
window.showToast = showToast;

console.log('HubTube script загружен и готов к работе!');
