# API Битрикса для Кристалла: привязка писем и звонков, история клиента, календарь менеджера

Документ для разработчика стороны Кристалла. Описывает три эндпоинта:

| Эндпоинт | Зачем |
|---|---|
| `resolve.php` | Пришло письмо или звонок: кто это в CRM? |
| `activities.php` | Дела CRM и задачи Битрикса: история клиента и календарь менеджера |
| `comments.php` | Закреплённые комментарии CRM для истории клиента |

Поиск и карточка компании (`companies_search.php`, `company.php`) описаны в `BITRIX-TZ.md`.

## Общее

- База: `https://crm.alvla.eu/local/ajax/crystal/clients/`
- Метод `GET`. Токен передаётся параметром `token` или заголовком `X-Api-Token`. Это тот же токен, что у `crystal/stats/`.
- Ошибка приходит как JSON `{"error": "текст"}` с кодом 4xx/5xx. 401 означает неверный токен, 400 — неверный параметр (в тексте сказано, какой).
- **Время** во всех ответах в поясе Киева (`"tz": "Europe/Kyiv"` в корне ответа), формат `YYYY-MM-DD HH:MM:SS`. Даты в параметрах тоже по Киеву: `YYYY-MM-DD` или `YYYY-MM-DD HH:MM:SS`. Менеджеры в Праге видят в Битриксе время на час меньше, это нормально. Для показа пересчитывайте в пояс пользователя.
- **Тексты** приходят без HTML и BB-кодов, обрезаны до 2000 символов.
- **Ссылки** (`url`) относительные, к ним нужно добавить `https://crm.alvla.eu`.
- **Списки ID** можно передавать через запятую: `deal_id=12,15`.
- Ответ содержит заголовок `X-Response-Time-Ms`.

### Что храним в Кристалле, что вычисляем

У письма или звонка храним только ID из Битрикса: `contact_id`, `company_id`, при необходимости `lead_id`. Всё остальное (название компании, сделки, история) запрашиваем при показе. Историю клиента **не храним**, а собираем на лету (см. раздел «Как собрать историю клиента»).

---

## 1. `resolve.php`: кто это?

Ищет телефон или email среди контактов, компаний и лидов CRM.

| Параметр | |
|---|---|
| `phone` | Номер в любом формате. Сравниваем по последним 9 цифрам, в номере должно быть хотя бы 7 цифр. |
| `email` | Адрес. Сначала ищем точное совпадение. Если его нет, ищем по домену (`@firma.cz`) среди контактов и компаний, кроме публичных почт (gmail, seznam и т. п.). |
| `strict=1` | Для email не искать по домену. |

Нужен ровно один из `phone` и `email`.

> ⚠️ `+` в URL превращается в пробел. Кодируйте его как `%2B` (`phone=%2B19055451316`) или передавайте номер без плюса.

```
GET resolve.php?token=…&phone=%2B19055451316
```

```json
{
  "tz": "Europe/Kyiv",
  "query": { "phone": "+19055451316", "digits": "19055451316" },
  "found": true,
  "suggested": { "contact_id": null, "company_id": null, "lead_id": 23745 },
  "contacts": [],
  "companies": [],
  "leads": [
    {
      "id": 23745, "title": "Whiz-a-Top Linen, Canada", "name": "Robert Danilek",
      "company_title": "Whiz-a-Top Linen",
      "status_id": "UC_79PPYK", "status_name": "Первый контакт (звонок)", "status_semantic": "open",
      "contact_id": null, "company_id": null, "created": "2026-11-23 17:34:12",
      "assigned_by_id": 6, "assigned_by_name": "Елена Дубовик"
    }
  ],
  "deals": [],
  "deals_total": 0
}
```

- `contacts[]`: `id`, `full_name`, `post`, `match` (`phone` | `email` | `domain`), `companies` [{`id`, `title`}], `phones`, `emails`, `assigned_by_id`, `assigned_by_name`.
- `companies[]`: найденные напрямую и компании найденных контактов. `match` бывает `phone` | `email` | `domain` | `contact` (компания найдена через контакт). Найденные напрямую идут первыми.
- `leads[]`: открытые первыми. `status_semantic` бывает `open` | `converted` | `lost`.
- `deals[]`: **открытые** сделки найденных компаний и контактов, до 20 штук, новые первыми. Сколько их всего, показывает `deals_total`.

### `suggested`: предложенная привязка

Заполнено, только когда привязка однозначна, иначе `null`:

| Ситуация | `suggested` |
|---|---|
| Найден ровно один контакт (точно, не по домену) | `contact_id`, `company_id` (если у контакта одна компания) |
| Контактов нет, компания найдена напрямую одна | `company_id` |
| Нашлось только по домену, и все контакты из одной компании | `company_id` |
| Ровно один **открытый** лид | добавляется `lead_id` (новый номер, лид ещё не сконвертирован) |

Если `suggested = null` и `found = true`, предложите менеджеру выбрать из `contacts`, `companies` и `leads`. Если `found = false`, это новый человек.

---

## 2. `activities.php`: дела и задачи

Отдаёт два источника в одном формате:
- **дела CRM** (`source: "crm"`): «дела» в карточках, встречи и т. п.;
- **задачи Битрикса** (`source: "task"`): модуль «Задачи».

Задача, привязанная к CRM, отдаётся один раз, как задача. Звонки, письма и чаты CRM по умолчанию **не отдаются**: их источник Кристалл.

| Параметр | |
|---|---|
| `responsible_id` | Исполнитель (id или список). Для календаря менеджера. |
| `accomplices=1` | Вместе с `responsible_id`: ещё задачи, где менеджер **соисполнитель** (`role: "accomplice"`). |
| `lead_id`, `deal_id`, `contact_id`, `company_id` | Сущности CRM (id или список). Для истории клиента. |
| `expand=1` | Компания: добавляются её контакты, сделки и лиды. Контакт: его сделки и лиды. **Для истории клиента передавайте всегда** (см. ниже). |
| `source` | `all` (по умолчанию) \| `crm` \| `tasks` |
| `completed` | `Y` \| `N`. Без параметра отдаются все. |
| `deadline_from`, `deadline_to` | Окно по крайнему сроку. Дела без срока в него не попадают. |
| `created_from`, `created_to` | Окно по дате создания. |
| `communications=1` | Включить звонки, письма и чаты CRM. |
| `order` | `deadline`: по сроку, без срока в конце. `created`: новые первыми. По умолчанию `deadline`, если передано окно по сроку, иначе `created`. |
| `limit`, `offset` | `limit` по умолчанию 100, максимум 500. `offset + limit` не больше 2000. |

Обязателен `responsible_id` или хотя бы одна сущность.

```
GET activities.php?token=…&responsible_id=10&completed=N&deadline_from=2026-11-23&deadline_to=2026-12-07
```

```json
{
  "tz": "Europe/Kyiv",
  "order": "deadline",
  "items": [
    {
      "uid": "crm:124248",
      "source": "crm",
      "id": 124248,
      "type": "todo",
      "provider_id": "CRM_TODO",
      "subject": "Напомнить о нас клиенту Wäscherei & Heissmangel V. Konstantinidis",
      "description": "должен скинуть замеры на мешки",
      "completed": false,
      "status": "open",
      "deadline": "2026-11-23 09:00:00",
      "start": "2026-11-23 09:00:00",
      "end": "2026-11-23 09:00:00",
      "created": "2026-09-08 12:36:23",
      "updated": "2026-09-08 12:36:23",
      "closed": null,
      "important": false,
      "direction": null,
      "role": "responsible",
      "responsible": { "id": 10, "name": "Алёна Колесниченко" },
      "author": { "id": 10, "name": "Алёна Колесниченко" },
      "company": { "id": 1764, "title": "Wäscherei & Heissmangel V. Konstantinidis" },
      "bindings": [
        { "type": "lead", "id": 17486, "title": "Wäscherei & Heissmangel V. Konstantinidis", "url": "/crm/lead/details/17486/" }
      ],
      "group_id": null,
      "url": "/crm/lead/details/17486/"
    }
  ],
  "total": 66,
  "total_crm": 66,
  "total_tasks": 0,
  "next_offset": null
}
```

### Поля дела

| Поле | |
|---|---|
| `uid` | Уникальный ключ в ленте: `crm:<id>` или `task:<id>`. |
| `type` | Дела CRM: `todo`, `meeting`, `call`, `email`, `chat`, `sms`, `webform`, `request`, `other`. Задачи: `task`. |
| `status` | Дела CRM: `open` \| `completed`. Задачи: `new`, `pending`, `in_progress`, `awaiting_control`, `completed`, `deferred`, `declined`. |
| `completed` | Готово или нет. У задач `awaiting_control`, `completed` и `declined` считаются завершёнными. |
| `deadline` | Крайний срок. **`null` значит, что срока нет**, у задач это бывает часто. |
| `start`, `end` | Плановое время: у дел CRM время дела, у задач плановые даты. |
| `updated` | Последнее изменение. У задач это колонка «Активность» в списке задач. |
| `closed` | Дата закрытия задачи (у дел CRM `null`). |
| `role` | При запросе по `responsible_id`: `responsible` или `accomplice`. При запросе по клиенту `null`. |
| `company` | Компания дела: привязанная напрямую, иначе компания сделки, контакта или лида. Может быть `null`. |
| `bindings` | К чему привязано: `lead` \| `deal` \| `contact` \| `company`, с названием и ссылкой. |
| `group_id` | Проект или группа задачи (на будущее, когда дойдём до проектов). |
| `url` | Задача: страница задачи. Дело CRM: карточка первой привязки. |

---

## 3. `comments.php`: закреплённые комментарии

Комментарии из таймлайна карточек CRM. По умолчанию **только закреплённые**.

| Параметр | |
|---|---|
| `lead_id`, `deal_id`, `contact_id`, `company_id`, `expand` | Как в `activities.php`. |
| `author_id` | Автор (id или список). |
| `pinned` | `Y` (по умолчанию) \| `all` |
| `created_from`, `created_to` | Окно по дате. |
| `limit`, `offset` | `limit` по умолчанию 100, максимум 500. |

Обязательна хотя бы одна сущность или `author_id`. Сортировка: новые первыми.

```
GET comments.php?token=…&company_id=1025&expand=1
```

```json
{
  "tz": "Europe/Kyiv",
  "items": [
    {
      "uid": "comment:528692",
      "source": "comment",
      "id": 528692,
      "text": "заказ клиента",
      "pinned": true,
      "created": "2026-11-20 16:21:31",
      "author": { "id": 10, "name": "Алёна Колесниченко" },
      "company": { "id": 1025, "title": "Admiral Objekt Wäsche und Arbeitskleidung GmbH" },
      "bindings": [
        { "type": "deal", "id": 2824, "title": "…", "url": "/crm/deal/details/2824/", "pinned": true }
      ],
      "url": "/crm/deal/details/2824/"
    }
  ],
  "total": 11,
  "next_offset": null
}
```

Закрепление в Битриксе относится к карточке: комментарий может быть закреплён в сделке и не закреплён в компании. Поэтому флаг `pinned` есть у каждой привязки, а общий `pinned` равен `true`, если комментарий закреплён хоть где-то.

---

## Как собрать историю клиента

Клиент — это компания из раздела «Клиенты» (её `id` берётся из `companies_search.php`).

1. `activities.php?company_id=X&expand=1&order=created`
2. `comments.php?company_id=X&expand=1`
3. Свои письма и звонки Кристалла, привязанные к `company_id = X`, а также к контактам компании. Список контактов есть в `company.php?id=X` → `contacts`.
4. Склеить всё в одну ленту по дате (`created`) и показывать новые первыми. Ключ для дедупликации: `uid`.

**Всегда передавайте `expand=1`.** Почти вся работа ведётся в сделках и лидах, а не в самой компании. Проверка на реальных данных:

| Компания | Комментарии без expand | Комментарии с expand | Дела с expand |
|---|---|---|---|
| Admiral Objekt (1025) | 0 | 11 | 85 |
| RENTHOFF (2559) | 3 | 17 | 42 |

Для истории одного контакта: `contact_id=Y&expand=1` (контакт и его сделки и лиды).

## Как построить календарь менеджера

```
activities.php?responsible_id=<bitrix user id>&completed=N&deadline_from=<начало>&deadline_to=<конец>
```

- Нужна связь «пользователь Кристалла → ID пользователя Битрикса».
- По умолчанию возвращаются и завершённые. Для календаря передавайте `completed=N`, а для отметки «сделано» `completed=Y`.
- `accomplices=1` добавляет задачи, где менеджер соисполнитель (например, задачи о пропущенных звонках ставятся всем менеджерам клиента). Удобно показывать их отдельно по полю `role`.
- **Дела без срока** в окно по `deadline` не попадают. Их стоит выводить отдельным списком «без срока»: тот же запрос без `deadline_from`/`deadline_to`, только с `completed=N`, отбирая элементы, где `deadline = null`.
- Фильтр «Кристалл / CRM / все» на стороне Кристалла: дела Кристалла берутся из его базы, из этого эндпоинта приходят CRM и задачи (`source` позволяет взять только одно из них).
- Фильтр по статусу: `completed=Y|N`.

## Пример: пришёл звонок

1. `resolve.php?phone=%2B420777123456`
2. Если `suggested` не `null`, сохраняем у звонка `contact_id`, `company_id` и `lead_id`.
3. Если `suggested = null`, но `found = true`, показываем менеджеру выбор из `contacts`, `companies` и `leads`.
4. Если `found = false`, это новый клиент.
