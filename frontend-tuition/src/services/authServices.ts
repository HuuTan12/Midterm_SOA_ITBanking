import { authClient } from "../util/Config.ts";

export const authServices = {
  login: (username: string, password: string) =>
    authClient.post("/auth/login", { username, password }),
  me: () => authClient.get("/users/me"),

  // Quên mật khẩu
  forgotPassword: (email: string) =>
    authClient.post("/auth/forgot-password", { email }),
  verifyResetOtp: (email: string, otp: string) =>
    authClient.post("/auth/verify-reset-otp", { email, otp }),
  resetPassword: (reset_token: string, new_password: string) =>
    authClient.post("/auth/reset-password", { reset_token, new_password }),
};