export type VendaDatabase = {
    id: string;
    total: number;
    horario: string;
    cliente?: string | null;
    excluida: boolean;
    updated_at: number;
    deleted_at?: number | null;
    sync_status?: string | null;
    criado_por?: string | null;
    criado_por_nome?: string | null;
};

export type VendaProduto = {
    id?: number;
    vendaId: string;
    produtoId: string;
    quantidade: number;
};