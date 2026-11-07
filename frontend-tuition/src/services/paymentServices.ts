import { paymentClient } from "../util/Config.ts";

export const paymentServices = {
  create: (mssv: string) => paymentClient.post("/payments", { mssv }),
  verifyOtp: (txId: number, otp: string) =>
    paymentClient.post(`/payments/${txId}/verify-otp`, { otp }),
  resendOtp: (txId: number) => paymentClient.post(`/payments/${txId}/resend-otp`),
  history: () => paymentClient.get("/users/me/transactions"),
    pending: () => paymentClient.get("/payments/pending"),
  cancel: (txId: number) => paymentClient.post(`/payments/${txId}/cancel`),
};