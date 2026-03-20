<?php

namespace Helpers;

class CrmDeal
{
    public static function updateDealUserFields(int $dealId, array $arUserFieldValues): void
    {
        global $USER_FIELD_MANAGER;
        $USER_FIELD_MANAGER->Update(
            'CRM_DEAL',
            $dealId,
            $arUserFieldValues,
        );
    }
}