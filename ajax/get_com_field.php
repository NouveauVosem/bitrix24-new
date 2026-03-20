<?php
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

use Bitrix\Main\Loader;
use Bitrix\Main\Context;
use Bitrix\Crm\DealTable;
use Bitrix\Main\Type;
use Bitrix\Main\Entity;
use Bitrix\Main\Application;

Loader::includeModule("main");
Loader::includeModule("crm");

class CrmOtherTable extends Entity\DataManager
{
    public static function getTableName()
    {
        return 'for_com_field';
    }

    public static function getMap()
    {
        return [
            new Entity\IntegerField('ID', [
                'primary' => true,
                'autocomplete' => true
            ]),
            new Entity\IntegerField('DEAL_ID'),
            new Entity\StringField('PROPERTY'),
            new Entity\TextField('VALUE'),
            new Entity\DatetimeField('DATE_CREATE', [
                'default_value' => new \Bitrix\Main\Type\DateTime()
            ])
        ];
    }

    public static function createTableIfNotExists()
    {
        $connection = Application::getConnection();
        $tableName = static::getTableName();
        $entity = static::getEntity();

        if (!$connection->isTableExists($tableName)) {
            $entity->createDbTable();
        }
    }
}

// Создаем таблицу, если не существует
CrmOtherTable::createTableIfNotExists();

$request = Context::getCurrent()->getRequest();

$dealId = (int)$request->getPost("dealId");
$saveInProperty = $request->getPost("rowId");
$action = $request->getPost("action");

if ($dealId <= 0 || !$saveInProperty) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Некорректные данные'
    ]);
    die();
}

if ($action == 'get_new_comment') {
    $getComValue = CrmOtherTable::getList([
        'select' => ['VALUE'],
        'filter' => [
            'DEAL_ID' => $dealId,
            'PROPERTY' => $saveInProperty
        ],
    ])->fetchAll();
    $comValue = '';
    if (!empty($getComValue)) {
        echo json_encode([
            'status' => 'success',
            'message' => 'Комментарий получен',
            'value' => $getComValue
        ]);
    } else {
        echo json_encode([
            'status' => 'error',
            'message' => 'Комментарии не найдены'
        ]);
    }
} else {
    echo json_encode([
        'status' => 'error',
        'message' => 'Некорректное действие'
    ]);
}

die();
?>