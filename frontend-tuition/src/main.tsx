import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./redux/store.ts";
import TuitionPage from "./page/TuitionPage.tsx";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider store={store}>
      <Routes>
        <Route path="/" element={<TuitionPage />}></Route>
      </Routes>
    </Provider>
  </BrowserRouter>,
);
