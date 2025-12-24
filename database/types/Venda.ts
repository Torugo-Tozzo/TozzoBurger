export type VendaDatabase = {
    id: string;
    total: number;
    horario: string;
    cliente?: string | null;
    excluida: boolean;
    updated_at: number;
    deleted_at?: number | null;
};

export type VendaProduto = {
    id?: number;
    vendaId: string;
    produtoId: string;
    quantidade: number;
};