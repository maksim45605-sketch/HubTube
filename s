<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Настройки HubTube</title>
    
    <!-- Иконки -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- Firebase -->
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
    
    <!-- Стили -->
    <link rel="stylesheet" href="style.css">
    
    <!-- Конфигурация Firebase -->
    <script src="firebase-config.js"></script>
</head>
<body>
    <div class="settings-container">
        <!-- Header -->
        <header class="settings-header">
            <div class="settings-header-content">
                <a href="index.html" class="btn-back">
                    <i class="fas fa-arrow-left"></i> Назад
                </a>
                <h1>Настройки</h1>
            </div>
        </header>
        
        <main class="settings-main">
            <!-- Аккаунт -->
            <section class="settings-section">
                <h2><i class="fas fa-user"></i> Аккаунт</h2>
                <div class="setting-item">
                    <div class="setting-label">Имя пользователя</div>
                    <div class="setting-control">
                        <span id="currentUsername">Загрузка...</span>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Email</div>
                    <div class="setting-control">
                        <span id="currentEmail">Загрузка...</span>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Изменить пароль</div>
                    <div class="setting-control">
                        <button class="btn-text" id="changePasswordBtn">Изменить</button>
                    </div>
                </div>
            </section>
            
            <!-- Внешний вид -->
            <section class="settings-section">
                <h2><i class="fas fa-palette"></i> Внешний вид</h2>
                <div class="setting-item">
                    <div class="setting-label">Тема</div>
                    <div class="setting-control">
                        <div class="theme-selector">
                            <div class="theme-option dark active" data-theme="dark"></div>
                            <div class="theme-option light" data-theme="light"></div>
                            <div class="theme-option auto" data-theme="auto"></div>
                        </div>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Язык</div>
                    <div class="setting-control">
                        <select class="form-select" id="languageSelect">
                            <option value="ru">Русский</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                </div>
            </section>
            
            <!-- Уведомления -->
            <section class="settings-section">
                <h2><i class="fas fa-bell"></i> Уведомления</h2>
                <div class="setting-item">
                    <div class="setting-label">Уведомления о подписчиках</div>
                    <div class="setting-control">
                        <label class="switch">
                            <input type="checkbox" id="subscriberNotifications" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Уведомления о комментариях</div>
                    <div class="setting-control">
                        <label class="switch">
                            <input type="checkbox" id="commentNotifications" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Уведомления о лайках</div>
                    <div class="setting-control">
                        <label class="switch">
                            <input type="checkbox" id="likeNotifications" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </section>
            
            <!-- Конфиденциальность -->
            <section class="settings-section">
                <h2><i class="fas fa-lock"></i> Конфиденциальность</h2>
                <div class="setting-item">
                    <div class="setting-label">Приватный аккаунт</div>
                    <div class="setting-control">
                        <label class="switch">
                            <input type="checkbox" id="privateAccount">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Скрыть просмотры</div>
                    <div class="setting-control">
                        <label class="switch">
                            <input type="checkbox" id="hideViews">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </section>
            
            <!-- Опасная зона -->
            <section class="settings-section danger-zone">
                <h2><i class="fas fa-exclamation-triangle"></i> Опасная зона</h2>
                <div class="setting-item">
                    <div class="setting-label">Удалить все видео</div>
                    <div class="setting-control">
                        <button class="btn-danger" id="deleteVideosBtn">Удалить</button>
                    </div>
                </div>
                <div class="setting-item">
                    <div class="setting-label">Удалить аккаунт</div>
                    <div class="setting-control">
                        <button class="btn-danger" id="deleteAccountBtn">Удалить</button>
                    </div>
                </div>
            </section>
        </main>
    </div>
    
    <script>
        class SettingsManager {
            constructor() {
                this.auth = auth;
                this.currentUser = null;
                this.settings = {
                    theme: 'dark',
                    language: 'ru',
                    notifications: {
                        subscribers: true,
                        comments: true,
                        likes: true
                    },
                    privacy: {
                        privateAccount: false,
                        hideViews: false
                    }
                };
            }
            
            async init() {
                this.auth.onAuthStateChanged(async (user) => {
                    if (user) {
                        this.currentUser = user;
                        await this.loadUserData();
                        await this.loadSettings();
                        this.setupEventListeners();
                    } else {
                        window.location.href = 'index.html';
                    }
                });
            }
            
            async loadUserData() {
                document.getElementById('currentUsername').textContent = this.currentUser.displayName || 'Пользователь';
                document.getElementById('currentEmail').textContent = this.currentUser.email || 'Не указан';
            }
            
            async loadSettings() {
                // Загружаем настройки из localStorage
                const savedSettings = localStorage.getItem('hubtube_settings');
                if (savedSettings) {
                    this.settings = JSON.parse(savedSettings);
                }
                
                // Применяем настройки
                this.applySettings();
            }
            
            applySettings() {
                // Тема
                const theme = this.settings.theme;
                document.querySelectorAll('.theme-option').forEach(option => {
                    option.classList.remove('active');
                    if (option.dataset.theme === theme) {
                        option.classList.add('active');
                    }
                });
                
                // Язык
                document.getElementById('languageSelect').value = this.settings.language;
                
                // Уведомления
                document.getElementById('subscriberNotifications').checked = this.settings.notifications.subscribers;
                document.getElementById('commentNotifications').checked = this.settings.notifications.comments;
                document.getElementById('likeNotifications').checked = this.settings.notifications.likes;
                
                // Конфиденциальность
                document.getElementById('privateAccount').checked = this.settings.privacy.privateAccount;
                document.getElementById('hideViews').checked = this.settings.privacy.hideViews;
            }
            
            saveSettings() {
                localStorage.setItem('hubtube_settings', JSON.stringify(this.settings));
            }
            
            setupEventListeners() {
                // Тема
                document.querySelectorAll('.theme-option').forEach(option => {
                    option.addEventListener('click', () => {
                        this.settings.theme = option.dataset.theme;
                        this.saveSettings();
                        this.applySettings();
                        this.applyTheme();
                    });
                });
                
                // Язык
                document.getElementById('languageSelect').addEventListener('change', (e) => {
                    this.settings.language = e.target.value;
                    this.saveSettings();
                });
                
                // Уведомления
                document.getElementById('subscriberNotifications').addEventListener('change', (e) => {
                    this.settings.notifications.subscribers = e.target.checked;
                    this.saveSettings();
                });
                
                document.getElementById('commentNotifications').addEventListener('change', (e) => {
                    this.settings.notifications.comments = e.target.checked;
                    this.saveSettings();
                });
                
                document.getElementById('likeNotifications').addEventListener('change', (e) => {
                    this.settings.notifications.likes = e.target.checked;
                    this.saveSettings();
                });
                
                // Конфиденциальность
                document.getElementById('privateAccount').addEventListener('change', (e) => {
                    this.settings.privacy.privateAccount = e.target.checked;
                    this.saveSettings();
                });
                
                document.getElementById('hideViews').addEventListener('change', (e) => {
                    this.settings.privacy.hideViews = e.target.checked;
                    this.saveSettings();
                });
                
                // Кнопки
                document.getElementById('changePasswordBtn').addEventListener('click', () => {
                    this.changePassword();
                });
                
                document.getElementById('deleteVideosBtn').addEventListener('click', () => {
                    if (confirm('Вы уверены, что хотите удалить все видео? Это действие нельзя отменить.')) {
                        this.deleteAllVideos();
                    }
                });
                
                document.getElementById('deleteAccountBtn').addEventListener('click', () => {
                    if (confirm('Вы уверены, что хотите удалить аккаунт? Все ваши данные будут удалены без возможности восстановления.')) {
                        this.deleteAccount();
                    }
                });
            }
            
            applyTheme() {
                const theme = this.settings.theme;
                let themeClass = 'dark';
                
                if (theme === 'light') {
                    themeClass = 'light';
                } else if (theme === 'auto') {
                    // Автоматическое определение темы
                    themeClass = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                
                document.documentElement.className = themeClass;
                
                // Сохраняем тему в body для совместимости
                document.body.dataset.theme = themeClass;
            }
            
            async changePassword() {
                const newPassword = prompt('Введите новый пароль (минимум 6 символов):');
                if (!newPassword || newPassword.length < 6) {
                    alert('Пароль должен содержать не менее 6 символов');
                    return;
                }
                
                const confirmPassword = prompt('Подтвердите новый пароль:');
                if (newPassword !== confirmPassword) {
                    alert('Пароли не совпадают');
                    return;
                }
                
                try {
                    await this.currentUser.updatePassword(newPassword);
                    alert('Пароль успешно изменен!');
                } catch (error) {
                    alert('Ошибка при изменении пароля: ' + error.message);
                }
            }
            
            async deleteAllVideos() {
                // В реальном приложении здесь бы удалялись все видео пользователя
                alert('Функция удаления всех видео в разработке');
            }
            
            async deleteAccount() {
                try {
                    await this.currentUser.delete();
                    alert('Аккаунт успешно удален');
                    window.location.href = 'index.html';
                } catch (error) {
                    alert('Ошибка при удалении аккаунта: ' + error.message);
                }
            }
        }
        
        // Инициализация настроек
        document.addEventListener('DOMContentLoaded', () => {
            const settings = new SettingsManager();
            settings.init();
        });
    </script>
    
    <style>
        .settings-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .settings-header {
            background: var(--bg-surface);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
        }
        
        .settings-header-content {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .settings-header h1 {
            font-size: 28px;
            margin: 0;
        }
        
        .settings-main {
            display: flex;
            flex-direction: column;
            gap: 30px;
        }
        
        .settings-section h2 {
            font-size: 20px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .danger-zone {
            border: 2px solid var(--red-500);
        }
        
        .danger-zone h2 {
            color: var(--red-500);
        }
        
        .btn-danger {
            background: var(--red-500);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
        }
        
        .btn-danger:hover {
            background: #dc2626;
        }
        
        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--bg-surface-light);
            transition: .4s;
            border-radius: 24px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 4px;
            background-color: var(--text-primary);
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: var(--purple-500);
        }
        
        input:checked + .slider:before {
            transform: translateX(26px);
        }
        
        @media (max-width: 768px) {
            .settings-container {
                padding: 10px;
            }
            
            .settings-section {
                padding: 15px;
            }
        }
    </style>
</body>
</html>
