//typescript định dạng dữ liệu api trả về nếu không khớp
//File này sẽ giúp code tự động nhắc lệnh và bắt lỗi nếu dữ liệu API trả về không khớp.
export interface TuitionData {
    mssv: string;
    full_name:string;
    tuition_id:number;
    amount:number;
    status:string;
    version:number;
}

export interface TuitionState {
    data: TuitionData | null;
    loading: boolean;
    error: string | null
}