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

  // Bước 1: gửi OTP về email
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
      setInfo("Mã OTP đã được gửi về email. Vui lòng kiểm tra hộp thư.");
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
        <div className="col-12 col-sm-8 col-md-6 col-lg-5">
          <div className="text-center mb-4">
            <h4 className="fw-bold text-primary mb-1">Khôi phục mật khẩu</h4>
            <p className="text-muted small">Cấp lại mật khẩu qua mã xác thực OTP</p>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <div className="small text-muted mb-3 fw-semibold">
                Bước {step}/3: {step === 1 ? "Nhập email" : step === 2 ? "Xác thực OTP" : "Mật khẩu mới"}
              </div>

              {info && <div className="alert alert-info py-2 small">{info}</div>}
              {error && <div className="alert alert-danger py-2 small">{error}</div>}

              {/* Bước 1 */}
              {step === 1 && (
                <form onSubmit={handleEmailSubmit}>
                  <div className="mb-3">
                    <label className="form-label">Email tài khoản</label>
                    <input
                      type="email"
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tan@example.com"
                      autoFocus
                      required
                    />
                  </div>
                  <button
                    className="btn btn-primary w-100 py-2"
                    type="submit"
                    disabled={loading || !email.trim()}
                  >
                    {loading ? "Đang gửi..." : "Gửi mã OTP"}
                  </button>
                </form>
              )}

              {/* Bước 2 */}
              {step === 2 && (
                <form onSubmit={handleVerify}>
                  <p className="small text-muted mb-2">
                    Mã OTP đã gửi tới <strong>{email}</strong>
                  </p>
                  <div className="mb-3">
                    <input
                      className="form-control text-center otp-input-clean"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="------"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      autoFocus
                      required
                    />
                  </div>
                  <div className="small text-muted text-center mb-3">
                    {expiresLeft > 0 ? (
                      <span>Hết hạn sau: <strong className="text-danger">{mm}:{ss}</strong></span>
                    ) : (
                      <span className="text-danger">Mã OTP đã hết hạn</span>
                    )}
                  </div>
                  <button
                    className="btn btn-primary w-100 py-2 mb-2"
                    type="submit"
                    disabled={loading || otp.length !== 6 || expiresLeft === 0}
                  >
                    {loading ? "Đang xác thực..." : "Xác thực OTP"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-link btn-sm w-100 text-decoration-none"
                    onClick={sendOtp}
                    disabled={loading || resendLeft > 0}
                  >
                    {resendLeft > 0 ? `Gửi lại mã sau ${resendLeft}s` : "Gửi lại mã OTP"}
                  </button>
                </form>
              )}

              {/* Bước 3 */}
              {step === 3 && (
                <form onSubmit={handleReset}>
                  <div className="mb-3">
                    <label className="form-label">Mật khẩu mới</label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      className="form-control"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      required
                    />
                  </div>
                  <button
                    className="btn btn-success w-100 py-2"
                    type="submit"
                    disabled={loading || !newPassword || !confirm}
                  >
                    {loading ? "Đang cập nhật..." : "Đổi mật khẩu"}
                  </button>
                </form>
              )}

              <div className="text-center mt-3 pt-2 border-top">
                <Link to="/login" className="small text-decoration-none">
                  &larr; Quay lại đăng nhập
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
