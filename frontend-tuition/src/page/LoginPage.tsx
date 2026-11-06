import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authServices } from "../services/authServices.ts";
import { TOKEN_KEY } from "../util/Config.ts";

const DEMO_USERS = [
  { name: "Nguyễn Hữu Tân", note: "Số dư: 20tr" },
  { name: "Trần Minh Thái", note: "Số dư: 5tr" },
  { name: "Lê Quốc Việt", note: "Số dư: 30tr" },
];

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

  const handleFillDemo = (name: string) => {
    setUsername(name);
    setPassword("123456");
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center align-items-center min-vh-75">
        <div className="col-12 col-sm-9 col-md-7 col-lg-5 col-xl-4">
          {/* Logo & Tên hệ thống */}
          <div className="text-center mb-4">
            <div className="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary text-white shadow-sm mb-2" style={{ width: 50, height: 50 }}>
              <i className="bi bi-bank fs-3"></i>
            </div>
            <h3 className="fw-bold text-dark mb-0">iBanking Portal</h3>
            <p className="text-muted small">Cổng dịch vụ thanh toán học phí trực tuyến</p>
          </div>

          {/* Khung đăng nhập */}
          <div className="banking-card shadow-sm border p-4">
            {notice && (
              <div className="alert alert-success py-2 px-3 small rounded-3 mb-3 d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill"></i>
                <div>{notice}</div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Tài khoản đăng nhập</label>
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
                <div className="form-text small text-muted" style={{ fontSize: "0.76rem" }}>
                  Ví dụ: <em>tan</em>, SĐT <em>0901111111</em> hoặc <em>tan@example.com</em>
                </div>
              </div>

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label mb-0">Mật khẩu</label>
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
                    placeholder="Nhập mật khẩu (Mặc định: 123456)"
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

            {/* Quick Demo Helpers */}
            <div className="border-top pt-3 mt-4">
              <div className="small text-muted mb-2 d-flex align-items-center gap-1">
                <i className="bi bi-lightning-charge text-warning"></i>
                Tài khoản kiểm thử nhanh (Demo):
              </div>
              <div className="d-flex flex-wrap gap-2">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.name}
                    type="button"
                    className="chip-btn"
                    onClick={() => handleFillDemo(u.name)}
                  >
                    {u.name} <span className="text-muted small">({u.note})</span>
                  </button>
                ))}
              </div>
            </div>
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
