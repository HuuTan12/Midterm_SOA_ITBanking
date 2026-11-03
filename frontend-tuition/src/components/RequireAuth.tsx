import { Navigate, Outlet } from "react-router-dom";
import { TOKEN_KEY } from "../util/Config.ts";

const RequireAuth = () =>
  localStorage.getItem(TOKEN_KEY) ? <Outlet /> : <Navigate to="/login" replace />;

export default RequireAuth;