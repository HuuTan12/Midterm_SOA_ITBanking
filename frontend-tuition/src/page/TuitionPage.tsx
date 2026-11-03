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

  // Đếm ngược OTP khi modal đang mở
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

  // Điều kiện để nút "Xác nhận giao dịch" được bật
  const canConfirm =
    !!data &&
    data.tuition_id != null &&
    data.status === "PENDING" &&
    !!me &&
    me.balance >= data.amount &&
    agreed &&
    !submitting;

  // Bước 1: tạo giao dịch, hệ thống gửi OTP qua email
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
      setFormError(errMsg(err, "Không tạo được giao dịch"));
    } finally {
      setSubmitting(false);
    }
  };

  // Bước 2: nhập OTP và xác nhận lần cuối
  const handleVerify = async () => {
    if (txId == null || !data) return;
    setSubmitting(true);
    setOtpError(null);
    try {
      await paymentServices.verifyOtp(txId, otp);
      setOtpOpen(false);
      setResult({
        ok: true,
        message: "Thanh toán thành công",
        txId,
        amount: data.amount,
        mssv: data.mssv,
      });
      loadMe();
      dispatch(fetchTuition(data.mssv));
    } catch (err: any) {
      const msg = errMsg(err, "Xác thực OTP thất bại");
      if (err.response?.status === 400) {
        setOtpError(msg); // OTP sai: cho nhập lại
      } else {
        setOtpOpen(false); // hết hạn, thiếu tiền, học phí đã được đóng...
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
      setOtpError(errMsg(err, "Không gửi lại được OTP"));
    } finally {
      setSubmitting(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

    return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-12 col-md-9 col-lg-7">
          {/* Header */}
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h4 className="fw-bold text-primary mb-0">Thanh toán học phí</h4>
              <span className="text-muted small">iBanking</span>
            </div>
            <div className="text-end">
              <div className="small fw-semibold">{me?.full_name}</div>
              <div className="mt-1">
                <Link className="btn btn-sm btn-outline-primary me-2" to="/history">
                  Lịch sử giao dịch
                </Link>
                <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>

          {/* Kết quả giao dịch */}
          {result && (
            <div className={`card shadow-sm border-0 mb-4 ${result.ok ? "border-success" : ""}`}>
              <div className="card-body p-4 text-center">
                <h5 className={result.ok ? "text-success fw-bold" : "text-danger fw-bold"}>
                  {result.ok ? "✔ " : "✖ "}
                  {result.message}
                </h5>
                {result.txId != null && (
                  <p className="mb-1 text-muted">Mã giao dịch: #{result.txId}</p>
                )}
                {result.ok && result.amount != null && (
                  <p className="mb-1">
                    Đã thanh toán <strong>{money(result.amount)}</strong> cho MSSV{" "}
                    <strong>{result.mssv}</strong>
                  </p>
                )}
                {me && <p className="mb-3">Số dư hiện tại: <strong>{money(me.balance)}</strong></p>}
                {result.ok && <p className="small text-muted">Email xác nhận đã được gửi.</p>}
                <button
                  className="btn btn-primary"
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

          {/* a. Người nộp tiền (chỉ đọc) */}
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white fw-bold text-secondary text-uppercase small">
              Người nộp tiền
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small text-muted mb-1">Họ và tên</label>
                  <input className="form-control bg-light" value={me?.full_name ?? ""} readOnly />
                </div>
                <div className="col-md-6">
                  <label className="form-label small text-muted mb-1">Số điện thoại</label>
                  <input className="form-control bg-light" value={me?.phone ?? ""} readOnly />
                </div>
                <div className="col-md-6">
                  <label className="form-label small text-muted mb-1">Email</label>
                  <input className="form-control bg-light" value={me?.email ?? ""} readOnly />
                </div>
              </div>
            </div>
          </div>

          {/* b. Tra cứu học phí */}
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white fw-bold text-secondary text-uppercase small">
              Thông tin học phí
            </div>
            <div className="card-body">
              <label htmlFor="mssvInput" className="form-label fw-semibold">
                Mã số sinh viên
              </label>
              <div className="input-group">
                <input
                  id="mssvInput"
                  className="form-control"
                  placeholder="Nhập MSSV (VD: 524H0028)"
                  value={mssvInput}
                  onChange={(e) => setMssvInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  className="btn btn-primary px-4 fw-semibold"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? "Đang tra cứu..." : "Tra cứu"}
                </button>
              </div>

              {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

              {data && (
                <div className="mt-4">
                  <div className="row mb-2">
                    <div className="col-5 text-muted">Họ và tên SV:</div>
                    <div className="col-7 fw-semibold">{data.full_name}</div>
                  </div>
                  <div className="row mb-2">
                    <div className="col-5 text-muted">MSSV:</div>
                    <div className="col-7 fw-semibold">{data.mssv}</div>
                  </div>
                  {data.tuition_id == null ? (
                    <div className="alert alert-info mt-3 mb-0">
                      Sinh viên này chưa có khoản học phí.
                    </div>
                  ) : (
                    <>
                      <div className="row mb-2 align-items-center">
                        <div className="col-5 text-muted">Số tiền cần đóng:</div>
                        <div className="col-7 fs-5 fw-bold text-danger">{money(data.amount)}</div>
                      </div>
                      <div className="row">
                        <div className="col-5 text-muted">Trạng thái:</div>
                        <div className="col-7">
                          {data.status === "PAID" ? (
                            <span className="badge bg-success">Đã thanh toán</span>
                          ) : (
                            <span className="badge bg-warning text-dark">Chưa thanh toán</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* c. Thông tin thanh toán */}
          {data && data.tuition_id != null && data.status === "PENDING" && (
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white fw-bold text-secondary text-uppercase small">
                Thông tin thanh toán
              </div>
              <div className="card-body">
                <div className="row mb-2">
                  <div className="col-5 text-muted">Số dư khả dụng:</div>
                  <div className="col-7 fw-semibold">{me ? money(me.balance) : "..."}</div>
                </div>
                <div className="row mb-3">
                  <div className="col-5 text-muted">Số tiền cần thanh toán:</div>
                  <div className="col-7 fw-semibold text-danger">{money(data.amount)}</div>
                </div>

                {me && me.balance < data.amount && (
                  <div className="alert alert-warning py-2">
                    Số dư không đủ để thanh toán khoản học phí này.
                  </div>
                )}

                <div className="form-check mb-3">
                  <input
                    id="terms"
                    type="checkbox"
                    className="form-check-input"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <label htmlFor="terms" className="form-check-label small">
                    Tôi đồng ý với các điều khoản và điều kiện của hệ thống, và xác nhận thanh toán
                    toàn bộ khoản học phí trên.
                  </label>
                </div>

                {formError && <div className="alert alert-danger py-2">{formError}</div>}

                <button
                  className="btn btn-success w-100 py-2 fw-semibold"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                >
                  {submitting ? "Đang xử lý..." : "Xác nhận giao dịch"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal nhập OTP */}
      {otpOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Xác thực giao dịch bằng OTP</h5>
                </div>
                <div className="modal-body">
                  <p className="text-muted small">
                    Mã OTP gồm 6 chữ số đã được gửi tới email <strong>{me?.email}</strong>.
                  </p>
                  <input
                    className="form-control form-control-lg text-center"
                    style={{ letterSpacing: "0.5em" }}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="------"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) =>
                      e.key === "Enter" && otp.length === 6 && secondsLeft > 0 && handleVerify()
                    }
                    autoFocus
                  />
                  <div className="text-center mt-2">
                    {secondsLeft > 0 ? (
                      <span className="text-muted small">
                        OTP hết hạn sau{" "}
                        <strong className="text-danger">
                          {mm}:{ss}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-danger small fw-semibold">
                        OTP đã hết hạn, vui lòng gửi lại mã.
                      </span>
                    )}
                  </div>
                  {otpError && <div className="alert alert-danger py-2 mt-3 mb-0">{otpError}</div>}
                </div>
                <div className="modal-footer">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setOtpOpen(false)}
                    disabled={submitting}
                  >
                    Hủy
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    onClick={handleResend}
                    disabled={submitting}
                  >
                    Gửi lại OTP
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleVerify}
                    disabled={submitting || otp.length !== 6 || secondsLeft === 0}
                  >
                    {submitting ? "Đang xử lý..." : "Xác nhận"}
                  </button>
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