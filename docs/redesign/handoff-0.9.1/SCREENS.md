# Экраны 0.9.1 → этапы плана

Каждая строка — флоу канваса. Прототип открывается в браузере: `prototypes/<mobile|desktop>/<Экран>.html` (оглавление — `prototypes/index.html`), снимок — `prototypes/thumbs/<Экран>.jpg`. «§» — раздел спецификации интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`, «Этап» — этап плана `docs/superpowers/plans/2026-10-14-redesign.md`.

Розовая пунктирная рамка в прототипе = место, изменённое в 0.9 (это разметка ревью, в код её не переносить).


## Мобайл (390 × 844)

| Флоу | Статус | § | Этап | Экраны |
|---|---|---|---|---|
| Главная для гостя | новое | 1 | 11 | [Главная](prototypes/mobile/Guest.html) |
| Вход и регистрация | как в 0.8 | 2 | 5 | [Вход](prototypes/mobile/Login.html), [Вход · неверный пароль](prototypes/mobile/LoginError.html), [Регистрация](prototypes/mobile/LoginRegister.html) |
| Обзор команды | как в 0.8 | 3 | 6 | [Обзор](prototypes/mobile/Team.html) |
| Смена и создание команды | как в 0.8 | 4 | 6 | [Мои команды](prototypes/mobile/TeamSwitch.html), [Новая команда](prototypes/mobile/TeamNew.html) |
| Набор новой команды | новое | 5 | 6 | [Набор состава](prototypes/mobile/Builder.html), [Номера, имена и капитан](prototypes/mobile/BuilderRoster.html), [Перерасход бюджета](prototypes/mobile/BuilderOver.html) |
| Состав · Список и счётчик SPP | изменено | 6 | 7a | [Состав · игрок раскрыт](prototypes/mobile/Stats.html), [Шапка при прокрутке](prototypes/mobile/StatsScrolled.html), [Подсказка о навыке](prototypes/mobile/StatsSkill.html) |
| Состав · Во время подготовки и матча | новое | 7 | 7a + 9 | [Идёт подготовка](prototypes/mobile/StatsPrep.html), [Идёт матч · записи](prototypes/mobile/StatsLive.html), [Травма в матче](prototypes/mobile/StatsLiveInjury.html) |
| Состав · Сохранение: конфликт и нет сети | новое | 8 | 7a | [Конфликт сохранения](prototypes/mobile/SaveConflict.html), [Нет сети](prototypes/mobile/SaveOffline.html) |
| Состав · Пропуски и погибшие | изменено | 9 | 7b | [Весь экран с пропусками и погибшими](prototypes/mobile/StatsInjured.html), [Пропуск матча](prototypes/mobile/StatsMng.html), [Отметка гибели](prototypes/mobile/StatsMngDead.html), [Профиль погибшего](prototypes/mobile/PlayerDead.html), [Отмена отметки](prototypes/mobile/PlayerDeadConfirm.html) |
| Состав · Найм игроков | изменено | 10 | 7c | [Найм · не хватает казны](prototypes/mobile/StatsHire.html) |
| Состав · Продажа игрока | изменено | 11 | 7c | [Продажа](prototypes/mobile/StatsSell.html) |
| Состав · Профиль и редактирование игрока | изменено | 12 | 7d, 7e | [Профиль игрока](prototypes/mobile/Player.html), [Редактирование](prototypes/mobile/PlayerEdit.html), [Капитан](prototypes/mobile/PlayerCaptain.html), [Карьера по матчам](prototypes/mobile/PlayerCareer.html) |
| Состав · Прокачка игрока | изменено | 13 | 7d | [1 · Тип прокачки](prototypes/mobile/Adv1Type.html), [2 · Категория](prototypes/mobile/Adv2Category.html), [3a · Навык на выбор](prototypes/mobile/Adv3Skill.html), [3b · Случайный навык](prototypes/mobile/Adv3Random.html), [3c · Характеристика (D8)](prototypes/mobile/Adv3Stat.html), [3d · D8 за столом](prototypes/mobile/Adv3StatTable.html), [4 · Готово](prototypes/mobile/Adv4Done.html) |
| Казна и ресурсы · сезон идёт | изменено | 14 | 8 | [Команда](prototypes/mobile/TeamManage.html), [Операция с казной](prototypes/mobile/TeamManageMoney.html) |
| Казна и ресурсы · межсезонье | изменено | 15 | 8 | [Команда в межсезонье](prototypes/mobile/TeamManagePre.html) |
| Матчи · Табло сезона и календарь | изменено | 16 | 9 | [Матчи](prototypes/mobile/Matches.html) |
| Матчи · Перед матчем: индьюсменты и пропуски | изменено | 17 | 9 | [Индьюсменты нам, травмы](prototypes/mobile/MatchesPrePlus.html), [Индьюсменты сопернику](prototypes/mobile/MatchesPreMinus.html), [CTV равны](prototypes/mobile/MatchesPreEven.html) |
| Матчи · Подготовка к матчу по шагам | новое | 18 | 9 | [1 · Фанаты](prototypes/mobile/PreFans.html), [2 · Погода](prototypes/mobile/PreWeather.html), [3 · Состав](prototypes/mobile/PreRoster.html), [4 · Индьюсменты](prototypes/mobile/PreInducements.html), [5 · Старт](prototypes/mobile/PreReview.html) |
| Матчи · Идёт игра | изменено | 19 | 9 | [Идёт игра](prototypes/mobile/MatchesLive.html) |
| Матчи · После матча по шагам | новое | 20 | 9 | [1 · Счёт из записей](prototypes/mobile/PostResult.html), [1 · Счёт расходится с записями](prototypes/mobile/PostResultMismatch.html), [2 · Доход и фанаты](prototypes/mobile/PostFans.html), [3 · Игроки](prototypes/mobile/PostPlayers.html), [4 · Состав](prototypes/mobile/PostRoster.html), [5 · Казна](prototypes/mobile/PostFinance.html), [6 · Дальше](prototypes/mobile/PostNext.html), [7 · Итог](prototypes/mobile/PostReview.html) |
| Матчи · Товарищеские вызовы | новое | 21 | 9 | [Вызовы](prototypes/mobile/Challenges.html), [Бросить вызов · выбор соперника](prototypes/mobile/ChallengeSend.html), [Поиск соперника](prototypes/mobile/ChallengeSendSearch.html), [Принять вызов](prototypes/mobile/ChallengeAccept.html) |
| Таблица → обзор соперника | как в 0.8 | 22 | 10 | [Таблица лиги](prototypes/mobile/League.html), [Соперник · Silverbrook Rangers](prototypes/mobile/OppTeam.html), [Соперник · Cinderpeak Ash](prototypes/mobile/OppTeamOgres.html) |
| Профиль тренера | новое | 23 | 10 | [Профиль тренера](prototypes/mobile/CoachProfile.html) |
| Справочник · Разделы и списки | как в 0.8 | 24–26 | 11 | [Справочник](prototypes/mobile/Ref.html), [Навыки](prototypes/mobile/RefSkills.html) |
| Справочник · Статьи и таблицы | как в 0.8 | 24–26 | 11 | [Player Advancement](prototypes/mobile/RefAdvancement.html) |
| Справочник · Правила команд | как в 0.8 | 24–26 | 11 | [Огры](prototypes/mobile/RefTeam.html), [Лесные эльфы](prototypes/mobile/RefTeamElves.html) |
| Настройки · Аккаунт | изменено | 27 | 5 | [Настройки](prototypes/mobile/Settings.html), [Смена пароля](prototypes/mobile/SettingsPassword.html) |
| Настройки · Темы и палитры | как в 0.8 | 28 | 4, 5 | [Тёмная тема](prototypes/mobile/SettingsDark.html), [«Палящий зной»](prototypes/mobile/SettingsParchment.html), [«Пламя Хаоса»](prototypes/mobile/SettingsEmbers.html) |
| Администрирование | новое | 29 | 12 | [Тренеры и сезон](prototypes/mobile/AdminMobile.html) |
| Техобслуживание | изменено | 30 | 3 | [Плановые работы](prototypes/mobile/Maintenance.html), [Сбой](prototypes/mobile/MaintenanceDown.html), [Готово](prototypes/mobile/MaintenanceDone.html), [Палитра «Под прожекторами»](prototypes/mobile/MaintenanceNight.html), [Палитра «Палящий зной»](prototypes/mobile/MaintenanceParchment.html) |

## Десктоп (1440, тянется по ширине)

| Флоу | Статус | § | Этап | Экраны |
|---|---|---|---|---|
| Главная для гостя | новое | 1 | 11 | [Главная](prototypes/desktop/DeskGuest.html) |
| Вход и регистрация | как в 0.8 | 2 | 5 | [Вход](prototypes/desktop/DeskLogin.html), [Регистрация](prototypes/desktop/DeskLoginRegister.html) |
| Обзор команды | как в 0.8 | 3 | 6 | [Обзор](prototypes/desktop/DeskOverview.html) |
| Смена и создание команды | как в 0.8 | 4 | 6 | [Мои команды](prototypes/desktop/DeskTeamSwitch.html), [Новая команда](prototypes/desktop/DeskTeamNew.html) |
| Набор новой команды | новое | 5 | 6 | [Набор состава](prototypes/desktop/DeskBuilder.html), [Перерасход бюджета](prototypes/desktop/DeskBuilderOver.html) |
| Состав · Список и счётчик SPP | изменено | 6 | 7a | [Состав · игрок справа](prototypes/desktop/DeskRoster.html) |
| Состав · Во время подготовки и матча | новое | 7 | 7a + 9 | [Идёт подготовка](prototypes/desktop/DeskRosterPrep.html), [Идёт матч · записи](prototypes/desktop/DeskRosterLive.html) |
| Состав · Сохранение: конфликт | новое | 8 | 7a | [Конфликт сохранения](prototypes/desktop/DeskSaveConflict.html) |
| Состав · Пропуски и погибшие | как в 0.8 | 9 | 7b | [Весь экран с пропусками и погибшими](prototypes/desktop/DeskRosterInjured.html), [Отметка гибели](prototypes/desktop/DeskRosterDeath.html) |
| Состав · Найм игроков | изменено | 10 | 7c | [Найм](prototypes/desktop/DeskRosterHire.html) |
| Состав · Продажа игрока | изменено | 11 | 7c | [Продажа](prototypes/desktop/DeskRosterSell.html) |
| Состав · Профиль и редактирование игрока | изменено | 12 | 7d, 7e | [Редактирование](prototypes/desktop/DeskRosterEdit.html), [Капитан](prototypes/desktop/DeskRosterCaptain.html), [Карьера по матчам](prototypes/desktop/DeskRosterCareer.html) |
| Состав · Прокачка игрока | изменено | 13 | 7d | [Прокачка в три колонки](prototypes/desktop/DeskRosterAdv.html), [D8 за столом · навык вместо характеристики](prototypes/desktop/DeskRosterAdvStat.html) |
| Казна и ресурсы · сезон идёт | изменено | 14 | 8 | [Казна и ресурсы](prototypes/desktop/DeskRosterFunds.html) |
| Казна и ресурсы · межсезонье | изменено | 15 | 8 | [Казна и ресурсы в межсезонье](prototypes/desktop/DeskRosterPreseason.html) |
| Матчи · Табло сезона и календарь | изменено | 16 | 9 | [Сезон](prototypes/desktop/DeskSeason.html) |
| Матчи · Перед матчем: индьюсменты и пропуски | изменено | 17 | 9 | [Индьюсменты нам, травмы](prototypes/desktop/DeskSeasonPrePlus.html), [Индьюсменты сопернику](prototypes/desktop/DeskSeasonPreMinus.html), [CTV равны](prototypes/desktop/DeskSeasonPreEven.html) |
| Матчи · Подготовка к матчу по шагам | новое | 18 | 9 | [4 · Индьюсменты](prototypes/desktop/DeskPreInducements.html), [5 · Старт](prototypes/desktop/DeskPreReview.html) |
| Матчи · Идёт игра | изменено | 19 | 9 | [Идёт игра](prototypes/desktop/DeskSeasonLive.html) |
| Матчи · После матча по шагам | новое | 20 | 9 | [1 · Счёт из записей](prototypes/desktop/DeskPostResult.html), [3 · Игроки](prototypes/desktop/DeskPostPlayers.html), [7 · Итог](prototypes/desktop/DeskPostReview.html) |
| Матчи · Товарищеские вызовы | новое | 21 | 9 | [Вызовы и отправка](prototypes/desktop/DeskChallenges.html) |
| Таблица → обзор соперника | как в 0.8 | 22 | 10 | [Соперник · Silverbrook Rangers](prototypes/desktop/DeskOppTeam.html), [Соперник · Cinderpeak Ash](prototypes/desktop/DeskOppTeamOgres.html) |
| Профиль тренера | новое | 23 | 10 | [Профиль тренера](prototypes/desktop/DeskCoachProfile.html) |
| Справочник · Разделы и списки | как в 0.8 | 24–26 | 11 | [Справочник · навыки](prototypes/desktop/DeskRef.html) |
| Справочник · Статьи и таблицы | как в 0.8 | 24–26 | 11 | [Статья (Weather)](prototypes/desktop/DeskRefReader.html), [Таблица (Player Advancement)](prototypes/desktop/DeskRefAdv.html) |
| Справочник · Правила команд | как в 0.8 | 24–26 | 11 | [Огры](prototypes/desktop/DeskRefTeam.html), [Лесные эльфы](prototypes/desktop/DeskRefTeamElves.html) |
| Настройки · Аккаунт | как в 0.8 | 27 | 5 | [Настройки](prototypes/desktop/DeskCoach.html), [Смена пароля](prototypes/desktop/DeskCoachPassword.html) |
| Настройки · Темы и палитры | как в 0.8 | 28 | 4, 5 | [Тёмная тема](prototypes/desktop/DeskCoachDark.html), [«Метель»](prototypes/desktop/DeskCoachIce.html), [«Тёмные эльфы»](prototypes/desktop/DeskCoachDungeon.html) |
| Администрирование · тренеры | новое | 29 | 12 | [Тренеры](prototypes/desktop/DeskAdminUsers.html), [Тренер с командой](prototypes/desktop/DeskAdminCoachNew.html), [Тренер](prototypes/desktop/DeskAdminUser.html), [Сброс пароля](prototypes/desktop/DeskAdminReset.html), [Правка команды](prototypes/desktop/DeskAdminTeamEdit.html) |
| Администрирование · сезон | новое | 29 | 12 | [Туры и пары](prototypes/desktop/DeskAdminSeason.html), [Участники](prototypes/desktop/DeskAdminEntries.html) |
| Техобслуживание | изменено | 30 | 3 | [Плановые работы](prototypes/desktop/DeskMaintenance.html), [Сбой](prototypes/desktop/DeskMaintenanceDown.html), [Готово](prototypes/desktop/DeskMaintenanceDone.html), [Палитра «Пламя Хаоса»](prototypes/desktop/DeskMaintenanceEmbers.html) |
