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
      setError(err.response?.data?.detail || "Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center align-items-center min-vh-75">
        <div className="col-12 col-sm-9 col-md-7 col-lg-5 col-xl-4">
          {/* Logo & Tên hệ thống */}
          <div className="text-center mb-4">
            <div className="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary text-white shadow-sm mb-2" style={{ width: 48, height: 48 }}>
              <i className="bi bi-bank fs-3"></i>
            </div>
            <h3 className="fw-bold text-dark mb-1">iBanking</h3>
            <p className="text-muted small">Cổng thanh toán học phí trực tuyến</p>
          </div>

          {/* Khung đăng nhập */}
          <div className="banking-card shadow-sm p-4">
            {notice && (
              <div className="alert alert-success py-2 px-3 small rounded-3 mb-3 d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill"></i>
                <div>{notice}</div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">Tên đăng nhập</label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0 text-muted">
                    <i className="bi bi-person"></i>
                  </span>
                  <input
                    className="form-control banking-input border-start-0"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    placeholder="Username, SĐT hoặc Email"
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label small fw-semibold text-secondary mb-0">Mật khẩu</label>
                  <Link to="/forgot-password" className="small text-decoration-none text-primary">
                    Quên mật khẩu?
                  </Link>
                </div>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0 text-muted">
                    <i className="bi bi-shield-lock"></i>
                  </span>
                  <input
                    type="password"
                    className="form-control banking-input border-start-0"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mật khẩu"
                  />
                </div>
              </div>

              {error && (
                <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  <div>{error}</div>
                </div>
              )}

              <button
                className="btn btn-banking-primary w-100 py-2 d-flex align-items-center justify-content-center gap-2 shadow-sm"
                type="submit"
                disabled={loading || !username.trim() || !password}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status"></span>
                    Đang đăng nhập...
                  </>
                ) : (
                  <>
                    <i className="bi bi-box-arrow-in-right"></i>
                    Đăng nhập
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="text-center text-muted small mt-4">
            Phân hệ đóng học phí iBanking • Đồ án môn học TDTU
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
