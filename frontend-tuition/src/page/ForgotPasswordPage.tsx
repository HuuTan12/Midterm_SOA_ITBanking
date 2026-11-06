import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authServices } from "../services/authServices.ts";

const OTP_SECONDS = 300;
const RESEND_SECONDS = 60;

const errMsg = (err: any, fallback: string) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expiresLeft, setExpiresLeft] = useState(0);
  const [resendLeft, setResendLeft] = useState(0);

  // Đếm ngược hạn OTP và thời gian chờ gửi lại (chỉ chạy ở bước 2)
  useEffect(() => {
    if (step !== 2) return undefined;
    const id = setInterval(() => {
      setExpiresLeft((s) => Math.max(0, s - 1));
      setResendLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // Bước 1 (và gửi lại ở bước 2): yêu cầu gửi OTP về email
  const sendOtp = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await authServices.forgotPassword(email.trim());
      setExpiresLeft(res.data.expires_in_seconds ?? OTP_SECONDS);
      setResendLeft(RESEND_SECONDS);
      setOtp("");
      setStep(2);
      setInfo("Nếu email tồn tại trong hệ thống, mã OTP đã được gửi. Vui lòng kiểm tra hộp thư.");
    } catch (err: any) {
      setError(errMsg(err, "Không kết nối được server"));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) sendOtp();
  };

  // Bước 2: xác thực OTP
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await authServices.verifyResetOtp(email.trim(), otp);
      setResetToken(res.data.reset_token);
      setStep(3);
    } catch (err: any) {
      setError(errMsg(err, "Xác thực OTP thất bại"));
    } finally {
      setLoading(false);
    }
  };

  // Bước 3: đặt mật khẩu mới
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (newPassword !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setLoading(true);
    try {
      await authServices.resetPassword(resetToken, newPassword);
      navigate("/login", {
        replace: true,
        state: { notice: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới." },
      });
    } catch (err: any) {
      setError(errMsg(err, "Đặt lại mật khẩu thất bại"));
    } finally {
      setLoading(false);
    }
  };

  const mm = String(Math.floor(expiresLeft / 60)).padStart(2, "0");
  const ss = String(expiresLeft % 60).padStart(2, "0");

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-6 col-lg-4">
          <h3 className="fw-bold text-primary text-center mb-1">iBanking</h3>
          <p className="text-center text-muted mb-4">Quên mật khẩu (bước {step}/3)</p>

          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              {/* BƯỚC 1: nhập email */}
              {step === 1 && (
                <form onSubmit={handleEmailSubmit}>
                  <p className="text-muted small">
                    Nhập email của tài khoản, hệ thống sẽ gửi mã OTP để bạn đặt lại mật khẩu.
                  </p>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="email@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <button
                    className="btn btn-primary w-100 fw-semibold"
                    type="submit"
                    disabled={loading || !email.trim()}
                  >
                    {loading ? "Đang gửi..." : "Gửi mã OTP"}
                  </button>
                </form>
              )}

              {/* BƯỚC 2: nhập OTP */}
              {step === 2 && (
                <form onSubmit={handleVerify}>
                  {info && <div className="alert alert-info py-2 small">{info}</div>}
                  <div className="mb-2">
                    <label className="form-label fw-semibold">Mã OTP (6 chữ số)</label>
                    <input
                      className="form-control form-control-lg text-center"
                      style={{ letterSpacing: "0.5em" }}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="------"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      autoFocus
                    />
                  </div>
                  <div className="text-center mb-3">
                    {expiresLeft > 0 ? (
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
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <button
                    className="btn btn-primary w-100 fw-semibold mb-2"
                    type="submit"
                    disabled={loading || otp.length !== 6 || expiresLeft === 0}
                  >
                    {loading ? "Đang xác thực..." : "Xác thực OTP"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary w-100"
                    onClick={sendOtp}
                    disabled={loading || resendLeft > 0}
                  >
                    {resendLeft > 0 ? `Gửi lại OTP (${resendLeft}s)` : "Gửi lại OTP"}
                  </button>
                </form>
              )}

              {/* BƯỚC 3: mật khẩu mới */}
              {step === 3 && (
                <form onSubmit={handleReset}>
                  <div className="alert alert-success py-2 small">
                    Xác thực thành công. Hãy đặt mật khẩu mới.
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Mật khẩu mới</label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoFocus
                    />
                    <div className="form-text">Tối thiểu 6 ký tự.</div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Nhập lại mật khẩu mới</label>
                    <input
                      type="password"
                      className="form-control"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <button
                    className="btn btn-primary w-100 fw-semibold"
                    type="submit"
                    disabled={loading || !newPassword || !confirm}
                  >
                    {loading ? "Đang lưu..." : "Đặt lại mật khẩu"}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="text-center mt-3">
            <Link to="/login" className="small">
              ← Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;