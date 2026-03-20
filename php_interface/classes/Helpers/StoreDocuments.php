<?php

namespace Helpers;

use \Bitrix\Catalog\StoreDocumentElementTable;
use Bitrix\Catalog\StoreTable;

class StoreDocuments
{

    const DOCUMENT_TYPES = [
        'A' => 'Приход',
        'S' => 'Оприходование',
        'M' => 'Перемещение',
        'D' => 'Списание',
        'R_S' => 'Реализация'
    ];


    public static function getById(int $documentId): array
    {
        $arDocument = \Bitrix\Catalog\StoreDocumentTable::getList([
            'filter' => ['ID' => $documentId],
            'select' => ['*']
        ])->fetch() ?: [];
        if (!empty($arDocument)) {
            $entityTypeId = 'CAT_STORE_DOCUMENT_' . $arDocument['DOC_TYPE'];
            global $USER_FIELD_MANAGER;
            $arUserFields = $USER_FIELD_MANAGER->GetUserFields($entityTypeId, $documentId);
            if (!empty($arUserFields)) {
                foreach ($arUserFields as $arUserField) {
                    $arDocument[$arUserField['FIELD_NAME']] = $arUserField['VALUE'];
                }
            }
        } else {
            return [];
        }
        return $arDocument;
    }

    public static function getDocumentProducts(int $documentId): array
    {
        $items = [];
        $rows = StoreDocumentElementTable::getList([
            'filter' => ['=DOC_ID' => $documentId],
            'select' => ['ID', 'DOC_ID', 'ELEMENT_ID', 'AMOUNT', 'PURCHASING_PRICE', 'STORE_FROM', 'STORE_TO'],
        ]);

        while ($item = $rows->fetch()) {
            $items[] = $item;
        }

        return $items;
    }

    public static function addProductToDocument(int $documentId, int $elementId, float $amount, float $price = 0, int $storeFrom = null, int $storeTo = null): ?int
    {
        $fields = [
            'DOC_ID' => $documentId,
            'ELEMENT_ID' => $elementId,
            'AMOUNT' => $amount,
            'PURCHASING_PRICE' => $price,
        ];

        if ($storeFrom !== null) {
            $fields['STORE_FROM'] = $storeFrom;
        }

        if ($storeTo !== null) {
            $fields['STORE_TO'] = $storeTo;
        }

        $result = StoreDocumentElementTable::add($fields);

        return $result->isSuccess() ? $result->getId() : null;
    }

    public static function getAvailableStores(): array
    {
        $stores = [];

        $result = StoreTable::getList([
            'filter' => ['=ACTIVE' => 'Y'], // тільки активні
            'select' => ['ID', 'TITLE', 'ADDRESS']
        ]);

        while ($store = $result->fetch()) {
            $stores[$store['ID']] = $store;
        }

        return $stores;
    }
}