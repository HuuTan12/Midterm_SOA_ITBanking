import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type {PayloadAction} from "@reduxjs/toolkit"
import type  { TuitionData,TuitionState} from '../../Types/index.ts';
import { tuitionServices } from '../../services/tuitionServices';

// Hành động: Tra cứu
export const fetchTuition = createAsyncThunk(
  'tuition/fetchTuition',
  async (mssv: string, { rejectWithValue }) => {
    try {
      const response = await tuitionServices.getTuitionDataByMSSV(mssv);
      return response.data as TuitionData;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Lỗi kết nối Server');
    }
  }
);

// Hành động: Thanh toán
export const processPayment = createAsyncThunk(
  'tuition/processPayment',
  async (payload: { mssv: string; version: number }, { rejectWithValue, dispatch }) => {
    try {
      const response = await tuitionServices.payTuition(payload);
      // Thanh toán xong thì tự động tra cứu lại để cập nhật trạng thái PAID
      dispatch(fetchTuition(payload.mssv)); 
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Thanh toán thất bại');
    }
  }
);

const initialState: TuitionState = {
  data: null,
  loading: false,
  error: null,
};

const tuitionSlice = createSlice({
  name: 'tuitionReducer',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    // Xử lý khi tra cứu
    builder.addCase(fetchTuition.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchTuition.fulfilled, (state, action: PayloadAction<TuitionData>) => {
      state.loading = false;
      state.data = action.payload;
    });
    builder.addCase(fetchTuition.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Xử lý khi thanh toán
    builder.addCase(processPayment.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(processPayment.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
  },
});


export default tuitionSlice.reducer;