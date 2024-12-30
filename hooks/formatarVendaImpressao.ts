import { VendaDatabase } from "@/database/useVendaDatabse";

export interface Produto {
    nome: string;
    quantidade: number;
    preco: number;
  }
  
  export function formatarVendaParaImpressao(venda: VendaDatabase, produtos: Produto[]): string {
    let printContent = `
      \u001b!\u0030\u001bE\u0001TOZZO BURGER\u001bE\u0001\u001b!\u0000
      \n------------- Informações da Venda -------------\n
      Número da Venda: #${venda.id}
      Cliente: ${venda.cliente}
      Data: ${new Date(venda.horario).toLocaleDateString()} às ${new Date(venda.horario).toLocaleTimeString()}
      \n---------------- Itens da Venda ----------------\n\n`;
  
    produtos.forEach((produto) => {
      const nomeProduto = produto.nome.length > 30
        ? produto.nome.slice(0, 27) + "..." // Trunca e adiciona "..."
        : produto.nome;
  
      const valorTotal = `R$ ${(produto.quantidade * produto.preco).toFixed(2)}`;
      const numPontosLinha = 48 - (nomeProduto.length + valorTotal.length + 8); // 7 é para quantidade e espaços
      const pontos = ".".repeat(numPontosLinha > 0 ? numPontosLinha : 0);
  
      printContent += `\x1bE1( ${produto.quantidade} x ) ${nomeProduto.toUpperCase()}${pontos}${valorTotal}\x1bE0\n`; // Negrito no nome do produto e valor total
      printContent += produto.quantidade > 1
        ? `    \x1bE1Preço Unitário: R$ ${produto.preco.toFixed(2)}\x1bE0\n\n` // Negrito no preço unitário
        : '\n';
    });
  
    // Total alinhado
    printContent += `\n---------------- Final da Conta ----------------\n`
    printContent += `\n\u001b!\u0030\u001bE\u0001TOTAL: R$ ${venda.total.toFixed(2)}\u001bE\u0001\u001b!\u0000\n\n\n\n\n\n`;
  
    return printContent;
  }
  