require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Verifica se aplicativo está rodando no ar
app.get('/', (req, res) => {
  res.send('ok!');
});

// Endpoint para registrar leituras de fluxo
app.post('/fluxo', async (req, res) => {
  const { litros, mililitros, timestamp, deviceId } = req.body;

  if (litros == null || mililitros == null || !timestamp || !deviceId) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const { error } = await supabase
    .from('leituras')
    .insert([
      {
        device_id: deviceId,
        litros: litros,
        mililitros: mililitros,
        timestamp: new Date(Number(timestamp))
      }
    ]);

  if (error) {
    console.error('Erro ao inserir leitura:', error);
    return res.status(500).json({ error: 'Erro ao registrar leitura' });
  }

  console.log('Nova leitura salva');
  res.status(200).json({ message: 'Leitura registrada' });
});

// Endpoint para compactar leituras
app.post('/compactar', async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId é obrigatório' });
  }

  const { data, error } = await supabase
    .rpc('compactar_leituras', { p_device_id: deviceId });

  if (error) {
    console.error('Erro ao compactar leituras:', error);
    return res.status(500).json({ error: 'Erro ao compactar leituras' });
  }

  res.status(200).json({ message: 'Compactação realizada com sucesso' });
});

// Endpoint para buscar leituras recentes
app.get('/fluxo/recentes/:deviceId', async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId é obrigatório' });
  }

  const { data, error } = await supabase
    .from('leituras')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Erro ao buscar leituras:', error);
    return res.status(500).json({ error: 'Erro ao buscar leituras' });
  }

  res.json(data);
});

// Endpoint para buscar todas as leituras
app.get('/leituras', async (req, res) => {
  const { data, error } = await supabase
    .from('leituras')
    .select('*');

  if (error) {
    console.error('Erro ao buscar todas leituras:', error);
    return res.status(500).json({ error: 'Erro ao buscar leituras' });
  }

  res.json(data);
});

module.exports = app;
module.exports.handler = serverless(app);
