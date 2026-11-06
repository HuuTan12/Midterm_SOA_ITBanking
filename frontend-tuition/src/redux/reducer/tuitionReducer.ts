import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from "@reduxjs/toolkit";
import type { TuitionData, TuitionState } from '../../Types/index.ts';
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
  },
});

export default tuitionSlice.reducer;