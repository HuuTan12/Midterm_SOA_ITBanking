import { httpClient } from "../util/Config.ts";

export const tuitionServices = {
  // Tra cứu học phí theo MSSV
  getTuitionDataByMSSV: (mssv: string) => {
    return httpClient.get(`/tuition/${mssv}`);
  },

  // Tạm giữ cho reducer cũ, sẽ thay bằng luồng OTP ở phần 2
  payTuition: (payload: { mssv: string; version: number }) => {
    return httpClient.post(`/tuition/pay`, payload);
  },
};