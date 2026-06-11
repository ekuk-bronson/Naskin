/**
 * Lightweight i18n for FreeSkin (RU / EN).
 *
 * Usage:
 *   import { t, useLocale } from '../services/i18n';
 *   const { locale, setLocale } = useLocale();   // re-renders on locale change
 *   <Text>{t('login.signInGoogle')}</Text>
 *
 * Translations live in this single file — keep keys flat & namespaced by screen.
 */
import { useSyncExternalStore } from 'react';
import { getSetting, setSetting } from './storage';

export type Locale = 'ru' | 'en';

const dict: Record<Locale, Record<string, string>> = {
  ru: {
    // Common
    'common.continue':       'Продолжить',
    'common.cancel':         'Отмена',
    'common.save':           'Сохранить',
    'common.delete':         'Удалить',
    'common.back':           'Назад',
    'common.next':           'Далее →',
    'common.done':           'Готово',
    'common.loading':        'Загрузка…',
    'common.error':          'Ошибка',
    'common.ok':             'Понятно',

    // Disclaimer
    'disclaimer':            'Это не диагноз. FreeSkin не является медицинским устройством. Обратитесь к врачу.',

    // Login
    'login.tagline':         'AI · Дерматоскрининг',
    'login.heroTitle':       'Мониторинг родинок\nна вашем смартфоне',
    'login.heroSub':         'Анализ по критериям ABCDE, история изменений\nи отчёт для врача — всё в одном месте.',
    'login.signInGoogle':    'Войти через Google',
    'login.guest':           'Продолжить без аккаунта',
    'login.guestTitle':      'Без входа',
    'login.guestMsg':        'Данные сохраняются только на этом устройстве. Перенос в Google-аккаунт позже невозможен.',
    'login.configNote':      '⚙ Настройте Google Client IDs в файле .env\n(подробности в services/auth.ts)',
    'login.errAuth':         'Ошибка авторизации. Попробуйте ещё раз.',
    'login.errProfile':      'Ошибка при загрузке профиля.',
    'login.errTimeout':      'Превышено время ожидания. Проверьте интернет.',

    // Tabs
    'tab.home':              'Главная',
    'tab.history':           'История',
    'tab.profile':           'Отчёт',
    'tab.settings':          'Настройки',

    // Home
    'home.title':            'Мои родинки',
    'home.heroTotal':        'ВСЕГО РОДИНОК',
    'home.heroNorm':         'норма',
    'home.heroLastCheck':    'Последний осмотр:',
    'home.heroEmpty':        'Начните мониторинг',
    'home.alertTitle':       'Требует внимания',
    'home.alertSub':         'изменилась',
    'home.section':          'ВСЕ РОДИНКИ',
    'home.sortDate':         'По дате',
    'home.sortScore':        'По риску',
    'home.sortName':         'А–Я',
    'home.emptyTitle':       'Записей нет',
    'home.emptyHint':        'Нажмите «Добавить родинку» для первого снимка',
    'home.add':              '＋ Добавить родинку',
    'home.confirmDelete':    'Удалить родинку',
    'home.confirmDeleteMsg': 'будет удалена навсегда. Это действие нельзя отменить.',

    // History
    'history.title':         'История',
    'history.subtitle':      'Динамика всех родинок',
    'history.statTotal':     'Всего',
    'history.statMod':       'Умерен.',
    'history.statHigh':      'Высокий',
    'history.statObs':       'Замеров',
    'history.empty':         'История пуста',
    'history.emptyHint':     'Сделайте первый снимок и начните мониторинг',
    'history.cta':           '＋ Добавить родинку',

    // Result
    'result.notFound':       'Запись не найдена',
    'result.changed':        '⚠ Изменилась',
    'result.tabAnalysis':    'Анализ',
    'result.tabHistory':     'История',
    'result.tabCompare':     'Сравнение',
    'result.rescan':         '📷  Сделать новый снимок',
    'result.compareNeeds':   'Нужно минимум 2 замера для сравнения',
    'result.dynamic':        'Динамика',
    'result.dynStable':      'Стабильная',
    'result.dynRising':      'Усиливается',
    'result.dynFalling':     'Снижается',
    'result.measurements':   'Замеров',
    'result.currentLevel':   'Текущая категория',

    // Settings
    'settings.title':        'Настройки',
    'settings.subtitle':     'Персонализация и данные',
    'settings.secInterface': 'ИНТЕРФЕЙС',
    'settings.secLanguage':  'ЯЗЫК',
    'settings.secData':      'ДАННЫЕ',
    'settings.secAbout':     'О ПРИЛОЖЕНИИ',
    'settings.textSize':     'Размер текста',
    'settings.haptics':      'Тактильный отклик',
    'settings.appLang':      'Язык приложения',
    'settings.langRu':       'Русский',
    'settings.langEn':       'English',
    'settings.privacy':      'Политика конфиденциальности',
    'settings.contact':      'Написать разработчику',
    'settings.replayOb':     'Онбординг',
    'settings.replayObSub':  'Показать вводный экран снова',
    'settings.erase':        'Удалить все мои данные',
    'settings.eraseSub':     'Сотрёт все родинки и фото с устройства',
    'settings.eraseTitle':   'Удалить все данные?',
    'settings.eraseMsg':     'Это удалит все родинки, фото и историю замеров с устройства. Действие нельзя отменить.',
    'settings.eraseConfirm': 'Удалить',
    'settings.eraseDone':    'Готово',
    'settings.eraseDoneMsg': 'Удалено записей: {n}',

    // Profile
    'profile.title':         'Отчёт',
    'profile.signOut':       'Выйти',
    'profile.signOutTitle':  'Выйти из аккаунта',
    'profile.signOutMsg':    'Данные о родинках останутся на устройстве.',
    'profile.fillProfile':   '＋ Заполнить профиль',
    'profile.editProfile':   '✎ изменить',
    'profile.statTotal':     'Всего',
    'profile.statMod':       'Умеренные',
    'profile.statHigh':      'Высокий',
    'profile.alertHigh':     '⚠ Требуют консультации врача',
    'profile.distribution':  'РАСПРЕДЕЛЕНИЕ РИСКОВ',
    'profile.reminders':     'НАПОМИНАНИЯ',
    'profile.remindersDesc': 'Проверяйте родинки по расписанию',
    'profile.reminderInt':   'Интервал напоминаний',
    'profile.nextReminder':  'Следующее напоминание:',
    'profile.export':        'Экспортировать PDF',
    'profile.exporting':     'Готовлю PDF…',
    'profile.modalTitle':    'Профиль пациента',
    'profile.modalSub':      'Помогает точнее интерпретировать риск',
    'profile.lblAge':        'ВОЗРАСТ',
    'profile.lblGender':     'ПОЛ',
    'profile.lblSkin':       'ТИП КОЖИ',
    'profile.male':          'Мужской',
    'profile.female':        'Женский',
    'profile.skinLight':     'Светлая (I–II)',
    'profile.skinMedium':    'Средняя (III–IV)',
    'profile.skinDark':      'Тёмная (V–VI)',

    // Risk levels (short labels)
    'risk.low':              'Низкий',
    'risk.notable':          'Внимание',
    'risk.moderate':         'Умеренный',
    'risk.high':             'Высокий',
    'risk.urgent':           'Срочно',

    // Risk full labels
    'risk.low.label':        'Низкий риск',
    'risk.notable.label':    'Низкий риск',
    'risk.moderate.label':   'Умеренный риск',
    'risk.high.label':       'Высокий риск',
    'risk.urgent.label':     'Срочно к врачу',

    // Notifications
    'notif.title':           'FreeSkin — время проверить родинки 🔍',
    'notif.body':            'Прошло {days} дн. Сделай фото и отследи изменения.',
    'notif.highTitle':       '⚠ {name} требует внимания',
    'notif.highBody':        'Высокий риск. Рекомендуем обратиться к дерматологу в течение 2 недель.',

    // Quality-check reasons returned by the preprocessing pipeline
    'quality.blurry':        'Изображение размытое — сфотографируйте в фокусе.',
    'quality.dark':          'Слишком темно — включите свет или подойдите к окну.',
    'quality.bright':        'Слишком ярко — избегайте прямого света на родинку.',
    'quality.flat':          'Изображение слишком плоское — попробуйте сменить освещение.',
    'quality.tooFar':        'Родинка слишком далеко — поднесите телефон ближе.',
    'quality.tooClose':      'Родинка занимает весь кадр — отодвиньте телефон.',
    'quality.tooSmall':      'Изображение слишком маленькое — нужно фото больше 200×200.',
    'quality.noSkin':        'На фото не обнаружена кожа. Сфотографируйте родинку на коже.',
    'quality.degraded':      'Препроцессинг ограничен: установите jpeg-js для полного пайплайна.',

    // PDF report extras
    'pdf.alertHigh':         '⚠ Требуют консультации дерматолога',

    // Risk recommendations
    'risk.low.rec':          'Обычное наблюдение. Самоосмотр раз в 6 месяцев.',
    'risk.notable.rec':      'Покажите дерматологу при следующем плановом визите.',
    'risk.moderate.rec':     'Обратитесь к дерматологу в течение месяца.',
    'risk.high.rec':         'Обратитесь к дерматологу в течение 2 недель.',
    'risk.urgent.rec':       'Срочно обратитесь к дерматологу.',

    // Risk summaries (one-liner explanation under hero)
    'risk.low.summary':      'Типичная доброкачественная родинка. Признаков беспокойства не выявлено.',
    'risk.notable.summary':  'Родинка имеет лёгкие отличительные черты, но без явных признаков опасности.',
    'risk.moderate.summary': 'Обнаружены признаки, требующие профессиональной оценки.',
    'risk.high.summary':     'Выявлены признаки, характерные для подозрительных образований.',
    'risk.urgent.summary':   'Признаки требуют немедленной оценки специалиста.',

    // Result extras
    'result.changedHero':    '⚠ изменилась',
    'result.dynLabel':       'ДИНАМИКА ОЦЕНКИ',

    // Profile extras
    'profile.noData':        'Нет данных для отчёта',
    'profile.versionLine':   'FreeSkin v0.1.0  ·  AI-дерматоскрининг',

    // Add wizard
    'add.titleNew':          'Новая родинка',
    'add.titlePhoto':        'Фото родинки',
    'add.titleRescan':       'Новый снимок',
    'add.headingName':       'Как назовём?',
    'add.headingPhoto':      'Добавь фото',
    'add.lblName':           'НАЗВАНИЕ',
    'add.lblLocation':       'РАСПОЛОЖЕНИЕ',
    'add.placeholderName':   'Родинка',
    'add.continue':          'Продолжить →',
    'add.next':              'Далее →',
    'add.chooseLocation':    'Выберите расположение',
    'add.takePhoto':         '📷  Сфотографировать',
    'add.fromGallery':       '🖼  Выбрать из галереи',
    'add.retake':            'Переснять',
    'add.emptyHint':         'Сфотографируйте или\nвыберите из галереи',
    'add.qualityChecking':   'Проверяю качество…',
    'add.qualityOk':         'Качество отличное — можно продолжать',
    'add.qualityProblem':    'Возможные проблемы со снимком',
    'add.qualityIgnore':     'Всё равно использовать',

    // Analysis result badges
    'analysis.mock':         'Демо-режим (модель не подключена)',
    'analysis.mockHint':     'Результат сгенерирован для проверки UI. Установите модель в assets/model/, чтобы видеть реальные оценки.',
    'analysis.noLesion':     'Родинка не обнаружена',
    'analysis.noLesionHint': 'Убедитесь, что родинка находится в центре кадра, хорошо освещена и не закрыта волосами.',
    'add.analyzing':         'Анализирую...',
    'add.analyzingSub':      'Оцениваем по критериям ABCDE',
    'add.errAnalysis':       'Не удалось выполнить анализ. Попробуйте ещё раз.',
    'add.errPermission':     'Нет доступа',
    'add.errPermissionMsg':  'Разрешите доступ к галерее в настройках.',

    // Body locations
    'loc.head':              'Голова',
    'loc.neck':              'Шея',
    'loc.chest':             'Грудь',
    'loc.back':              'Спина',
    'loc.belly':             'Живот',
    'loc.leftArm':           'Левая рука',
    'loc.rightArm':          'Правая рука',
    'loc.leftLeg':           'Левая нога',
    'loc.rightLeg':          'Правая нога',
    'loc.shoulder':          'Плечо',
    'loc.arm':               'Рука',
    'loc.leg':               'Нога',
    'loc.other':             'Другое',

    // Camera
    'cam.permText':          'Нужен доступ к камере',
    'cam.permBtn':           'Разрешить',
    'cam.distFar':           'Приблизьтесь',
    'cam.distGood':          'Идеально',
    'cam.distClose':         'Отдалитесь',
    'cam.distPrep':          'Подготовка…',
    'cam.gallery':           'Галерея',

    // Onboarding
    'ob.welcome':            'Добро пожаловать',
    'ob.welcomeSub':         'AI-помощник для мониторинга родинок',
    'ob.feat1Title':         'Анализ родинок по фото',
    'ob.feat1Sub':           'Сделайте снимок — мы оценим риск по критериям ABCDE',
    'ob.feat2Title':         'Динамика во времени',
    'ob.feat2Sub':           'Отслеживайте изменения месяц за месяцем',
    'ob.feat3Title':         'Отчёт для врача',
    'ob.feat3Sub':           'Экспортируйте PDF-отчёт для дерматолога',
    'ob.profileTitle':       'Расскажите о себе',
    'ob.profileSub':         'Помогает точнее интерпретировать риск',
    'ob.start':              'Начать',
    'ob.skip':               'Пропустить',

    // Modal (ABCDE help)
    'modal.title':           'Критерии ABCDE',
    'modal.sub':             'Признаки, на которые смотрит дерматолог',
    'modal.aTitle':          'A · Асимметрия',
    'modal.aDesc':           'Доброкачественные родинки симметричны. Подозрительные — асимметричны.',
    'modal.bTitle':          'B · Границы',
    'modal.bDesc':           'Чёткие ровные границы — норма. Размытые, неровные — повод обратиться.',
    'modal.cTitle':          'C · Цвет',
    'modal.cDesc':           'Однородный коричневый — норма. Несколько оттенков, чёрные пятна — внимание.',
    'modal.dTitle':          'D · Диаметр',
    'modal.dDesc':           'Размер более 6 мм требует внимания, особенно при росте.',
    'modal.eTitle':          'E · Изменение',
    'modal.eDesc':           'Любое изменение размера, формы, цвета — повод показаться врачу.',

    // Profile NotifCard
    'profile.notifMain':     'Периодические напоминания',
    'profile.intervalSub':   '7 дней',
    'profile.interval14':    '14 дней',
    'profile.interval30':    '30 дней',

    // Settings extras
    'settings.textNormal':   'Обычный',
    'settings.textLarge':    'Крупный',
    'settings.sortDate':     'По дате',
    'settings.sortRisk':     'По риску',
    'settings.sortName':     'По имени',
    'settings.qualityStd':   'Стандарт',
    'settings.qualityHigh':  'Высокое',
    'settings.qualityDesc':  'Высокое — точнее, но медленнее',
    'settings.dataSort':     'Сортировка по умолчанию',
    'settings.analysis':     'Качество анализа',
  },

  en: {
    'common.continue':       'Continue',
    'common.cancel':         'Cancel',
    'common.save':           'Save',
    'common.delete':         'Delete',
    'common.back':           'Back',
    'common.next':           'Next →',
    'common.done':           'Done',
    'common.loading':        'Loading…',
    'common.error':          'Error',
    'common.ok':             'OK',

    'disclaimer':            'This is not a diagnosis. FreeSkin is not a medical device. Please consult a doctor.',

    'login.tagline':         'AI · Dermascreening',
    'login.heroTitle':       'Mole monitoring\non your smartphone',
    'login.heroSub':         'ABCDE-based analysis, change history,\nand a report for your doctor — all in one app.',
    'login.signInGoogle':    'Sign in with Google',
    'login.guest':           'Continue without an account',
    'login.guestTitle':      'Without sign-in',
    'login.guestMsg':        'Data stays only on this device. Migrating to a Google account later is not possible.',
    'login.configNote':      '⚙ Configure Google Client IDs in .env\n(see services/auth.ts for details)',
    'login.errAuth':         'Authorisation error. Please try again.',
    'login.errProfile':      'Failed to load profile.',
    'login.errTimeout':      'Request timed out. Please check your connection.',

    'tab.home':              'Home',
    'tab.history':           'History',
    'tab.profile':           'Report',
    'tab.settings':          'Settings',

    'home.title':            'My moles',
    'home.heroTotal':        'TOTAL MOLES',
    'home.heroNorm':         'normal',
    'home.heroLastCheck':    'Last check:',
    'home.heroEmpty':        'Start monitoring',
    'home.alertTitle':       'Needs attention',
    'home.alertSub':         'changed',
    'home.section':          'ALL MOLES',
    'home.sortDate':         'By date',
    'home.sortScore':        'By risk',
    'home.sortName':         'A–Z',
    'home.emptyTitle':       'No records',
    'home.emptyHint':        'Tap “Add mole” to take your first photo',
    'home.add':              '＋ Add mole',
    'home.confirmDelete':    'Delete mole',
    'home.confirmDeleteMsg': 'will be deleted permanently. This cannot be undone.',

    'history.title':         'History',
    'history.subtitle':      'Dynamics across all moles',
    'history.statTotal':     'Total',
    'history.statMod':       'Moderate',
    'history.statHigh':      'High',
    'history.statObs':       'Scans',
    'history.empty':         'History is empty',
    'history.emptyHint':     'Take your first photo and start monitoring',
    'history.cta':           '＋ Add mole',

    'result.notFound':       'Record not found',
    'result.changed':        '⚠ Changed',
    'result.tabAnalysis':    'Analysis',
    'result.tabHistory':     'History',
    'result.tabCompare':     'Compare',
    'result.rescan':         '📷  Take a new photo',
    'result.compareNeeds':   'At least 2 scans are required to compare',
    'result.dynamic':        'Dynamic',
    'result.dynStable':      'Stable',
    'result.dynRising':      'Rising',
    'result.dynFalling':     'Falling',
    'result.measurements':   'Scans',
    'result.currentLevel':   'Current level',

    'settings.title':        'Settings',
    'settings.subtitle':     'Personalisation and data',
    'settings.secInterface': 'INTERFACE',
    'settings.secLanguage':  'LANGUAGE',
    'settings.secData':      'DATA',
    'settings.secAbout':     'ABOUT',
    'settings.textSize':     'Text size',
    'settings.haptics':      'Haptic feedback',
    'settings.appLang':      'App language',
    'settings.langRu':       'Russian',
    'settings.langEn':       'English',
    'settings.privacy':      'Privacy policy',
    'settings.contact':      'Contact developer',
    'settings.replayOb':     'Onboarding',
    'settings.replayObSub':  'Show the intro screens again',
    'settings.erase':        'Erase all my data',
    'settings.eraseSub':     'Removes every mole, photo, and history record from this device',
    'settings.eraseTitle':   'Erase all data?',
    'settings.eraseMsg':     'This will delete every mole, photo, and scan history from this device. This cannot be undone.',
    'settings.eraseConfirm': 'Erase',
    'settings.eraseDone':    'Done',
    'settings.eraseDoneMsg': 'Records deleted: {n}',

    'profile.title':         'Report',
    'profile.signOut':       'Sign out',
    'profile.signOutTitle':  'Sign out of account',
    'profile.signOutMsg':    'Mole data will remain on the device.',
    'profile.fillProfile':   '＋ Complete profile',
    'profile.editProfile':   '✎ edit',
    'profile.statTotal':     'Total',
    'profile.statMod':       'Moderate',
    'profile.statHigh':      'High',
    'profile.alertHigh':     '⚠ Doctor consultation recommended',
    'profile.distribution':  'RISK DISTRIBUTION',
    'profile.reminders':     'REMINDERS',
    'profile.remindersDesc': 'Schedule periodic mole self-checks',
    'profile.reminderInt':   'Reminder interval',
    'profile.nextReminder':  'Next reminder:',
    'profile.export':        'Export PDF',
    'profile.exporting':     'Preparing PDF…',
    'profile.modalTitle':    'Patient profile',
    'profile.modalSub':      'Helps interpret risk more accurately',
    'profile.lblAge':        'AGE',
    'profile.lblGender':     'GENDER',
    'profile.lblSkin':       'SKIN TYPE',
    'profile.male':          'Male',
    'profile.female':        'Female',
    'profile.skinLight':     'Light (I–II)',
    'profile.skinMedium':    'Medium (III–IV)',
    'profile.skinDark':      'Dark (V–VI)',

    'risk.low':              'Low',
    'risk.notable':          'Notable',
    'risk.moderate':         'Moderate',
    'risk.high':             'High',
    'risk.urgent':           'Urgent',

    'risk.low.label':        'Low risk',
    'risk.notable.label':    'Low risk',
    'risk.moderate.label':   'Moderate risk',
    'risk.high.label':       'High risk',
    'risk.urgent.label':     'See a doctor urgently',

    'notif.title':           'FreeSkin — time to check your moles 🔍',
    'notif.body':             '{days} days have passed. Take a photo and track changes.',
    'notif.highTitle':        '⚠ {name} needs attention',
    'notif.highBody':         'High risk. We recommend seeing a dermatologist within 2 weeks.',

    'quality.blurry':         'Image is blurry — hold the camera steady and tap to focus.',
    'quality.dark':           'Too dark — turn on the light or move toward a window.',
    'quality.bright':         'Too bright — avoid direct light on the mole.',
    'quality.flat':           'Image is too flat — change the lighting and try again.',
    'quality.tooFar':         'Mole is too far away — bring the camera closer.',
    'quality.tooClose':       'Mole fills the frame — pull the camera back a bit.',
    'quality.tooSmall':       'Image is too small — needs to be larger than 200×200 pixels.',
    'quality.noSkin':         'No skin detected in the photo. Please take a picture of a mole on skin.',
    'quality.degraded':       'Preprocessing degraded: install jpeg-js for the full pipeline.',

    'pdf.alertHigh':          '⚠ Doctor consultation recommended',

    'risk.low.rec':          'Routine self-checks every 6 months.',
    'risk.notable.rec':      'Show it to your dermatologist at your next routine visit.',
    'risk.moderate.rec':     'See a dermatologist within a month.',
    'risk.high.rec':         'See a dermatologist within 2 weeks.',
    'risk.urgent.rec':       'See a dermatologist as soon as possible.',

    'risk.low.summary':      'Typical benign mole. No signs of concern.',
    'risk.notable.summary':  'The mole has minor distinctive features but no clear danger signs.',
    'risk.moderate.summary': 'Findings warrant professional evaluation.',
    'risk.high.summary':     'Features consistent with suspicious lesions detected.',
    'risk.urgent.summary':   'Findings require immediate specialist evaluation.',

    'result.changedHero':    '⚠ changed',
    'result.dynLabel':       'SCORE DYNAMICS',

    'profile.noData':        'No data for the report',
    'profile.versionLine':   'FreeSkin v0.1.0  ·  AI dermascreening',

    'add.titleNew':          'New mole',
    'add.titlePhoto':        'Mole photo',
    'add.titleRescan':       'New scan',
    'add.headingName':       'What shall we call it?',
    'add.headingPhoto':      'Add a photo',
    'add.lblName':           'NAME',
    'add.lblLocation':       'LOCATION',
    'add.placeholderName':   'Mole',
    'add.continue':          'Continue →',
    'add.next':              'Next →',
    'add.chooseLocation':    'Choose a location',
    'add.takePhoto':         '📷  Take photo',
    'add.fromGallery':       '🖼  Choose from gallery',
    'add.retake':            'Retake',
    'add.emptyHint':         'Take a photo\nor pick from gallery',
    'add.qualityChecking':   'Checking photo quality…',
    'add.qualityOk':         'Photo quality looks great — ready to continue',
    'add.qualityProblem':    'There may be issues with this photo',
    'add.qualityIgnore':     'Use anyway',

    'analysis.mock':         'Demo mode (model not loaded)',
    'analysis.mockHint':     'This result is generated for UI testing. Place a model in assets/model/ to see real predictions.',
    'analysis.noLesion':     'No mole detected',
    'analysis.noLesionHint': 'Make sure the mole is centred in the frame, well-lit, and not covered by hair.',
    'add.analyzing':         'Analysing…',
    'add.analyzingSub':      'Evaluating ABCDE criteria',
    'add.errAnalysis':       'Analysis failed. Please try again.',
    'add.errPermission':     'No access',
    'add.errPermissionMsg':  'Allow gallery access in device settings.',

    'loc.head':              'Head',
    'loc.neck':              'Neck',
    'loc.chest':             'Chest',
    'loc.back':              'Back',
    'loc.belly':             'Belly',
    'loc.leftArm':           'Left arm',
    'loc.rightArm':          'Right arm',
    'loc.leftLeg':           'Left leg',
    'loc.rightLeg':          'Right leg',
    'loc.shoulder':          'Shoulder',
    'loc.arm':               'Arm',
    'loc.leg':               'Leg',
    'loc.other':             'Other',

    'cam.permText':          'Camera access required',
    'cam.permBtn':           'Allow',
    'cam.distFar':           'Move closer',
    'cam.distGood':          'Perfect',
    'cam.distClose':         'Move further',
    'cam.distPrep':          'Preparing…',
    'cam.gallery':           'Gallery',

    'ob.welcome':            'Welcome',
    'ob.welcomeSub':         'AI assistant for mole monitoring',
    'ob.feat1Title':         'Photo-based mole analysis',
    'ob.feat1Sub':           'Take a photo — we evaluate risk by ABCDE criteria',
    'ob.feat2Title':         'Track over time',
    'ob.feat2Sub':           'See changes month by month',
    'ob.feat3Title':         'Doctor-ready report',
    'ob.feat3Sub':           'Export a PDF report for your dermatologist',
    'ob.profileTitle':       'Tell us about yourself',
    'ob.profileSub':         'Helps interpret risk more accurately',
    'ob.start':              'Get started',
    'ob.skip':               'Skip',

    'modal.title':           'ABCDE criteria',
    'modal.sub':             'What dermatologists look for',
    'modal.aTitle':          'A · Asymmetry',
    'modal.aDesc':           'Benign moles are symmetric. Suspicious ones are asymmetric.',
    'modal.bTitle':          'B · Border',
    'modal.bDesc':           'Sharp, even borders are normal. Blurred or jagged ones are a flag.',
    'modal.cTitle':          'C · Color',
    'modal.cDesc':           'Uniform brown is normal. Multiple shades or black spots — pay attention.',
    'modal.dTitle':          'D · Diameter',
    'modal.dDesc':           'Anything over 6 mm warrants attention, especially if growing.',
    'modal.eTitle':          'E · Evolution',
    'modal.eDesc':           'Any change in size, shape or color is a reason to see a doctor.',

    'profile.notifMain':     'Periodic reminders',
    'profile.intervalSub':   '7 days',
    'profile.interval14':    '14 days',
    'profile.interval30':    '30 days',

    'settings.textNormal':   'Normal',
    'settings.textLarge':    'Large',
    'settings.sortDate':     'By date',
    'settings.sortRisk':     'By risk',
    'settings.sortName':     'By name',
    'settings.qualityStd':   'Standard',
    'settings.qualityHigh':  'High',
    'settings.qualityDesc':  'High is more accurate but slower',
    'settings.dataSort':     'Default sort order',
    'settings.analysis':     'Analysis quality',
  },
};

// ── Reactive locale store ───────────────────────────────────────────────────
let currentLocale: Locale = 'ru';
const listeners = new Set<() => void>();

function readPersistedLocale(): Locale {
  const v = getSetting('language');
  return v === 'en' ? 'en' : 'ru';
}

// Initialise from settings; safe even if user is null (returns null → ru).
try { currentLocale = readPersistedLocale(); } catch { currentLocale = 'ru'; }

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(loc: Locale): void {
  if (loc === currentLocale) return;
  currentLocale = loc;
  setSetting('language', loc);
  listeners.forEach((l) => { try { l(); } catch { /* swallow */ } });
}

/** Re-load locale from settings (e.g. after sign-in switches user namespace). */
export function refreshLocale(): void {
  const next = readPersistedLocale();
  if (next !== currentLocale) {
    currentLocale = next;
    listeners.forEach((l) => { try { l(); } catch { /* swallow */ } });
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Translate a key. Falls back to RU then to the key itself. */
export function t(key: string): string {
  return dict[currentLocale]?.[key] ?? dict.ru[key] ?? key;
}

/**
 * React hook — re-renders the component when locale changes.
 * Returns a locale-bound `t` function that closes over the current locale,
 * so JSX expressions like `{t('foo')}` correctly invalidate on locale change.
 */
export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void; t: (k: string) => string } {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  // Bind `t` to the locale captured by this render so React's JSX
  // can detect the change. (Otherwise `t` is the same reference and
  // some renderers may not re-evaluate the inner string output.)
  const boundT = (key: string): string =>
    dict[locale]?.[key] ?? dict.ru[key] ?? key;
  return { locale, setLocale, t: boundT };
}
