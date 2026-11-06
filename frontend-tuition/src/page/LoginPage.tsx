import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authServices } from "../services/authServices.ts";
import { TOKEN_KEY } from "../util/Config.ts";

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();
  const notice = (loc.state as { notice?: string } | null)?.notice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authServices.login(username.trim(), password);
      localStorage.setItem(TOKEN_KEY, res.data.access_token);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Không kết nối được server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-6 col-lg-4">
          <h3 className="fw-bold text-primary text-center mb-4">iBanking</h3>
          <form className="card shadow-sm border-0" onSubmit={handleSubmit}>
            <div className="card-body p-4">
              {notice && <div className="alert alert-success py-2">{notice}</div>}
              <div className="mb-3">
                <label className="form-label fw-semibold">Tên đăng nhập</label>
                <input className="form-control" value={username}
                  onChange={(e) => setUsername(e.target.value)} autoFocus />
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold">Mật khẩu</label>
                <input type="password" className="form-control" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <div className="alert alert-danger py-2">{error}</div>}
              <button className="btn btn-primary w-100 fw-semibold" type="submit"
                disabled={loading || !username.trim() || !password}>
                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
              <div className="text-center mt-3">
                <Link to="/forgot-password" className="small">
                  Quên mật khẩu?
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;