import axios, { type AxiosInstance } from "axios";

export const TOKEN_KEY = "access_token";

const createClient = (baseURL: string): AxiosInstance => {
  const client = axios.create({ baseURL, timeout: 30000 });

  // Tự gắn JWT vào mọi request
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // Token hết hạn/sai -> về trang đăng nhập
  client.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error.response?.status === 401 && !location.pathname.startsWith("/login")) {
        localStorage.removeItem(TOKEN_KEY);
        location.href = "/login";
      }
      return Promise.reject(error);
    },
  );
  return client;
};

export const authClient = createClient("http://127.0.0.1:8001");
export const tuitionClient = createClient("http://127.0.0.1:8002/api");
export const paymentClient = createClient("http://127.0.0.1:8003");

// Giữ tên cũ để tuitionServices.ts hiện tại chạy tiếp
export const httpClient = tuitionClient;