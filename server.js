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
const DATA_FILE = path.join(__dirname, "data", "tickets.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

app.patch("/api/tickets/:id", (req, res) => {
  const { id } = req.params;
  const idx = tickets.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Ticket não encontrado" });
  tickets[idx] = { ...tickets[idx], ...req.body };
  saveTickets(tickets);
  broadcastTickets();
  res.json(tickets[idx]);
});

app.listen(PORT, () => {
  console.log(`RESOLVE.AO a correr em http://localhost:${PORT}`);
});
