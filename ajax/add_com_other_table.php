<?
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

$saveOneItem = $request->getPost("saveOneItem");
$action = $request->getPost("action");

if ($action === 'add_to_other_table') {

    if (empty($saveOneItem) || !is_array($saveOneItem)) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Нет данных для сохранения'
        ]);
        die();
    }

    foreach ($saveOneItem as $item) {

        $rowId = (int)$item['rowId'];
        $value = trim($item['value']);
        $dealId = (int)$item['dealId'];

        if ($dealId > 0 || $value !== '') {
            $resItem = CrmOtherTable::getList([
                'select' => ['ID'],
                'filter' => [
                    'DEAL_ID' => $dealId,
                    'PROPERTY' => $rowId
                ]
            ])->fetch();

            $addItem = [
                'DEAL_ID' => $dealId,
                'PROPERTY' => $rowId,
                'VALUE' => $value
            ];

            if ($resItem) {
                $result = CrmOtherTable::update($resItem['ID'], $addItem);
                $resultsMessage = 'Запись обновлена';
            } else {
                $result = CrmOtherTable::add($addItem);
                $resultsMessage = 'Запись добавлена';
            }

            $results = [
                'status' => $result->isSuccess() ? 'success' : 'error',
                'message' => $result->isSuccess()
                    ? $resultsMessage
                    : 'Ошибка: ' . implode(', ', json_decode($result->getErrorMessages(), true)),
                'dealId' => $dealId,
                'rowId' => $rowId,
                'value' => $value
            ];
        }
    }

    echo json_encode($results);
    die();
}
die();
?>