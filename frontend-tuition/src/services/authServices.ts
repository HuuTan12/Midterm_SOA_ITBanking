import { authClient } from "../util/Config.ts";

export const authServices = {
  login: (username: string, password: string) =>
    authClient.post("/auth/login", { username, password }),
  me: () => authClient.get("/users/me"),
};