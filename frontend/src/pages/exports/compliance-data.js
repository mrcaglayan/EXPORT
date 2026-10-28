import {apiClient} from '@/api/client'
export const transactionTypes=['STANDARD_EXPORT','FREE_OF_CHARGE','TEMPORARY_EXPORT','RETURN_EXPORT']
export async function loadAll(base,path,signal){const rows=[];let total=1;for(let offset=0;offset<total;offset+=100){const {data}=await apiClient.get(`${base}/${path}`,{params:{limit:100,offset},signal});total=data.total;rows.push(...data.items)}return rows}
