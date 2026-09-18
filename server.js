// RESOLVE.AO — servidor local do sistema de tickets
// Node.js + Express, armazenamento em ficheiro JSON (sem dependências externas de base de dados).
// Para produção a sério, troque o "store" por uma base de dados real (ver README.md).

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || "244931719199"; // formato wa.me, sem "+"
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ---------------- saúde da aplicação (Railway) ---------------- */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "resolve-ao-tickets" });
});

/* ---------------- armazenamento simples em ficheiro ---------------- */
function loadTickets() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Erro a ler tickets.json:", e);
    return [];
  }
}

function saveTickets(tickets) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2), "utf-8");
}

let tickets = loadTickets();

/* ---------------- clientes SSE (atualizações em tempo real) ---------------- */
let sseClients = [];

function broadcastTickets() {
  const payload = `event: tickets\ndata: ${JSON.stringify(tickets)}\n\n`;
  sseClients.forEach((res) => res.write(payload));
}

app.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(`event: tickets\ndata: ${JSON.stringify(tickets)}\n\n`);
  sseClients.push(res);
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

/* ---------------- configuração pública (telefone do negócio, etc.) ---------------- */
app.get("/api/config", (req, res) => {
  res.json({ businessPhone: BUSINESS_PHONE });
});

/* ---------------- API de tickets ---------------- */
app.get("/api/tickets", (req, res) => {
  res.json(tickets);
});

app.post("/api/tickets", (req, res) => {
  const body = req.body || {};
  const ticketId = "RSL-" + String(Math.floor(100000 + Math.random() * 899999));
  const ticket = {
    id: crypto.randomUUID(),
    ticketId,
    status: "novo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: "",
    categoria: body.categoria || "",
    categoriaKey: body.categoriaKey || "",
    servico: body.servico || "",
    descricao: body.descricao || "",
    nome: body.nome || "",
    telefone: body.telefone || "",
    localizacao: body.localizacao || "",
    urgencia: body.urgencia || "Sem pressa",
    dataPreferida: body.dataPreferida || "",
    horaPreferida: body.horaPreferida || "",
    tecnicoNome: "",
    tecnicoAvaliacao: "",
    dataConfirmada: "",
    horaConfirmada: "",
    valorEstimado: "",
    notas: "",
  };
  tickets.unshift(ticket);
  saveTickets(tickets);
  broadcastTickets();
  res.status(201).json(ticket);
});

const CLOSED_STATUSES = ["concluido", "cancelado"];

app.patch("/api/tickets/:id", (req, res) => {
  const { id } = req.params;
  const idx = tickets.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Ticket não encontrado" });

  const before = tickets[idx];
  const patch = { ...req.body, updatedAt: new Date().toISOString() };

  // Regista quando o ticket entrou num estado final (para o relatório mensal),
  // e limpa essa marca se o ticket for reaberto.
  if (patch.status && CLOSED_STATUSES.includes(patch.status) && !CLOSED_STATUSES.includes(before.status)) {
    patch.closedAt = new Date().toISOString();
  } else if (patch.status && !CLOSED_STATUSES.includes(patch.status) && CLOSED_STATUSES.includes(before.status)) {
    patch.closedAt = "";
  }

  tickets[idx] = { ...before, ...patch };
  saveTickets(tickets);
  broadcastTickets();
  res.json(tickets[idx]);
});

/* ---------------- relatório mensal ---------------- */
function computeReport(year, month) {
  // month: 1-12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // primeiro dia do mês seguinte

  const inMonth = (isoStr) => {
    if (!isoStr) return false;
    const d = new Date(isoStr);
    return d >= start && d < end;
  };

  const abertosNoMes = tickets.filter((t) => inMonth(t.createdAt));
  const fechadosNoMes = tickets.filter((t) => inMonth(t.closedAt));
  const resolvidosNoMes = fechadosNoMes.filter((t) => t.status === "concluido");
  const naoAceitesNoMes = fechadosNoMes.filter((t) => t.status === "cancelado");

  const porCategoria = {};
  abertosNoMes.forEach((t) => {
    const cat = t.categoria || "Sem categoria";
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
  });

  return {
    ano: year,
    mes: month,
    abertos: abertosNoMes.length,
    fechados: fechadosNoMes.length,
    resolvidos: resolvidosNoMes.length,
    naoAceitesOuNaoResolvidos: naoAceitesNoMes.length,
    porCategoria,
    geradoEm: new Date().toISOString(),
  };
}

app.get("/api/report", (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  res.json(computeReport(year, month));
});

app.get("/api/report.csv", (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const r = computeReport(year, month);
  const lines = [
    "métrica,valor",
    `ano,${r.ano}`,
    `mes,${r.mes}`,
    `abertos,${r.abertos}`,
    `fechados,${r.fechados}`,
    `resolvidos,${r.resolvidos}`,
    `nao_aceites_ou_nao_resolvidos,${r.naoAceitesOuNaoResolvidos}`,
    "",
    "categoria,tickets_abertos",
    ...Object.entries(r.porCategoria).map(([cat, n]) => `${cat},${n}`),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="relatorio-resolve-ao-${r.ano}-${String(r.mes).padStart(2, "0")}.csv"`);
  res.send(lines.join("\n"));
});

app.listen(PORT, () => {
  console.log(`RESOLVE.AO a correr em http://localhost:${PORT}`);
});
