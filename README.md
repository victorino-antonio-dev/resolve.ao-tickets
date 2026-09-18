# RESOLVE.AO — Sistema de Tickets (versão local/self-hosted)

Ferramenta web com:
- **Pedido do cliente** — escolha de categoria/serviço, dados de contacto e handoff para WhatsApp com mensagem pré-preenchida.
- **Painel interno** — quadro de tickets (Novo → Em atendimento → Agendado → Concluído), atribuição de técnico, valor estimado e botão para enviar a confirmação ao cliente por WhatsApp.
- Atualização em tempo real entre janelas/dispositivos (Server-Sent Events).
- Sem dependências de base de dados externa — guarda os tickets num ficheiro `data/tickets.json` local, fácil de trocar por uma base de dados a sério mais tarde (ver secção "Evoluir para produção").

Esta é a versão independente da plataforma Claude — corre em qualquer servidor Node.js, incluindo o seu próprio computador.

## 1. Correr localmente (ambiente de testes)

Pré-requisitos: [Node.js](https://nodejs.org) 18 ou superior instalado.

```bash
cd resolve-ao-app
npm install
cp .env.example .env      # ajuste o número de WhatsApp em BUSINESS_PHONE se necessário
npm run dev
```

Abra **http://localhost:3000** no navegador. Abra duas janelas — uma com "Pedir serviço" e outra com "Painel de tickets" — para ver a atualização em tempo real quando cria ou edita um ticket.

Os dados ficam guardados em `data/tickets.json`. Para recomeçar do zero, apague esse ficheiro (o servidor volta a criá-lo vazio).

## 2. Estrutura do projeto

```
resolve-ao-app/
├── server.js          # servidor Express + API de tickets + SSE
├── package.json
├── .env.example        # copie para .env
├── data/
│   └── tickets.json    # criado automaticamente (não vai para o Git)
└── public/
    └── index.html       # frontend (marca RESOLVE.AO, formulário e painel)
```

API disponível:

| Método | Rota              | Descrição                          |
|--------|-------------------|-------------------------------------|
| GET    | `/api/config`     | Configuração pública (nº WhatsApp) |
| GET    | `/api/tickets`    | Lista todos os tickets              |
| POST   | `/api/tickets`    | Cria um novo ticket                 |
| PATCH  | `/api/tickets/:id`| Atualiza um ticket existente        |
| GET    | `/api/stream`     | Eventos em tempo real (SSE)         |

## 3. Hospedar no Render (recomendado)

Este projeto já vem pronto para o Render, com um ficheiro `render.yaml` incluído (Render "Blueprint").

**Passo a passo:**
1. Suba esta pasta para um repositório no GitHub (ver secção 4 abaixo se precisar de ajuda).
2. Em [dashboard.render.com](https://dashboard.render.com), clique em **New +** → **Web Service**.
3. Escolha **Build and deploy from a Git repository** e selecione o repositório.
4. O Render deteta o `render.yaml` automaticamente (ou configure à mão: Environment = Node, Build Command = `npm install`, Start Command = `npm start`).
5. Em **Environment**, confirme/ajuste a variável `BUSINESS_PHONE` (já vem pré-definida no `render.yaml`, mas pode editar no dashboard).
6. Clique em **Create Web Service**. Acompanhe os logs até aparecer `RESOLVE.AO a correr em http://localhost:...`.
7. O Render dá um URL público tipo `https://resolve-ao-tickets.onrender.com` — pronto a usar, já com HTTPS.

⚠️ **Sobre persistência de dados:** o plano gratuito do Render usa disco efémero — `data/tickets.json` pode perder-se em reinícios ou redeploys. Para produção a sério:
- Mude para um plano pago e ative um **disco persistente** (as linhas já preparadas, comentadas, estão no `render.yaml` — é só descomentar), ou
- Peça para adaptar o `server.js` a usar uma base de dados real (Render tem Postgres gratuito por 90 dias) — ver Opção C abaixo.

### Outras opções de hospedagem

### Opção B — VPS próprio (ex.: DigitalOcean, Contabo, Hetzner)
1. Instale Node.js no servidor.
2. Copie a pasta do projeto (ou faça `git clone`).
3. `npm install --production`
4. Use o [PM2](https://pm2.keymetrics.io/) para manter o servidor sempre ativo:
   ```bash
   npm install -g pm2
   pm2 start server.js --name resolve-ao
   pm2 save
   pm2 startup
   ```
5. Configure um domínio com Nginx como proxy reverso para a porta 3000, e ative HTTPS com [Certbot](https://certbot.eff.org/).

### Opção C — Evoluir para produção a sério
O ficheiro `data/tickets.json` é ótimo para testar, mas não é seguro para vários acessos simultâneos em produção nem sobrevive bem a certos tipos de hospedagem. Quando estiver pronto para lançar a sério, substitua as funções `loadTickets`/`saveTickets` em `server.js` por uma base de dados real — por exemplo:
- **SQLite** (`better-sqlite3`) — simples, ainda sem servidor de base de dados separado.
- **PostgreSQL** (ex. via [Supabase](https://supabase.com) ou [Railway](https://railway.app)) — recomendado se vários membros da equipa forem usar o painel ao mesmo tempo.

A estrutura da API (`GET/POST/PATCH /api/tickets`) mantém-se igual — só a forma como os dados são guardados muda.

## 4. Ligação ao WhatsApp

Atualmente o botão "Continuar no WhatsApp" (lado do cliente) e "Enviar confirmação por WhatsApp" (lado da equipa) abrem uma conversa no WhatsApp com a mensagem já escrita — mas alguém tem de clicar em "Enviar". Isto **não é uma integração automática**.

Para automatizar por completo (o sistema a enviar mensagens sozinho, sem clique manual), o próximo passo seria integrar a [WhatsApp Business Platform (Cloud API) da Meta](https://developers.facebook.com/docs/whatsapp/cloud-api), que exige conta Business verificada e aprovação da Meta. Isso pode ser adicionado a este mesmo `server.js` mais tarde, mantendo a mesma interface.

## 5. Personalizar

- **Categorias e serviços**: edite o array `CATEGORIES` em `public/index.html`.
- **Cores e tipografia da marca**: variáveis CSS no topo de `public/index.html` (`:root { --laranja: ... }`), já alinhadas com o manifesto da marca RESOLVE.AO.
- **Número de WhatsApp**: variável `BUSINESS_PHONE` no `.env`.
