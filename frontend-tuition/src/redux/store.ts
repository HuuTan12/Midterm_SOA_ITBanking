import { configureStore } from '@reduxjs/toolkit';
import tuitionReducer from './reducer/tuitionReducer';

export const store = configureStore({
  reducer: {
    tuition: tuitionReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;