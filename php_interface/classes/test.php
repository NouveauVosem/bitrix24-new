<?
// /home/trentium/avilon/local/php_interface/test.php
$fileName = 'log_crm_ship_test.txt';
if ($fileHandler = fopen($fileName, 'a+')) {
    fwrite($fileHandler, "formParam--------------\n");
    fwrite($fileHandler, print_r($formParam, true) . "\n");
    fwrite($fileHandler, "--------------\n");
    fwrite($fileHandler, "values--------------\n");
    fwrite($fileHandler, print_r($values, true) . "\n");
    fwrite($fileHandler, "--------------\n");
    fclose($fileHandler);
}
?>