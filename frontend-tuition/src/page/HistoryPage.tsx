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

const STATUS: Record<string, { label: string; cls: string }> = {
  SUCCESS: { label: "Thành công", cls: "bg-success" },
  PENDING_OTP: { label: "Chờ OTP", cls: "bg-warning text-dark" },
  FAILED: { label: "Thất bại", cls: "bg-danger" },
  EXPIRED: { label: "Hết hạn", cls: "bg-secondary" },
};

// DB lưu giờ UTC không kèm múi giờ -> thêm "Z" để trình duyệt đổi về giờ địa phương
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
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-10">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h4 className="fw-bold text-primary mb-0">Lịch sử giao dịch</h4>
            <div>
              <Link className="btn btn-sm btn-outline-primary me-2" to="/">
                Thanh toán học phí
              </Link>
              <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
                Đăng xuất
              </button>
            </div>
          </div>

          {loading && <div className="text-muted">Đang tải...</div>}
          {error && <div className="alert alert-danger">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="alert alert-info">Bạn chưa có giao dịch nào.</div>
          )}

          {rows.length > 0 && (
            <div className="card shadow-sm border-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Mã GD</th>
                      <th>Thời gian</th>
                      <th>MSSV</th>
                      <th className="text-end">Số tiền</th>
                      <th>Trạng thái</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const st = STATUS[t.status] ?? { label: t.status, cls: "bg-secondary" };
                      return (
                        <tr key={t.id}>
                          <td>#{t.id}</td>
                          <td className="small">{fmt(t.created_at)}</td>
                          <td>{t.mssv}</td>
                          <td className="text-end fw-semibold">
                            {t.amount.toLocaleString("vi-VN")} đ
                          </td>
                          <td>
                            <span className={`badge ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="small text-muted">{t.fail_reason ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;