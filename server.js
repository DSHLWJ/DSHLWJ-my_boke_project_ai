const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

const app = express();
const port = 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());
// 增大请求体限制
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// 默认代理设置
const proxy = 'http://127.0.0.1:7897';
const httpsAgent = new HttpsProxyAgent(proxy);

// ✅ 统一文章生成函数
async function generateArticle(prompt, model, provider = 'chatgpt', useProxy = false) {
  let url = '';
  let apiKey = '';
  let headers = {};
  let payload = {};

  const TIMEOUT_MS = 120000; // 2分钟

  if (provider === 'chatgpt') {
    url = 'https://api.openai.com/v1/chat/completions';
    apiKey = process.env.OPENAI_API_KEY;
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    payload = {
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 6000,
    };
  } else if (provider === 'doubao') {
    url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    apiKey = process.env.DOUBAO_API_KEY;
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    payload = {
      model: model,
      messages: [
        { role: 'user', content: prompt },
      ],
      max_tokens: 6000,
    };
  } else {
    throw new Error(`未知的 provider: ${provider}`);
  }

  function withTimeout(promise, timeout) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), timeout))
  ]);
}

  const axiosConfig = { headers };
  if (useProxy) axiosConfig.httpsAgent = httpsAgent;

  // const response = await axios.post(url, payload, axiosConfig);
  const response = await withTimeout(axios.post(url, payload, axiosConfig), TIMEOUT_MS);

  // ✅ ChatGPT 与豆包返回字段不同，统一处理
  if (provider === 'chatgpt') {
    return response.data.choices[0].message.content;
  } else if (provider === 'doubao') {
    return response.data.choices?.[0]?.message?.content || ''; // 豆包返回的 choices 可能是空数组
  }
}

// 保存文章为 markdown
function saveArticleToMarkdown(content, title, category = '') {

  // 从 .env 文件中获取保存路径，默认为项目内的默认路径
  // const savePath = process.env.ARTICLE_SAVE_PATH || path.join(__dirname, 'content', 'posts', category);
  const dirPath = path.join(__dirname, '..','boke_web_UI','content', 'post',category);
  // 创建目录（如果不存在的话）
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const fileName = `${Date.now()}-${title.replace(/\s+/g, '-')}.md`;
  const filePath = path.join(dirPath, fileName);

// 这里的格式很重要
const md = `---
title: "${title}"
date: ${new Date().toISOString()}
description: "${category}"
tags:
  - "${category}"
---

${content}
`;

  fs.writeFileSync(filePath, md, 'utf8');
}


// 路由：生成文章
app.post('/generate-article', async (req, res) => {
  const { prompt, title, category, model, provider, useProxy } = req.body;
  if (!prompt || !title) {
    return res.status(400).json({ message: '请提供 prompt 和 title' });
  }
  try {
    const article = await generateArticle(prompt, model, provider, useProxy);
    saveArticleToMarkdown(article, title, category);
    res.status(200).json({ message: '文章生成成功', provider });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ message: '生成文章失败，请检查 API Key 或代理设置。' });
  }
});

// ✨ 获取分类
app.get('/categories', (req, res) => {
  const baseDir = path.join(__dirname, '..','boke_web_UI','content', 'post');
  // const savePath = process.env.ARTICLE_SAVE_PATH || path.join(__dirname, 'content', 'posts', category);

  try {
    if (!fs.existsSync(baseDir)) {
      return res.status(200).json([]);
    }

    const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    res.status(200).json(dirs);
  } catch (err) {
    console.error('读取分类失败:', err);
    res.status(500).json({ message: '读取分类失败' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
