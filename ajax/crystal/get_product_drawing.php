<?php
require_once($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

header('Content-Type: application/json; charset=utf-8');

$bitrixId = (int)($_GET['bitrixId'] ?? 0);
$article  = trim($_GET['article'] ?? '');

if ($bitrixId) {
    $el   = CIBlockElement::GetByID($bitrixId);
    $item = $el->GetNextElement();
} elseif ($article) {
    $res  = CIBlockElement::GetList([], [
        'IBLOCK_ID'           => [14, 15],
        '=PROPERTY_ARTNUMBER' => $article,
    ], false, ['nTopCount' => 1], ['ID', 'PROPERTY_85']);
    $item = $res->GetNextElement();
} else {
    echo json_encode(['found' => false, 'message' => 'bitrixId or article required']);
    die();
}

if (!$item) {
    echo json_encode(['found' => false, 'message' => 'Товар не найден']);
    die();
}

$props = $item->GetProperties();
$fileId = $props['85']['VALUE'] ?? null;

if (!$fileId) {
    echo json_encode(['found' => true, 'file' => null]);
    die();
}

$fileArray = CFile::GetFileArray((int)$fileId);
if (!$fileArray) {
    echo json_encode(['found' => true, 'file' => null]);
    die();
}

$ext = strtolower(pathinfo($fileArray['ORIGINAL_NAME'], PATHINFO_EXTENSION));

echo json_encode([
    'found' => true,
    'file'  => [
        'url'  => CFile::GetPath((int)$fileId),
        'name' => $fileArray['ORIGINAL_NAME'],
        'ext'  => $ext,
    ],
]);
