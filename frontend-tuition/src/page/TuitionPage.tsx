import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import type { AppDispatch, RootState } from "../redux/store";
import { fetchTuition } from "../redux/reducer/tuitionReducer";
import { authServices } from "../services/authServices.ts";
import { paymentServices } from "../services/paymentServices.ts";
import { TOKEN_KEY } from "../util/Config.ts";

interface Me {
  id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string;
  balance: number;
}

interface Result {
  ok: boolean;
  message: string;
  txId?: number;
  amount?: number;
  mssv?: string;
}

const OTP_SECONDS = 300;
const money = (n: number) => n.toLocaleString("vi-VN") + " đ";
const errMsg = (err: any, fallback: string) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

const TuitionPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { data, loading, error } = useSelector((s: RootState) => s.tuition);

  const [me, setMe] = useState<Me | null>(null);
  const [mssvInput, setMssvInput] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [otpOpen, setOtpOpen] = useState(false);
  const [txId, setTxId] = useState<number | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const loadMe = () =>
    authServices.me().then((r) => setMe(r.data)).catch(() => {});

  useEffect(() => {
    loadMe();
  }, []);

  // Đếm ngược thời hạn hiệu lực của mã OTP
  useEffect(() => {
    if (!otpOpen) return undefined;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpOpen]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    navigate("/login", { replace: true });
  };

  const handleSearch = () => {
    if (!mssvInput.trim()) return;
    setAgreed(false);
    setFormError(null);
    setResult(null);
    dispatch(fetchTuition(mssvInput.trim()));
  };

  // Điều kiện để bật nút Xác nhận giao dịch
  const canConfirm =
    !!data &&
    data.tuition_id != null &&
    data.status === "PENDING" &&
    !!me &&
    me.balance >= data.amount &&
    agreed &&
    !submitting;

  // Bước 1: Khởi tạo giao dịch thanh toán
  const handleConfirm = async () => {
    if (!data) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await paymentServices.create(data.mssv);
      setTxId(res.data.transaction_id);
      setOtp("");
      setOtpError(null);
      setSecondsLeft(res.data.expires_in_seconds ?? OTP_SECONDS);
      setOtpOpen(true);
    } catch (err: any) {
      setFormError(errMsg(err, "Không tạo được giao dịch thanh toán"));
    } finally {
      setSubmitting(false);
    }
  };

  // Bước 2: Xác thực OTP và chốt giao dịch
  const handleVerify = async () => {
    if (txId == null || !data) return;
    setSubmitting(true);
    setOtpError(null);
    try {
      await paymentServices.verifyOtp(txId, otp);
      setOtpOpen(false);
      setResult({
        ok: true,
        message: "Thanh toán học phí thành công!",
        txId,
        amount: data.amount,
        mssv: data.mssv,
      });
      loadMe();
      dispatch(fetchTuition(data.mssv));
    } catch (err: any) {
      const msg = errMsg(err, "Xác thực OTP thất bại");
      if (err.response?.status === 400) {
        setOtpError(msg);
      } else {
        setOtpOpen(false);
        setResult({ ok: false, message: msg, txId });
        loadMe();
        dispatch(fetchTuition(data.mssv));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (txId == null) return;
    setSubmitting(true);
    setOtpError(null);
    try {
      const res = await paymentServices.resendOtp(txId);
      setOtp("");
      setSecondsLeft(res.data.expires_in_seconds ?? OTP_SECONDS);
    } catch (err: any) {
      setOtpError(errMsg(err, "Không gửi lại được mã OTP"));
    } finally {
      setSubmitting(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div>
      {/* Header thanh điều hướng chuẩn ngân hàng */}
      <nav className="banking-navbar navbar navbar-expand-lg px-3 py-2">
        <div className="container">
          <Link to="/" className="banking-brand">
            <div className="brand-icon">
              <i className="bi bi-bank"></i>
            </div>
            <div>
              <span className="brand-title">iBanking</span>
              <span className="brand-subtitle">Phân hệ đóng học phí</span>
            </div>
          </Link>

          <div className="d-flex align-items-center gap-3 ms-auto">
            <div className="d-none d-md-flex align-items-center gap-3 px-3 py-1 bg-light rounded-pill border">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-person-circle text-primary fs-5"></i>
                <div className="text-start">
                  <div className="fw-semibold small text-dark lh-sm">{me?.full_name ?? "Đang tải..."}</div>
                  <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                    Số dư: <strong className="text-primary">{me ? money(me.balance) : "---"}</strong>
                  </div>
                </div>
              </div>
            </div>

            <Link to="/history" className="btn btn-sm btn-outline-secondary rounded-pill px-3">
              <i className="bi bi-clock-history me-1"></i> Lịch sử GD
            </Link>

            <button onClick={logout} className="btn btn-sm btn-outline-danger rounded-pill px-3">
              <i className="bi bi-box-arrow-right me-1"></i> Đăng xuất
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="container py-4">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-8">
            {/* Kết quả giao dịch sau khi nộp */}
            {result && (
              <div className={`banking-card border-${result.ok ? "success" : "danger"} mb-4`}>
                <div className={`p-4 text-center ${result.ok ? "bg-success-subtle text-success-emphasis" : "bg-danger-subtle text-danger-emphasis"}`}>
                  <div className="mb-2">
                    <i className={`bi ${result.ok ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} fs-1`}></i>
                  </div>
                  <h5 className="fw-bold mb-1">{result.message}</h5>
                  {result.txId != null && (
                    <p className="text-muted small mb-1">Mã tham chiếu giao dịch: <strong>#{result.txId}</strong></p>
                  )}
                  {result.ok && result.amount != null && (
                    <p className="mb-2">
                      Đã thanh toán thành công <strong>{money(result.amount)}</strong> cho sinh viên: <strong>{result.mssv}</strong>
                    </p>
                  )}
                  {result.ok && (
                    <div className="small text-muted mb-3">
                      <i className="bi bi-envelope-check me-1"></i>
                      Hóa đơn điện tử đã được gửi tới email cá nhân.
                    </div>
                  )}
                  <button
                    className="btn btn-sm btn-primary rounded-pill px-3"
                    onClick={() => {
                      setResult(null);
                      setAgreed(false);
                    }}
                  >
                    Thực hiện giao dịch mới
                  </button>
                </div>
              </div>
            )}

            {/* a. Nhóm thông tin người nộp tiền */}
            <div className="banking-card">
              <div className="banking-card-header">
                <h6 className="card-title-text mb-0">
                  <i className="bi bi-person-circle text-primary me-2"></i>
                  Thông tin người nộp tiền
                </h6>
              </div>
              <div className="banking-card-body">
                <div className="row g-3">
                  <div className="col-6 col-md-3">
                    <div className="text-muted small">Họ và tên</div>
                    <div className="fw-semibold text-dark">{me?.full_name ?? "---"}</div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="text-muted small">Số điện thoại</div>
                    <div className="fw-semibold text-dark">{me?.phone ?? "---"}</div>
                  </div>
                  <div className="col-12 col-md-3">
                    <div className="text-muted small">Email nhận OTP</div>
                    <div className="fw-semibold text-dark text-truncate">{me?.email ?? "---"}</div>
                  </div>
                  <div className="col-12 col-md-3">
                    <div className="text-muted small">Số dư khả dụng</div>
                    <div className="fw-bold text-primary fs-6">{me ? money(me.balance) : "---"}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* b. Nhóm tra cứu học phí */}
            <div className="banking-card">
              <div className="banking-card-header">
                <h6 className="card-title-text mb-0">
                  <i className="bi bi-search text-primary me-2"></i>
                  Tra cứu học phí sinh viên
                </h6>
              </div>
              <div className="banking-card-body">
                <label htmlFor="mssvInput" className="form-label small fw-semibold text-secondary">
                  Mã số sinh viên (MSSV)
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0 text-muted">
                    <i className="bi bi-mortarboard"></i>
                  </span>
                  <input
                    id="mssvInput"
                    className="form-control banking-input border-start-0"
                    placeholder="Nhập mã số sinh viên..."
                    value={mssvInput}
                    onChange={(e) => setMssvInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <button
                    className="btn btn-banking-primary d-flex align-items-center gap-2"
                    onClick={handleSearch}
                    disabled={loading || !mssvInput.trim()}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status"></span>
                        Đang tìm...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-search"></i>
                        Tra cứu
                      </>
                    )}
                  </button>
                </div>

                {error && (
                  <div className="alert alert-danger py-2 px-3 small rounded-3 mt-3 mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-exclamation-circle-fill"></i>
                    <div>{error}</div>
                  </div>
                )}

                {/* Khung kết quả tra cứu */}
                {data && (
                  <div className="tuition-result-box mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="fw-semibold text-secondary small">THÔNG TIN SINH VIÊN</span>
                      {data.tuition_id == null ? (
                        <span className="badge bg-secondary">Không có công nợ</span>
                      ) : data.status === "PAID" ? (
                        <span className="badge-paid">
                          <i className="bi bi-check-circle-fill me-1"></i>Đã thanh toán
                        </span>
                      ) : (
                        <span className="badge-pending">
                          <i className="bi bi-clock-history me-1"></i>Chưa thanh toán
                        </span>
                      )}
                    </div>

                    <div className="row g-2 mb-2">
                      <div className="col-12 col-sm-6">
                        <div className="text-muted small">Họ và tên sinh viên</div>
                        <div className="fw-bold text-dark fs-6">{data.full_name}</div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="text-muted small">Mã số sinh viên (MSSV)</div>
                        <div className="fw-bold text-primary fs-6">{data.mssv}</div>
                      </div>
                    </div>

                    {data.tuition_id == null ? (
                      <div className="alert alert-info py-2 px-3 small rounded-3 mt-2 mb-0">
                        Sinh viên này hiện không có khoản học phí nào cần thanh toán.
                      </div>
                    ) : (
                      <div className="pt-3 mt-2 border-top d-flex justify-content-between align-items-center">
                        <div>
                          <div className="text-muted small">Số tiền cần đóng</div>
                          <div className="fs-5 fw-bold text-danger">{money(data.amount)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* c. Nhóm thông tin thanh toán & Xác nhận */}
            {data && data.tuition_id != null && data.status === "PENDING" && (
              <div className="banking-card border-primary">
                <div className="banking-card-header bg-light">
                  <h6 className="card-title-text text-primary mb-0">
                    <i className="bi bi-shield-check text-primary me-2"></i>
                    Xác nhận thanh toán học phí
                  </h6>
                </div>
                <div className="banking-card-body">
                  <div className="p-3 bg-light rounded-3 mb-3">
                    <div className="d-flex justify-content-between mb-2 small">
                      <span className="text-muted">Số dư khả dụng hiện tại:</span>
                      <span className="fw-semibold">{me ? money(me.balance) : "---"}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-2 small">
                      <span className="text-muted">Số tiền thanh toán học phí:</span>
                      <span className="fw-bold text-danger">-{money(data.amount)}</span>
                    </div>
                    <div className="border-top pt-2 d-flex justify-content-between small">
                      <span className="fw-semibold">Số dư còn lại sau thanh toán:</span>
                      <span className={`fw-bold ${me && me.balance >= data.amount ? "text-success" : "text-danger"}`}>
                        {me ? money(me.balance - data.amount) : "---"}
                      </span>
                    </div>
                  </div>

                  {me && me.balance < data.amount && (
                    <div className="alert alert-warning py-2 small mb-3 d-flex align-items-center gap-2">
                      <i className="bi bi-exclamation-triangle-fill fs-5 text-warning"></i>
                      <div>Số dư hiện tại không đủ để thực hiện giao dịch này. Vui lòng nạp thêm tiền.</div>
                    </div>
                  )}

                  <div className="form-check mb-3">
                    <input
                      id="terms"
                      type="checkbox"
                      className="form-check-input"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    <label htmlFor="terms" className="form-check-label small text-secondary" style={{ cursor: "pointer" }}>
                      Tôi đồng ý với các điều khoản giao dịch của iBanking và xác nhận thanh toán khoản học phí này.
                    </label>
                  </div>

                  {formError && (
                    <div className="alert alert-danger py-2 small mb-3">
                      {formError}
                    </div>
                  )}

                  <button
                    className="btn btn-banking-success w-100 d-flex align-items-center justify-content-center gap-2 shadow-sm py-2"
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status"></span>
                        Đang xử lý giao dịch...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-lock-fill"></i>
                        Xác nhận giao dịch ({money(data.amount)})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal xác thực OTP giao dịch */}
      {otpOpen && (
        <>
          <div className="modal-backdrop fade show" style={{ backgroundColor: "rgba(15, 23, 42, 0.5)" }}></div>
          <div className="modal fade show d-block" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow rounded-4 overflow-hidden">
                <div className="modal-header border-bottom py-3 px-4 bg-light">
                  <div className="d-flex align-items-center gap-2">
                    <div className="text-primary fs-5">
                      <i className="bi bi-shield-lock-fill"></i>
                    </div>
                    <h5 className="modal-title fw-bold text-dark fs-6 mb-0">Xác thực OTP giao dịch</h5>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => !submitting && setOtpOpen(false)}
                  ></button>
                </div>

                <div className="modal-body p-4 text-center">
                  <p className="text-muted small mb-2">
                    Mã xác thực gồm <strong>6 chữ số</strong> đã được gửi tới email:
                  </p>
                  <div className="fw-semibold text-primary mb-3">{me?.email}</div>

                  <div className="my-3">
                    <input
                      className="form-control form-control-lg otp-box-clean text-center"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="······"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) =>
                        e.key === "Enter" && otp.length === 6 && secondsLeft > 0 && handleVerify()
                      }
                      autoFocus
                    />
                  </div>

                  <div className="d-flex align-items-center justify-content-center gap-1 small text-muted mt-2">
                    <i className="bi bi-clock text-danger"></i>
                    {secondsLeft > 0 ? (
                      <span>
                        Mã hết hạn sau: <strong className="text-danger">{mm}:{ss}</strong>
                      </span>
                    ) : (
                      <span className="text-danger fw-semibold">Mã OTP đã hết hiệu lực.</span>
                    )}
                  </div>

                  {otpError && (
                    <div className="alert alert-danger py-2 mt-3 mb-0 small rounded-3">
                      <i className="bi bi-exclamation-triangle-fill me-1"></i>
                      {otpError}
                    </div>
                  )}
                </div>

                <div className="modal-footer border-top bg-light py-2 px-3 d-flex justify-content-between">
                  <button
                    className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                    onClick={() => setOtpOpen(false)}
                    disabled={submitting}
                  >
                    Hủy bỏ
                  </button>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-outline-primary btn-sm rounded-pill px-3"
                      onClick={handleResend}
                      disabled={submitting}
                    >
                      <i className="bi bi-arrow-clockwise me-1"></i> Gửi lại mã
                    </button>
                    <button
                      className="btn btn-banking-primary btn-sm rounded-pill px-4"
                      onClick={handleVerify}
                      disabled={submitting || otp.length !== 6 || secondsLeft === 0}
                    >
                      {submitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          Đang duyệt...
                        </>
                      ) : (
                        "Xác nhận"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TuitionPage;
