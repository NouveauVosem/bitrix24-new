<?php
CJSCore::Init(['jquery']);
?>
<div id="report-container">
    <div class="filter-hint">При отсутствии фильтра по дате выборка ограничена текущим месяцем</div>

    <div id="filter">
        <?php include 'filter.php'; ?>
        <div class="export-container">
            <button class="ui-btn export-to-csv">Выгрузить в CSV</button>
        </div>
    </div>
    <br>
    <div id="table">
        <?php include 'table.php'; ?>
    </div>
</div>