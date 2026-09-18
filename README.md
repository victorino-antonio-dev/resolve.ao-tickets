# RESOLVE.AO — Central de Pedidos

Ferramenta web com:
- **Pedido do cliente** — escolha de categoria/serviço, dados de contacto e handoff para WhatsApp com mensagem pré-preenchida.
- **Painel interno** — quadro de tickets (Novo → Em atendimento → Agendado → Concluído), atribuição de técnico, valor estimado e botão para enviar a confirmação ao cliente por WhatsApp.
- Atualização em tempo real entre janelas/dispositivos (Server-Sent Events).
- Sem dependências de base de dados externa — guarda os tickets num ficheiro JSON local ou num Volume persistente do Railway.

Aplicação Node.js/Express publicada em [resolve-ao-tickets-production.up.railway.app](https://resolve-ao-tickets-production.up.railway.app/).

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
| GET    | `/health`         | Verificação de saúde do serviço     |

## 3. Deploy no Railway

O projeto está ligado ao GitHub e preparado para deploy automático no Railway através de `railway.json`.

**Passo a passo:**
1. No Railway, selecione **New Project → Deploy from GitHub repo**.
2. Escolha `victorino-antonio-dev/resolve.ao-tickets` e mantenha `main` como branch de produção.
3. Em **Variables**, defina `BUSINESS_PHONE=244931719199`. A variável `PORT` é fornecida automaticamente pelo Railway.
4. Em **Settings → Networking**, mantenha o domínio público `resolve-ao-tickets-production.up.railway.app`.
5. Para não perder tickets em reinícios ou novos deploys, adicione um **Volume** ao serviço e monte-o em `/data`. O servidor deteta automaticamente `RAILWAY_VOLUME_MOUNT_PATH`.
6. Cada novo commit em `main` inicia um deploy automático. A rota `/health` é usada para confirmar que o serviço ficou pronto.

Sem Volume, o sistema continua funcional, mas o ficheiro de tickets fica no armazenamento efémero do contentor e pode ser perdido num redeploy.

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
- **PostgreSQL** (ex. via [Supabase](https://supabase.com) ou [Railway](https://railway.com)) — recomendado se vários membros da equipa forem usar o painel ao mesmo tempo.

A estrutura da API (`GET/POST/PATCH /api/tickets`) mantém-se igual — só a forma como os dados são guardados muda.

## 4. Ligação ao WhatsApp

Atualmente o botão "Continuar no WhatsApp" (lado do cliente) e "Enviar confirmação por WhatsApp" (lado da equipa) abrem uma conversa no WhatsApp com a mensagem já escrita — mas alguém tem de clicar em "Enviar". Isto **não é uma integração automática**.

Para automatizar por completo (o sistema a enviar mensagens sozinho, sem clique manual), o próximo passo seria integrar a [WhatsApp Business Platform (Cloud API) da Meta](https://developers.facebook.com/docs/whatsapp/cloud-api), que exige conta Business verificada e aprovação da Meta. Isso pode ser adicionado a este mesmo `server.js` mais tarde, mantendo a mesma interface.

## 5. Personalizar

- **Categorias e serviços**: edite o array `CATEGORIES` em `public/index.html`.
- **Cores e tipografia da marca**: variáveis CSS no topo de `public/index.html` (`:root { --laranja: ... }`), já alinhadas com o manifesto da marca RESOLVE.AO.
- **Número de WhatsApp**: variável `BUSINESS_PHONE` no `.env` local ou nas Variables do Railway.
