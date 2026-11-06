import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { paymentServices } from "../services/paymentServices.ts";
import { TOKEN_KEY } from "../util/Config.ts";

interface Tx {
  id: number;
  mssv: string;
  amount: number;
  status: string;
  fail_reason: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  SUCCESS: { label: "Thành công", cls: "badge-paid", icon: "bi-check-circle-fill" },
  PENDING_OTP: { label: "Chờ OTP", cls: "badge-pending", icon: "bi-clock-history" },
  FAILED: { label: "Thất bại", cls: "badge bg-danger-subtle text-danger border border-danger-subtle", icon: "bi-x-circle-fill" },
  EXPIRED: { label: "Hết hạn", cls: "badge bg-secondary-subtle text-secondary border border-secondary-subtle", icon: "bi-hourglass-bottom" },
};

const fmt = (s: string) => {
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  return new Date(hasTz ? s : s + "Z").toLocaleString("vi-VN");
};

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    paymentServices
      .history()
      .then((r) => setRows(r.data))
      .catch((e: any) =>
        setError(e?.response?.data?.detail || "Không tải được lịch sử giao dịch"),
      )
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    navigate("/login", { replace: true });
  };

  return (
    <div>
      {/* Header */}
      <nav className="banking-navbar navbar navbar-expand-lg px-3 py-2 mb-4">
        <div className="container">
          <Link to="/" className="banking-brand">
            <div className="brand-icon">
              <i className="bi bi-bank"></i>
            </div>
            <div>
              <span className="brand-title">iBanking</span>
              <span className="brand-subtitle">Lịch sử giao dịch</span>
            </div>
          </Link>

          <div className="d-flex align-items-center gap-2 ms-auto">
            <Link to="/" className="btn btn-sm btn-outline-primary rounded-pill px-3">
              <i className="bi bi-wallet2 me-1"></i> Đóng học phí
            </Link>
            <button onClick={logout} className="btn btn-sm btn-outline-danger rounded-pill px-3">
              <i className="bi bi-box-arrow-right me-1"></i> Đăng xuất
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="container pb-5">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 className="fw-bold mb-1 text-dark">Lịch sử giao dịch thanh toán</h4>
            <p className="text-muted small mb-0">Sao kê các giao dịch nộp học phí đã thực hiện</p>
          </div>
          <span className="badge bg-light text-muted border px-3 py-2 rounded-pill">
            Tổng cộng: {rows.length} giao dịch
          </span>
        </div>

        {loading && (
          <div className="text-center py-5 text-muted">
            <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
            Đang tải dữ liệu sao kê...
          </div>
        )}

        {error && (
          <div className="alert alert-danger py-3 px-4 rounded-3">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="banking-card p-5 text-center text-muted">
            <i className="bi bi-receipt fs-1 text-secondary opacity-50 mb-2 d-block"></i>
            <h6>Chưa có giao dịch nào</h6>
            <p className="small mb-3">Tài khoản này chưa phát sinh giao dịch thanh toán học phí nào.</p>
            <Link to="/" className="btn btn-banking-primary btn-sm rounded-pill px-3">
              Thực hiện nộp học phí ngay
            </Link>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="banking-card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th className="ps-4">Mã GD</th>
                    <th>Thời gian</th>
                    <th>MSSV</th>
                    <th className="text-end">Số tiền</th>
                    <th className="text-center">Trạng thái</th>
                    <th className="pe-4">Chi tiết / Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const cfg = STATUS_CONFIG[t.status] ?? {
                      label: t.status,
                      cls: "badge bg-secondary",
                      icon: "bi-dash-circle",
                    };
                    return (
                      <tr key={t.id}>
                        <td className="ps-4 fw-semibold text-primary">#{t.id}</td>
                        <td className="small text-muted">{fmt(t.created_at)}</td>
                        <td>
                          <span className="badge bg-light text-dark border px-2 py-1">
                            {t.mssv}
                          </span>
                        </td>
                        <td className="text-end fw-bold text-dark">
                          {t.amount.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="text-center">
                          <span className={`${cfg.cls} d-inline-flex align-items-center gap-1`}>
                            <i className={`bi ${cfg.icon}`}></i>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="pe-4 small text-muted">
                          {t.fail_reason ? (
                            <span className="text-danger">{t.fail_reason}</span>
                          ) : t.status === "SUCCESS" ? (
                            <span className="text-success">
                              <i className="bi bi-check2 me-1"></i>Đã gạch nợ thành công
                            </span>
                          ) : (
                            "---"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default HistoryPage;
