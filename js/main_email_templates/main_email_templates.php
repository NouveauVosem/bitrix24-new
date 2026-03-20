<?php
define("NO_KEEP_STATISTIC", true);
define("NO_AGENT_STATISTIC", true);
define("NO_AGENT_CHECK", true);
require($_SERVER["DOCUMENT_ROOT"]."/bitrix/modules/main/include/prolog_before.php");

use Bitrix\Main\Loader;

Loader::includeModule("main");
Loader::includeModule("crm");

$userId = \Bitrix\Crm\Service\Container::getInstance()->getContext()->getUserId();

global $USER;

$addLink = false;

if ($USER->IsAdmin() || $USER->GetID() == 21) {
    $addLink = true;
}

$action = $_POST['action'] ?? '';

$activity['OWNER_TYPE_ID'] = 0;
$arTemplates = [];
$ids = [];

if ($action === 'get_email_templates') {

	// --- получаем ID юзера ---
	if (isset($_POST['userId']) && (int)$_POST['userId'] > 0) {
		$userId = (int)$_POST['userId'];
	}
	if ($userId <= 0) {
		$userId = (int)\Bitrix\Crm\Service\Container::getInstance()->getContext()->getUserId();
	}
	if ($userId <= 0) {
		echo json_encode(['error' => 'User not authorized']);
		die();
	}
	// --- конец получения ID юзера ---

	// --- функция для замены bxacid ссылок ---
	function replaceBxacidLinks($html)
	{
		return preg_replace_callback(
			'/src="bxacid:(\d+)"/i',
			function ($matches) {
				$fileId = (int)$matches[1];
				$filePath = CFile::GetPath($fileId);
				if ($filePath) {
					return 'src="' . $filePath . '"';
				}
				return $matches[0];
			},
			$html
		);
	}
	// --- конец функции ---

	$res = \CCrmMailTemplate::getUserAvailableTemplatesList((int)$activity['OWNER_TYPE_ID']);
	while ($item = $res->fetch())
	{
		$entity_type_id = ((int)$item['ENTITY_TYPE_ID'] > 0) ? (int)$item['ENTITY_TYPE_ID'] : '';
		$entityType = \CCrmOwnerType::resolveName($entity_type_id);

		$ids[] = $item['ID'];

		$arTemplates[] = [
			'id' => $item['ID'],
			'title' => $item['TITLE'],
			'scope' => $item['SCOPE'],
			'subject' => $item['SUBJECT'],
			'body' => $item['BODY'],
			'entityType' => $entityType,
			'item' => $item,
			'userId' => $userId,
		];
	}

	$obTemplates = \CCrmMailTemplate::getList(
		[],
		['ID' => $ids],
		false,
		false,
		['ID', 'TITLE', 'SUBJECT', 'BODY', 'SCOPE', 'ENTITY_TYPE_ID']
	);

	$templates = [];

	while ($item = $obTemplates->fetch())
	{
		$entity_type_id = ((int)$item['ENTITY_TYPE_ID'] > 0) ? (int)$item['ENTITY_TYPE_ID'] : '';
		$entityType = \CCrmOwnerType::resolveName($entity_type_id);
		
		$templates[] = [
			'id' => $item['ID'],
			'title' => $item['TITLE'],
			'scope' => $item['SCOPE'],
			'subject' => $item['SUBJECT'],
			// 👇 прогоняем body через замену
			'body' => replaceBxacidLinks($item['BODY']),
			'entityType' => $entityType,
			'item' => $item,
			'userId' => $userId,
		];
	}

	echo json_encode([
		'templates' => $templates,
	]);
}

if ($action === 'update_email_template') {
	$templateId = (int)($_POST['id'] ?? 0);
	$title = trim($_POST['title'] ?? '');
	$subject = trim($_POST['subject'] ?? '');
	$body = trim($_POST['body'] ?? '');

	if ($templateId > 0 && $title !== '' && $subject !== '' && $body !== '') {
		$fields = [
			'TITLE' => $title,
			'SUBJECT' => $subject,
			'BODY' => $body,
		];

		$result = \CCrmMailTemplate::update($templateId, $fields);
		if ($result) {
			echo json_encode(['success' => true]);
		} else {
			echo json_encode(['error' => 'Failed to update template']);
		}
	} else {
		echo json_encode(['error' => 'Invalid input data']);
	}
}

if ($action === 'add_email_template') {
	$title = trim($_POST['title'] ?? '');
	$subject = trim($_POST['subject'] ?? '');
	$body = trim($_POST['body'] ?? '');

	if ($title !== '' && $subject !== '' && $body !== '') {
		$fields = [
			'TITLE' => $title,
			'SUBJECT' => $subject,
			'BODY' => $body,
			'SCOPE' => 1,
			'ENTITY_TYPE_ID' => 0,
			'OWNER_ID' => $userId,
			'IS_ACTIVE' => 'Y'
		];

		$result = \CCrmMailTemplate::add($fields);
		if ($result) {
			echo json_encode(['success' => true, 'id' => $result]);
		} else {
			echo json_encode(['error' => 'Failed to add template']);
		}
	} else {
		echo json_encode(['error' => 'Invalid input data']);
	}
}

if ($action === 'delete_email_template') {
	$templateId = (int)($_POST['id'] ?? 0);

	if ($templateId > 0) {
		$result = \CCrmMailTemplate::delete($templateId);
		if ($result) {
			echo json_encode(['success' => true]);
		} else {
			echo json_encode(['error' => 'Failed to delete template']);
		}
	} else {
		echo json_encode(['error' => 'Invalid template ID']);
	}
}

die();
