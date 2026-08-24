export type Sale = {
    id: string;
    total: number;
    soldAt: string;
    customerName?: string | null;
    isCancelled: boolean;
    updated_at: number;
    deleted_at?: number | null;
    sync_status?: string | null;
    createdBy?: string | null;
    createdByName?: string | null;
};

export type SaleItem = {
    id?: string;
    saleId: string;
    productId: string;
    quantity: number;
};
