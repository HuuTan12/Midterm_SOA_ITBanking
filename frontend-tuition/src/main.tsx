import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./redux/store.ts";
import TuitionPage from "./page/TuitionPage.tsx";
import LoginPage from "./page/LoginPage.tsx";
import ForgotPasswordPage from "./page/ForgotPasswordPage.tsx";
import HistoryPage from "./page/HistoryPage.tsx";
import RequireAuth from "./components/RequireAuth.tsx";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider store={store}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<TuitionPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>
      </Routes>
    </Provider>
  </BrowserRouter>,
);