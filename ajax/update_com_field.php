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
$value = trim($request->getPost("value"));
$saveInProperty = $request->getPost("saveInProperty");
$action = $request->getPost("action");


if ($action === 'add_new_comment') {
    if ($dealId <= 0 || !$saveInProperty) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Некорректные данные'
        ]);
        die();
    }

    // Получаем текущую сделку
    $deal = DealTable::getList([
        'filter' => ['ID' => $dealId],
        'select' => [
            '*',
            'UF_*'
        ]
    ])->fetch();

    if (!$deal) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Сделка не найдена'
        ]);
        die();
    }

    // Дополняем значение, если поле уже не пустое
    if (!empty($deal[$saveInProperty])) {
        $deal[$saveInProperty] = '';
        $value = $deal[$saveInProperty] . PHP_EOL . $value;
    }

    // Обновляем сделку
    $result = DealTable::update($dealId, [
        $saveInProperty => $value
    ]);

    if ($result->isSuccess()) {
        echo json_encode([
            'status'  => 'success',
            'message' => 'Поле успешно обновлено',
            'dealId'  => $dealId,
            'field'   => $saveInProperty,
            'value'   => $value
        ]);
    } else {
        echo json_encode([
            'status'  => 'error',
            'message' => 'Ошибка сохранения: ' . implode(', ', $result->getErrorMessages())
        ]);
    }
}
die();
?>