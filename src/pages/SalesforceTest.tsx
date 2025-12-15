import { useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import { app } from "@/lib/firebase";

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

type CustomerDetailsJob = {
  jobId: string;
  status: "queued" | "processing" | "success" | "failed";
  attempts?: number;
  updatedAt?: string;
  lastError?: string | null;
  lastHttpStatus?: number | null;
  lastSuccessAt?: string | null;
};

type Option = {
  label: string;
  value: string;
};

type RegionOption = {
  label: string;
  customerValue: string;
  productValue: string;
};

const COUNTRY: Option[] = [
  { label: "Select", value: "" },
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
];

const EMPTY_STATE: RegionOption[] = [
  { label: "Select", customerValue: "", productValue: "" },
];

const AU_STATE: RegionOption[] = [
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

const NZ_STATE: RegionOption[] = [
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

type SharedForm = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  phone: string;
  handoverDate: string;
  chassisNumber: string;
  brand: string;
  model: string;
  country: string;
  regionCode: string;
  postcode: string;
  dealershipCode: string;
  streetAddress: string;
  suburb: string;
  vin: string;
};

type CustomerExtras = {
  originType: string;
  lifecycleStage: string;
  formNameSapSync: string;
  formsSubmitted: string;
  source: string;
};

const SalesforceTest = () => {
  const [sharedForm, setSharedForm] = useState<SharedForm>({
    firstName: "John",
    lastName: "Smith",
    email: "john@test.com",
    mobile: "0400123456",
    phone: "",
    handoverDate: "2025-01-05",
    chassisNumber: "ABC123456",
    brand: "Snowy River",
    model: "SRT19",
    country: "AU",
    regionCode: "VIC",
    postcode: "3000",
    dealershipCode: "3141",
    streetAddress: "123 Main St",
    suburb: "Melbourne",
    vin: "VIN00000001",
  });

  const [customerExtras, setCustomerExtras] = useState<CustomerExtras>({
    originType: "Z01",
    lifecycleStage: "Customer",
    formNameSapSync: "[SNOWYRIVER] Product Registration",
    formsSubmitted: "Product Registration Form",
    source: "webapp",
  });

  const [callableResult, setCallableResult] = useState<string>("");
  const [callableUploadResult, setCallableUploadResult] = useState<string>("");
  const [chainedStatus, setChainedStatus] = useState<string>("");

  const [proofPayload, setProofPayload] = useState<UploadProofPayload>({
    fileName: "proof-of-purchase.pdf",
    base64Data: "",
    productRegisteredId: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [customerDetailsResult, setCustomerDetailsResult] = useState<string>("");
  const [customerJobId, setCustomerJobId] = useState<string>("");
  const [customerJobStatus, setCustomerJobStatus] = useState<string>("");

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

  const regionOptions = useMemo(() => {
    if (sharedForm.country === "AU") return AU_STATE;
    if (sharedForm.country === "NZ") return NZ_STATE;
    return EMPTY_STATE;
  }, [sharedForm.country]);

  const selectedRegion = useMemo(
    () => regionOptions.find((option) => option.customerValue === sharedForm.regionCode),
    [regionOptions, sharedForm.regionCode],
  );

  const modelOptions = useMemo(() => {
    switch (sharedForm.brand) {
      case "Regent":
        return REGENT_MODEL;
      case "Snowy River":
        return SNOWY_MODEL;
      case "Newgen":
        return NEWGEN_MODEL;
      default:
        return [{ label: "Select", value: "" }];
    }
  }, [sharedForm.brand]);

  const dealershipOptions = useMemo(() => {
    switch (sharedForm.brand) {
      case "Regent":
        return DEALERSHIP_PURCHASED_FROM_REGENT;
      case "Snowy River":
        return DEALERSHIP_PURCHASED_FROM_SNOWY;
      case "Newgen":
        return DEALERSHIP_PURCHASED_FROM_NEWGEN;
      default:
        return DEALERSHIP_PURCHASED_FROM;
    }
  }, [sharedForm.brand]);

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

  const handleSharedChange = (key: keyof SharedForm, value: string) => {
    setSharedForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCountryChange = (value: string) => {
    setSharedForm((prev) => ({ ...prev, country: value, regionCode: "" }));
  };

  const handleBrandChange = (value: string) => {
    setSharedForm((prev) => ({ ...prev, brand: value, model: "", dealershipCode: "" }));
  };

  const handleProofFileChange = async (file: File | null) => {
    setProofFile(file);
    if (!file) return;
    const base64Data = await toBase64(file);
    setProofPayload((prev) => ({ ...prev, base64Data, fileName: file.name }));
  };

  const buildProductPayload = (): ProductRegistrationData => ({
    firstName: sharedForm.firstName,
    lastName: sharedForm.lastName,
    email: sharedForm.email,
    mobile: sharedForm.mobile,
    phone: sharedForm.phone,
    streetAddress: sharedForm.streetAddress,
    suburb: sharedForm.suburb,
    country: sharedForm.country,
    postcode: sharedForm.postcode,
    stateRegion: selectedRegion?.productValue ?? "",
    chassisNumber: sharedForm.chassisNumber,
    brand: sharedForm.brand,
    model: sharedForm.model,
    dealershipCode: sharedForm.dealershipCode,
    handoverDate: sharedForm.handoverDate,
    vin: sharedForm.vin,
  });

  const buildCustomerPayload = (): CustomerDetailsPayload => ({
    Email__c: sharedForm.email,
    First_Name__c: sharedForm.firstName,
    Last_Name__c: sharedForm.lastName,
    Mobile_Number__c: sharedForm.mobile,
    Handover_Date__c: sharedForm.handoverDate,
    Model__c: sharedForm.model,
    Country__c: sharedForm.country,
    State_AU__c: sharedForm.country === "AU" ? selectedRegion?.customerValue ?? "" : "",
    State_NZ__c: sharedForm.country === "NZ" ? selectedRegion?.customerValue ?? "" : "",
    Postcode__c: sharedForm.postcode,
    Dealership_Purchased_From__c: sharedForm.dealershipCode,
    Brand: sharedForm.brand,
    Origin_Type: customerExtras.originType,
    Lifecycle_Stage: customerExtras.lifecycleStage,
    Form_Name_SAP_Sync: customerExtras.formNameSapSync,
    Forms_Submitted: customerExtras.formsSubmitted,
    source: customerExtras.source,
    chassisNumber: sharedForm.chassisNumber,
  });

  const runCallableSubmission = async () => {
    setCallableResult("Submitting via Firebase Function...");
    try {
      const response = await submitProductRegistrationFn(buildProductPayload());
      setCallableResult(JSON.stringify(response.data, null, 2));
      if (response.data.salesforceId) {
        setProofPayload((prev) => ({ ...prev, productRegisteredId: response.data.salesforceId ?? "" }));
      }
    } catch (error: any) {
      const code = error?.code ?? "unknown";
      const message = error?.message ?? String(error);
      setCallableResult(`Error (${code}): ${message}`);
    }
  };

  const runCallableUpload = async () => {
    setCallableUploadResult("Uploading via Firebase Function...");
    try {
      const response = await uploadProofOfPurchaseFn(proofPayload);
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
      const registrationResponse = await submitProductRegistrationFn(buildProductPayload());
      setCallableResult(JSON.stringify(registrationResponse.data, null, 2));

      const { success, salesforceId } = registrationResponse.data;
      if (!success || !salesforceId) {
        throw new Error("submitProductRegistration 未返回 salesforceId");
      }

      setProofPayload((prev) => ({ ...prev, productRegisteredId: salesforceId }));

      const base64Data = proofPayload.base64Data || "";
      if (!base64Data) {
        throw new Error("请先选择购买凭证文件或填写 base64 内容");
      }

      const uploadPayload: UploadProofPayload = {
        fileName: proofPayload.fileName || "proof-of-purchase",
        base64Data,
        productRegisteredId: salesforceId,
      };

      setChainedStatus(`步骤 2/2：已获得 ${salesforceId}，准备上传购买凭证...`);
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
      const response = await enqueueCustomerDetailsFn(buildCustomerPayload());
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
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Salesforce Test Bench</h1>
        <p className="text-sm text-muted-foreground">
          已删除 OAuth/查询/直连上传，只保留 Firebase Callable 的 Product Registration、Proof of Purchase 上传，以及 Customer Details 队列。
          相同字段合并为一个表单，避免重复填写。
        </p>
      </header>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">基础信息（共用）</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            First Name
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.firstName}
              onChange={(e) => handleSharedChange("firstName", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Last Name
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.lastName}
              onChange={(e) => handleSharedChange("lastName", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Email（必填）
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.email}
              onChange={(e) => handleSharedChange("email", e.target.value)}
              placeholder="john@test.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mobile
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.mobile}
              onChange={(e) => handleSharedChange("mobile", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Phone
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.phone}
              onChange={(e) => handleSharedChange("phone", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Street Address
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.streetAddress}
              onChange={(e) => handleSharedChange("streetAddress", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Suburb
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.suburb}
              onChange={(e) => handleSharedChange("suburb", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Country
            <select
              className="rounded border px-3 py-2"
              value={sharedForm.country}
              onChange={(e) => handleCountryChange(e.target.value)}
            >
              {COUNTRY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            State / Region
            <select
              className="rounded border px-3 py-2"
              value={sharedForm.regionCode}
              onChange={(e) => handleSharedChange("regionCode", e.target.value)}
            >
              {regionOptions.map((option) => (
                <option key={`${option.productValue}-${option.customerValue}`} value={option.customerValue}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Postcode
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.postcode}
              onChange={(e) => handleSharedChange("postcode", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
            Chassis Number（必填）
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.chassisNumber}
              onChange={(e) => handleSharedChange("chassisNumber", e.target.value)}
              placeholder="ABC123456"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Brand
            <select
              className="rounded border px-3 py-2"
              value={sharedForm.brand}
              onChange={(e) => handleBrandChange(e.target.value)}
            >
              {BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Model
            <select
              className="rounded border px-3 py-2"
              value={sharedForm.model}
              onChange={(e) => handleSharedChange("model", e.target.value)}
            >
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dealership（SAP code）
            <select
              className="rounded border px-3 py-2"
              value={sharedForm.dealershipCode}
              onChange={(e) => handleSharedChange("dealershipCode", e.target.value)}
            >
              {dealershipOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Handover Date
            <input
              className="rounded border px-3 py-2"
              type="date"
              value={sharedForm.handoverDate}
              onChange={(e) => handleSharedChange("handoverDate", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            VIN
            <input
              className="rounded border px-3 py-2"
              value={sharedForm.vin}
              onChange={(e) => handleSharedChange("vin", e.target.value)}
              placeholder="可选"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Firebase Callable：submitProductRegistration & uploadProofOfPurchase</h2>
        <p className="text-sm text-muted-foreground">
          使用上方共用字段生成 payload；State/Region 会自动匹配 Product Registration 需要的前缀（如 AU-VIC），购买凭证上传会使用返回的 Product_Registered__c Id。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Product_Registered__c Id（可自动填充）
            <input
              className="rounded border px-3 py-2"
              value={proofPayload.productRegisteredId}
              onChange={(e) => setProofPayload((prev) => ({ ...prev, productRegisteredId: e.target.value }))}
              placeholder="来自 submitProductRegistration 的 salesforceId"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            凭证文件名
            <input
              className="rounded border px-3 py-2"
              value={proofPayload.fileName}
              onChange={(e) => setProofPayload((prev) => ({ ...prev, fileName: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            选择凭证文件（会转 base64）
            <input
              type="file"
              onChange={(e) => handleProofFileChange(e.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-muted-foreground">{proofFile?.name ?? "No file selected"}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            或直接粘贴 base64
            <textarea
              className="rounded border px-3 py-2"
              rows={3}
              value={proofPayload.base64Data}
              onChange={(e) => setProofPayload((prev) => ({ ...prev, base64Data: e.target.value }))}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            onClick={runCallableSubmission}
            type="button"
          >
            仅提交 Product_Registered__c
          </button>
          <button
            className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
            onClick={runCallableUpload}
            type="button"
          >
            仅上传购买凭证
          </button>
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            onClick={runChainedSubmissionAndUpload}
            type="button"
          >
            提交注册并上传凭证（串联）
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">submitProductRegistration 返回</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{callableResult || "等待提交"}</pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold">uploadProofOfPurchase 返回</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{callableUploadResult || "等待上传"}</pre>
            {chainedStatus && (
              <p className="mt-2 text-xs text-slate-700">{chainedStatus}</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Customer Details → Firebase Callable + Cloud Tasks</h2>
        <p className="text-sm text-muted-foreground">
          使用同一套字段；State_AU__c / State_NZ__c 会使用无前缀的值（例如 VIC、NSW），以符合 Customer Details 写入格式。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Origin_Type
            <input
              className="rounded border px-3 py-2"
              value={customerExtras.originType}
              onChange={(e) => setCustomerExtras((prev) => ({ ...prev, originType: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Lifecycle_Stage
            <input
              className="rounded border px-3 py-2"
              value={customerExtras.lifecycleStage}
              onChange={(e) => setCustomerExtras((prev) => ({ ...prev, lifecycleStage: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Form_Name_SAP_Sync
            <input
              className="rounded border px-3 py-2"
              value={customerExtras.formNameSapSync}
              onChange={(e) => setCustomerExtras((prev) => ({ ...prev, formNameSapSync: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Forms_Submitted
            <input
              className="rounded border px-3 py-2"
              value={customerExtras.formsSubmitted}
              onChange={(e) => setCustomerExtras((prev) => ({ ...prev, formsSubmitted: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            source（内部追踪）
            <input
              className="rounded border px-3 py-2"
              value={customerExtras.source}
              onChange={(e) => setCustomerExtras((prev) => ({ ...prev, source: e.target.value }))}
              placeholder="webapp / kiosk 等"
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
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{customerDetailsResult || "等待提交"}</pre>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Job 状态</h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{customerJobStatus || (customerJobId ? "等待查询" : "请先提交获取 jobId")}</pre>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SalesforceTest;
