<?php
require_once (__DIR__.'/crest.php');

// https://crm.alvla.eu/local/ajax/crest/index.php

$result = CRest::call('profile');

echo '<pre>';
	print_r($result);
echo '</pre>';
