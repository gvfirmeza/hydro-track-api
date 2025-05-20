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

// Endpoint para registrar (ou atualizar) leituras de fluxo
app.post('/fluxo', async (req, res) => {
  const { litros, mililitros, deviceId } = req.body;

  if (litros == null || mililitros == null || !deviceId) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const timestamp = new Date();

  const { error } = await supabase
    .from('leituras')
    .upsert(
      [{
        device_id: deviceId,
        litros: litros,
        mililitros: mililitros,
        timestamp: timestamp,
      }],
      { onConflict: ['device_id'] }
    );

  if (error) {
    console.error('Erro ao registrar/atualizar leitura:', error);
    return res.status(500).json({ error: 'Erro ao registrar/atualizar leitura' });
  }

  console.log(`[${timestamp.toISOString()}] Leitura salva/atualizada para ${deviceId}`);
  res.status(200).json({ message: 'Leitura registrada/atualizada' });
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

// Endpoint para atualizar fluxo diário
app.post('/fluxo-diario', async (req, res) => {
  const { deviceId, litrosTotal, data, adminId } = req.body;

  if (!deviceId || litrosTotal == null || !data || !adminId) {
    return res.status(400).json({ error: 'deviceId, litrosTotal, data e adminId são obrigatórios' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('leituras_diarias')
    .select('id')
    .eq('device_id', deviceId)
    .eq('data', data)
    .maybeSingle();

  if (fetchError) {
    console.error('Erro ao buscar leitura diária:', fetchError);
    return res.status(500).json({ error: 'Erro ao buscar leitura diária' });
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('leituras_diarias')
      .update({ litros_total: litrosTotal, admin_id: adminId })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Erro ao atualizar leitura diária:', updateError);
      return res.status(500).json({ error: 'Erro ao atualizar leitura diária' });
    }

    res.status(200).json({ message: 'Leitura diária atualizada' });
  } else {
    const { error: insertError } = await supabase
      .from('leituras_diarias')
      .insert([
        { device_id: deviceId, data: data, litros_total: litrosTotal, admin_id: adminId }
      ]);

    if (insertError) {
      console.error('Erro ao inserir leitura diária:', insertError);
      return res.status(500).json({ error: 'Erro ao inserir leitura diária' });
    }

    res.status(201).json({ message: 'Leitura diária criada' });
  }
});

// Endpoint para buscar histórico diário
app.get('/leituras-diarias/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const dias = parseInt(req.query.dias);

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId é obrigatório' });
  }

  let query = supabase
    .from('leituras_diarias')
    .select('*')
    .eq('device_id', deviceId)
    .order('data', { ascending: false });

  if (!isNaN(dias)) {
    query = query.limit(dias);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar leituras diárias:', error);
    return res.status(500).json({ error: 'Erro ao buscar leituras diárias' });
  }

  const resultadoFinal = !isNaN(dias) ? data.reverse() : data;

  res.json(resultadoFinal);
});

// Endpoint para buscar leituras diárias por admin
app.get('/leituras-diarias/admin/:adminId', async (req, res) => {
  const { adminId } = req.params;
  const dias = parseInt(req.query.dias);

  if (!adminId) {
    return res.status(400).json({ error: 'adminId é obrigatório' });
  }

  let query = supabase
    .from('leituras_diarias')
    .select('*')
    .eq('admin_id', adminId)
    .order('data', { ascending: false });

  if (!isNaN(dias)) {
    query = query.limit(dias);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar leituras diárias por admin:', error);
    return res.status(500).json({ error: 'Erro ao buscar leituras diárias por admin' });
  }

  const resultadoFinal = !isNaN(dias) ? data.reverse() : data;

  res.json(resultadoFinal);
});


module.exports = app;
module.exports.handler = serverless(app);
