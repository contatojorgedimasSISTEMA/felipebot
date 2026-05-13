const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'felipebot2024';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const historicos = {};

const SYSTEM_PROMPT = `Voce e o Felipe, assessor virtual da dupla sertaneja Jorge Dimas e Joao.
Voce fala de forma descontraida, calorosa e autentica, como um sertanejo de verdade.
Use expressoes regionais naturalmente: "uai", "so", "trem", "oce", "ce", "misericordia", "oxe", "claro claro", "com certeza so".

REGRAS:
1. Se a mensagem for spam, propaganda, link suspeito ou sem sentido responda apenas: "SPAM_IGNORAR"
2. Se a pessoa e FA responda com carinho, agradeca em nome da dupla, use expressoes sertanejas, pergunte de onde ela e.
3. Se a pessoa quer CONTRATAR um show informe que o contato e a Panka Hits Producoes: WhatsApp (12) 99713-7294 ou e-mail contatojdej@gmail.com.
4. Se a pessoa quer PEDIR MUSICA ou mandar um salve responda animado, diga que com certeza vao tocar, manda um abraco da dupla.
5. Qualquer outra mensagem geral responda de forma simpatica e sertaneja.

NUNCA se identifique como IA. Voce e o Felipe, da equipe da dupla.
Respostas curtas e naturais, no maximo 3-4 frases. Sem formalidade.`;

function isSpam(texto) {
  const p = [/http[s]?:\/\//i,/bit\.ly/i,/ganhe\s+dinheiro/i,/clique\s+aqui/i,/bitcoin/i,/investimento\s+garantido/i];
  return p.some((r) => r.test(texto));
}

async function gerarResposta(userId, mensagem) {
  if (isSpam(mensagem)) return null;
  if (!historicos[userId]) historicos[userId] = [];
  historicos[userId].push({ role: 'user', content: mensagem });
  if (historicos[userId].length > 10) historicos[userId] = historicos[userId].slice(-10);
  const r = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system: SYSTEM_PROMPT, messages: historicos[userId] });
  const texto = r.content[0].text.trim();
  if (texto === 'SPAM_IGNORAR') return null;
  historicos[userId].push({ role: 'assistant', content: texto });
  return texto;
}

async function enviarMensagem(recipientId, texto) {
  try {
    await axios.post('https://graph.facebook.com/v19.0/me/messages', { recipient: { id: recipientId }, message: { text: texto }, messaging_type: 'RESPONSE' }, { params: { access_token: PAGE_ACCESS_TOKEN } });
    console.log('[Felipe] DM enviada para ' + recipientId);
  } catch (err) { console.error('[Felipe] Erro DM:', err.response?.data || err.message); }
}

async function responderComentario(commentId, texto) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/${commentId}/replies`, { message: texto }, { params: { access_token: PAGE_ACCESS_TOKEN } });
    console.log('[Felipe] Comentario respondido: ' + commentId);
  } catch (err) { console.error('[Felipe] Erro comentario:', err.response?.data || err.message); }
}

app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'instagram') return;
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      if (!ev.message || ev.message.is_echo || !ev.message.text) continue;
      console.log('[Felipe] DM de ' + ev.sender.id + ': ' + ev.message.text);
      try { const r = await gerarResposta(ev.sender.id, ev.message.text); if (r) await enviarMensagem(ev.sender.id, r); } catch (e) { console.error(e.message); }
    }
    for (const ch of entry.changes || []) {
      if (ch.field !== 'comments' || !ch.value || ch.value.verb !== 'add') continue;
      const { id: cid, text: txt, from } = ch.value;
      if (!txt || !from?.id) continue;
      console.log('[Felipe] Comentario de ' + from.id + ': ' + txt);
      try { const r = await gerarResposta(from.id, txt); if (r) await responderComentario(cid, r); } catch (e) { console.error(e.message); }
    }
  }
});

app.get('/', (req, res) => res.json({ status: 'Felipe online', dupla: 'Jorge Dimas e Joao' }));

app.get('/privacidade', (req, res) => {
  res.send('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Politica de Privacidade - Jorge Dimas e Joao</title></head><body><h1>Politica de Privacidade</h1><p>Este aplicativo e utilizado pela equipe da dupla sertaneja Jorge Dimas e Joao para gerenciar mensagens no Instagram e WhatsApp.</p><h2>Dados coletados</h2><p>Coletamos apenas mensagens enviadas voluntariamente pelos usuarios, com o objetivo de responder duvidas sobre contratacao de shows.</p><h2>Uso dos dados</h2><p>Os dados sao utilizados exclusivamente para responder as mensagens. Nao compartilhamos informacoes com terceiros.</p><h2>Contato</h2><p>contatojdej@gmail.com | Panka Hits Producoes: (12) 99713-7294</p></body></html>');
});

app.listen(process.env.PORT || 3000, () => console.log('[Felipe] Bot online'));
