<?php
require_once($_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php');

$fileId = 352268;

$file = \CFile::GetFileArray($fileId);

if (!$file) {
    echo "ФАЙЛ НЕ НАЙДЕН в b_file (ID=$fileId)\n";
} else {
    echo "Запись в b_file ЕСТЬ:\n";
    echo "  ID: " . $file['ID'] . "\n";
    echo "  FILE_NAME: " . $file['FILE_NAME'] . "\n";
    echo "  ORIGINAL_NAME: " . $file['ORIGINAL_NAME'] . "\n";
    echo "  CONTENT_TYPE: " . $file['CONTENT_TYPE'] . "\n";
    echo "  FILE_SIZE: " . $file['FILE_SIZE'] . "\n";
    echo "  SUBDIR: " . $file['SUBDIR'] . "\n";

    $path = $_SERVER['DOCUMENT_ROOT'] . '/upload/' . $file['SUBDIR'] . '/' . $file['FILE_NAME'];
    echo "  Путь: " . $path . "\n";
    echo "  Файл на диске: " . (file_exists($path) ? "ЕСТЬ (" . filesize($path) . " байт)" : "НЕ СУЩЕСТВУЕТ") . "\n";
}
