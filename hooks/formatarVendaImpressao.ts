import { Sale } from "@/database/types/Sale";

export interface Produto {
  name: string;
  quantity: number;
  price: number;
}

function removerAcentos(texto: string | undefined | null): string {
  if (!texto) return "";
  return texto
    .normalize("NFD") // Separa o caractere base do acento (Ex: 'ç' vira 'c' + '¸')
    .replace(/[\u0300-\u036f]/g, "") // Remove os diacríticos (acentos)
    .replace(/[^\x00-\x7F]/g, ""); // Remove qualquer caractere não-ASCII restante por segurança
}

export function formatarVendaParaImpressao(venda: Sale, produtos: Produto[]): string {
  const clienteLimpo = removerAcentos(venda.customerName) || "Nao informado";
  let printContent = `
      \u001b!\u0030\u001bE\u0001TOZZO BURGER\u001bE\u0001\u001b!\u0000
      \n------------- Informacoes da Venda -------------\n
      Numero da Venda: #${venda.id}
      Cliente: ${clienteLimpo}
      Data: ${new Date(venda.soldAt).toLocaleDateString()} as ${new Date(venda.soldAt).toLocaleTimeString()}
      \n---------------- Itens da Venda ----------------\n\n`;

  produtos.forEach((produto) => {
    let nomeProdutoLimpo = removerAcentos(produto.name);

    nomeProdutoLimpo = nomeProdutoLimpo.length > 30
      ? nomeProdutoLimpo.slice(0, 27) + "..."
      : nomeProdutoLimpo;

    const valorTotal = `R$ ${(produto.quantity * produto.price).toFixed(2)}`;
    
    const numPontosLinha = 48 - (nomeProdutoLimpo.length + valorTotal.length + 8); 
    const pontos = ".".repeat(numPontosLinha > 0 ? numPontosLinha : 0);

    printContent += `\x1bE1( ${produto.quantity} x ) ${nomeProdutoLimpo.toUpperCase()}${pontos}${valorTotal}\x1bE0\n`;
    
    printContent += produto.quantity > 1
      ? `    \x1bE1Preco Unitario: R$ ${produto.price.toFixed(2)}\x1bE0\n\n`
      : '\n';
  });

  printContent += `\n---------------- Final da Conta ----------------\n`
  printContent += `\n\u001b!\u0030\u001bE\u0001TOTAL: R$ ${venda.total.toFixed(2)}\u001bE\u0001\u001b!\u0000\n\n\n\n\n\n`;

  return printContent;
}