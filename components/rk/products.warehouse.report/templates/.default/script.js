function refreshTaskReport() {
    var reloadParams = {apply_filter: 'Y', clear_nav: 'Y'};
    var gridObject = BX.Main.gridManager.getById('products-warehouse-report-grid');  // Идентификатор грида

    if (gridObject.hasOwnProperty('instance')) {
        gridObject.instance.reloadTable('POST', reloadParams);
    }
}

BX.addCustomEvent('BX.Main.Filter:apply', function (id, data, ctx, promise, params) {
    refreshTaskReport();
});

$(document).on("click", ".export-to-csv", function (event) {
    $.ajax({
        url: window.location.href,
        data:{'exportToCsv':'Y'},
        success: function (fileLink) {
            openFileInNewTab(fileLink)
        }
    });
})

function openFileInNewTab(fileLink) {
    let link = document.createElement("a");
    link.href = fileLink;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

$(document).on('click', '.show-documents-list', function (){
    BX.SidePanel.Instance.open($(this).attr('data-url'), {
        width: 600,
    });
})