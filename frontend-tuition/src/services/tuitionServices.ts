import { httpClient } from "../util/Config.ts";

export const tuitionServices = {
  // Tra cứu học phí theo MSSV
  getTuitionDataByMSSV: (mssv: string) => {
    return httpClient.get(`/tuition/${mssv}`);
  },
};