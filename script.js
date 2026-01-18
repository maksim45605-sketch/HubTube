// ==============================================
// УПРАВЛЕНИЕ ДАННЫМИ ЧЕРЕЗ FIREBASE
// ==============================================

class FirebaseManager {
    // ... предыдущий код ...

    // Комментарии
    async addComment(videoId, text, parentId = null) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                return { success: false, error: 'Пользователь не авторизован' };
            }
            
            const userData = await this.getUserData(user.uid);
            if (!userData.success) {
                return userData;
            }
            
            // Обработка форматирования *жирный текст*
            const formattedText = this.formatCommentText(text);
            
            const commentData = {
                videoId: videoId,
                userId: user.uid,
                username: userData.data.username,
                avatarColor: userData.data.avatarColor,
                text: formattedText,
                originalText: text,
                likes: 0,
                likedBy: [],
                replies: 0,
                isPinned: false,
                isHearted: false,
                parentId: parentId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = await this.db.collection('comments').add(commentData);
            
            // Увеличиваем счетчик комментариев
            if (!parentId) {
                await this.db.collection('videos').doc(videoId).update({
                    comments: firebase.firestore.FieldValue.increment(1)
                });
            } else {
                // Увеличиваем счетчик ответов у родительского комментария
                await this.db.collection('comments').doc(parentId).update({
                    replies: firebase.firestore.FieldValue.increment(1)
                });
            }
            
            return { success: true, commentId: docRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async getComments(videoId, limit = 50) {
        try {
            const snapshot = await this.db.collection('comments')
                .where('videoId', '==', videoId)
                .where('parentId', '==', null)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            
            const comments = [];
            snapshot.forEach(doc => {
                comments.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return { success: true, comments };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async getReplies(commentId) {
        try {
            const snapshot = await this.db.collection('comments')
                .where('parentId', '==', commentId)
                .orderBy('createdAt', 'asc')
                .get();
            
            const replies = [];
            snapshot.forEach(doc => {
                replies.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return { success: true, replies };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async toggleLikeComment(commentId, userId) {
        try {
            const commentRef = this.db.collection('comments').doc(commentId);
            const commentDoc = await commentRef.get();
            
            if (!commentDoc.exists) {
                return { success: false, error: 'Комментарий не найден' };
            }
            
            const commentData = commentDoc.data();
            const likedBy = commentData.likedBy || [];
            const hasLiked = likedBy.includes(userId);
            
            if (hasLiked) {
                // Убираем лайк
                await commentRef.update({
                    likes: firebase.firestore.FieldValue.increment(-1),
                    likedBy: firebase.firestore.FieldValue.arrayRemove(userId)
                });
                return { success: true, liked: false };
            } else {
                // Добавляем лайк
                await commentRef.update({
                    likes: firebase.firestore.FieldValue.increment(1),
                    likedBy: firebase.firestore.FieldValue.arrayRemove(userId)
                });
                return { success: true, liked: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async togglePinComment(commentId, videoId, userId) {
        try {
            // Проверяем, является ли пользователь владельцем видео
            const videoDoc = await this.db.collection('videos').doc(videoId).get();
            if (!videoDoc.exists) {
                return { success: false, error: 'Видео не найдено' };
            }
            
            const videoData = videoDoc.data();
            if (videoData.userId !== userId) {
                return { success: false, error: 'Только автор видео может закреплять комментарии' };
            }
            
            const commentRef = this.db.collection('comments').doc(commentId);
            const commentDoc = await commentRef.get();
            
            if (!commentDoc.exists) {
                return { success: false, error: 'Комментарий не найден' };
            }
            
            const commentData = commentDoc.data();
            const isCurrentlyPinned = commentData.isPinned;
            
            if (isCurrentlyPinned) {
                // Открепляем комментарий
                await commentRef.update({
                    isPinned: false
                });
                return { success: true, pinned: false };
            } else {
                // Открепляем все другие закрепленные комментарии
                const pinnedComments = await this.db.collection('comments')
                    .where('videoId', '==', videoId)
                    .where('isPinned', '==', true)
                    .get();
                
                const batch = this.db.batch();
                pinnedComments.forEach(doc => {
                    batch.update(doc.ref, { isPinned: false });
                });
                await batch.commit();
                
                // Закрепляем текущий комментарий
                await commentRef.update({
                    isPinned: true
                });
                
                return { success: true, pinned: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async toggleHeartComment(commentId, videoId, userId) {
        try {
            // Проверяем, является ли пользователь владельцем видео
            const videoDoc = await this.db.collection('videos').doc(videoId).get();
            if (!videoDoc.exists) {
                return { success: false, error: 'Видео не найдено' };
            }
            
            const videoData = videoDoc.data();
            if (videoData.userId !== userId) {
                return { success: false, error: 'Только автор видео может ставить сердечки' };
            }
            
            const commentRef = this.db.collection('comments').doc(commentId);
            const commentDoc = await commentRef.get();
            
            if (!commentDoc.exists) {
                return { success: false, error: 'Комментарий не найден' };
            }
            
            const commentData = commentDoc.data();
            const isCurrentlyHearted = commentData.isHearted;
            
            await commentRef.update({
                isHearted: !isCurrentlyHearted
            });
            
            return { success: true, hearted: !isCurrentlyHearted };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // Уведомления
    async createNotification(userId, type, data) {
        try {
            const notificationData = {
                userId: userId,
                type: type,
                data: data,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await this.db.collection('notifications').add(notificationData);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async getNotifications(userId, limit = 20) {
        try {
            const snapshot = await this.db.collection('notifications')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            
            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return { success: true, notifications };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async markNotificationAsRead(notificationId) {
        try {
            await this.db.collection('notifications').doc(notificationId).update({
                read: true
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async markAllNotificationsAsRead(userId) {
        try {
            const snapshot = await this.db.collection('notifications')
                .where('userId', '==', userId)
                .where('read', '==', false)
                .get();
            
            const batch = this.db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { read: true });
            });
            
            await batch.commit();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // Редактирование профиля
    async updateUserProfile(userId, data) {
        try {
            await this.db.collection('users').doc(userId).update({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // Аналитика для студии
    async getChannelAnalytics(userId, period = 'week') {
        try {
            const now = new Date();
            let startDate;
            
            switch (period) {
                case 'day':
                    startDate = new Date(now.setDate(now.getDate() - 1));
                    break;
                case 'week':
                    startDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case 'month':
                    startDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
                default:
                    startDate = new Date(now.setDate(now.getDate() - 7));
            }
            
            // Получаем видео пользователя за период
            const videosSnapshot = await this.db.collection('videos')
                .where('userId', '==', userId)
                .where('createdAt', '>=', startDate)
                .get();
            
            let totalViews = 0;
            let totalLikes = 0;
            let totalComments = 0;
            let videosCount = 0;
            
            videosSnapshot.forEach(doc => {
                const video = doc.data();
                totalViews += video.views || 0;
                totalLikes += video.likes || 0;
                totalComments += video.comments || 0;
                videosCount++;
            });
            
            // Получаем статистику подписчиков
            const userDoc = await this.db.collection('users').doc(userId).get();
            const userData = userDoc.data();
            const subscribers = userData.subscribers || 0;
            
            return {
                success: true,
                analytics: {
                    views: totalViews,
                    likes: totalLikes,
                    comments: totalComments,
                    videos: videosCount,
                    subscribers: subscribers,
                    period: period
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async getUserVideos(userId, limit = 20) {
        try {
            const snapshot = await this.db.collection('videos')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            
            const videos = [];
            snapshot.forEach(doc => {
                videos.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return { success: true, videos };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // Форматирование текста комментария
    formatCommentText(text) {
        // Заменяем *текст* на <strong>текст</strong>
        return text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    }
    
    // Проверка достижений
    async checkAchievements(userId) {
        try {
            const userDoc = await this.db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                return { success: false, error: 'Пользователь не найден' };
            }
            
            const userData = userDoc.data();
            const subscribers = userData.subscribers || 0;
            const lastAchievementCheck = userData.lastAchievementCheck || 0;
            
            const achievements = [];
            
            // Проверяем достижения по подписчикам
            if (subscribers >= 10 && (lastAchievementCheck < 10 || !lastAchievementCheck)) {
                achievements.push({
                    type: 'subscribers',
                    count: 10,
                    message: '🎉 Вы набрали 10 подписчиков!'
                });
            }
            
            if (subscribers >= 50 && (lastAchievementCheck < 50 || !lastAchievementCheck)) {
                achievements.push({
                    type: 'subscribers',
                    count: 50,
                    message: '🎉 Вы набрали 50 подписчиков!'
                });
            }
            
            if (subscribers >= 100 && (lastAchievementCheck < 100 || !lastAchievementCheck)) {
                achievements.push({
                    type: 'subscribers',
                    count: 100,
                    message: '🎉 Вы набрали 100 подписчиков! Вы получили галочку от HubTube!'
                });
            }
            
            // Обновляем последнюю проверку достижений
            if (achievements.length > 0) {
                const maxAchievement = Math.max(...achievements.map(a => a.count));
                await this.db.collection('users').doc(userId).update({
                    lastAchievementCheck: maxAchievement
                });
            }
            
            return { success: true, achievements };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// ==============================================
// ОСНОВНОЙ КОД ПРИЛОЖЕНИЯ
// ==============================================

// Инициализация Firebase менеджера
const firebaseManager = new FirebaseManager();

// DOM элементы
const videoGrid = document.getElementById('videoGrid');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const authButtons = document.getElementById('authButtons');
const loggedInButtons = document.getElementById('loggedInButtons');
const userButton = document.getElementById('userButton');
const userAvatar = document.getElementById('userAvatar');
const username = document.getElementById('username');
const uploadBtn = document.getElementById('uploadBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const categories = document.getElementById('categories');
const themesContainer = document.getElementById('themesContainer');
const studioBtn = document.getElementById('studioBtn');

// Уведомления
const notificationsBtn = document.getElementById('notificationsBtn');
const notificationsDropdown = document.getElementById('notificationsDropdown');
const notificationsList = document.getElementById('notificationsList');
const notificationBadge = document.getElementById('notificationBadge');
const markAllAsReadBtn = document.getElementById('markAllAsRead');

// Модальные окна
const authModal = document.getElementById('authModal');
const uploadModal = document.getElementById('uploadModal');
const videoPlayerModal = document.getElementById('videoPlayerModal');
const editProfileModal = document.getElementById('editProfileModal');

// Формы
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const uploadForm = document.getElementById('uploadForm');
const editProfileForm = document.getElementById('editProfileForm');

// Комментарии
const commentInput = document.getElementById('commentInput');
const submitComment = document.getElementById('submitComment');
const commentsList = document.getElementById('commentsList');
const commentsCount = document.getElementById('commentsCount');

// Лайки
const likeBtn = document.getElementById('likeBtn');
const likeCount = document.getElementById('likeCount');

// Текущий пользователь и состояние
let currentUser = null;
let currentUserData = null;
let currentCategory = 'all';
let currentVideo = null;
let currentTheme = 'all';
let isSubscribed = false;
let isLiked = false;
let currentComments = [];
let unreadNotifications = 0;

// ==============================================
// ФУНКЦИИ РЕНДЕРИНГА
// ==============================================

// Рендеринг видео
async function renderVideos(videos = []) {
    videoGrid.innerHTML = '';
    
    if (videos.length === 0) {
        videoGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-video-slash"></i>
                <h3>Видео не найдены</h3>
                <p>Будьте первым, кто загрузит видео на HubTube!</p>
                ${currentUser ? 
                    `<button class="btn btn-upload" style="margin-top: 20px;" onclick="showUploadModal()">
                        <i class="fas fa-upload"></i> Загрузить видео
                    </button>` : 
                    ''
                }
            </div>
        `;
        return;
    }
    
    for (const video of videos) {
        // Фильтрация по теме
        if (currentTheme !== 'all' && video.theme !== currentTheme) {
            continue;
        }
        
        const videoCard = document.createElement('div');
        videoCard.className = `video-card fade-in ${video.type === 'short' ? 'short' : ''}`;
        
        const videoDate = video.createdAt ? formatDate(video.createdAt.toDate()) : 'Недавно';
        const isShort = video.type === 'short';
        
        videoCard.innerHTML = `
            <div class="thumbnail">
                <img src="${video.thumbnail || firebaseManager.getDefaultThumbnail(video.category)}" 
                     alt="${video.title}"
                     onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?w=1280&h=720&fit=crop'">
                <div class="video-duration">${video.duration}</div>
                ${isShort ? '<div class="short-badge">SHORTS</div>' : ''}
                <div class="play-button">
                    <i class="fas fa-play" style="font-size: 24px;"></i>
                </div>
            </div>
            <div class="video-info">
                <h3 class="video-title">${video.title}</h3>
                <p class="video-description">${video.description || 'Нет описания'}</p>
                <div class="channel-info">
                    <div class="channel-avatar" style="background: ${video.avatarColor}">
                        ${video.username ? video.username.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                        <div class="channel-name">
                            <span>${video.username || 'Неизвестный автор'}</span>
                            ${video.isVerified ? '<span class="verified-badge"><i class="fas fa-check-circle"></i></span>' : ''}
                        </div>
                        <div>${formatViews(video.views)} просмотров • ${videoDate}</div>
                    </div>
                </div>
                <div class="video-meta">
                    <span><i class="fas fa-tag"></i> ${getCategoryName(video.category)}</span>
                    <span><i class="fas fa-thumbs-up"></i> ${video.likes}</span>
                    ${video.comments ? `<span><i class="fas fa-comment"></i> ${video.comments}</span>` : ''}
                </div>
            </div>
        `;
        
        videoCard.addEventListener('click', () => {
            playVideo(video);
        });
        
        videoGrid.appendChild(videoCard);
    }
}

// Рендеринг комментариев
function renderComments(comments) {
    commentsList.innerHTML = '';
    currentComments = comments;
    
    if (comments.length === 0) {
        commentsList.innerHTML = `
            <div class="empty-state" style="padding: 20px 0;">
                <p>Пока нет комментариев. Будьте первым!</p>
            </div>
        `;
        return;
    }
    
    // Находим закрепленный комментарий
    const pinnedComment = comments.find(c => c.isPinned);
    if (pinnedComment) {
        const pinnedElement = createCommentElement(pinnedComment, true);
        document.getElementById('pinnedComment').style.display = 'block';
        document.getElementById('pinnedCommentContent').innerHTML = `
            <div class="comment-author-name">${pinnedComment.username}</div>
            <div class="comment-text">${pinnedComment.text}</div>
            ${pinnedComment.isHearted ? '<div class="heart-comment"><i class="fas fa-heart"></i> Сердечко от автора</div>' : ''}
        `;
    }
    
    // Рендерим остальные комментарии
    const otherComments = comments.filter(c => !c.isPinned);
    otherComments.forEach(comment => {
        const commentElement = createCommentElement(comment, false);
        commentsList.appendChild(commentElement);
        
        // Загружаем ответы на комментарии
        loadReplies(comment.id, commentElement);
    });
}

function createCommentElement(comment, isPinned = false) {
    const commentElement = document.createElement('div');
    commentElement.className = `comment-item ${isPinned ? 'pinned' : ''}`;
    commentElement.dataset.commentId = comment.id;
    
    const commentDate = comment.createdAt ? formatDate(comment.createdAt.toDate()) : 'только что';
    
    commentElement.innerHTML = `
        <div class="comment-avatar" style="background: ${comment.avatarColor}">
            ${comment.username ? comment.username.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="comment-body">
            <div class="comment-meta">
                <span class="comment-author-name">${comment.username}</span>
                <span class="comment-time">${commentDate}</span>
            </div>
            <div class="comment-text">${comment.text}</div>
            <div class="comment-actions">
                <button class="comment-action-btn like-comment ${comment.likedBy && comment.likedBy.includes(currentUser?.uid) ? 'liked' : ''}" 
                        data-comment-id="${comment.id}">
                    <i class="fas fa-thumbs-up"></i>
                    <span class="like-count">${comment.likes || 0}</span>
                </button>
                <button class="comment-action-btn reply-comment" data-comment-id="${comment.id}">
                    <i class="fas fa-reply"></i> Ответить
                </button>
                ${currentVideo && currentVideo.userId === currentUser?.uid ? `
                    <button class="comment-action-btn pin-comment" data-comment-id="${comment.id}" data-video-id="${currentVideo.id}">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                    <button class="comment-action-btn heart-comment-btn" data-comment-id="${comment.id}" data-video-id="${currentVideo.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                ` : ''}
            </div>
            <div class="comment-replies" id="replies-${comment.id}"></div>
        </div>
    `;
    
    return commentElement;
}

async function loadReplies(commentId, commentElement) {
    const result = await firebaseManager.getReplies(commentId);
    if (result.success && result.replies.length > 0) {
        const repliesContainer = commentElement.querySelector(`#replies-${commentId}`);
        if (repliesContainer) {
            result.replies.forEach(reply => {
                const replyElement = createCommentElement(reply);
                replyElement.classList.add('reply');
                replyElement.style.marginLeft = '20px';
                repliesContainer.appendChild(replyElement);
            });
        }
    }
}

// Рендеринг уведомлений
function renderNotifications(notifications) {
    notificationsList.innerHTML = '';
    unreadNotifications = notifications.filter(n => !n.read).length;
    
    if (notifications.length === 0) {
        notificationsList.innerHTML = `
            <div class="notification-item">
                <div class="notification-content">Нет уведомлений</div>
            </div>
        `;
        notificationBadge.style.display = 'none';
        return;
    }
    
    if (unreadNotifications > 0) {
        notificationBadge.textContent = unreadNotifications;
        notificationBadge.style.display = 'flex';
    } else {
        notificationBadge.style.display = 'none';
    }
    
    notifications.forEach(notification => {
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification-item ${notification.read ? '' : 'unread'}`;
        notificationElement.dataset.notificationId = notification.id;
        
        const timeAgo = notification.createdAt ? formatDate(notification.createdAt.toDate()) : 'только что';
        let content = '';
        
        switch (notification.type) {
            case 'subscribers':
                content = `🎉 ${notification.data.message}`;
                break;
            case 'comment':
                content = `💬 ${notification.data.username} прокомментировал ваше видео "${notification.data.videoTitle}"`;
                break;
            case 'like':
                content = `👍 ${notification.data.username} поставил лайк вашему видео "${notification.data.videoTitle}"`;
                break;
            case 'reply':
                content = `💬 ${notification.data.username} ответил на ваш комментарий`;
                break;
            default:
                content = notification.data.message || 'Новое уведомление';
        }
        
        notificationElement.innerHTML = `
            <div class="notification-content">${content}</div>
            <div class="notification-time">${timeAgo}</div>
        `;
        
        notificationElement.addEventListener('click', () => {
            markNotificationAsRead(notification.id);
        });
        
        notificationsList.appendChild(notificationElement);
    });
}

// ==============================================
// ФУНКЦИИ КОММЕНТАРИЕВ
// ==============================================

// Добавление комментария
async function addComment() {
    if (!currentUser) {
        showModal(authModal);
        return;
    }
    
    const text = commentInput.value.trim();
    if (!text) {
        showAlert(null, 'Введите текст комментария', 'error');
        return;
    }
    
    const result = await firebaseManager.addComment(currentVideo.id, text);
    if (result.success) {
        commentInput.value = '';
        loadComments(currentVideo.id);
        showAlert(null, 'Комментарий добавлен', 'success');
    } else {
        showAlert(null, result.error, 'error');
    }
}

// Загрузка комментариев
async function loadComments(videoId) {
    const result = await firebaseManager.getComments(videoId);
    if (result.success) {
        renderComments(result.comments);
        commentsCount.textContent = result.comments.length;
    }
}

// Лайк комментария
async function likeComment(commentId) {
    if (!currentUser) {
        showModal(authModal);
        return;
    }
    
    const result = await firebaseManager.toggleLikeComment(commentId, currentUser.uid);
    if (result.success) {
        loadComments(currentVideo.id);
    }
}

// Закрепление комментария
async function pinComment(commentId, videoId) {
    if (!currentUser || currentVideo.userId !== currentUser.uid) {
        showAlert(null, 'Только автор видео может закреплять комментарии', 'error');
        return;
    }
    
    const result = await firebaseManager.togglePinComment(commentId, videoId, currentUser.uid);
    if (result.success) {
        loadComments(currentVideo.id);
        showAlert(null, result.pinned ? 'Комментарий закреплен' : 'Комментарий откреплен', 'success');
    } else {
        showAlert(null, result.error, 'error');
    }
}

// Сердечко от автора
async function heartComment(commentId, videoId) {
    if (!currentUser || currentVideo.userId !== currentUser.uid) {
        showAlert(null, 'Только автор видео может ставить сердечки', 'error');
        return;
    }
    
    const result = await firebaseManager.toggleHeartComment(commentId, videoId, currentUser.uid);
    if (result.success) {
        loadComments(currentVideo.id);
        showAlert(null, result.hearted ? 'Сердечко добавлено' : 'Сердечко убрано', 'success');
    } else {
        showAlert(null, result.error, 'error');
    }
}

// ==============================================
// ФУНКЦИИ УВЕДОМЛЕНИЙ
// ==============================================

// Загрузка уведомлений
async function loadNotifications() {
    if (!currentUser) return;
    
    const result = await firebaseManager.getNotifications(currentUser.uid);
    if (result.success) {
        renderNotifications(result.notifications);
    }
}

// Отметка уведомления как прочитанного
async function markNotificationAsRead(notificationId) {
    const result = await firebaseManager.markNotificationAsRead(notificationId);
    if (result.success) {
        loadNotifications();
    }
}

// Отметить все как прочитанные
async function markAllNotificationsAsRead() {
    if (!currentUser) return;
    
    const result = await firebaseManager.markAllNotificationsAsRead(currentUser.uid);
    if (result.success) {
        loadNotifications();
        showAlert(null, 'Все уведомления прочитаны', 'success');
    }
}

// Проверка достижений
async function checkAchievements() {
    if (!currentUser) return;
    
    const result = await firebaseManager.checkAchievements(currentUser.uid);
    if (result.success && result.achievements.length > 0) {
        result.achievements.forEach(achievement => {
            // Создаем уведомление
            firebaseManager.createNotification(currentUser.uid, 'subscribers', {
                message: achievement.message
            });
            
            // Показываем всплывающее уведомление
            showAlert(null, achievement.message, 'success');
        });
        
        loadNotifications();
    }
}

// ==============================================
// ФУНКЦИИ ПРОФИЛЯ
// ==============================================

// Показать редактор профиля
function showEditProfileModal() {
    if (!currentUser) return;
    
    document.getElementById('editUsername').value = currentUserData.username || '';
    document.getElementById('editBio').value = currentUserData.bio || '';
    document.getElementById('editAvatarUrl').value = currentUserData.avatarUrl || '';
    document.getElementById('editBannerUrl').value = currentUserData.bannerUrl || '';
    document.getElementById('editLinks').value = currentUserData.links ? currentUserData.links.join('\n') : '';
    
    showModal(editProfileModal);
}

// Сохранение профиля
editProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) return;
    
    const username = document.getElementById('editUsername').value.trim();
    const bio = document.getElementById('editBio').value.trim();
    const avatarUrl = document.getElementById('editAvatarUrl').value.trim();
    const bannerUrl = document.getElementById('editBannerUrl').value.trim();
    const links = document.getElementById('editLinks').value.trim();
    
    if (!username) {
        showAlert(document.getElementById('editProfileAlert'), 'Введите имя канала', 'error');
        return;
    }
    
    const updateData = {
        username: username,
        bio: bio,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (avatarUrl) updateData.avatarUrl = avatarUrl;
    if (bannerUrl) updateData.bannerUrl = bannerUrl;
    if (links) {
        updateData.links = links.split('\n').map(link => link.trim()).filter(link => link);
    }
    
    const result = await firebaseManager.updateUserProfile(currentUser.uid, updateData);
    if (result.success) {
        // Обновляем данные пользователя
        const userData = await firebaseManager.getUserData(currentUser.uid);
        if (userData.success) {
            currentUserData = userData.data;
            updateUI();
        }
        
        hideModal(editProfileModal);
        showAlert(null, 'Профиль успешно обновлен', 'success');
    } else {
        showAlert(document.getElementById('editProfileAlert'), result.error, 'error');
    }
});

// ==============================================
// ФУНКЦИИ ЛАЙКОВ
// ==============================================

// Лайк видео
async function toggleLikeVideo() {
    if (!currentUser) {
        showModal(authModal);
        return;
    }
    
    if (!currentVideo) return;
    
    const result = await firebaseManager.toggleLike(currentVideo.id, currentUser.uid);
    if (result.success) {
        isLiked = result.liked;
        updateLikeButton();
        loadVideos(); // Обновляем список видео
    }
}

function updateLikeButton() {
    if (isLiked) {
        likeBtn.classList.add('liked');
        likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i> <span id="likeCount">' + (currentVideo.likes || 0) + '</span>';
    } else {
        likeBtn.classList.remove('liked');
        likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i> <span id="likeCount">' + (currentVideo.likes || 0) + '</span>';
    }
}

// ==============================================
// ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ СОБЫТИЙ
// ==============================================

// Тематика
themesContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('theme-btn')) {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        e.target.classList.add('active');
        currentTheme = e.target.dataset.theme;
        loadVideos();
    }
});

// Уведомления
notificationsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = notificationsDropdown.style.display === 'block';
    notificationsDropdown.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        loadNotifications();
    }
});

markAllAsReadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    markAllNotificationsAsRead();
});

// Закрытие уведомлений при клике вне
document.addEventListener('click', () => {
    notificationsDropdown.style.display = 'none';
});

// Комментарии
submitComment.addEventListener('click', addComment);
commentInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addComment();
    }
});

// Делегирование событий для комментариев
commentsList.addEventListener('click', (e) => {
    const likeBtn = e.target.closest('.like-comment');
    const replyBtn = e.target.closest('.reply-comment');
    const pinBtn = e.target.closest('.pin-comment');
    const heartBtn = e.target.closest('.heart-comment-btn');
    
    if (likeBtn) {
        const commentId = likeBtn.dataset.commentId;
        likeComment(commentId);
    }
    
    if (replyBtn) {
        const commentId = replyBtn.dataset.commentId;
        // Реализация ответов на комментарии
        commentInput.focus();
        commentInput.value = `@${currentComments.find(c => c.id === commentId)?.username || ''} `;
    }
    
    if (pinBtn) {
        const commentId = pinBtn.dataset.commentId;
        const videoId = pinBtn.dataset.videoId;
        pinComment(commentId, videoId);
    }
    
    if (heartBtn) {
        const commentId = heartBtn.dataset.commentId;
        const videoId = heartBtn.dataset.videoId;
        heartComment(commentId, videoId);
    }
});

// Лайки
likeBtn.addEventListener('click', toggleLikeVideo);

// Студия
studioBtn.addEventListener('click', () => {
    if (!currentUser) {
        showModal(authModal);
        return;
    }
    
    // Открываем студию в новом окне
    window.open('studio.html', '_blank');
});

// Редактирование профиля в выпадающем меню
function showUserDropdown() {
    // ... предыдущий код ...
    
    // Добавляем пункт редактирования профиля
    dropdown.innerHTML = `
        <div class="dropdown-item" onclick="window.location.href='studio.html'">
            <i class="fas fa-tv"></i>
            <span>Студия</span>
        </div>
        <div class="dropdown-item" onclick="showEditProfileModal()">
            <i class="fas fa-user-edit"></i>
            <span>Редактировать профиль</span>
        </div>
        <div class="dropdown-item" onclick="window.open('settings.html', '_blank')">
            <i class="fas fa-cog"></i>
            <span>Настройки</span>
        </div>
        <div class="dropdown-item logout" onclick="logout()">
            <i class="fas fa-sign-out-alt"></i>
            <span>Выйти</span>
        </div>
    `;
    
    // ... остальной код ...
}

// ==============================================
// ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================

// Показ видеоплеера (обновленная версия)
async function playVideo(video) {
    try {
        currentVideo = video;
        
        // Увеличиваем счетчик просмотров
        await firebaseManager.incrementViews(video.id);
        
        // Проверяем, лайкнул ли пользователь видео
        if (currentUser) {
            const likeResult = await firebaseManager.toggleLike(video.id, currentUser.uid);
            if (likeResult.success) {
                isLiked = likeResult.liked;
            }
        }
        
        // Обновляем информацию о видео
        // ... предыдущий код ...
        
        // Загружаем комментарии
        loadComments(video.id);
        
        // Обновляем кнопку лайка
        updateLikeButton();
        
        // Обновляем кнопку подписки
        await updateSubscribeButton();
        
        showModal(videoPlayerModal);
    } catch (error) {
        console.error('Ошибка при воспроизведении видео:', error);
        showAlert(null, 'Ошибка при загрузке видео', 'error');
    }
}

// Загрузка видео (обновленная)
async function loadVideos() {
    // Показываем скелетоны загрузки
    videoGrid.innerHTML = `
        <div class="video-card skeleton" style="height: 320px;"></div>
        <div class="video-card skeleton" style="height: 320px;"></div>
        <div class="video-card skeleton" style="height: 320px;"></div>
        <div class="video-card skeleton" style="height: 320px;"></div>
    `;
    
    const result = await firebaseManager.getVideos(20, currentCategory === 'all' ? null : currentCategory);
    if (result.success) {
        // Фильтруем по типу (Shorts или обычные видео)
        let filteredVideos = result.videos;
        if (currentCategory === 'short') {
            filteredVideos = result.videos.filter(video => video.type === 'short');
        } else if (currentCategory !== 'all') {
            filteredVideos = result.videos.filter(video => video.type !== 'short');
        }
        
        renderVideos(filteredVideos);
    } else {
        videoGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Ошибка загрузки видео</h3>
                <p>${result.error}</p>
            </div>
        `;
    }
}

// Обновление UI
function updateUI() {
    if (currentUser && currentUserData) {
        authButtons.style.display = 'none';
        loggedInButtons.style.display = 'flex';
        
        // Используем кастомный аватар если есть
        if (currentUserData.avatarUrl) {
            userAvatar.innerHTML = `<img src="${currentUserData.avatarUrl}" alt="${currentUserData.username}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            userAvatar.textContent = currentUserData.username.charAt(0).toUpperCase();
            userAvatar.style.background = currentUserData.avatarColor;
        }
        
        username.textContent = currentUserData.username;
        
        // Загружаем уведомления
        loadNotifications();
        
        // Проверяем достижения
        checkAchievements();
    } else {
        authButtons.style.display = 'flex';
        loggedInButtons.style.display = 'none';
        notificationBadge.style.display = 'none';
    }
    loadVideos();
}

// ==============================================
// ИНИЦИАЛИЗАЦИЯ
// ==============================================

// Проверка состояния авторизации при загрузке
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const result = await firebaseManager.getUserData(user.uid);
        if (result.success) {
            currentUser = user;
            currentUserData = result.data;
            updateUI();
        }
    } else {
        currentUser = null;
        currentUserData = null;
        updateUI();
    }
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadVideos();
    console.log('HubTube загружен успешно!');
});

// Глобальные функции
window.showEditProfileModal = showEditProfileModal;
window.logout = logout;
window.showUploadModal = showUploadModal;
