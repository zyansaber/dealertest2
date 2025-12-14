import { useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import { app } from "@/lib/firebase";

const defaultOrderQuery =
  "SELECT Id, OwnerId, IsDeleted, Name, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, SystemModstamp, LastActivityDate, LastViewedDate, LastReferencedDate, Cancel_Order_Chassis_Number__c, Chassis_Number__c, Dealer_Store__c, Expected_Delivery_Date__c, Floor_Plan__c, Goods_Receiver__c, Invoice_Receiver__c, Order_Number__c, Order_Receiver__c, Payer__c, Payment_Terms__c, Product__c, Requested_Date__c, Sales_Owner__c, Sales_Unit__c, Salesforce_Account_Profile__c, Salesforce_Lead_ID__c, Spec_Sheet__c, Stage__c, Tax__c, Total__c, Close_Comment__c, Lost_Reason__c, Order_Total__c FROM Order__c WHERE CreatedDate>=LAST_YEAR";

const defaultLeadQuery =
  "SELECT Id, LastName, FirstName, Name, Phone, MobilePhone, Email, Description, LeadSource, Status, Owner.Name, CreatedDate, State_NZ__c, Brand__c, Warranty_Claims_Ticket_Id__c, Origin_Type__c, Medium__c, Shows__c, Dealership__c, Lead_Form_Type__c, Postcode__c, Do_you_have_a_trade_in__c, Handover_Date__c, Dealership_Purchased_From__c, Country__c, State_AU__c, Model__c, Nature_of_enquiry_Others__c, Nature_of_Enquiry__c, NewGen_Model__c, Prefer_Dealership__c, Preferred_Dealership__c, Source__c, Regent_Model__c, Snowy_Model__c, Year_Manufactured__c, Lead_Type__c, Snowy_Model_Range__c FROM Lead WHERE Master__c=false AND CreatedDate>=LAST_YEAR";

type ProductRegistrationData = {
  firstName?: string;
  lastName?: string;
  email: string;
  mobile?: string;
  phone?: string;
  streetAddress?: string;
  suburb?: string;
  country?: string;
  postcode?: string;
  stateRegion?: string;
  chassisNumber: string;
  brand?: string;
  model?: string;
  dealershipCode?: string;
  handoverDate?: string;
  vin?: string;
};

type SubmitProductRegistrationResult = {
  success: boolean;
  salesforceId?: string;
};

type UploadProofPayload = {
  fileName: string;
  base64Data: string;
  productRegisteredId: string;
};

type UploadProofOfPurchaseResponse = {
  success: boolean;
  contentVersionId?: string;
};

type CustomerDetailsPayload = {
  Email__c: string;
  First_Name__c?: string;
  Last_Name__c?: string;
  Mobile_Number__c?: string;
  Handover_Date__c?: string;
  Model__c?: string;
  Country__c?: string;
  State_AU__c?: string;
  State_NZ__c?: string;
  Postcode__c?: string;
  Dealership_Purchased_From__c?: string;
  Brand?: string;
  Origin_Type?: string;
  Lifecycle_Stage?: string;
  Form_Name_SAP_Sync?: string;
  Forms_Submitted?: string;
  source?: string;
  chassisNumber?: string;
};

type Option = {
  label: string;
  value: string;
};

const COUNTRY: Option[] = [
  { label: "Select", value: "" },
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
];

const EMPTY_STATE: Option[] = [{ label: "Select", value: "" }];

const AU_STATE: Option[] = [
  { label: "Select", value: "" },
  { label: "New South Wales", value: "AU-NSW" },
  { label: "Victoria", value: "AU-VIC" },
  { label: "Queensland", value: "AU-QLD" },
  { label: "South Australia", value: "AU-SA" },
  { label: "Western Australia", value: "AU-WA" },
  { label: "Tasmania", value: "AU-TAS" },
  { label: "Northern territory", value: "AU-NT" },
  { label: "Australian Capital Territory", value: "AU-ACT" },
];

const NZ_STATE: Option[] = [
  { label: "Select", value: "" },
  { label: "Northland", value: "NZ-NTL" },
  { label: "Auckland", value: "NZ-AUK" },
  { label: "Waikato", value: "NZ-WKO" },
  { label: "Bay of Plenty", value: "NZ-BOP" },
  { label: "Gisborne", value: "NZ-GIS" },
  { label: "Hawke’s Bay", value: "NZ-HKB" },
  { label: "Taranaki", value: "NZ-TKI" },
  { label: "Manawatu-Wanganui", value: "NZ-MWT" },
  { label: "Wellington", value: "NZ-WGN" },
  { label: "Tasman", value: "NZ-TAS" },
  { label: "Nelson", value: "NZ-NSN" },
  { label: "Marlborough", value: "NZ-MBH" },
  { label: "West Coast", value: "NZ-WTC" },
  { label: "Canterbury", value: "NZ-CAN" },
  { label: "Otago", value: "NZ-OTA" },
  { label: "Southland", value: "NZ-STL" },
  { label: "Chatham Islands", value: "NZ-CIT" },
];

const REGENT_MODEL: Option[] = [
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

const SNOWY_MODEL: Option[] = [
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

const NEWGEN_MODEL: Option[] = [
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

const DEALERSHIP_PURCHASED_FROM: Option[] = [
  { label: "Select", value: "" },
  { label: "Green RV - Forest Glen", value: "204642" },
  { label: "Green RV - Slacks Creek", value: "204670" },
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
  { label: "Snowy River - Perth", value: "3121" },
  { label: "Snowy River - Traralgon", value: "3123" },
  { label: "Snowy River - Frankston", value: "3141" },
  { label: "Newcastle RV Super Centre - Berefield", value: "204646" },
  { label: "Snowy River - Townsville", value: "204677" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "Bendigo Caravan Group - Bendigo", value: "201223" },
  { label: "Great Ocean Road RV & Caravans - Warrnambool", value: "204025" },
  { label: "Snowy River Head Office", value: "3110" },
  { label: "Mandurah Caravan & RV Centre", value: "200994" },
];

const DEALERSHIP_PURCHASED_FROM_NEWGEN: Option[] = [
  { label: "Select", value: "" },
  { label: "Newgen Caravan - Gympie", value: "3137" },
  { label: "Newgen Caravan - Newcastle", value: "3133" },
  { label: "Sherrif Caravans & Traliers - Prospect Vale", value: "204671" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "NEWCASTLE CARAVANS & RVS", value: "503201" },
  { label: "Caravans WA", value: "505014" },
  { label: "Motorhub Ltd", value: "505491" },
];

const DEALERSHIP_PURCHASED_FROM_SNOWY: Option[] = [
  { label: "Select", value: "" },
  { label: "Green RV - Forest Glen", value: "204642" },
  { label: "Green RV - Slacks Creek", value: "204670" },
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
  { label: "Snowy River - Perth", value: "3121" },
  { label: "Snowy River - Traralgon", value: "3123" },
  { label: "Snowy River - Frankston", value: "3141" },
  { label: "Newcastle RV Super Centre - Berefield", value: "204646" },
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

const DEALERSHIP_PURCHASED_FROM_REGENT: Option[] = [
  { label: "Select", value: "" },
  { label: "Green RV - Forest Glen", value: "204642" },
  { label: "Green RV - Slacks Creek", value: "204670" },
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
  { label: "Snowy River - Perth", value: "3121" },
  { label: "Snowy River - Traralgon", value: "3123" },
  { label: "Snowy River - Frankston", value: "3141" },
  { label: "Newcastle RV Super Centre - Berefield", value: "204646" },
  { label: "Snowy River - Townsville", value: "204677" },
  { label: "The Caravan Hub - Townsville", value: "200035" },
  { label: "Bendigo Caravan Group - Bendigo", value: "201223" },
  { label: "Great Ocean Road RV & Caravans - Warrnambool", value: "204025" },
  { label: "Snowy River Head Office", value: "3110" },
  { label: "Mandurah Caravan & RV Centre", value: "200994" },
];

const BRAND_OPTIONS: Option[] = [
  { label: "Select", value: "" },
  { label: "Regent", value: "Regent" },
  { label: "Snowy River", value: "Snowy River" },
  { label: "Newgen", value: "Newgen" },
];

type CustomerDetailsJob = {
  jobId: string;
  status: "queued" | "processing" | "success" | "failed";
  attempts?: number;
  updatedAt?: string;
  lastError?: string | null;
  lastHttpStatus?: number | null;
  lastSuccessAt?: string | null;
};

const productRegistrationTemplate = JSON.stringify(
  {
    First_Name__c: "John",
    Last_Name__c: "Doe",
    Email__c: "john.doe@gmail.com",
    Mobile_Number__c: "0456789123",
    Phone_Number__c: "0388889999",
    Street_Address__c: "123 Main st",
    Suburb__c: "Regents Park",
    Sync_with_SAP__c: "false",
    Country__c: "AU",
    Postcode__c: "3072",
    State_Region__c: "AU-VIC",
    Chassis_Number__c: "ABC123456",
    Brand__c: "Snowy",
    Model__c: "SRC20",
    Dealership_Purchased_From__c: "3141",
    Handover_Date__c: "2024-10-10",
    VIN__c: "VIN99887766",
  },
  null,
  2,
);

const SalesforceTest = () => {
  const [authForm, setAuthForm] = useState({
    tokenUrl: "https://test.salesforce.com/services/oauth2/token",
    grant_type: "password",
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
  });
  const [authResult, setAuthResult] = useState<string>("");

  const [queryParams, setQueryParams] = useState({
    instanceUrl: "https://regentrv--staging.sandbox.my.salesforce.com",
    apiVersion: "v60.0",
    bearerToken: "",
    orderQuery: defaultOrderQuery,
    leadQuery: defaultLeadQuery,
  });
  const [orderResult, setOrderResult] = useState<string>("");
  const [leadResult, setLeadResult] = useState<string>("");

  const [productRegistration, setProductRegistration] = useState(productRegistrationTemplate);
  const [productToken, setProductToken] = useState("");
  const [productResult, setProductResult] = useState<string>("");

  const [callablePayload, setCallablePayload] = useState<ProductRegistrationData>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    phone: "",
    streetAddress: "",
    suburb: "",
    country: "AU",
    postcode: "",
    stateRegion: "",
    chassisNumber: "",
    brand: "",
    model: "",
    dealershipCode: "",
    handoverDate: "",
    vin: "",
  });
  const [callableResult, setCallableResult] = useState<string>("");

  const functions = useMemo(() => getFunctions(app, "us-central1"), []);
  const submitProductRegistrationFn = useMemo(
    () =>
      httpsCallable<ProductRegistrationData, SubmitProductRegistrationResult>(
        functions,
        "submitProductRegistration",
      ),
    [functions],
  );

  const uploadProofOfPurchaseFn = useMemo(
    () =>
      httpsCallable<UploadProofPayload, UploadProofOfPurchaseResponse>(
        functions,
        "uploadProofOfPurchase",
      ),
    [functions],
  );

  const enqueueCustomerDetailsFn = useMemo(
    () =>
      httpsCallable<CustomerDetailsPayload, CustomerDetailsJob>(
        functions,
        "enqueuePostCustomerDetails",
      ),
    [functions],
  );

  const getCustomerDetailsJobFn = useMemo(
    () =>
      httpsCallable<{ jobId: string }, CustomerDetailsJob>(
        functions,
        "getPostCustomerDetailsJob",
      ),
    [functions],
  );

  const [uploadForm, setUploadForm] = useState({
    title: "test.txt",
    pathOnClient: "test.txt",
    firstPublishLocationId: "",
    apiVersion: "v62.0",
    instanceUrl: "https://regentrv--staging.sandbox.my.salesforce.com",
    bearerToken: "",
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<string>("");

  const [callableUploadPayload, setCallableUploadPayload] = useState<UploadProofPayload>({
    fileName: "",
    base64Data: "",
    productRegisteredId: "",
  });
  const [callableUploadFile, setCallableUploadFile] = useState<File | null>(null);
  const [callableUploadResult, setCallableUploadResult] = useState<string>("");
  const [chainedStatus, setChainedStatus] = useState<string>("");

  const [customerDetailsPayload, setCustomerDetailsPayload] =
    useState<CustomerDetailsPayload>({
      Email__c: "",
      First_Name__c: "",
      Last_Name__c: "",
      Mobile_Number__c: "",
      Handover_Date__c: "",
      Model__c: "",
      Country__c: "",
      State_AU__c: "",
      State_NZ__c: "",
      Postcode__c: "",
      Dealership_Purchased_From__c: "",
      Brand: "",
      Origin_Type: "",
      Lifecycle_Stage: "",
      Form_Name_SAP_Sync: "",
      Forms_Submitted: "",
      source: "",
      chassisNumber: "",
    });
  const [customerDetailsResult, setCustomerDetailsResult] = useState<string>("");
  const [customerJobId, setCustomerJobId] = useState<string>("");
  const [customerJobStatus, setCustomerJobStatus] = useState<string>("");

  const stateOptions = useMemo(() => {
    if (customerDetailsPayload.Country__c === "AU") return AU_STATE;
    if (customerDetailsPayload.Country__c === "NZ") return NZ_STATE;
    return EMPTY_STATE;
  }, [customerDetailsPayload.Country__c]);

  const stateValue = useMemo(() => {
    if (customerDetailsPayload.Country__c === "AU") {
      return customerDetailsPayload.State_AU__c ?? "";
    }
    if (customerDetailsPayload.Country__c === "NZ") {
      return customerDetailsPayload.State_NZ__c ?? "";
    }
    return "";
  }, [
    customerDetailsPayload.Country__c,
    customerDetailsPayload.State_AU__c,
    customerDetailsPayload.State_NZ__c,
  ]);

  const modelOptions = useMemo(() => {
    switch (customerDetailsPayload.Brand) {
      case "Regent":
        return REGENT_MODEL;
      case "Snowy River":
        return SNOWY_MODEL;
      case "Newgen":
        return NEWGEN_MODEL;
      default:
        return [{ label: "Select", value: "" }];
    }
  }, [customerDetailsPayload.Brand]);

  const dealershipOptions = useMemo(() => {
    switch (customerDetailsPayload.Brand) {
      case "Regent":
        return DEALERSHIP_PURCHASED_FROM_REGENT;
      case "Snowy River":
        return DEALERSHIP_PURCHASED_FROM_SNOWY;
      case "Newgen":
        return DEALERSHIP_PURCHASED_FROM_NEWGEN;
      default:
        return DEALERSHIP_PURCHASED_FROM;
    }
  }, [customerDetailsPayload.Brand]);

  const handleAuthChange = (key: string, value: string) => {
    setAuthForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleQueryChange = (key: string, value: string) => {
    setQueryParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleUploadChange = (key: string, value: string) => {
    setUploadForm((prev) => ({ ...prev, [key]: value }));
  };

  const runAuth = async () => {
    setAuthResult("Requesting token...");
    try {
      const body = new URLSearchParams(authForm as Record<string, string>);
      const response = await fetch(authForm.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await response.json();
      setAuthResult(JSON.stringify(data, null, 2));
      if (data.access_token) {
        setQueryParams((prev) => ({ ...prev, bearerToken: data.access_token }));
        setProductToken(data.access_token);
        setUploadForm((prev) => ({ ...prev, bearerToken: data.access_token }));
      }
    } catch (error) {
      setAuthResult(`Auth failed: ${String(error)}`);
    }
  };

  const runQuery = async (type: "order" | "lead") => {
    const query = type === "order" ? queryParams.orderQuery : queryParams.leadQuery;
    const url = `${queryParams.instanceUrl}/services/data/${queryParams.apiVersion}/query?q=${encodeURIComponent(query)}`;
    const setter = type === "order" ? setOrderResult : setLeadResult;
    setter("Loading...");
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${queryParams.bearerToken}`,
        },
      });
      const data = await response.json();
      setter(JSON.stringify(data, null, 2));
    } catch (error) {
      setter(`Query failed: ${String(error)}`);
    }
  };

  const runProductRegistration = async () => {
    setProductResult("Submitting...");
    try {
      const payload = JSON.parse(productRegistration);
      const url = `${queryParams.instanceUrl}/services/data/v62.0/sobjects/Product_Registered__c`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${productToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setProductResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setProductResult(`Product registration failed: ${String(error)}`);
    }
  };

  const filePreview = useMemo(() => uploadFile?.name ?? "No file selected", [uploadFile]);

  const callableFilePreview = useMemo(
    () => callableUploadFile?.name ?? "No file selected",
    [callableUploadFile],
  );

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          const base64 = result.split(",")[1];
          resolve(base64 ?? "");
        } else {
          reject(new Error("Unable to read file"));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  const runUpload = async () => {
    setUploadResult("Uploading...");
    try {
      let versionData = "";
      if (uploadFile) {
        versionData = await toBase64(uploadFile);
      }
      const url = `${uploadForm.instanceUrl}/services/data/${uploadForm.apiVersion}/sobjects/ContentVersion`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${uploadForm.bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Title: uploadForm.title,
          PathOnClient: uploadForm.pathOnClient,
          VersionData: versionData,
          FirstPublishLocationId: uploadForm.firstPublishLocationId,
        }),
      });
      const data = await response.json();
      setUploadResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setUploadResult(`Upload failed: ${String(error)}`);
    }
  };

  const handleCallableChange = (key: keyof ProductRegistrationData, value: string) => {
    setCallablePayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleCallableUploadChange = (key: keyof UploadProofPayload, value: string) => {
    setCallableUploadPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleCustomerDetailsChange = (
    key: keyof CustomerDetailsPayload,
    value: string,
  ) => {
    setCustomerDetailsPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleCustomerCountryChange = (value: string) => {
    setCustomerDetailsPayload((prev) => ({
      ...prev,
      Country__c: value,
      State_AU__c: value === "AU" ? prev.State_AU__c ?? "" : "",
      State_NZ__c: value === "NZ" ? prev.State_NZ__c ?? "" : "",
    }));
  };

  const handleCustomerStateChange = (value: string) => {
    setCustomerDetailsPayload((prev) => ({
      ...prev,
      State_AU__c: prev.Country__c === "AU" ? value : "",
      State_NZ__c: prev.Country__c === "NZ" ? value : "",
    }));
  };

  const handleCustomerBrandChange = (value: string) => {
    setCustomerDetailsPayload((prev) => ({
      ...prev,
      Brand: value,
      Model__c: "",
      Dealership_Purchased_From__c: "",
    }));
  };

  const runCallableSubmission = async () => {
    setCallableResult("Submitting via Firebase Function...");
    try {
      const response = await submitProductRegistrationFn(callablePayload);
      setCallableResult(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCallableResult(`Error (${code}): ${message}`);
    }
  };

  const runCallableUpload = async () => {
    setCallableUploadResult("Uploading via Firebase Function...");
    try {
      const response = await uploadProofOfPurchaseFn(callableUploadPayload);
      setCallableUploadResult(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCallableUploadResult(`Error (${code}): ${message}`);
    }
  };

  const runChainedSubmissionAndUpload = async () => {
    setChainedStatus("步骤 1/2：通过 Callable 创建 Product_Registered__c...");
    setCallableResult("");
    setCallableUploadResult("");
    try {
      const registrationResponse = await submitProductRegistrationFn(callablePayload);
      setCallableResult(JSON.stringify(registrationResponse.data, null, 2));

      const { success, salesforceId } = registrationResponse.data;
      if (!success || !salesforceId) {
        throw new Error("submitProductRegistration 未返回 salesforceId");
      }

      setCallableUploadPayload((prev) => ({
        ...prev,
        productRegisteredId: salesforceId,
      }));

      const base64Data = callableUploadPayload.base64Data || "";
      if (!base64Data) {
        throw new Error("请先选择购买凭证文件或填写 base64 内容");
      }

      const uploadPayload: UploadProofPayload = {
        fileName: callableUploadPayload.fileName || "proof-of-purchase",
        base64Data,
        productRegisteredId: salesforceId,
      };

      setChainedStatus(
        `步骤 2/2：已获得 ${salesforceId}，准备上传购买凭证...`,
      );
      const uploadResponse = await uploadProofOfPurchaseFn(uploadPayload);
      setCallableUploadResult(JSON.stringify(uploadResponse.data, null, 2));
      setChainedStatus("完成：已创建 Product_Registered__c 并上传购买凭证。");
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setChainedStatus(`流程失败 (${code}): ${message}`);
    }
  };

  const submitCustomerDetails = async () => {
    setCustomerDetailsResult("Submitting to Firebase queue...");
    try {
      const response = await enqueueCustomerDetailsFn(customerDetailsPayload);
      const { jobId, status } = response.data;
      setCustomerDetailsResult(JSON.stringify(response.data, null, 2));
      setCustomerJobId(jobId);
      setCustomerJobStatus(status);
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCustomerDetailsResult(`Error (${code}): ${message}`);
    }
  };

  const refreshCustomerJobStatus = async () => {
    if (!customerJobId) {
      setCustomerJobStatus("请先提交以获得 jobId");
      return;
    }
    setCustomerJobStatus("Checking status...");
    try {
      const response = await getCustomerDetailsJobFn({ jobId: customerJobId });
      setCustomerJobStatus(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCustomerJobStatus(`Error (${code}): ${message}`);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Salesforce API Test Bench</h1>
        <p className="text-muted-foreground text-sm">
          独立测试页面。输入凭据与数据后即可直接调用 Salesforce API，不会影响其他页面。
        </p>
      </header>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">1. 获取 OAuth Token</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Token URL
            <input
              className="rounded border px-3 py-2"
              value={authForm.tokenUrl}
              onChange={(e) => handleAuthChange("tokenUrl", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            grant_type
            <input
              className="rounded border px-3 py-2"
              value={authForm.grant_type}
              onChange={(e) => handleAuthChange("grant_type", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            client_id
            <input
              className="rounded border px-3 py-2"
              value={authForm.client_id}
              onChange={(e) => handleAuthChange("client_id", e.target.value)}
              placeholder=""
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            client_secret
            <input
              className="rounded border px-3 py-2"
              type="password"
              value={authForm.client_secret}
              onChange={(e) => handleAuthChange("client_secret", e.target.value)}
              placeholder=""
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            username
            <input
              className="rounded border px-3 py-2"
              value={authForm.username}
              onChange={(e) => handleAuthChange("username", e.target.value)}
              placeholder=""
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            password + security token
            <input
              className="rounded border px-3 py-2"
              type="password"
              value={authForm.password}
              onChange={(e) => handleAuthChange("password", e.target.value)}
              placeholder=""
            />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            onClick={runAuth}
            type="button"
          >
            获取 Token
          </button>
        </div>
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{authResult || "等待请求"}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">2. 查询数据</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            实例 URL
            <input
              className="rounded border px-3 py-2"
              value={queryParams.instanceUrl}
              onChange={(e) => handleQueryChange("instanceUrl", e.target.value)}
              placeholder="https://your-org.my.salesforce.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            API Version
            <input
              className="rounded border px-3 py-2"
              value={queryParams.apiVersion}
              onChange={(e) => handleQueryChange("apiVersion", e.target.value)}
              placeholder="v60.0"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Bearer Token
            <input
              className="rounded border px-3 py-2"
              value={queryParams.bearerToken}
              onChange={(e) => handleQueryChange("bearerToken", e.target.value)}
              placeholder="Copy access_token from OAuth response"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Order 查询语句
            <textarea
              className="rounded border px-3 py-2"
              rows={3}
              value={queryParams.orderQuery}
              onChange={(e) => handleQueryChange("orderQuery", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Lead 查询语句
            <textarea
              className="rounded border px-3 py-2"
              rows={3}
              value={queryParams.leadQuery}
              onChange={(e) => handleQueryChange("leadQuery", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            onClick={() => runQuery("order")}
            type="button"
          >
            查询订单
          </button>
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            onClick={() => runQuery("lead")}
            type="button"
          >
            查询线索
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">订单查询结果</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{orderResult || "等待查询"}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold">线索查询结果</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{leadResult || "等待查询"}
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">3. 创建 Product_Registered__c</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Bearer Token
            <input
              className="rounded border px-3 py-2"
              value={productToken}
              onChange={(e) => setProductToken(e.target.value)}
              placeholder="Access token"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            请求体 (JSON)
            <textarea
              className="rounded border px-3 py-2"
              rows={10}
              value={productRegistration}
              onChange={(e) => setProductRegistration(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            onClick={runProductRegistration}
            type="button"
          >
            提交 Product_Registered__c
          </button>
        </div>
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{productResult || "等待提交"}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">4. 上传 ContentVersion (Proof of Purchase)</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            实例 URL
            <input
              className="rounded border px-3 py-2"
              value={uploadForm.instanceUrl}
              onChange={(e) => handleUploadChange("instanceUrl", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            API Version
            <input
              className="rounded border px-3 py-2"
              value={uploadForm.apiVersion}
              onChange={(e) => handleUploadChange("apiVersion", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Bearer Token
            <input
              className="rounded border px-3 py-2"
              value={uploadForm.bearerToken}
              onChange={(e) => handleUploadChange("bearerToken", e.target.value)}
              placeholder="Access token"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title
            <input
              className="rounded border px-3 py-2"
              value={uploadForm.title}
              onChange={(e) => handleUploadChange("title", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            PathOnClient
            <input
              className="rounded border px-3 py-2"
              value={uploadForm.pathOnClient}
              onChange={(e) => handleUploadChange("pathOnClient", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            FirstPublishLocationId
            <input
              className="rounded border px-3 py-2"
              value={uploadForm.firstPublishLocationId}
              onChange={(e) => handleUploadChange("firstPublishLocationId", e.target.value)}
              placeholder="Related record ID"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            选择文件
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-muted-foreground">{filePreview}</span>
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
            onClick={runUpload}
            type="button"
          >
            上传附件
          </button>
        </div>
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{uploadResult || "等待上传"}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">5. 测试 Firebase Callable Function（submitProductRegistration）</h2>
        <p className="text-sm text-muted-foreground">
          后端会从 Firebase Secrets 读取 Salesforce 凭据并调用 /services/oauth2/token，再创建 Product_Registered__c 并在
          Firestore 写入日志。前端只需按下方字段提交，email 和 chassisNumber 为必填，其余可选。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            First Name
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.firstName ?? ""}
              onChange={(e) => handleCallableChange("firstName", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Last Name
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.lastName ?? ""}
              onChange={(e) => handleCallableChange("lastName", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Email（必填）
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.email ?? ""}
              onChange={(e) => handleCallableChange("email", e.target.value)}
              placeholder="john.doe@gmail.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mobile
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.mobile ?? ""}
              onChange={(e) => handleCallableChange("mobile", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Phone
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.phone ?? ""}
              onChange={(e) => handleCallableChange("phone", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Street Address
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.streetAddress ?? ""}
              onChange={(e) => handleCallableChange("streetAddress", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Suburb
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.suburb ?? ""}
              onChange={(e) => handleCallableChange("suburb", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Country（默认 AU）
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.country ?? ""}
              onChange={(e) => handleCallableChange("country", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Postcode
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.postcode ?? ""}
              onChange={(e) => handleCallableChange("postcode", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            State / Region（如 AU-VIC）
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.stateRegion ?? ""}
              onChange={(e) => handleCallableChange("stateRegion", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Chassis Number（必填）
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.chassisNumber ?? ""}
              onChange={(e) => handleCallableChange("chassisNumber", e.target.value)}
              placeholder="ABC123456"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Brand
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.brand ?? ""}
              onChange={(e) => handleCallableChange("brand", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Model
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.model ?? ""}
              onChange={(e) => handleCallableChange("model", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dealership Code（SAP dealer code）
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.dealershipCode ?? ""}
              onChange={(e) => handleCallableChange("dealershipCode", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Handover Date（YYYY-MM-DD）
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.handoverDate ?? ""}
              onChange={(e) => handleCallableChange("handoverDate", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            VIN
            <input
              className="rounded border px-3 py-2"
              value={callablePayload.vin ?? ""}
              onChange={(e) => handleCallableChange("vin", e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            className="rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
            onClick={runCallableSubmission}
            type="button"
          >
            通过 Firebase Function 提交
          </button>
        </div>

        <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{callableResult || "等待提交"}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">6. 通过 Firebase Function 上传购买凭证</h2>
        <div className="mt-1 space-y-1 text-sm text-muted-foreground">
          <p>
            使用 uploadProofOfPurchase（Callable）将文件上传为 ContentVersion，并关联到 Product_Registered__c。
          </p>
          <p>
            如果要和 submitProductRegistration 串联测试，请在下方填写文件信息后点击「提交注册并上传凭证」，流程会先
            调用 submitProductRegistration，拿到 salesforceId 后再自动上传凭证并把 productRegisteredId 填好。
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Product_Registered__c Id（关联目标）
            <input
              className="rounded border px-3 py-2"
              value={callableUploadPayload.productRegisteredId}
              onChange={(e) => handleCallableUploadChange("productRegisteredId", e.target.value)}
              placeholder="来自 submitProductRegistration 的 salesforceId"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            原始文件名
            <input
              className="rounded border px-3 py-2"
              value={callableUploadPayload.fileName}
              onChange={(e) => handleCallableUploadChange("fileName", e.target.value)}
              placeholder="invoice123.pdf"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Base64 内容（可粘贴 dataURI，或选择文件自动生成）
            <textarea
              className="rounded border px-3 py-2"
              rows={4}
              value={callableUploadPayload.base64Data}
              onChange={(e) => handleCallableUploadChange("base64Data", e.target.value)}
              placeholder="data:application/pdf;base64,XXX 或纯 base64"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            选择文件（自动转 base64）
            <input
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0] ?? null;
                setCallableUploadFile(file);
                if (file) {
                  try {
                    const base64 = await toBase64(file);
                    setCallableUploadPayload((prev) => ({
                      ...prev,
                      base64Data: base64,
                      fileName: prev.fileName || file.name,
                    }));
                  } catch (err) {
                    setCallableUploadResult(`读取文件失败: ${String(err)}`);
                  }
                }
              }}
            />
            <span className="text-xs text-muted-foreground">{callableFilePreview}</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
            onClick={runCallableUpload}
            type="button"
          >
            通过 Firebase Function 上传凭证
          </button>
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            onClick={runChainedSubmissionAndUpload}
            type="button"
          >
            提交注册并上传凭证（串联）
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-700">{chainedStatus || "等待操作"}</p>
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{callableUploadResult || "等待上传"}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">7. Customer Details → Firebase Callable + Cloud Tasks</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          通过 enqueuePostCustomerDetails（Callable）将表单发送到 Cloud Tasks 队列，并用 getPostCustomerDetailsJob 查询状态。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email__c（必填）
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Email__c}
              onChange={(e) => handleCustomerDetailsChange("Email__c", e.target.value)}
              placeholder="customer@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            First_Name__c
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.First_Name__c ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("First_Name__c", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Last_Name__c
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Last_Name__c ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("Last_Name__c", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mobile_Number__c
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Mobile_Number__c ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("Mobile_Number__c", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Handover_Date__c（YYYY-MM-DD）
            <input
              className="rounded border px-3 py-2"
              type="date"
              value={customerDetailsPayload.Handover_Date__c ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("Handover_Date__c", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Model__c
            <select
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Model__c ?? ""}
              onChange={(e) => handleCustomerDetailsChange("Model__c", e.target.value)}
              disabled={!customerDetailsPayload.Brand}
            >
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Country__c
            <select
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Country__c ?? ""}
              onChange={(e) => handleCustomerCountryChange(e.target.value)}
            >
              {COUNTRY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            State/Region（根据 Country__c）
            <select
              className="rounded border px-3 py-2"
              value={stateValue}
              onChange={(e) => handleCustomerStateChange(e.target.value)}
              disabled={!customerDetailsPayload.Country__c}
            >
              {stateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Postcode__c
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Postcode__c ?? ""}
              onChange={(e) => handleCustomerDetailsChange("Postcode__c", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dealership_Purchased_From__c
            <select
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Dealership_Purchased_From__c ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange(
                  "Dealership_Purchased_From__c",
                  e.target.value,
                )
              }
            >
              {dealershipOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Brand
            <select
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Brand ?? ""}
              onChange={(e) => handleCustomerBrandChange(e.target.value)}
            >
              {BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Origin_Type
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Origin_Type ?? ""}
              onChange={(e) => handleCustomerDetailsChange("Origin_Type", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Lifecycle_Stage
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Lifecycle_Stage ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("Lifecycle_Stage", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Form_Name_SAP_Sync
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Form_Name_SAP_Sync ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("Form_Name_SAP_Sync", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Forms_Submitted
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.Forms_Submitted ?? ""}
              onChange={(e) =>
                handleCustomerDetailsChange("Forms_Submitted", e.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            source（内部追踪）
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.source ?? ""}
              onChange={(e) => handleCustomerDetailsChange("source", e.target.value)}
              placeholder="webapp / kiosk 等"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            chassisNumber（内部追踪）
            <input
              className="rounded border px-3 py-2"
              value={customerDetailsPayload.chassisNumber ?? ""}
              onChange={(e) => handleCustomerDetailsChange("chassisNumber", e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            onClick={submitCustomerDetails}
            type="button"
          >
            提交到队列（enqueuePostCustomerDetails）
          </button>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
            onClick={refreshCustomerJobStatus}
            type="button"
          >
            查询最新状态（getPostCustomerDetailsJob）
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">队列返回</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{customerDetailsResult || "等待提交"}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Job 状态</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
{customerJobStatus || (customerJobId ? "等待查询" : "请先提交获取 jobId")}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SalesforceTest;
