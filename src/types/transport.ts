export type TransportCompany = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TransportPreference = {
  preferenceRank: number;
  companyId: string;
  truckNumber: string;
  supplierRating: string;
  bankGuarantee: string;
};

export type DealerTransportPreferences = {
  destinationLocation: string;
  preferences: TransportPreference[];
  updatedAt?: string;
};
