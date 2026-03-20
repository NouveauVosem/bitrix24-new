<?php

use Bitrix\Main\Grid\Options as GridOptions;
use Bitrix\Crm\Filter\UiFilterOptions;

class ProductsWarehouseReport extends CBitrixComponent
{
    const GRID_ID_FILTER = 'products-warehouse-report';
    const GRID_ID_TABLE = 'products-warehouse-report-grid';
    const MAIN_WAREHOUSE_ID = 1;
    const WAREHOUSE_ID_COMPLECT = 3;
    const STORE_ID_UKRAINE = 7;
    const STORE_ID_CINK = 2;
    const CATALOG_IBLOCK_ID = 14;
    const SECTION_ID_SKLAD = 14;
    const TYPE_ID_PRODUCT_WITH_OFFER = 3;
    const OFFERS_IBLOCK_ID = 15;
    const SECTION_ID_PID_ZAKAZ = 13;
    private GridOptions $gridOptions;
    private ?string $userId;
    private int $warehouseIdSelected;
    private bool $isAppend = false;
    private array $arSorting;

    public function executeComponent(): void
    {
        CModule::IncludeModule('catalog');
        CModule::IncludeModule('crm');
        $this->gridOptions = new GridOptions(self::GRID_ID_TABLE);
        $this->arResult['WAREHOUSES'] = \Helpers\StoreDocuments::getAvailableStores();
        $this->arSorting = $this->gridOptions->getSorting()['sort'];
        $this->getUserFilterData();
        $this->setTableColumns();

        $this->warehouseIdSelected = $this->arResult['FILTER']['WAREHOUSE'] ?: self::MAIN_WAREHOUSE_ID;
        $this->arResult['SECTIONS'] = $this->getProductsSections();
        $this->arResult['PRODUCT_LIST_GLOBAL'] = $this->getGlobalProductList();
        $this->arResult['DOCUMENTS'] = $this->getDocumentsWithProducts();

        $this->arResult['DEALS'] = $this->getDealsWithProducts();

        $this->arResult['CALCULATED_DATA'] = [];
        $this->arResult['CALCULATED_DATA_ADDITIONAL'] = [];


        $this->getDataBySelectedWarehouse();
        $this->calcDataBySelectedWarehouse();
        $this->createGridRows();


        if (in_array($this->warehouseIdSelected, [self::MAIN_WAREHOUSE_ID, self::WAREHOUSE_ID_COMPLECT])) {
            $this->appendAdditionalWarehousesData();
        }

        if ($this->arResult['FILTER']['HIDE_ZERO'] == 'Y') {
            $this->deleteZeroColumns();
        }

        if ($_REQUEST['exportToCsv'] == 'Y') {
            global $APPLICATION;
            $APPLICATION->RestartBuffer();
            echo $this->exportToCsv();
            die;
        } else {
            $this->includeComponentTemplate();
        }
    }

    private function getUserFilterData(): void
    {
        global $USER;
        $this->userId = $USER->GetID();
        $filterOptions = new UiFilterOptions(self::GRID_ID_FILTER, []);
        $this->arResult['FILTER'] = $filterOptions->getFilter();

        if (!$this->arResult['FILTER']['DATE_from'] && !$this->arResult['FILTER']['DATE_to']) {
            $this->arResult['FILTER']['DATE_from'] = date("01.m.Y 00:00:01");
            $this->arResult['FILTER']['DATE_to'] = date("t.m.Y 23:59:00");
        }
    }


    private function getDataBySelectedWarehouse(): void
    {
        if (!empty($this->arResult['DOCUMENTS'])) {
            $arProductsIds = [];
            foreach ($this->arResult['DOCUMENTS'] as $strTypeDoc => $arDocumentsOfType) {
                foreach ($arDocumentsOfType as $arDocument) {
                    $arProductsIds = array_merge($arProductsIds, array_keys($arDocument['PRODUCTS'] ?: []));
                }
            }
            $this->arResult['PRODUCTS'] = $this->getProductsList($arProductsIds, $this->warehouseIdSelected);
        }
    }

    private function getProductsList(array $productIds, $warehouseId): array
    {
        $arProducts = \Helpers\StoreProducts::getProductsFromStore($warehouseId, $productIds);
        if (!empty($arProducts)) {
            $arProductsIds = array_keys($arProducts);
            $arProductsIblockData = \Bitrix\Iblock\ElementTable::getList([
                'filter' => ['ID' => $arProductsIds],
                'select' => ['ID', 'NAME']
            ])->fetchAll();
            foreach ($arProductsIblockData as $arProduct) {
                $arProducts[$arProduct['ID']]['IBLOCK_DATA'] = $arProduct;
            }
        }
        return $arProducts;
    }

    private function getDocumentsWithProducts(): array
    {

        //$dateTo = $this->arResult['FILTER']['DATE_to'];
        $dateTo = date("d.m.Y 23:59:00");
        $filter = [
            '>=DATE_STATUS' => $this->arResult['FILTER']['DATE_from'],
            '<=DATE_STATUS' => $dateTo,
        ];
        return \Helpers\StoreProducts::getDocumentsWithProducts($filter);
    }

    private function getDealsWithProducts(): array
    {
        $result = [];
        $obDeal = new CCrmDeal(false);
        //$arProductsIds = array_keys($this->arResult['PRODUCT_LIST_GLOBAL']);
        $arProductsIds = [];
        foreach ($this->arResult['PRODUCT_LIST_GLOBAL'] as $productId => $arProduct) {
            $arProductsIds[] = $productId;
            if (!empty($arProduct['OFFERS_IDS'])) {
                $arProductsIds = array_merge($arProductsIds, $arProduct['OFFERS_IDS']);
            }
        }
        $arDealsWithThisProducts = \Bitrix\Crm\ProductRowTable::getList([
            'filter' => ['PRODUCT_ID' => $arProductsIds, 'OWNER_TYPE' => 'D'],
        ])->fetchAll();

        if (!empty($arDealsWithThisProducts)) {
            $arDealsIds = array_column($arDealsWithThisProducts, 'OWNER_ID');
            $filter = [
                'ID' => $arDealsIds,
                'UF_DOC' => false,
                '!STAGE_SEMANTIC_ID' => [
                    \Bitrix\Crm\PhaseSemantics::FAILURE,
                    \Bitrix\Crm\PhaseSemantics::SUCCESS,
                ],
            ];


            $obDeals = \Bitrix\Crm\DealTable::getList([
                'filter' => $filter,
                'select' => ['ID']
            ]);
            while ($arDeal = $obDeals->fetch()) {
                $arDeal['PRODUCTS'] = $obDeal::LoadProductRows($arDeal['ID']);
                $result[] = $arDeal;
            }
        }
        return $result;
    }

    private function calcDataBySelectedWarehouse(): void
    {
        $currentSaveDataKey = 'CALCULATED_DATA';
        if ($this->isAppend) $currentSaveDataKey = 'CALCULATED_DATA_ADDITIONAL_' . $this->warehouseIdSelected;

        foreach ($this->arResult['PRODUCTS'] as $arProduct) {
            $arCalcRow = [];
            $arCalcRow['PRODUCT_NAME'] = $arProduct['IBLOCK_DATA']['NAME'];
            $arCalcRow['PRODUCT_ID'] = $arProduct['IBLOCK_DATA']['ID'];

            $arCalcRow['INCOMING'] = $this->calcIncomingForProduct($arProduct['PRODUCT_ID']);
            $arCalcRow['SOLD'] = $this->calcSoldForProduct($arProduct['PRODUCT_ID']);
            $arCalcRow['WRITE_OF'] = $this->calcWriteOfForProduct($arProduct['PRODUCT_ID']);

            $this->arResult[$currentSaveDataKey][$arProduct['PRODUCT_ID']] = $arCalcRow;
        }
    }

    private function createGridRows(): void
    {
        $this->arResult['ROWS'] = [];

        foreach ($this->arResult['PRODUCT_LIST_GLOBAL'] as $productId => $arProduct) {
            $arProductCalcData = $this->arResult['CALCULATED_DATA'][$productId] ?: [];
            if (empty($arProductCalcData)) {
                $arOffersIds = $this->getOffersIdsByProductId($productId);
                $arProductCalcData = $this->arResult['CALCULATED_DATA'][array_key_first($arOffersIds)] ?: [];
            }
            $arRow['id'] = $arProductCalcData['PRODUCT_ID'] ?: $productId;
            $sectionName = 'Верхний уровень';
            if ($arProduct['IBLOCK_SECTION_ID']) {
                $sectionName = "
                <a target='_blank' href='/shop/documents-catalog/list/{$arProduct['IBLOCK_SECTION_ID']}/?IBLOCK_ID=" . self::CATALOG_IBLOCK_ID . "'>
                    {$this->arResult['SECTIONS_ALL'][$arProduct['IBLOCK_SECTION_ID']]['NAME']}
                </a>";
            }

            $storeData = $arProduct['STORE_DATA'][$this->warehouseIdSelected];
            $finalAmount = $storeData['AMOUNT'] ?: 0;

            if ($this->inFilterDateToIsCurrentDay()) {
                $arProductCalcData['RESERVE'] = $this->calcReserveForProduct($arProduct['ID']);
                $arProductCalcData['RESERVE']['VALUE'] = $storeData['QUANTITY_RESERVED'] ?: 0;
            }


            $arProductCalcData['FIRST_AMOUNT'] =
                $finalAmount +
                $arProductCalcData['WRITE_OF']['VALUE'] +
                $arProductCalcData['SOLD']['VALUE'] -
                $arProductCalcData['INCOMING']['VALUE'];


            //рахуємо ще раз, відносно поточного періоду, попередні розрахунки були щоб дістати початковий залишок
            $arProductCalcData['INCOMING'] = $this->calcIncomingForProduct($arProduct['ID'], true);
            $arProductCalcData['SOLD'] = $this->calcSoldForProduct($arProduct['ID'], true);
            $arProductCalcData['WRITE_OF'] = $this->calcWriteOfForProduct($arProduct['ID'], true);
            if (!$this->inFilterDateToIsCurrentDay()) {
                $finalAmount =
                    $arProductCalcData['FIRST_AMOUNT'] +
                    $arProductCalcData['INCOMING']['VALUE'] -
                    $arProductCalcData['SOLD']['VALUE'] -
                    $arProductCalcData['WRITE_OF']['VALUE'];
            }
            //

            $column = [
                'PRODUCT_ID' => $arProduct['ID'],
                'PRODUCT_NAME' => "<a href='/shop/documents-catalog/" . self::CATALOG_IBLOCK_ID . "/product/{$arProduct['ID']}/'>{$arProduct['NAME']}</a>",
                'SECTION_NAME' => $sectionName,
                'FIRST_AMOUNT' => $this->getRowItemValue($arProductCalcData['FIRST_AMOUNT'], 'FIRST_AMOUNT'),
                'INCOMING' => $this->getRowItemValue($arProductCalcData['INCOMING'], 'INCOMING'),
                'SOLD' => $this->getRowItemValue($arProductCalcData['SOLD'], 'SOLD', $arProduct['ID']),
                'FINAL_AMOUNT' => $finalAmount,
                'WRITE_OF' => $this->getRowItemValue($arProductCalcData['WRITE_OF'], 'WRITE_OF'),
                'RESERVE' => $this->getRowItemValue($arProductCalcData['RESERVE'], 'RESERVE', $arProduct['ID']),
                'AVAILABLE_AMOUNT' => $finalAmount - $arProductCalcData['RESERVE']['VALUE'],
            ];
            $arRow['columns'] = $column;
            $this->arResult['ROWS'][] = $arRow;
        }
    }


    private function calcIncomingForProduct(int $productId, bool $skipByAdditionalFilter = false): array
    {
        $result = ['VALUE' => 0, 'DOCUMENTS' => []];
        $arDocuments = [];
        $arDocumentsIncoming = $this->arResult['DOCUMENTS']['Приход'] ?: [];
        $arDocumentsIncoming2 = $this->arResult['DOCUMENTS']['Оприходование'] ?: [];
        $arDocumentsMoving = $this->arResult['DOCUMENTS']['Перемещение'] ?: [];

        $arDocuments += $arDocumentsIncoming;
        $arDocuments += $arDocumentsIncoming2;
        $arDocuments += $arDocumentsMoving;

        if (!empty($arDocuments)) {
            if ($skipByAdditionalFilter) {
                $arDocuments = $this->getDocumentsFilteredByDate($arDocuments, 'DATE_STATUS');
            }
            foreach ($arDocuments as $arDocument) { 
                $arDocument['PRODUCTS'] = $arDocument['PRODUCTS'] ?: [];
                $arProductRowsInDocument = $arDocument['PRODUCTS'][$productId] ?: [];
                $arProductOffersIds = $this->arResult['PRODUCT_LIST_GLOBAL'][$productId]['OFFERS_IDS'] ?: [];
                if (!$arProductRowsInDocument && !empty($arProductOffersIds)) {
                    foreach ($arProductOffersIds as $offerId) {
                        if (array_key_exists($offerId, $arDocument['PRODUCTS'])) {
                            $arProductRowsInDocument = $arDocument['PRODUCTS'][$offerId] ?: [];
                        }
                    }
                }
                foreach ($arProductRowsInDocument as $arProductInDocument) {
                    if ($arProductInDocument['STORE_TO'] == $this->warehouseIdSelected) {
                        $result['VALUE'] += $arProductInDocument['AMOUNT'];
                        $result['DOCUMENTS'][] = $arDocument;
                    }
                }
            }
        }

        return $result;
    }

    private function calcSoldForProduct(int $productId, bool $skipByAdditionalFilter = false): array
    {
        $result = ['VALUE' => 0, 'DOCUMENTS' => []];
        $arDocuments = $this->arResult['DOCUMENTS']['Реализация'];
        
        if (!empty($arDocuments)) {
            if ($skipByAdditionalFilter) {
                $arDocuments = $this->getDocumentsFilteredByDate($arDocuments, 'DATE_DEDUCTED');
            }

            foreach ($arDocuments as $arDocument) {
                $arDocument['PRODUCTS'] = $arDocument['PRODUCTS'] ?: [];
                $arProductRowsInDocument = $arDocument['PRODUCTS'][$productId] ?: [];
                $arProductOffersIds = $this->arResult['PRODUCT_LIST_GLOBAL'][$productId]['OFFERS_IDS'] ?: [];
                if (!$arProductRowsInDocument && !empty($arProductOffersIds)) {
                    foreach ($arProductOffersIds as $offerId) {
                        if (array_key_exists($offerId, $arDocument['PRODUCTS'])) {
                            $arProductRowsInDocument = $arDocument['PRODUCTS'][$offerId] ?: [];
                        }
                    }
                }
                foreach ($arProductRowsInDocument as $arProductInDocument) {
                    if ($arProductInDocument['STORE_TO'] == $this->warehouseIdSelected) {
                        $result['VALUE'] += $arProductInDocument['AMOUNT'];
                        $result['DOCUMENTS'][] = $arDocument;
                    }
                }
            }
        }
        return $result;
    }

    private function calcWriteOfForProduct(int $productId, bool $skipByAdditionalFilter = false): array
    {
        $result = ['VALUE' => 0, 'DOCUMENTS' => []];
        $arDocuments = $this->arResult['DOCUMENTS']['Списание'] ?: [];
        $arDocuments += $this->arResult['DOCUMENTS']['Перемещение'] ?: [];

        if (!empty($arDocuments)) {
            if ($skipByAdditionalFilter) {
                $arDocuments = $this->getDocumentsFilteredByDate($arDocuments, 'DATE_STATUS');
            }
            foreach ($arDocuments as $arDocument) {
                $arDocument['PRODUCTS'] = $arDocument['PRODUCTS'] ?: [];
                $arProductRowsInDocument = $arDocument['PRODUCTS'][$productId] ?: [];
                $arProductOffersIds = $this->arResult['PRODUCT_LIST_GLOBAL'][$productId]['OFFERS_IDS'] ?: [];
                if (!$arProductRowsInDocument && !empty($arProductOffersIds)) {
                    foreach ($arProductOffersIds as $offerId) {
                        if (array_key_exists($offerId, $arDocument['PRODUCTS'])) {
                            $arProductRowsInDocument = $arDocument['PRODUCTS'][$offerId] ?: [];
                        }
                    }
                }
                foreach ($arProductRowsInDocument as $arProductInDocument) {
                    if ($arProductInDocument['STORE_FROM'] == $this->warehouseIdSelected) {
                        $result['VALUE'] += $arProductInDocument['AMOUNT'];
                        $result['DOCUMENTS'][] = $arDocument;
                    }
                }
            }
        }
        return $result;
    }

    public function getProductByOfferId(int $offerId): array
    {
        foreach ($this->arResult['PRODUCT_LIST_GLOBAL'] as $productId => $arProduct) {
            if (is_array($arProduct['OFFERS_IDS']) && in_array($offerId, $arProduct['OFFERS_IDS'])) {
                return $arProduct;
            }
        }
        return [];
    }

    public function getOffersIdsByProductId(int $productId): array
    {
        $arProduct = $this->arResult['PRODUCT_LIST_GLOBAL'][$productId] ?: [];
        if (!empty($arProduct) && !empty($arProduct['OFFERS_IDS'])) {
            return $arProduct['OFFERS_IDS'];
        }
        return [];
    }




    private function getRowItemValue($value, $fieldCode, $productID = null): string|int
    {
        if (!$value) return 0;
        $resultValue = $value;
        if (is_array($value)) {
            $url = '/custom-reports/products-warehouse/show_documents_list.php';
            if (!empty($value['DOCUMENTS'])) {

                $notSaleDocIds = $saleDocIds = [];
                foreach ($value['DOCUMENTS'] as $document) {
                    if (!$document['IS_SALE']) {
                        $notSaleDocIds[] = $document['ID'];
                    } else {
                        $saleDocIds[] = $document['ID'];
                    }
                }
                $docIds = array_column($value['DOCUMENTS'], 'ID');
                if ($fieldCode != 'RESERVE') {
                    $params = ['docIds' => $notSaleDocIds, 'saleDocIds' => $saleDocIds, 'entityType' => 'document'];
                    if ($fieldCode == 'SOLD') {
                        $params['soldAmount'] = $value['VALUE'];
                        if ($productID > 0) {
                            $params['productId'] = $productID;
                        }
                    }
                } else {
                    $params = ['docIds' => $docIds, 'entityType' => 'deal'];
                    $params['productId'] = $productID;
                }

                $url .= '?' . http_build_query($params);

            }
            $resultValue = "
                <a class='show-documents-list' href='javascript:void(0);' data-url='$url'>{$value['VALUE']}</a>
            ";
        }

        return $resultValue;

    }

    private function setTableColumns(): void
    {
        $this->arResult['COLUMNS'] = array(
            ['id' => 'PRODUCT_ID', 'name' => 'ID товара', 'sort' => 'PRODUCT_ID'],
            ['id' => 'PRODUCT_NAME', 'name' => 'Товар', 'sort' => 'PRODUCT_ID'],
            ['id' => 'SECTION_NAME', 'name' => 'Раздел', 'sort' => 'SECTION_NAME'],
            ['id' => 'FIRST_AMOUNT', 'name' => 'Начальный остаток',],
            ['id' => 'INCOMING', 'name' => 'Поступило',],
            ['id' => 'SOLD', 'name' => 'Продано',],
            ['id' => 'WRITE_OF', 'name' => 'Списано',],
            ['id' => 'FINAL_AMOUNT', 'name' => 'Конечный остаток',],
            ['id' => 'RESERVE', 'name' => 'Резерв',],
            ['id' => 'AVAILABLE_AMOUNT', 'name' => 'Доступный остаток',],
        );
    }

    private function calcReserveForProduct(int $productId): array
    {
        $result = ['VALUE' => 0, 'DOCUMENTS' => []];
        foreach ($this->arResult['DEALS'] as $arDeal) {

            foreach ($arDeal['PRODUCTS'] as $arProduct) {
                $isCurrentProduct = $arProduct['PRODUCT_ID'] == $productId;
                if (!$isCurrentProduct && !empty($this->arResult['PRODUCT_LIST_GLOBAL'][$productId]['OFFERS_IDS'])) {
                    $isCurrentProduct = in_array($arProduct['PRODUCT_ID'], $this->arResult['PRODUCT_LIST_GLOBAL'][$productId]['OFFERS_IDS']);
                }
                if ($isCurrentProduct && $arProduct['STORE_ID'] == $this->warehouseIdSelected && $arProduct['RESERVE_QUANTITY'] > 0) {
                    $result['VALUE'] += $arProduct['RESERVE_QUANTITY'] ?: 0;
                    $result['DOCUMENTS'][] = $arDeal;
                }
            }
        }


        return $result;
    }

    private function appendAdditionalWarehousesData(): void
    {
        $this->isAppend = true;
        $arAdditionalWarehouses = [self::STORE_ID_UKRAINE, self::STORE_ID_CINK];
        foreach ($arAdditionalWarehouses as $additionalStoreId) {
            $this->warehouseIdSelected = $additionalStoreId;
            $this->getDataBySelectedWarehouse();
            $this->calcDataBySelectedWarehouse();

            $columnStoreIdAvailableAmount = 'AVAILABLE_AMOUNT_STORE_' . $additionalStoreId;
            $this->arResult['COLUMNS'][] = [
                'id' => $columnStoreIdAvailableAmount,
                'name' => 'Доступный остаток ' . $this->arResult['WAREHOUSES'][$additionalStoreId]['TITLE'],
            ];

            foreach ($this->arResult['ROWS'] as &$arRow) {
                $productId = $arRow['id'];
                $arProduct = $this->arResult['PRODUCT_LIST_GLOBAL'][$productId];
                $arOffersIds = $this->getOffersIdsByProductId($productId);
                if (empty($arProduct) && !empty($arOffersIds)) {
                    $arProduct = $this->getProductByOfferId($arOffersIds[array_key_last($arOffersIds)]['ID']);
                }

                if (empty($arProduct)) {
                    $arRow['columns'][$columnStoreIdAvailableAmount] = 0;
                    continue;
                };


                $arCalculatedDataAdditional = $this->arResult['CALCULATED_DATA_ADDITIONAL_' . $additionalStoreId][$productId] ?: [];
                if (empty($arCalculatedDataAdditional)) {
                    $arCalculatedDataAdditional = $this->arResult['CALCULATED_DATA_ADDITIONAL_' . $additionalStoreId][array_key_first($arOffersIds)] ?: [];
                }

                $storeData = $arProduct['STORE_DATA'][$additionalStoreId] ?: [];
                $finalAmount = $storeData['AMOUNT'] ?: 0;

                if ($this->inFilterDateToIsCurrentDay()) {
                    $arCalculatedDataAdditional['RESERVE'] = $this->calcReserveForProduct($arProduct['ID']);
                    $arCalculatedDataAdditional['RESERVE']['VALUE'] = $storeData['QUANTITY_RESERVED'] ?: 0;
                }


                $arCalculatedDataAdditional['FIRST_AMOUNT'] =
                    $finalAmount +
                    $arCalculatedDataAdditional['WRITE_OF']['VALUE'] +
                    $arCalculatedDataAdditional['SOLD']['VALUE'] -
                    $arCalculatedDataAdditional['INCOMING']['VALUE'];


                //рахуємо ще раз, відносно поточного періоду, попередні розрахунки були щоб дістати початковий залишок
                $arCalculatedDataAdditional['INCOMING'] = $this->calcIncomingForProduct($arProduct['ID'], true);
                $arCalculatedDataAdditional['SOLD'] = $this->calcSoldForProduct($arProduct['ID'], true);
                $arCalculatedDataAdditional['WRITE_OF'] = $this->calcWriteOfForProduct($arProduct['ID'], true);
                if (!$this->inFilterDateToIsCurrentDay()) {
                    $finalAmount =
                        $arCalculatedDataAdditional['FIRST_AMOUNT'] +
                        $arCalculatedDataAdditional['INCOMING']['VALUE'] -
                        $arCalculatedDataAdditional['SOLD']['VALUE'] -
                        $arCalculatedDataAdditional['WRITE_OF']['VALUE'];
                }
                //


                if (!empty($arCalculatedDataAdditional)) {
                    $arRow['columns'][$columnStoreIdAvailableAmount] = $finalAmount - $arCalculatedDataAdditional['RESERVE']['VALUE'];
                }
            }



        }
    }

    private function exportToCsv()
    {
        $fileName = 'Отчет: Движение товара по складам ' . date("d.m.Y H-i-s") . '.csv';
        $arHeaders = $this->arResult['COLUMNS'];
        $arHeaders = array_column($arHeaders, 'name');

        $arData = [];
        foreach ($this->arResult['ROWS'] as $idEmp => $arRow) {
            foreach ($arRow['columns'] as &$colValue) {
                $colValue = trim(strip_tags($colValue));
            }
            $arData[] = $arRow['columns'];
        }

        $obCsv = new CsvFromArray($fileName, $arHeaders, $arData, ';');
        $fullPath = $obCsv->create();
        return str_replace($_SERVER['DOCUMENT_ROOT'], '', $fullPath);
    }

    private function getGlobalProductList(): array
    {
        $result = [];
        $arFilter = ['IBLOCK_ID' => self::CATALOG_IBLOCK_ID, 'ACTIVE' => 'Y'];

        if (empty($this->arResult['FILTER']['SECTIONS'])) {
            if ($this->warehouseIdSelected == self::MAIN_WAREHOUSE_ID) {
                $this->arResult['FILTER']['SECTIONS'] = [self::SECTION_ID_SKLAD];
            } else {
                $this->arResult['FILTER']['SECTIONS'] = [self::SECTION_ID_SKLAD, self::SECTION_ID_PID_ZAKAZ];
            }
        }

        $arFilter['SECTION_ID'] = $this->getSubSectionsRecursive($this->arResult['FILTER']['SECTIONS']);
        $arFilter['SECTION_ID'] += $this->arResult['FILTER']['SECTIONS'];
        $arFilter['SECTION_ID'] = array_unique($arFilter['SECTION_ID']);

        $defaultSort = ['ID' => 'DESC'];
        if ($this->arSorting['PRODUCT_ID']) {
            $defaultSort['ID'] = $this->arSorting['PRODUCT_ID'];
        }

        if ($this->arResult['FILTER']['FIND']) {
            $arFilter['%NAME'] = trim($this->arResult['FILTER']['FIND']);
        }
        $obProducts = CIBlockElement::GetList(
            $defaultSort,
            $arFilter,
            false,
            false,
            ['ID', 'NAME', 'IBLOCK_SECTION_ID']
        );
        while ($arProduct = $obProducts->fetch()) {
            $arCatalogItem = CCatalogProduct::GetByID($arProduct['ID']);
            if ($arCatalogItem['TYPE'] == self::TYPE_ID_PRODUCT_WITH_OFFER) {
                $obProductOffers = CIBlockElement::GetList(
                    [],
                    ['IBLOCK_ID' => self::OFFERS_IBLOCK_ID, 'PROPERTY_CML2_LINK' => $arProduct['ID']],
                    false,
                    false,
                    ['ID', 'NAME', 'PROPERTY_CML2_LINK']
                );
                while ($arOffer = $obProductOffers->Fetch()) {
                    $arProduct['OFFERS'][$arOffer['ID']] = $arOffer;
                }
            }
            $arProduct['STORE_DATA'] = $this->getStoreDataByProductId($arProduct['ID']);
            if (empty($arProduct['STORE_DATA']) && !empty($arProduct['OFFERS'])) {
                $arProduct['STORE_DATA'] = $this->getStoreDataByProductId($arProduct['OFFERS'][array_key_first($arProduct['OFFERS'])]['ID']);
            }
            if (!empty($arProduct['OFFERS'])) {
                foreach ($arProduct['OFFERS'] as $arOffer) {
                    $arProduct['OFFERS_IDS'][$arOffer['ID']] = $arOffer['ID'];
                }

            }

            $result[$arProduct['ID']] = $arProduct;
        }

        if ($this->arSorting['SECTION_NAME']) {
            $direction = strtolower($this->arSorting['SECTION_NAME']) === 'desc' ? -1 : 1;
            $sections = $this->arResult['SECTIONS_ALL'];
            uasort($result, function ($a, $b) use ($direction, $sections) {
                $nameA = $sections[$a['IBLOCK_SECTION_ID']]['NAME'] ?? '';
                $nameB = $sections[$b['IBLOCK_SECTION_ID']]['NAME'] ?? '';

                return $direction * strcmp($nameA, $nameB);
            });
        }

        return $result;
    }

    private function getStoreDataByProductId(int $productId): array
    {
        $result = [];
        $arStoreData = \Bitrix\Catalog\StoreProductTable::getList([
            'filter' => ['PRODUCT_ID' => $productId],
        ])->fetchAll();
        if (!empty($arStoreData)) {
            $result = array_column($arStoreData, null, 'STORE_ID');
        }

        return $result;
    }

    private function getProductsSections()
    {
        $result = [];

        $res = CIBlockSection::GetList(
            ['LEFT_MARGIN' => 'ASC'],
            ['IBLOCK_ID' => self::CATALOG_IBLOCK_ID, 'ACTIVE' => 'Y'],
            false,
            ['ID', 'NAME', 'DEPTH_LEVEL','IBLOCK_SECTION_ID']
        );

        while ($section = $res->Fetch()) {
            $this->arResult['SECTIONS_ALL'][$section['ID']] = $section;
            $prefix = str_repeat('.', $section['DEPTH_LEVEL'] - 1);
            $result[$section['ID']] = $prefix . $section['NAME'];
        }
        return $result;
    }

    private function getSubSectionsRecursive(array $arSectionIds): array
    {
        $result = [];
        $nextLevelIds = [];

        foreach ($this->arResult['SECTIONS_ALL'] as $section) {
            if (in_array($section['IBLOCK_SECTION_ID'], $arSectionIds)) {
                $result[] = $section["ID"];
                $nextLevelIds[] = $section['ID'];
            }
        }

        if (!empty($nextLevelIds)) {
            $result = array_merge($result, $this->getSubSectionsRecursive($nextLevelIds));
        }

        return $result;
    }

    private function isEmptyColumn(array $column)
    {
        $arSkipColumnNames = ['PRODUCT_ID', 'PRODUCT_NAME', 'SECTION_NAME'];
        $isEmpty = true;
        foreach ($column as $code => $value) {
            if (!in_array($code, $arSkipColumnNames)) {
                $clearValue = trim(strip_tags($value));
                if (intval($clearValue) > 0) {
                    $isEmpty = false;
                }
            }
        }
        return $isEmpty;
    }

    private function deleteZeroColumns()
    {
        foreach ($this->arResult['ROWS'] as $keyRow => $arRow)
        {
            if ($this->isEmptyColumn($arRow['columns'])) {
                unset($this->arResult['ROWS'][$keyRow]);
            }
        }
    }

    private function getDocumentsFilteredByDate(array $arDocuments, string $fieldFilterCode)
    {
        $dateCreateToInFilterTimeStamp = strtotime($this->arResult['FILTER']['DATE_to']);

        foreach ($arDocuments as $keyDocument => $arDocument) {
            if ($arDocument[$fieldFilterCode]) {
                $dateCreateDocumentTimestamp = strtotime($arDocument[$fieldFilterCode]->toString());
                if ($dateCreateDocumentTimestamp > $dateCreateToInFilterTimeStamp) {
                    unset($arDocuments[$keyDocument]);
                }
            }
        }

        return $arDocuments;
    }

    private function inFilterDateToIsCurrentDay(): bool
    {
        $check = str_contains($this->arResult['FILTER']['DATE_to'], date("d.m.Y"));
        if (!$check) {
            $timeStampFilter = strtotime(date("d.m.Y", strtotime($this->arResult['FILTER']['DATE_to'])));
            $currentTimeStamp = strtotime(date("d.m.Y"));
            if ($currentTimeStamp < $timeStampFilter) {
                $check = true;
            }
        }
        return $check;
    }


}