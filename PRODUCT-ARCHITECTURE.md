---
Структура продуктов в a-crystal

Стек

Backend: Node.js + TypeScript + TypeORM + PostgreSQL
Frontend: React (JSX)

---
Основные сущности (БД)

Product (основной контейнер)
├── id (UUID)
├── productType → ProductType
├── status (active/inactive)
├── name / shortDescription / htmlDescription — JSONB {ru, en, cs}
├── specifications — JSONB (агрегат из вариантов, для фильтрации)
├── media — JSONB [{url, order, typeOfMedia, alt}]
└── variants (1:N) → ProductVariant

ProductVariant (конкретная позиция)
├── article (уникальный, напр. "01.0001.01")
├── venturaLink (ссылка на старую систему — Bitrix/Ventura)
├── specs — JSONB {color: "zinc", weight: 300, range: [29,37]}
├── dimensions — JSONB {internal/external: {h,w,d}}
├── weight (decimal, кг)
├── featureCodes (text[])
├── tags (N:M)
└── equipComponents → VariantComponent

Дополнительные таблицы

┌──────────────────────┬───────────────────────────────────────────────────────────────────────┐
│       Таблица        │                              Назначение                               │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ product_types        │ Категории товаров с иерархией (parentCode)                            │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ spec_keys            │ Атрибуты (код, тип значения, unit, sortOrder, по каким типам товаров) │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ specification_values │ Enum-варианты для атрибутов                                           │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ spec_enum_rich       │ Зависимые enum'ы (напр. цвет зависит от материала)                    │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ features             │ Фичи товара с локализованными метками                                 │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ product_compat       │ Совместимость товаров (detail/option)                                 │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ variant_components   │ Комплектация варианта (другие варианты + кол-во)                      │
├──────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ title_formulas       │ Правила генерации динамических заголовков                             │
└──────────────────────┴───────────────────────────────────────────────────────────────────────┘

---
Ключевые паттерны

1. Мультиязычность через JSONB — все текстовые поля: {ru: "...", en: "...", cs: "..."}
2. Specs в 2 местах: истина в ProductVariant.specs, кешируется в Product.specifications для быстрой фильтрации каталога
3. 3 типа спецификаций: float/range ([29, 37]), enum (код строкой), rich enum (с зависимостями)
4. Media вне БД: файлы на WebDAV/Synology, в БД только URL как JSONB
5. venturaLink — это мост к старой системе Bitrix/Ventura (интересно в контексте твоего проекта)

---
Фронтенд (React компоненты)

frontend/src/components/Products/:
- Products.jsx — главная страница управления
- VariantEditor.jsx — редактор вариантов и спеков
- ProductTypesPanel.jsx — управление категориями
- CompatPanel.jsx / VariantCompatPanel.jsx — совместимость
- AiFillModal.jsx — AI-генерация описаний
- TitleFormulaPanel.jsx — динамические заголовки

---


---
Как связан вариант с продуктом

В БД: ProductVariant.product — это @ManyToOne с onDelete: "CASCADE". В таблице хранится колонка product_id (FK). Вариант без продукта существовать не может — каскад при удалении продукта сносит все его варианты.

---
Можно ли сохранить вариант без участия продукта?

Нет. Все три пути записи всегда грузят продукт первым:

1. addVariant (POST /product/addVariant/:id) — добавить новый вариант

// Сначала грузит продукт:
const product = await this.productRepo.findOne({ where: { id: productId }, relations: ['variants'...] });

// Создаёт вариант с явной ссылкой на продукт:
const variant = this.variantRepo.create({ ..., product });

// Добавляет в массив и пересчитывает кеш:
product.variants.push(variant);
product.specifications = this.aggregateSpecifications(product.variants);

// Сохраняет ПРОДУКТ (вариант идёт каскадом):
return await this.productRepo.save(product);

2. update (PATCH /product/update/:id) — обновить продукт + варианты

Варианты передаются в dto.variants[]. Сервис сам матчит по id — что существует, обновляет; что ново — создаёт; чего нет в DTO — удаляет. Сохраняется через productRepo.save(product).

▎ Отдельного endpoint'а PATCH /product/variant/:id нет — вариант нельзя обновить изолированно, только как часть полного dto.variants.

3. deleteVariant — единственное исключение

Это единственный метод где вызывается variantRepo.delete(variantId) напрямую. Но и здесь после удаления обязательно перезагружает продукт и пересчитывает product.specifications:
const product = await this.productRepo.findOne({ where: { id: productId }, relations: ['variants'] });
product.specifications = this.aggregateSpecifications(product.variants);
await this.productRepo.save(product);

---
Ключевой инвариант

Product.specifications — это денормализованный кеш для фильтрации каталога, агрегированный из всех variant.specs. Поэтому любое изменение вариантов обязано идти через продукт — иначе кеш рассинхронизируется.

Вариант изменился → пересчитать Product.specifications → сохранить продукт

Это и есть причина, почему независимого сохранения варианта нет.


---
Создание/обновление формы продукта

Где хранятся формы

Формы хранятся в Crystal (https://crystal.alvla.tools), а не в Битриксе. Битрикс используется только как источник каталога (опции слотов).

---
API-поток сохранения (product_forms_editor.js:36–73)

Создание новой формы — 2 запроса:
1. POST /api/product-forms
   { name, bitrixName, article, productName, variantName, bitrixId }
   → получаем { id, ... }

2. PUT /api/product-forms/{id}/full
   { ...то же + slots: [...] }

Обновление существующей — 1 запрос:
PUT /api/product-forms/{id}/full
{ name, bitrixName, article, productName, variantName, bitrixId, slots: [...] }

Слот в payload:
{
  id: null,              // null если новый
  name: { ru, en, cs }, // локализованное название
  required: true,
  quantityPerUnit: 1,
  order: 0,
  options: [{ id, article, name, bitrixId }]
}

---
Откуда берутся опции слотов (Битрикс)

Редактор формы подтягивает товары из каталога Битрикса через локальные PHP-хендлеры:

┌────────────────────────────────────────────────────────────────┬──────────────────────────┬──────────────────────────────┐
│                             Запрос                             │           Файл           │          Назначение          │
├────────────────────────────────────────────────────────────────┼──────────────────────────┼──────────────────────────────┤
│ GET /local/ajax/crystal/get_catalog_sections.php               │ Битрикс → IBlock         │ Список разделов каталога     │
│                                                                │ sections                 │                              │
├────────────────────────────────────────────────────────────────┼──────────────────────────┼──────────────────────────────┤
│ GET /local/ajax/crystal/get_catalog_products.php?sectionId=X   │ Битрикс → IBlock         │ Товары раздела               │
│                                                                │ products                 │                              │
├────────────────────────────────────────────────────────────────┼──────────────────────────┼──────────────────────────────┤
│ GET                                                            │ Битрикс → поиск          │ Автокомплит по               │
│ /local/ajax/crystal/search_catalog_products.php?q=X&limit=8    │                          │ артикулу/имени               │
└────────────────────────────────────────────────────────────────┴──────────────────────────┴──────────────────────────────┘

Из Битрикса берётся только: article, name, bitrixId. Потом это сохраняется в Crystal как опции слота.

---
Нормы (deal_product_forms.js)

Поверх форм есть слой норм — конкретные конфигура и ценой:

POST /api/product-form-norms/findOrCreate  ← создns
PATCH /api/product-form-norms/{id}          ← обновить draftPrice/snapshot
PATCH /api/product-form-norms/{id}/setDefault
DELETE /api/product-form-norms/{id}

---
Итоговая схема

Битрикс (каталог)
    ↓ get_catalog_products.php (PHP → IBlock)
    ↓ артикулы + bitrixId
Crystal (product_forms_editor.js)
    → POST/PUT /api/product-forms/{id}/full  (фор
    → POST /api/product-form-norms/findOrCreate  (конкретная конфигурация)
    → PATCH add_deal_product.php             (еслсделки в Битрикс)

Битрикс — только источник данных каталога и приёмчник форм живёт в Crystal.