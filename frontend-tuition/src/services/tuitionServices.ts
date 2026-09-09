import { httpClient } from "../util/Config.ts"

export const tuitionServices = {
    //hàm tra cứu học phí
    getTuitionDataByMSSV: (mssv: string) => {
        return httpClient.get(`/tuition/${mssv}`)
    },

    payTuition: (payload: {mssv:string;version:number}) => {
        return httpClient.post(`/tuition/pay`,payload)
    }
}