export type Option = {
  label: string;
  value: string;
};

export type RegionOption = {
  label: string;
  customerValue: string;
  productValue: string;
};

export const COUNTRY: Option[] = [
  { label: "Select", value: "" },
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
];

export const EMPTY_STATE: RegionOption[] = [
  { label: "Select", customerValue: "", productValue: "" },
];

export const AU_STATE: RegionOption[] = [
  { label: "Select", customerValue: "", productValue: "" },
  { label: "New South Wales", customerValue: "NSW", productValue: "AU-NSW" },
  { label: "Victoria", customerValue: "VIC", productValue: "AU-VIC" },
  { label: "Queensland", customerValue: "QLD", productValue: "AU-QLD" },
  { label: "South Australia", customerValue: "SA", productValue: "AU-SA" },
  { label: "Western Australia", customerValue: "WA", productValue: "AU-WA" },
  { label: "Tasmania", customerValue: "TAS", productValue: "AU-TAS" },
  { label: "Northern territory", customerValue: "NT", productValue: "AU-NT" },
  { label: "Australian Capital Territory", customerValue: "ACT", productValue: "AU-ACT" },
];

export const NZ_STATE: RegionOption[] = [
  { label: "Select", customerValue: "", productValue: "" },
  { label: "Northland", customerValue: "NTL", productValue: "NZ-NTL" },
  { label: "Auckland", customerValue: "AUK", productValue: "NZ-AUK" },
  { label: "Waikato", customerValue: "WKO", productValue: "NZ-WKO" },
  { label: "Bay of Plenty", customerValue: "BOP", productValue: "NZ-BOP" },
  { label: "Gisborne", customerValue: "GIS", productValue: "NZ-GIS" },
  { label: "Hawke’s Bay", customerValue: "HKB", productValue: "NZ-HKB" },
  { label: "Taranaki", customerValue: "TKI", productValue: "NZ-TKI" },
  { label: "Manawatu-Wanganui", customerValue: "MWT", productValue: "NZ-MWT" },
  { label: "Wellington", customerValue: "WGN", productValue: "NZ-WGN" },
  { label: "Tasman", customerValue: "TAS", productValue: "NZ-TAS" },
  { label: "Nelson", customerValue: "NSN", productValue: "NZ-NSN" },
  { label: "Marlborough", customerValue: "MBH", productValue: "NZ-MBH" },
  { label: "West Coast", customerValue: "WTC", productValue: "NZ-WTC" },
  { label: "Canterbury", customerValue: "CAN", productValue: "NZ-CAN" },
  { label: "Otago", customerValue: "OTA", productValue: "NZ-OTA" },
  { label: "Southland", customerValue: "STL", productValue: "NZ-STL" },
  { label: "Chatham Islands", customerValue: "CIT", productValue: "NZ-CIT" },
];

export const REGENT_MODEL: Option[] = [
  { label: "Select", value: "" },
  { label: "RDC196", value: "RDC196" },
  { label: "RDC206", value: "RDC206" },
  { label: "RDC210", value: "RDC210" },
  { label: "RDC210F", value: "RDC210F" },
  { label: "RDC236", value: "RDC236" },
  { label: "RCC206", value: "RCC206" },
  { label: "RCC216", value: "RCC216" },
  { label: "RCC220", value: "RCC220" },
  { label: "RCC226F", value: "RCC226F" },
];

export const SNOWY_MODEL: Option[] = [
  { label: "Select", value: "" },
  { label: "SRC-14", value: "SRC14" },
  { label: "SRC-16", value: "SRC16" },
  { label: "SRC-17", value: "SRC17" },
  { label: "SRC-18", value: "SRC18" },
  { label: "SRC-19", value: "SRC19" },
  { label: "SRC-19E", value: "SRC19E" },
  { label: "SRC-20", value: "SRC20" },
  { label: "SRC-20F", value: "SRC20F" },
  { label: "SRC-21", value: "SRC21" },
  { label: "SRC-21S", value: "SRC21S" },
  { label: "SRC-22", value: "SRC22" },
  { label: "SRC-22S", value: "SRC22S" },
  { label: "SRC-22F", value: "SRC22F" },
  { label: "SRC-23", value: "SRC23" },
  { label: "SRC-24", value: "SRC24" },
  { label: "SRT-18", value: "SRT18" },
  { label: "SRT-18F", value: "SRT18F" },
  { label: "SRT-19", value: "SRT19" },
  { label: "SRT-20", value: "SRT20" },
  { label: "SRT-20F", value: "SRT20F" },
  { label: "SRT-22F", value: "SRT22F" },
  { label: "SRP-14", value: "SRP14" },
  { label: "SRP-17", value: "SRP17" },
  { label: "SRP-18", value: "SRP18" },
  { label: "SRP-18F", value: "SRP18F" },
  { label: "SRP-19", value: "SRP19" },
  { label: "SRP-19F", value: "SRP19F" },
  { label: "SRP-20", value: "SRP20" },
  { label: "SRL-206", value: "SRL206" },
  { label: "SRL-216S", value: "SRL216S" },
  { label: "SRL-220S", value: "SRL220S" },
  { label: "SRL-236", value: "SRL236" },
  { label: "SRV19", value: "SRV19" },
  { label: "SRV22", value: "SRV22" },
  { label: "SRH13", value: "SRH13" },
  { label: "SRH14", value: "SRH14" },
  { label: "SRH15", value: "SRH15" },
  { label: "SRH15F", value: "SRH15F" },
  { label: "SRH16", value: "SRH16" },
  { label: "SRH16F", value: "SRH16F" },
];

export const NEWGEN_MODEL: Option[] = [
  { label: "Select", value: "" },
  { label: "NG13", value: "NG13" },
  { label: "NG15", value: "NG15" },
  { label: "NG17", value: "NG17" },
  { label: "NG18", value: "NG18" },
  { label: "NG18F", value: "NG18F" },
  { label: "NG19", value: "NG19" },
  { label: "NG19S", value: "NG19S" },
  { label: "NG19R", value: "NG19R" },
  { label: "NG20", value: "NG20" },
  { label: "NG20SR", value: "NG20SR" },
  { label: "NG21", value: "NG21" },
  { label: "NG23", value: "NG23" },
  { label: "NG21F 2 Bunks", value: "NG21F 2 Bunks" },
  { label: "NG21F 3 Bunks", value: "NG21F 3 BUNKS" },
  { label: "NGC16", value: "NGC16" },
  { label: "NGC18", value: "NGC18" },
  { label: "NGC19F", value: "NGC19F" },
  { label: "NGC19", value: "NGC19" },
  { label: "NGC20", value: "NGC20" },
  { label: "NGC21S", value: "NGC21S" },
  { label: "NGC22F", value: "NGC22F" },
  { label: "NGC24", value: "NGC24" },
  { label: "NGB19", value: "NGB19" },
  { label: "NGB20", value: "NGB20" },
  { label: "NGB21S", value: "NGB21S" },
  { label: "NGB21F", value: "NGB21F" },
];

export const DEALERSHIP_PURCHASED_FROM: Option[] = [
  { label: "Select", value: "" },
  { label: "Green RV - Forest Glen", value: "204642" },
  { label: "Green RV - Slacks Creek\t", value: "204670" },
  { label: "QCCC - Gympie", value: "3137" },
  { label: "Newgen Caravan - Newcastle", value: "3133" },
  { label: "Snowy River - Toowoomba", value: "3135" },
  { label: "Springvale Caravan Centre - Keysborough", value: "204675" },
  { label: "Auswide Caravans - South Nowra", value: "204669" },
  { label: "Dario Caravans -St.Marys", value: "204643" },
  { label: "Dario Caravans - Pooraka", value: "204676" },
  { label: "Vanari Caravans - Marsden Point", value: "204679" },
  { label: "CMG Campers - Christchurch", value: "204680" },
  { label: "Sherrif Caravans & Traliers - Prospect Vale", value: "204671" },
  { label: "ABCO Caravans - Boambee Valley", value: "204673" },
  { label: "Snowy River - Perth\t", value: "3121" },
  { label: "Snowy River - Traralgon\t", value: "3123" },
  { label: "Snowy River - Frankston\t", value: "3141" },
  { label: "Newcastle RV Super Centre - Berefield\t", value: "204646" },
  { label: "Snowy River - Townsville", value: "204677" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "Bendigo Caravan Group - Bendigo", value: "201223" },
  { label: "Great Ocean Road RV & Caravans - Warrnambool", value: "204025" },
  { label: "Snowy River Head Office", value: "3110" },
  { label: "Mandurah Caravan & RV Centre", value: "200994" },
];

export const DEALERSHIP_PURCHASED_FROM_NEWGEN: Option[] = [
  { label: "Select", value: "" },
  { label: "Newgen Caravan - Gympie", value: "3137" },
  { label: "Newgen Caravan - Newcastle", value: "3133" },
  { label: "Sherrif Caravans & Traliers - Prospect Vale", value: "204671" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "NEWCASTLE CARAVANS & RVS", value: "503201" },
  { label: "Caravans WA", value: "505014" },
  { label: "Motorhub Ltd", value: "505491" },
];

export const DEALERSHIP_PURCHASED_FROM_SNOWY: Option[] = [
  { label: "Select", value: "" },
  { label: "Green RV - Forest Glen", value: "204642" },
  { label: "Green RV - Slacks Creek\t", value: "204670" },
  { label: "Snowy River - Newcastle", value: "3133" },
  { label: "Snowy River - Toowoomba", value: "3135" },
  { label: "Springvale Caravan Centre - Keysborough", value: "204675" },
  { label: "Auswide Caravans - South Nowra", value: "204669" },
  { label: "Dario Caravans -St.Marys", value: "204643" },
  { label: "Dario Caravans - Pooraka", value: "204676" },
  { label: "Vanari Caravans - Marsden Point", value: "204679" },
  { label: "CMG Campers - Christchurch", value: "204680" },
  { label: "Sherrif Caravans & Traliers - Prospect Vale", value: "204671" },
  { label: "ABCO Caravans - Boambee Valley", value: "204673" },
  { label: "Snowy River - Perth\t", value: "3121" },
  { label: "Snowy River - Traralgon\t", value: "3123" },
  { label: "Snowy River - Frankston\t", value: "3141" },
  { label: "Newcastle RV Super Centre - Berefield\t", value: "204646" },
  { label: "Snowy River - Townsville", value: "204677" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "Bendigo Caravan Group - Bendigo", value: "201223" },
  { label: "Great Ocean Road RV & Caravans - Warrnambool", value: "204025" },
  { label: "Snowy River Head Office", value: "3110" },
  { label: "Mandurah Caravan & RV Centre", value: "200994" },
  { label: "Snowy River Geelong", value: "3128" },
  { label: "Snowy River Launceston", value: "3126" },
  { label: "Destiny RV - South Australia", value: "503257" },
  { label: "Snowy River Wangaratta", value: "504620" },
];

export const DEALERSHIP_PURCHASED_FROM_REGENT: Option[] = [
  { label: "Select", value: "" },
  { label: "Green RV - Forest Glen", value: "204642" },
  { label: "Green RV - Slacks Creek\t", value: "204670" },
  { label: "QCCC - Gympie", value: "3137" },
  { label: "Snowy River - Toowoomba", value: "3135" },
  { label: "Springvale Caravan Centre - Keysborough", value: "204675" },
  { label: "Auswide Caravans - South Nowra", value: "204669" },
  { label: "Dario Caravans -St.Marys", value: "204643" },
  { label: "Dario Caravans - Pooraka", value: "204676" },
  { label: "Vanari Caravans - Marsden Point", value: "204679" },
  { label: "CMG Campers - Christchurch", value: "204680" },
  { label: "Sherrif Caravans & Traliers - Prospect Vale", value: "204671" },
  { label: "ABCO Caravans - Boambee Valley", value: "204673" },
  { label: "Snowy River - Perth\t", value: "3121" },
  { label: "Snowy River - Traralgon\t", value: "3123" },
  { label: "Snowy River - Frankston\t", value: "3141" },
  { label: "Newcastle RV Super Centre - Berefield\t", value: "204646" },
  { label: "Snowy River - Townsville", value: "204677" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "Bendigo Caravan Group - Bendigo", value: "201223" },
  { label: "Great Ocean Road RV & Caravans - Warrnambool", value: "204025" },
  { label: "Snowy River Head Office", value: "3110" },
  { label: "Mandurah Caravan & RV Centre", value: "200994" },
];

export const BRAND_OPTIONS: Option[] = [
  { label: "Select", value: "" },
  { label: "Snowy", value: "Snowy" },
  { label: "Newgen", value: "Newgen" },
  { label: "Regent", value: "Regent" },
];

export const ALL_DEALERSHIP_OPTIONS: Option[] = Array.from(
  new Map(
    [
      ...DEALERSHIP_PURCHASED_FROM,
      ...DEALERSHIP_PURCHASED_FROM_NEWGEN,
      ...DEALERSHIP_PURCHASED_FROM_SNOWY,
      ...DEALERSHIP_PURCHASED_FROM_REGENT,
    ].map((opt) => [opt.value, opt])
  ).values()
);
