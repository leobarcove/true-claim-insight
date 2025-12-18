declare namespace Express {
  interface User {
    id: string;
    email: string;
    fullName: string;
    phoneNumber: string;
    role: string;
    tenantId: string;
    licenseNumber?: string;
    tenant?: {
      id: string;
      name: string;
    };
  }
}
