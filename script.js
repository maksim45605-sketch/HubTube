// Глобальные переменные
let currentUser = null;
let currentUserData = null;
let currentVideo = null;
let videos = [];
let subscriptions = [];
let notifications = [];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    initEventListeners();
    checkAuthState();
    loadVideos();
    updateUI();
});

// Инициализация Firebase
function initFirebase() {
    // Firebase уже инициализирован в HTML
    console.log('Firebase инициализирован');
}

// Проверка состояния авторизации
function checkAuthState() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData(user.uid);
            await loadSubscriptions();
            await loadNotifications();
            showToast('Вы успешно вошли!', 'success');
        } else {
            currentUser = null;
            currentUserData = null;
        }
        updateUI();
    });
}

// Загрузка данных пользователя
async function loadUserData(uid) {
    try {
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
        showToast('Ошибка загрузки профиля', 'error');
    }
}

// Загрузка видео
async function loadVideos() {
    try {
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
        showToast('Ошибка загрузки видео', 'error');
    }
}

// Загрузка подписок
async function loadSubscriptions() {
    if (!currentUser) return;
    
    try {
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
    document.getElementById('userBtn').addEventListener('click', () => {
        if (currentUser) {
            showPage('profile');
        } else {
            showModal('authModal');
        }
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Форма входа
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            await auth.signInWithEmailAndPassword(email, password);
            hideModal('authModal');
            showToast('Вход выполнен успешно!', 'success');
        } catch (error) {
            showToast(getAuthError(error.code), 'error');
        }
    });
    
    // Форма регистрации
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const handle = document.getElementById('registerHandle').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        
        if (password !== confirmPassword) {
            showToast('Пароли не совпадают', 'error');
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
            showToast('Имя пользователя может содержать только буквы, цифры и нижнее подчеркивание', 'error');
            return;
        }
        
        try {
            // Проверка уникальности имени пользователя
            const snapshot = await db.collection('users')
                .where('handle', '==', handle.toLowerCase())
                .get();
            
            if (!snapshot.empty) {
                showToast('Это имя пользователя уже занято', 'error');
                return;
            }
            
            // Создание пользователя
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Сохранение данных пользователя
            await db.collection('users').doc(user.uid).set({
                username: username,
                handle: handle.toLowerCase(),
                email: email,
                avatarColor: getRandomColor(),
                subscribers: 0,
                videos: 0,
                views: 0,
                likes: 0,
                isVerified: false,
                bio: '',
                links: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            hideModal('authModal');
            showToast('Регистрация успешна!', 'success');
            
        } catch (error) {
            showToast(getAuthError(error.code), 'error');
        }
    });
    
    // Загрузка видео
    document.getElementById('uploadBtn').addEventListener('click', () => {
        if (!currentUser) {
            showModal('authModal');
            return;
        }
        showModal('uploadModal');
    });
    
    document.getElementById('uploadStudioBtn').addEventListener('click', () => {
        showModal('uploadModal');
    });
    
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('videoTitle').value;
        const description = document.getElementById('videoDescription').value;
        const type = document.getElementById('videoType').value;
        const category = document.getElementById('videoCategory').value;
        const url = document.getElementById('videoUrl').value;
        const thumbnail = document.getElementById('thumbnailUrl').value;
        const tags = document.getElementById('videoTags').value.split(',').map(tag => tag.trim());
        
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
                username: currentUserData.username,
                handle: currentUserData.handle,
                avatarColor: currentUserData.avatarColor,
                views: 0,
                likes: 0,
                comments: 0,
                subscribers: currentUserData.subscribers || 0,
                duration: '0:00',
                isVerified: currentUserData.isVerified || false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('videos').add(videoData);
            
            // Обновление счетчика видео пользователя
            await db.collection('users').doc(currentUser.uid).update({
                videos: firebase.firestore.FieldValue.increment(1)
            });
            
            hideModal('uploadModal');
            showToast('Видео успешно загружено!', 'success');
            
            // Обновление списка видео
            loadVideos();
            
        } catch (error) {
            console.error('Ошибка загрузки видео:', error);
            showToast('Ошибка загрузки видео', 'error');
        }
    });
    
    // Редактирование профиля
    document.getElementById('editProfileBtn').addEventListener('click', () => {
        if (!currentUser) return;
        
        document.getElementById('editUsername').value = currentUserData.username || '';
        document.getElementById('editBio').value = currentUserData.bio || '';
        document.getElementById('editAvatarUrl').value = currentUserData.avatarUrl || '';
        document.getElementById('editBannerUrl').value = currentUserData.bannerUrl || '';
        document.getElementById('editLinks').value = currentUserData.links ? currentUserData.links.join('\n') : '';
        
        showModal('editProfileModal');
    });
    
    document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('editUsername').value;
        const bio = document.getElementById('editBio').value;
        const avatarUrl = document.getElementById('editAvatarUrl').value;
        const bannerUrl = document.getElementById('editBannerUrl').value;
        const links = document.getElementById('editLinks').value.split('\n').filter(link => link.trim());
        
        try {
            await db.collection('users').doc(currentUser.uid).update({
                username: username,
                bio: bio,
                avatarUrl: avatarUrl || null,
                bannerUrl: bannerUrl || null,
                links: links,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await loadUserData(currentUser.uid);
            hideModal('editProfileModal');
            showToast('Профиль успешно обновлен!', 'success');
            
        } catch (error) {
            console.error('Ошибка обновления профиля:', error);
            showToast('Ошибка обновления профиля', 'error');
        }
    });
    
    // Настройки
    document.getElementById('saveAccountSettings').addEventListener('click', async () => {
        if (!currentUser) return;
        
        const username = document.getElementById('settingsUsername').value;
        const email = document.getElementById('settingsEmail').value;
        const password = document.getElementById('settingsPassword').value;
        const confirmPassword = document.getElementById('settingsConfirmPassword').value;
        
        if (password && password !== confirmPassword) {
            showToast('Пароли не совпадают', 'error');
            return;
        }
        
        try {
            const updates = {
                username: username,
                email: email,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (password) {
                await currentUser.updatePassword(password);
            }
            
            await db.collection('users').doc(currentUser.uid).update(updates);
            
            if (email !== currentUser.email) {
                await currentUser.updateEmail(email);
            }
            
            await loadUserData(currentUser.uid);
            showToast('Настройки сохранены!', 'success');
            
        } catch (error) {
            console.error('Ошибка сохранения настроек:', error);
            showToast('Ошибка сохранения настроек', 'error');
        }
    });
    
    // Удаление аккаунта
    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите удалить аккаунт? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            await db.collection('users').doc(currentUser.uid).delete();
            await currentUser.delete();
            showToast('Аккаунт успешно удален', 'success');
            setTimeout(() => location.reload(), 2000);
        } catch (error) {
            console.error('Ошибка удаления аккаунта:', error);
            showToast('Ошибка удаления аккаунта', 'error');
        }
    });
    
    // Закрытие модальных окон
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
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
    document.getElementById('searchBtn').addEventListener('click', searchVideos);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchVideos();
    });
    
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
    document.querySelector(`.theme-option[data-theme="${savedTheme}"]`)?.classList.add('active');
    
    // Переключение навигации на мобильных устройствах
    document.getElementById('navToggle').addEventListener('click', () => {
        document.querySelector('.nav-menu').classList.toggle('active');
    });
}

// Показать страницу
function showPage(pageId) {
    // Скрыть все страницы
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Показать выбранную страницу
    document.getElementById(pageId + 'Page').classList.add('active');
    
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
    document.querySelector('.nav-menu').classList.remove('active');
}

// Показать модальное окно
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

// Скрыть модальное окно
function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Рендеринг видео
function renderVideos() {
    const grid = document.getElementById('videoGrid');
    grid.innerHTML = '';
    
    videos.forEach(video => {
        if (video.type === 'short') return; // Пропускаем Shorts
        
        const card = createVideoCard(video);
        grid.appendChild(card);
    });
}

// Рендеринг Shorts
function renderShorts() {
    const grid = document.getElementById('shortsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    videos.forEach(video => {
        if (video.type !== 'short') return;
        
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
            <img src="${video.thumbnail}" alt="${video.title}" onerror="this.src='https://via.placeholder.com/300x169?text=HubTube'">
            <div class="video-duration">${video.duration || '0:00'}</div>
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <div class="video-meta">
                <span>${video.username}</span>
                <span>•</span>
                <span>${formatViews(video.views)} просмотров</span>
                <span>•</span>
                <span>${formatDate(video.createdAt?.toDate())}</span>
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => openVideo(video));
    return card;
}

// Создание карточки Short
function createShortCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = video.id;
    
    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="${video.title}" onerror="this.src='https://via.placeholder.com/169x300?text=Shorts'">
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
    grid.innerHTML = '';
    
    const filteredVideos = category === 'all' 
        ? videos.filter(v => v.type !== 'short')
        : videos.filter(v => v.type !== 'short' && v.category === category);
    
    filteredVideos.forEach(video => {
        const card = createVideoCard(video);
        grid.appendChild(card);
    });
}

// Открытие видео
function openVideo(video) {
    currentVideo = video;
    
    // Увеличить счетчик просмотров
    db.collection('videos').doc(video.id).update({
        views: firebase.firestore.FieldValue.increment(1)
    });
    
    // Обновить информацию в модальном окне
    document.getElementById('videoModalTitle').textContent = video.title;
    document.getElementById('videoChannelName').textContent = video.username;
    document.getElementById('videoViews').textContent = formatViews(video.views + 1) + ' просмотров';
    document.getElementById('videoDate').textContent = formatDate(video.createdAt?.toDate());
    document.getElementById('videoModalDescription').textContent = video.description;
    document.getElementById('likeCount').textContent = formatNumber(video.likes);
    
    // Установить проверку канала
    if (video.isVerified) {
        document.getElementById('videoChannelVerified').style.display = 'inline';
    } else {
        document.getElementById('videoChannelVerified').style.display = 'none';
    }
    
    // Установить аватар канала
    const avatar = document.getElementById('videoChannelAvatar');
    avatar.textContent = video.username.charAt(0).toUpperCase();
    avatar.style.backgroundColor = video.avatarColor;
    
    // Обновить плеер
    const player = document.getElementById('videoPlayer');
    player.innerHTML = createVideoPlayer(video.url);
    
    // Загрузить комментарии
    loadComments(video.id);
    
    // Показать модальное окно
    showModal('videoModal');
}

// Создание видеоплеера
function createVideoPlayer(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = getYouTubeId(url);
        if (videoId) {
            return `
                <iframe 
                    src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        }
    } else if (url.includes('vimeo.com')) {
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
    
    return `
        <video controls autoplay>
            <source src="${url}" type="video/mp4">
            Ваш браузер не поддерживает видео.
        </video>
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
        const snapshot = await db.collection('comments')
            .where('videoId', '==', videoId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        const list = document.getElementById('commentsList');
        list.innerHTML = '';
        
        snapshot.forEach(doc => {
            const comment = doc.data();
            const commentElement = createCommentElement(comment);
            list.appendChild(commentElement);
        });
        
        document.getElementById('commentsCount').textContent = snapshot.size;
        
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
    }
}

// Создание элемента комментария
function createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = 'comment-item';
    
    div.innerHTML = `
        <div class="comment-avatar" style="background-color: ${comment.avatarColor || '#666'}">
            ${comment.username?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div class="comment-content">
            <div class="comment-header">
                <span class="comment-author">${comment.username || 'Аноним'}</span>
                <span class="comment-time">${formatDate(comment.createdAt?.toDate())}</span>
            </div>
            <div class="comment-text">${formatCommentText(comment.text)}</div>
            <div class="comment-actions">
                <button class="comment-action">
                    <i class="fas fa-thumbs-up"></i> ${comment.likes || 0}
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
    return text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}

// Отправка комментария
document.getElementById('submitCommentBtn')?.addEventListener('click', async () => {
    if (!currentUser) {
        showModal('authModal');
        return;
    }
    
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    try {
        await db.collection('comments').add({
            videoId: currentVideo.id,
            userId: currentUser.uid,
            username: currentUserData.username,
            avatarColor: currentUserData.avatarColor,
            text: text,
            likes: 0,
            likedBy: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Обновить счетчик комментариев
        await db.collection('videos').doc(currentVideo.id).update({
            comments: firebase.firestore.FieldValue.increment(1)
        });
        
        // Очистить поле ввода
        input.value = '';
        
        // Перезагрузить комментарии
        loadComments(currentVideo.id);
        
        showToast('Комментарий добавлен', 'success');
        
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        showToast('Ошибка добавления комментария', 'error');
    }
});

// Загрузка данных профиля
async function loadProfileData() {
    if (!currentUser) return;
    
    const user = currentUserData || await loadUserData(currentUser.uid);
    
    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileHandle').textContent = '@' + user.handle;
    document.getElementById('profileBio').textContent = user.bio || 'Нет описания';
    document.getElementById('profileSubscribers').textContent = formatNumber(user.subscribers || 0) + ' подписчиков';
    document.getElementById('profileVideos').textContent = formatNumber(user.videos || 0) + ' видео';
    document.getElementById('profileJoined').textContent = formatDate(user.createdAt?.toDate());
    document.getElementById('profileTotalViews').textContent = formatNumber(user.views || 0);
    document.getElementById('profileTotalLikes').textContent = formatNumber(user.likes || 0);
    document.getElementById('profileAbout').textContent = user.bio || 'Нет описания';
    
    if (user.isVerified) {
        document.getElementById('profileVerified').style.display = 'inline';
    } else {
        document.getElementById('profileVerified').style.display = 'none';
    }
    
    // Установить аватар
    const avatar = document.getElementById('profileAvatar');
    avatar.querySelector('span').textContent = user.username.charAt(0).toUpperCase();
    avatar.style.backgroundColor = user.avatarColor;
    
    if (user.avatarUrl) {
        avatar.innerHTML = `<img src="${user.avatarUrl}" alt="${user.username}">`;
    }
    
    // Установить баннер
    if (user.bannerUrl) {
        document.getElementById('profileBanner').style.backgroundImage = `url(${user.bannerUrl})`;
    }
    
    // Загрузить ссылки
    const linksContainer = document.getElementById('profileLinks');
    linksContainer.innerHTML = '';
    
    if (user.links && user.links.length > 0) {
        user.links.forEach(link => {
            const linkElement = document.createElement('a');
            linkElement.href = link;
            linkElement.textContent = link;
            linkElement.target = '_blank';
            linkElement.className = 'profile-link';
            linksContainer.appendChild(linkElement);
        });
    }
    
    // Загрузить видео пользователя
    loadUserVideos();
}

// Загрузка видео пользователя
async function loadUserVideos() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection('videos')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        const grid = document.getElementById('profileVideosGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        snapshot.forEach(doc => {
            const video = {
                id: doc.id,
                ...doc.data()
            };
            
            const card = createVideoCard(video);
            grid.appendChild(card);
        });
        
    } catch (error) {
        console.error('Ошибка загрузки видео пользователя:', error);
    }
}

// Загрузка данных студии
async function loadStudioData() {
    if (!currentUser) return;
    
    const user = currentUserData || await loadUserData(currentUser.uid);
    
    document.getElementById('studioViews').textContent = formatNumber(user.views || 0);
    document.getElementById('studioSubscribers').textContent = formatNumber(user.subscribers || 0);
    document.getElementById('studioVideos').textContent = formatNumber(user.videos || 0);
    document.getElementById('studioLikes').textContent = formatNumber(user.likes || 0);
    
    // Загрузить видео для студии
    loadStudioVideos();
}

// Загрузка видео для студии
async function loadStudioVideos() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection('videos')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        const grid = document.getElementById('studioVideosGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        snapshot.forEach(doc => {
            const video = {
                id: doc.id,
                ...doc.data()
            };
            
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
    card.className = 'video-card';
    
    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="${video.title}" onerror="this.src='https://via.placeholder.com/300x169?text=HubTube'">
            ${video.type === 'short' ? '<div class="short-badge">SHORTS</div>' : ''}
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <div class="video-meta">
                <span>${formatViews(video.views)} просмотров</span>
                <span>•</span>
                <span>${formatNumber(video.likes)} лайков</span>
                <span>•</span>
                <span>${formatDate(video.createdAt?.toDate())}</span>
            </div>
            <div class="video-actions">
                <button class="btn btn-secondary btn-sm">Редактировать</button>
                <button class="btn btn-danger btn-sm">Удалить</button>
            </div>
        </div>
    `;
    
    return card;
}

// Загрузка данных настроек
function loadSettingsData() {
    if (!currentUser) return;
    
    document.getElementById('settingsUsername').value = currentUserData?.username || '';
    document.getElementById('settingsEmail').value = currentUser?.email || '';
}

// Загрузка данных подписок
async function loadSubscriptionsData() {
    if (!currentUser) return;
    
    try {
        const channelsGrid = document.getElementById('channelsGrid');
        if (!channelsGrid) return;
        
        channelsGrid.innerHTML = '';
        
        // Загрузить данные каналов, на которые подписан пользователь
        for (const channelId of subscriptions) {
            const doc = await db.collection('users').doc(channelId).get();
            if (doc.exists) {
                const channel = doc.data();
                const channelElement = createChannelElement(channel);
                channelsGrid.appendChild(channelElement);
            }
        }
        
    } catch (error) {
        console.error('Ошибка загрузки подписок:', error);
    }
}

// Создание элемента канала
function createChannelElement(channel) {
    const div = document.createElement('div');
    div.className = 'channel-card';
    
    div.innerHTML = `
        <div class="channel-avatar" style="background-color: ${channel.avatarColor}">
            ${channel.username?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div class="channel-info">
            <h3 class="channel-name">${channel.username}</h3>
            <p class="channel-handle">@${channel.handle}</p>
            <p class="channel-subscribers">${formatNumber(channel.subscribers || 0)} подписчиков</p>
        </div>
        <button class="btn btn-secondary">Отписаться</button>
    `;
    
    return div;
}

// Поиск видео
async function searchVideos() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) return;
    
    try {
        const snapshot = await db.collection('videos')
            .where('title', '>=', query)
            .where('title', '<=', query + '\uf8ff')
            .get();
        
        const searchResults = [];
        snapshot.forEach(doc => {
            searchResults.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Показать результаты поиска
        const grid = document.getElementById('videoGrid');
        grid.innerHTML = '';
        
        searchResults.forEach(video => {
            if (video.type === 'short') return;
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
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Форматирование чисел
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
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
    
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' дн назад';
    
    return date.toLocaleDateString('ru-RU');
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
        return 'https://via.placeholder.com/1080x1920/ff0000/ffffff?text=Shorts';
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
function getAuthError(code) {
    const errors = {
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/email-already-in-use': 'Email уже используется',
        'auth/invalid-email': 'Неверный формат email',
        'auth/weak-password': 'Пароль слишком простой',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
        'auth/network-request-failed': 'Ошибка сети. Проверьте подключение'
    };
    
    return errors[code] || 'Произошла ошибка';
}

// Проверка достижений
async function checkAchievements() {
    if (!currentUser) return;
    
    const user = currentUserData;
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
        await db.collection('users').doc(currentUser.uid).update({
            isVerified: true,
            achieved100: true
        });
    }
    
    // Сохранение достижений и показ уведомлений
    for (const achievement of achievements) {
        await db.collection('notifications').add({
            userId: currentUser.uid,
            type: 'achievement',
            title: 'Достижение!',
            message: achievement.message,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast(achievement.message, 'success');
    }
}

// Периодическая проверка достижений
setInterval(() => {
    if (currentUser) {
        checkAchievements();
    }
}, 60000); // Каждую минуту
