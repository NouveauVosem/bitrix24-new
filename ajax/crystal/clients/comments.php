<?php
// Комментарии таймлайна CRM для истории клиента в Кристалле.
// По умолчанию — только закреплённые.
//
// Параметры (нужна хотя бы одна сущность или author_id):
//   lead_id, deal_id, contact_id, company_id — сущности CRM (id или список через запятую);
//   expand=1     — компания → ещё её контакты, сделки и лиды; контакт → его сделки и лиды;
//   author_id    — автор комментария (id или список);
//   pinned       — Y (по умолчанию) — только закреплённые | all — все;
//   created_from, created_to — дата создания (YYYY-MM-DD или YYYY-MM-DD HH:MM:SS, пояс Киева);
//   limit        — 100, не больше 500; offset — 0.
//
// Закрепление в Битриксе — свойство привязки: комментарий может быть закреплён в сделке
// и не закреплён в компании. С pinned=Y берём комментарии, закреплённые хотя бы в одной
// из запрошенных сущностей; в bindings у каждой привязки есть свой флаг pinned.
require __DIR__ . '/_common.php';

$owners      = crystalClientsOwnersFromParams();
$ownersGiven = crystalClientsParam('lead_id') . crystalClientsParam('deal_id')
             . crystalClientsParam('contact_id') . crystalClientsParam('company_id') !== '';
$authors     = crystalClientsIdList('author_id');

if (!$ownersGiven && empty($authors)) {
    crystalClientsError('нужна одна из сущностей (lead_id, deal_id, contact_id, company_id) или author_id');
}

$pinnedRaw = mb_strtolower(crystalClientsParam('pinned')) ?: 'y';
if (!in_array($pinnedRaw, ['y', 'all'], true)) crystalClientsError('pinned: Y | all');
$pinnedOnly = $pinnedRaw === 'y';

$createdFrom = crystalClientsDateParam('created_from');
$createdTo   = crystalClientsDateParam('created_to', true);
$limit       = crystalClientsNumber('limit', 100, 1, 500);
$offset      = crystalClientsNumber('offset', 0, 0, null);

$empty = ['tz' => CRYSTAL_CLIENTS_TZ, 'items' => [], 'total' => 0, 'next_offset' => null];
if ($ownersGiven && empty($owners)) crystalClientsRespond($empty);

$conn      = \Bitrix\Main\Application::getConnection();
$sqlHelper = $conn->getSqlHelper();

$commentType = class_exists('\Bitrix\Crm\Timeline\TimelineType') ? (int)\Bitrix\Crm\Timeline\TimelineType::COMMENT : 7;

// ── Выборка ──────────────────────────────────────────────────────────────────
$bindWhere = [];
if (!empty($owners)) $bindWhere[] = crystalClientsOwnersSql($owners, 'ENTITY_TYPE_ID', 'ENTITY_ID');
if ($pinnedOnly)     $bindWhere[] = "IS_FIXED = 'Y'";

$where = ["t.TYPE_ID = $commentType"];
if (!empty($bindWhere)) {
    $where[] = 't.ID IN (SELECT OWNER_ID FROM b_crm_timeline_bind WHERE ' . implode(' AND ', $bindWhere) . ')';
}
if (!empty($authors)) $where[] = 't.AUTHOR_ID IN (' . implode(',', $authors) . ')';
if ($createdFrom)     $where[] = 't.CREATED >= ' . $sqlHelper->convertToDbDateTime($createdFrom);
if ($createdTo)       $where[] = 't.CREATED <= ' . $sqlHelper->convertToDbDateTime($createdTo);
$whereSql = implode(' AND ', $where);

$total = (int)$conn->query("SELECT COUNT(*) AS CNT FROM b_crm_timeline t WHERE $whereSql")->fetch()['CNT'];
if ($total === 0) crystalClientsRespond($empty);

$rows = $conn->query(
    "SELECT t.ID, t.COMMENT, t.AUTHOR_ID, t.CREATED FROM b_crm_timeline t WHERE $whereSql"
    . " ORDER BY t.CREATED DESC, t.ID DESC LIMIT $limit OFFSET $offset"
);
$comments = [];
while ($r = $rows->fetch()) $comments[(int)$r['ID']] = $r;

// ── Привязки страницы ────────────────────────────────────────────────────────
$pairsOf  = [];
$pinnedOf = [];
$allPairs = [];
if (!empty($comments)) {
    $rows = $conn->query(
        'SELECT OWNER_ID, ENTITY_TYPE_ID, ENTITY_ID, IS_FIXED FROM b_crm_timeline_bind'
        . ' WHERE OWNER_ID IN (' . implode(',', array_keys($comments)) . ')'
    );
    while ($r = $rows->fetch()) {
        $id = (int)$r['OWNER_ID'];
        $pair = [(int)$r['ENTITY_TYPE_ID'], (int)$r['ENTITY_ID']];
        $pairsOf[$id][] = $pair;
        $allPairs[] = $pair;
        if ($r['IS_FIXED'] === 'Y') $pinnedOf[$id][$pair[0] . ':' . $pair[1]] = true;
    }
}
$ownerInfo = crystalClientsOwnerInfo($allPairs);

$users = crystalClientsUserNames(array_column($comments, 'AUTHOR_ID'));
$typeIdOf = array_flip(CRYSTAL_CLIENTS_OWNER_NAMES);

// ── Ответ ────────────────────────────────────────────────────────────────────
$items = [];
foreach ($comments as $id => $c) {
    $b = crystalClientsBindings($pairsOf[$id] ?? [], $ownerInfo);
    foreach ($b['bindings'] as &$binding) {
        $binding['pinned'] = isset($pinnedOf[$id][$typeIdOf[$binding['type']] . ':' . $binding['id']]);
    }
    unset($binding);

    $authorId = (int)$c['AUTHOR_ID'];
    $items[] = [
        'uid'      => 'comment:' . $id,
        'source'   => 'comment',
        'id'       => $id,
        'text'     => crystalClientsText($c['COMMENT']),
        'pinned'   => !empty($pinnedOf[$id]),
        'created'  => crystalClientsDateTime($c['CREATED']),
        'author'   => $authorId ? ['id' => $authorId, 'name' => $users[$authorId] ?? null] : null,
        'company'  => $b['company'],
        'bindings' => $b['bindings'],
        'url'      => $b['bindings'][0]['url'] ?? null,
    ];
}

crystalClientsRespond([
    'tz'          => CRYSTAL_CLIENTS_TZ,
    'items'       => $items,
    'total'       => $total,
    'next_offset' => $offset + $limit < $total ? $offset + $limit : null,
]);
