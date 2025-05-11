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
  const { litros, mililitros, timestamp, deviceId } = req.body;

  if (litros == null || mililitros == null || !timestamp || !deviceId) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const { error } = await supabase
    .from('leituras')
    .upsert([
      {
        device_id: deviceId,
        litros: litros,
        mililitros: mililitros,
        timestamp: new Date(Number(timestamp))
      }
    ], { onConflict: ['device_id'] });

  if (error) {
    console.error('Erro ao registrar/atualizar leitura:', error);
    return res.status(500).json({ error: 'Erro ao registrar/atualizar leitura' });
  }

  console.log('Leitura salva/atualizada');
  res.status(200).json({ message: 'Leitura registrada/atualizada' });
});

// Endpoint para limpar leituras antigas e manter só as últimas 20
app.post('/compactar', async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId é obrigatório' });
  }

  const { data: leituras, error: fetchError } = await supabase
    .from('leituras')
    .select('id')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .range(20, 100000);

  if (fetchError) {
    console.error('Erro ao buscar leituras para compactar:', fetchError);
    return res.status(500).json({ error: 'Erro ao buscar leituras' });
  }

  if (leituras.length > 0) {
    const idsParaExcluir = leituras.map(l => l.id);

    const { error: deleteError } = await supabase
      .from('leituras')
      .delete()
      .in('id', idsParaExcluir);

    if (deleteError) {
      console.error('Erro ao deletar leituras:', deleteError);
      return res.status(500).json({ error: 'Erro ao deletar leituras' });
    }

    console.log(`Leituras antigas removidas para o device ${deviceId}`);
    return res.status(200).json({ message: 'Leituras antigas removidas com sucesso' });
  } else {
    console.log(`Nada para remover para o device ${deviceId}`);
    return res.status(200).json({ message: 'Nenhuma leitura antiga para remover' });
  }
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
  const { deviceId, litrosTotal, data } = req.body;

  if (!deviceId || litrosTotal == null || !data) {
    return res.status(400).json({ error: 'deviceId, litrosTotal e data são obrigatórios' });
  }

  // Primeiro tenta fazer update
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
    // Já existe, faz update
    const { error: updateError } = await supabase
      .from('leituras_diarias')
      .update({ litros_total: litrosTotal })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Erro ao atualizar leitura diária:', updateError);
      return res.status(500).json({ error: 'Erro ao atualizar leitura diária' });
    }

    res.status(200).json({ message: 'Leitura diária atualizada' });
  } else {
    // Não existe, cria novo
    const { error: insertError } = await supabase
      .from('leituras_diarias')
      .insert([
        { device_id: deviceId, data: data, litros_total: litrosTotal }
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


module.exports = app;
module.exports.handler = serverless(app);
