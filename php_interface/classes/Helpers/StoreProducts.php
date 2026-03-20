<?php

namespace Helpers;

use Bitrix\Catalog\StoreDocumentElementTable;
use Bitrix\Catalog\StoreProductTable;
use Bitrix\Sale\Internals\ShipmentTable;
use Bitrix\Sale\Internals\BasketTable;
use Bitrix\Sale\Internals\ShipmentItemStoreTable;

class StoreProducts
{
    public static function getProductsFromStore(int $storeId, array $productsIds = []): array
    {
        $products = [];

        $filter = ['=STORE_ID' => $storeId];
        if (!empty($productsIds)) {
            $filter['PRODUCT_ID'] = $productsIds;
        }
        $result = StoreProductTable::getList([
            'filter' => $filter,
            'select' => ['*']
        ]);

        while ($item = $result->fetch()) {
            $products[$item['PRODUCT_ID']] = $item;
        }

        return $products;
    }


    public static function getDocumentsWithProducts(array $filter)
    {

        $arDocuments = $arDocumentsIds = [];
        $obDocuments = \Bitrix\Catalog\StoreDocumentTable::getList([
            'filter' => $filter,
            'select' => ['*']
        ]);
        while ($arDocument = $obDocuments->fetch()) {
            $arDocumentsIds[] = $arDocument['ID'];
            $arDocuments[StoreDocuments::DOCUMENT_TYPES[$arDocument['DOC_TYPE']]][$arDocument['ID']] = $arDocument;
        }

        if (!empty($arDocuments)) {
            $obProductRow = StoreDocumentElementTable::getList([
                'filter' => ['=DOC_ID' => $arDocumentsIds],
                'select' => ['ID', 'DOC_ID', 'ELEMENT_ID', 'AMOUNT', 'PURCHASING_PRICE', 'STORE_FROM', 'STORE_TO'],
            ]);
            while ($arProductRow = $obProductRow->fetch()) {
                foreach ($arDocuments as $strDocType => &$arDocumentsOfType) {
                    foreach ($arDocumentsOfType as &$arDocument) {
                        if ($arDocument['ID'] == $arProductRow['DOC_ID']) {
                            $arDocument['PRODUCTS'][$arProductRow['ELEMENT_ID']][] = $arProductRow;
                        }
                    }
                }
            }
        }

        $arDocuments = self::appendDocumentsRealization($arDocuments, $filter);

        return $arDocuments;
    }

    private static function appendDocumentsRealization(array $arDocuments, $filter)
    {
        $arOrdersIds = [];
        $filterShipment['>=DATE_DEDUCTED'] = $filter['>=DATE_STATUS'];
        $filterShipment['<=DATE_DEDUCTED'] = $filter['<=DATE_STATUS'];
        $filterShipment['DEDUCTED'] = 'Y';
        $obShipments = ShipmentTable::getList([
            'filter' => $filterShipment,
            'select' => ['ID', 'ORDER_ID', 'PRICE_DELIVERY', 'DATE_INSERT', 'DATE_DEDUCTED']
        ]);

        while ($arShipment = $obShipments->fetch()) {
            $arShipment['IS_SALE'] = 'Y';
            $arDocuments['Реализация'][$arShipment['ID']."S_R"] = $arShipment;
            if ($arShipment['ORDER_ID'] > 0) {
                $arOrdersIds[] = $arShipment['ORDER_ID'];
            }
        }

        if (!empty($arOrdersIds)) {
            $obBasket = BasketTable::getList([
                'filter' => ['=ORDER_ID' => $arOrdersIds],
                'select' => ['ID', 'ORDER_ID', 'PRODUCT_ID', 'NAME']
            ]);

            while ($arBasketItem = $obBasket->fetch()) {
                foreach($arDocuments['Реализация'] as &$arDocument) {
                    if ($arDocument['ORDER_ID'] == $arBasketItem['ORDER_ID']) {
                        $shipmentBarCode = ShipmentItemStoreTable::getList([
                            'filter' => ['=BASKET_ID' => $arBasketItem['ID']],
                        ])->fetch() ?: [];
                        $arBasketItem['STORE_TO'] = $shipmentBarCode['STORE_ID'] ?: false;
                        $arBasketItem['AMOUNT'] = $shipmentBarCode['QUANTITY'] ?: 0;
                        $arDocument['PRODUCTS'][$arBasketItem['PRODUCT_ID']][] = $arBasketItem;

                    }
                }
            }
        }

        return $arDocuments;
    }
}