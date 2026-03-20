<?php

class CCatalogStoreDocumentHandler
{
    const UF_LIST_OF_OTHER_DOCUMENTS = 'UF_CATALOG_1746719926754';
    const UF_STORE_TO = 'UF_CATALOG_1746717715573';

    public static function OnDocumentAdd($documentId, $arFields = [])
    {
        if ($documentId > 0) {
            $arDocumentData = \Helpers\StoreDocuments::getById($documentId);

            $arDocumentLinks = $arDocumentData[self::UF_LIST_OF_OTHER_DOCUMENTS];
            if (!empty($arDocumentLinks)) {
                $arDocumentIds = [];
                foreach ($arDocumentLinks as $arDocumentLink) {
                    if (preg_match('#/details/(\d+)/?#', $arDocumentLink, $matches)) {
                        $arDocumentIds[] = (int)$matches[1];;
                    }
                } 
                self::copyProductsFromOtherDocuments($documentId, $arDocumentIds, $arDocumentData);
            }
        }
    }

    public static function onGetPublicEdit($event)
    {
        $params = $event->getParameters();
        foreach ($params as $arField) {
            if ($arField['FIELD_NAME'] == self::UF_STORE_TO) {
                $htmlResult = "<select name='{$arField['FIELD_NAME']}' class='ui-ctl-element'>";
                $arStores = \Helpers\StoreDocuments::getAvailableStores();
                foreach ($arStores as $arStore) {
                    $isSelected = '';
                    if ($arField['VALUE'] == $arStore['ID']) {
                        $isSelected = 'selected';
                    }
                    $htmlResult .= "<option $isSelected value='{$arStore['ID']}'>{$arStore['TITLE']}</option>";
                }
                $htmlResult .= "</select>";
                return new \Bitrix\Main\EventResult(\Bitrix\Main\EventResult::SUCCESS, $htmlResult);
            }
        }
    }

    public static function onGetPublicView($event)
    {
        $params = $event->getParameters();
        foreach ($params as $arField) {
            if ($arField["FIELD_NAME"] == self::UF_STORE_TO) {
                $htmlResult = '';
                if ($arField['VALUE']) {
                    $arStores = \Helpers\StoreDocuments::getAvailableStores();
                    $htmlResult = $arStores[$arField['VALUE']]['TITLE'];
                }

                if (!$htmlResult) $htmlResult = 'Не заповнено';
                return new \Bitrix\Main\EventResult(\Bitrix\Main\EventResult::SUCCESS, $htmlResult);
            }
        }
    }


    private static function copyProductsFromOtherDocuments(int $documentId, array $arDocumentIdsFrom, array $documentData)
    {
        if (!empty($arDocumentIdsFrom) && $documentId > 0) {
            foreach ($arDocumentIdsFrom as $documentIdFrom) {
                $arProducts = \Helpers\StoreDocuments::getDocumentProducts($documentIdFrom);
                if (!empty($arProducts)) {
                    foreach ($arProducts as $arProduct) {
                        \Helpers\StoreDocuments::addProductToDocument(
                            $documentId,
                            $arProduct['ELEMENT_ID'],
                            $arProduct['AMOUNT'] ?: 1,
                            $arProduct['PURCHASING_PRICE'] ?: 0,
                            $arProduct['STORE_TO'],
                            $documentData[self::UF_STORE_TO],
                        );
                    }
                }
            }
        }
    }
}