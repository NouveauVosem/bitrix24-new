<?php

class CsvFromArray
{

    private string $fileName;
    private array $arHeaders;
    private array $arData;
    private string $separator;
    private string $pathToFile;

    public function __construct($fileName, $arHeaders, $arData, $separator)
    {
        $this->fileName = $fileName;
        $this->arHeaders = $arHeaders;
        $this->arData = $arData;
        $this->separator = $separator;
        $this->pathToFile = $_SERVER['DOCUMENT_ROOT'] . '/upload/'.$fileName;
    }

    public function create()
    {
        $csvStr = implode($this->separator, $this->arHeaders) . "\n";

        foreach ($this->arData as $data) {
            $csvStr .= implode($this->separator, $data) . "\n";
        }

        if (strlen($csvStr) > 0) {
            $csvStr = "\xEF\xBB\xBF" . $csvStr;

            file_put_contents($this->pathToFile, $csvStr);
            return $this->pathToFile;
        }

        return null;
    }
}