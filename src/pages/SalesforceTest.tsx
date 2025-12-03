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
    </div>
  );
};

export default SalesforceTest;
