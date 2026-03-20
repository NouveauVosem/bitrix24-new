<?php
require_once (__DIR__.'/crest.php');

// https://crm.alvla.eu/local/ajax/crest/install.php

$result = CRest::installApp();
if($result['rest_only'] === false):?>
	<head>
		<script src="//api.bitrix24.com/api/v1/"></script>
		<?php if($result['install'] == true):?>
			<script>
				BX24.init(function(){
					BX24.installFinish();
					console.log(BX24.installFinish());
				});
			</script>
		<?php endif;?>
	</head>
	<body>
		<pre>
			<? var_dump($result); ?>
		</pre>
		<?php if($result['install'] == true):?>
			installation has been finished
		<?php else:?>
			installation error
		<?php endif;?>
	</body>
<?php endif;