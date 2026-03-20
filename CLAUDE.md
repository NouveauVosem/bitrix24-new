# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Bitrix24 CRM customization project** — a collection of PHP event handlers, components, and JavaScript extensions for a Ukrainian company's Bitrix24 installation at `crm.alvla.eu`. It is not a standalone application; all code runs inside the Bitrix24 framework.

There is no build system, package manager, or test runner. Deployment is done by copying files to the Bitrix24 server.

## Architecture

### Entry Points

- **`php_interface/init.php`** — loaded by Bitrix24 on every request; registers autoloaders and frontend assets
- **`php_interface/events.php`** — registers all server-side event handlers (the primary integration point with Bitrix24)

### Event Flow

```
Bitrix24 Event (e.g., deal stage change)
    → events.php handler registration
    → php_interface/classes/ handler class
    → Helpers/ for ORM queries
    → CRest (ajax/crest/) for REST API calls when needed
```

```
User action in browser
    → js/ frontend script
    → AJAX call to ajax/ PHP handler
    → Bitrix24 ORM or custom DB table
```

### Key Classes

| File | Purpose |
|------|---------|
| `php_interface/classes/CCrmHandler.php` | Main business logic: monitors deal stage transitions, triggers inventory reservation/shipment for specific pipeline stages |
| `php_interface/classes/CCatalogStoreDocumentHandler.php` | Auto-copies products between store documents; renders custom warehouse dropdown fields |
| `php_interface/classes/CCrmLeadHandler.php` | Duplicate phone detection — auto-marks new leads as "lost" if phone already exists in contacts/companies/deals |
| `php_interface/classes/MissedCalls.php` | VoIP integration — auto-creates tasks for missed calls (code 304) on leads/contacts/companies/deals |
| `php_interface/classes/Helpers/CrmDeal.php` | Updates CRM custom (UF_) fields |
| `php_interface/classes/Helpers/StoreDocuments.php` | CRUD for catalog store documents via Bitrix ORM |
| `php_interface/classes/Helpers/StoreProducts.php` | Product/inventory queries across warehouses |
| `ajax/crest/crest.php` | OAuth2 REST API client for Bitrix24 (`CRest` class) — handles token refresh, batch calls |

### Component

`components/rk/products.warehouse.report/class.php` — a standalone inventory reporting component. Queries arrivals, adjustments, movements, write-offs, and sales to calculate per-product balances across 4 warehouses. Supports CSV export.

### Frontend Scripts (auto-loaded via `init.php`)

| File | Purpose |
|------|---------|
| `js/custom.js` | Inline product comment editing in CRM deal product rows (column `PROPERTY_92`); saves to field `UF_CRM_1755779350` and custom table `for_com_field`. Also injects "Расчитать доставку" button near field `UF_CRM_1765617418` (logic currently commented out). |
| `js/mail_disable_attachments/mail_disable_attachments.js` | Auto-removes file attachments from email reply forms using MutationObserver |
| `js/main_email_templates/main_email_templates.js` | Email template manager — save/load/delete templates for quick composition |
| `js/grid_documents/menu.js` | Adds context menu items to warehouse document grids for changing document dates |

### Backend for Frontend

| File | Purpose |
|------|---------|
| `js/main_email_templates/main_email_templates.php` | CRUD backend for email templates (get/add/update/delete) |
| `grid_documents/change.php` | Backend handler for document date changes |

### AJAX Handlers

| File | Purpose |
|------|---------|
| `ajax/update_com_field.php` | Save product comments to `for_com_field` table; creates table on demand |
| `ajax/get_com_field.php` | Retrieve product comments from `for_com_field` |
| `ajax/add_com_other_table.php` | Secondary comment storage (legacy/unused) |
| `ajax/change_documents_data.php` | Update warehouse document dates |

### Custom Database Table

`for_com_field` — stores product comments per deal (ID, DEAL_ID, PROPERTY, VALUE, DATE_CREATE). Created dynamically if missing.

## Event Handlers (events.php)

| Event | Handler | Description |
|-------|---------|-------------|
| `crm / OnBeforeCrmDealUpdate` | `CCrmHandler::productReserve` | Reserve products on deal stage change |
| `crm / OnAfterCrmDealProductRowsSave` | `CCrmHandler::OnAfterCrmDealProductRowsSave` | Post-save product row sync |
| `catalog / OnDocumentAdd` | `CCatalogStoreDocumentHandler::OnDocumentAdd` | Auto-copy products to new store document |
| `crm / OnAfterCrmLeadAdd` | `CCrmLeadHandler::checkDuplicatePhoneAndLoseLead` | Mark lead as lost if phone is duplicate |
| `sale / OnSaleShipmentEntitySaved` | `saveShipment()` | Write shipment ID/order/account to deal fields; schedule shipment date update via agent |
| `crm / onCrmDynamicItemUpdate` | `changeCmartInvoice()` | On Smart Invoice stage `DT31_1:P` — aggregate invoice totals and write remainder to deal |
| `voximplant / OnCallEnd` | `MissedCalls::checkCall` | Create task for missed calls (priority 10000) |
| `main / onGetPublicView` | `CCatalogStoreDocumentHandler::onGetPublicView` | Custom field rendering (view mode) |
| `main / onGetPublicEdit` | `CCatalogStoreDocumentHandler::onGetPublicEdit` | Custom field rendering (edit mode) |

## Deal Pipeline Stages

Business logic triggers on these specific stage IDs:

**Category 0:** `UC_TB1B18` (ZV/під замовлення), `UC_L8JVGQ` (сборка), `UC_3S4WFS` (выписка инвойса), `UC_KPW8X6` (заказ транспорта), `UC_WR1KV9` (в пути)

**Category 1:** `C1:UC_GI474N` (ZV), `C1:PREPARATION` (сборка), `C1:UC_3M0L0N` (выписка инвойса), `C1:UC_XELH19` (заказ транспорта), `C1:UC_2DPXDX` (в пути)

## CRM Fields Reference

| Field ID | Purpose |
|----------|---------|
| `UF_CRM_1755779350` | Product comments (saved from deal product grid) |
| `UF_CRM_1765617418` | "Розрахувати доставку" button anchor field |
| `UF_CRM_1741189617279` | Shipment date (used to schedule `AgentUpdateShipmentDate`) |
| `UF_CRM_1728403359608` | Deal total amount |
| `UF_CRM_1738587359094` | Remaining amount after invoice deduction |
| `UF_DOC` | Last shipment document ID |
| `UF_ORDER_ID` | Order ID from shipment |
| `UF_ACCOUNT_NUMBER` | Account number from shipment |

## Smart Invoice (Dynamic Entity)

- Entity type ID: `31`
- Trigger stage: `DT31_1:P`
- Field `UF_CRM_SMART_INVOICE_1738856087998` — invoice amount (pipe-separated, first value used)
- Field `UF_CRM_67A081D9A5E31` — total deal amount written to invoice
- Field `UF_CRM_67A0CBD1BC563` — remainder written to invoice

## IBlocks and Warehouses

**IBlocks:** 14 = Main Catalog, 15 = Offers

**Warehouses:** 1 = Main, 2 = Cink, 3 = Complect, 7 = Ukraine

**Sections:** 14 = Storage (Склад), 13 = Under Custom Order (Під замовлення)

**Document types:** A = Arrival, S = Adjustments, M = Movements, D = Write-offs, R_S = Sales

## Bitrix24-Specific Patterns

- **ORM queries** use `\Bitrix\Module\EntityTable::getList([...])` syntax
- **Events** are registered with `\Bitrix\Main\EventManager::getInstance()->addEventHandler()` or legacy `AddEventHandler()`
- **Frontend** uses Bitrix's global `BX` object (`BX.ready()`, `BX.ajax()`, `BX.PopupWindow`, `BX.Main.gridManager`)
- **Components** extend `\CBitrixComponent` and use `$this->arResult` / `$this->arParams`
- REST API calls go through `CRest::call('method.name', [...params])` or `CRest::callBatch([...])`
- **Agents** scheduled via `CAgent::Add([...])` for deferred operations

## Credentials

`ajax/crest/settings.json` holds live OAuth tokens for `crm.alvla.eu`. Never commit changes to this file with real credentials exposed; it is managed at runtime by `CRest`.

## Cookie Deduplication

`init.php` includes a temporary fix that removes duplicate cookies set across multiple domains simultaneously. It can be removed once the root cause (multi-domain cookie conflict) is resolved.

## Notes on Test/Backup Files

- `php_interface/classes/CCrmHandler.php111` — backup of CCrmHandler, not loaded
- `php_interface/classes/for_test_log_crm_ship.txt` — debug log file
- `php_interface/test.php`, `php_interface/classes/test.php` — debug scripts, not included in production flow
- `js/add_to_grid_menu.js` — commented out in `init.php`, unused
