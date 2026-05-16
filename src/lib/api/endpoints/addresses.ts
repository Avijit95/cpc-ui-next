import { request } from "../client";
import type { Address, AddressDeleteResponse, StateCode } from "../types";

export type CreateAddressBody = {
  label?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  stateCode: StateCode;
  pincode: string;
  isDefault?: boolean;
};

export type UpdateAddressBody = Partial<Omit<CreateAddressBody, "isDefault">>;

export const addressesApi = {
  list() {
    return request<Address[]>("/me/addresses");
  },
  create(body: CreateAddressBody) {
    return request<Address>("/me/addresses", { method: "POST", body });
  },
  update(id: string, body: UpdateAddressBody) {
    return request<Address>(`/me/addresses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  setDefault(id: string) {
    return request<Address>(
      `/me/addresses/${encodeURIComponent(id)}/set-default`,
      { method: "POST" },
    );
  },
  remove(id: string) {
    return request<AddressDeleteResponse>(
      `/me/addresses/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};
