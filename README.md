---

# 🍔 Tozzo Burger – App de Gestão de Vendas/Pedidos

Este é um aplicativo desenvolvido para a lanchonete **Tozzo Burger**, feito em **React Native** utilizando **Expo**, com o objetivo de gerenciar vendas e pedidos, com **foco principal na impressão de pedidos** diretamente na cozinha.

O projeto nasceu da necessidade do meu pai de ter um app simples e funcional para o controle dos pedidos da lanchonete. Além disso, o repositório está público para fins acadêmicos, servindo como comprovação do meu estágio não obrigatório.

---

## 🚀 Tecnologias utilizadas

* **React Native** com **Expo**
* **expo-sqlite** (banco de dados local)
* **Biblioteca Bluetooth** para comunicação e impressão de pedidos (necessita rodar fora do ambiente Expo Go)

---

## 🛠️ Pré-requisitos

Antes de rodar o projeto, é necessário ter:

* **Node.js** (versão LTS recomendada)
* **npm** (instalado junto com o Node.js)
* **Expo CLI** (instalado globalmente)
* **Android Studio** (para emulador ou um dispositivo físico Android com modo desenvolvedor)

---

## 📦 Instalação e execução

1. **Clonar o repositório**:

```bash
git clone https://github.com/seu-usuario/tozzo-burger.git
cd tozzo-burger
```

2. **Instalar as dependências**:

```bash
(delete a pasta android)
npm install
```

3. **Rodar o aplicativo** (necessário rodar via `npx expo run:android` por causa das libs nativas – **não funciona no Expo Go**):

```bash
npx expo run:android
```

> **Importante:** Como o app usa bibliotecas que rodam fora do ambiente Expo Go (ex.: Bluetooth para impressão), é obrigatório gerar a versão compilada do aplicativo. O simples `npx expo start` não será suficiente.

---

## 🗄️ Banco de Dados

* O aplicativo utiliza **expo-sqlite** para armazenamento local.
* Na primeira execução, as tabelas são criadas automaticamente, não sendo necessário nenhum script manual.

---

## 📃 Objetivo do Projeto

O **Tozzo Burger** foi desenvolvido para:

* Cadastrar e gerenciar pedidos da lanchonete
* Imprimir pedidos via conexão Bluetooth
* Melhorar a organização e agilidade no atendimento

---

## 📌 Observações

* O projeto está **público** apenas para fins de visualização e comprovação acadêmica.
* Dados sensíveis não devem ser inseridos neste repositório.

---

## 🧑‍💻 Autor

Desenvolvido por **Victor Hugo Tozzo Filho**
---
