// File: src/page/TuitionPage.tsx
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { fetchTuition, processPayment } from '../redux/reducer/tuitionReducer';

const TuitionPage: React.FC = () => {
  // Biến lưu trữ MSSV người dùng nhập vào
  const [mssvInput, setMssvInput] = useState('');
  
  // Lấy các công cụ và dữ liệu từ Redux Store
  const dispatch = useDispatch<AppDispatch>();
  const { data, loading, error } = useSelector((state: RootState) => state.tuition);

  // Xử lý khi bấm nút "Tra cứu"
  const handleSearch = () => {
    if (mssvInput.trim() !== '') {
      dispatch(fetchTuition(mssvInput.trim()));
    }
  };

  // Xử lý khi bấm nút "Xác nhận thanh toán"
  const handlePayment = () => {
    if (data && data.status === 'PENDING') {
      const isConfirm = window.confirm(`Bạn có chắc muốn thanh toán ${data.amount.toLocaleString('vi-VN')} đ?`);
      if (isConfirm) {
        dispatch(processPayment({ mssv: data.mssv, version: data.version }));
      }
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-8 col-lg-6">
          
          {/* Header */}
          <div className="text-center mb-4">
            <h3 className="fw-bold text-primary">Tra Cứu Học Phí</h3>
            <p className="text-muted small">Cổng thông tin tra cứu và thanh toán học phí sinh viên</p>
          </div>

          {/* Form Tra cứu */}
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-body p-4">
              <label htmlFor="mssvInput" className="form-label fw-semibold">
                Mã số sinh viên
              </label>
              <div className="input-group">
                <input
                  type="text"
                  id="mssvInput"
                  className="form-control"
                  placeholder="Nhập MSSV (VD: 524H0028)"
                  value={mssvInput}
                  onChange={(e) => setMssvInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button 
                  className="btn btn-primary px-4 fw-semibold" 
                  type="button"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? 'Đang xử lý...' : 'Tra cứu'}
                </button>
              </div>
            </div>
          </div>

          {/* Khối hiển thị Lỗi (nếu nhập sai MSSV hoặc server chết) */}
          {error && (
            <div className="alert alert-danger shadow-sm border-0 mb-4">
              <strong>Thất bại:</strong> {error}
            </div>
          )}

          {/* Khối hiển thị Kết quả Hóa đơn (Chỉ hiện ra khi API trả về data) */}
          {data && (
            <div className="card shadow-sm border-0">
              <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                <span className="fw-bold text-secondary text-uppercase small">Thông tin hóa đơn</span>
                {data.status === 'PAID' ? (
                  <span className="badge bg-success px-3 py-2 rounded-pill">Đã thanh toán</span>
                ) : (
                  <span className="badge bg-warning text-dark px-3 py-2 rounded-pill">Chưa thanh toán</span>
                )}
              </div>

              <div className="card-body p-4">
                <div className="row mb-3">
                  <div className="col-5 text-muted">Mã số sinh viên:</div>
                  <div className="col-7 fw-semibold">{data.mssv}</div>
                </div>

                <div className="row mb-3">
                  <div className="col-5 text-muted">Họ và tên:</div>
                  <div className="col-7 fw-semibold">{data.full_name}</div>
                </div>

                <div className="row mb-3">
                  <div className="col-5 text-muted">Mã hóa đơn:</div>
                  <div className="col-7">#{data.tuition_id}</div>
                </div>

                <hr className="text-muted my-3" />

                <div className="row align-items-center">
                  <div className="col-5 text-muted">Số tiền cần đóng:</div>
                  <div className="col-7">
                    <span className="fs-4 fw-bold text-danger">
                      {data.amount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              </div>

              {/* Nút thanh toán (Ẩn đi nếu sinh viên đã đóng tiền rồi) */}
              {data.status === 'PENDING' && (
                <div className="card-footer bg-light p-3 border-0">
                  <button 
                    className="btn btn-success w-100 py-2 fw-semibold"
                    onClick={handlePayment}
                    disabled={loading}
                  >
                    {loading ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default TuitionPage;