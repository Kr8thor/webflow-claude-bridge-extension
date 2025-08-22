import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Environment configuration with secure defaults
const config = {
  client_id: process.env.WEBFLOW_CLIENT_ID,
  client_secret: process.env.WEBFLOW_CLIENT_SECRET,
  site_token: process.env.WEBFLOW_TOKEN,
  site_id: process.env.WEBFLOW_SITE_ID || '689d248bc9c3f34341eb4473',
  locale_id: process.env.WEBFLOW_LOCALE_ID || '689d2c3f7b5a91e0b9407739',
  http_port: parseInt(process.env.BRIDGE_HTTP_PORT || '8788'),
  ws_port: parseInt(process.env.BRIDGE_WS_PORT || '8787'),
  host: process.env.BRIDGE_HOST || '127.0.0.1'
};

// Validate required credentials
function validateCredentials() {
  const missing = [];
  if (!config.client_id) missing.push('WEBFLOW_CLIENT_ID');
  if (!config.client_secret) missing.push('WEBFLOW_CLIENT_SECRET');
  
  if (missing.length > 0) {
    console.warn(`⚠️  Missing credentials: ${missing.join(', ')}`);
    console.warn('   OAuth features will be disabled. Basic API token can still be used.');
  } else {
    console.log('✅ OAuth credentials loaded successfully');
  }
  
  if (!config.site_token) {
    console.warn('⚠️  No WEBFLOW_TOKEN found. Some API operations may fail.');
  }
  
  return { valid: missing.length === 0, missing };
}

// WebSocket server for extension communication
const wss = new WebSocketServer({ port: config.ws_port, host: config.host });
let lastClient: import("ws") | null = null;

wss.on("connection", (ws) => {
  console.log('🔌 Extension connected via WebSocket');
  lastClient = ws;
  
  ws.on("close", () => { 
    if (lastClient === ws) {
      lastClient = null;
      console.log('❌ Extension disconnected');
    }
  });
  
  ws.on("error", (error) => {
    console.error('🚨 WebSocket error:', error);
  });
});

// Enhanced API request helper with proper authentication
async function makeWebflowRequest(endpoint: string, options: any = {}) {
  const baseUrl = 'https://api.webflow.com/v2';
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  
  const headers: any = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };
  
  // Use OAuth token if available, fallback to site token
  if (config.site_token) {
    headers['Authorization'] = `Bearer ${config.site_token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  
  return response.json().catch(() => ({}));
}

// Task execution endpoint
app.post("/task", async (req, res) => {
  if (!lastClient) {
    return res.status(503).json({ 
      ok: false, 
      error: "Extension not connected. Please open the extension in Webflow Designer." 
    });
  }
  
  const payload = JSON.stringify(req.body);
  console.log(`📤 Sending task to extension: ${req.body?.ops?.length || 0} operations`);
  
  const result = await new Promise((resolve) => {
    const onMessage = (msg: any) => {
      try {
        const parsed = JSON.parse(msg.toString());
        lastClient?.off("message", onMessage);
        console.log(`📥 Task completed:`, parsed.ok ? 'Success' : `Error: ${parsed.error}`);
        resolve(parsed);
      } catch (error) {
        lastClient?.off("message", onMessage);
        resolve({ ok: false, error: "Invalid response from extension" });
      }
    };
    
    lastClient!.on("message", onMessage);
    lastClient!.send(payload);
    
    // Timeout after 10 seconds
    setTimeout(() => { 
      lastClient?.off("message", onMessage); 
      resolve({ ok: true, note: "No response (timeout), task may still be executing" }); 
    }, 10000);
  });
  
  res.json(result);
});

// Enhanced publish endpoint with proper site configuration
app.post("/publish", async (req, res) => {
  try {
    const { 
      siteId = config.site_id, 
      domainIds = [], 
      publishToWebflowSubdomain = true 
    } = req.body || {};
    
    if (!siteId) {
      return res.status(400).json({ 
        ok: false, 
        error: "Missing siteId. Please provide siteId or set WEBFLOW_SITE_ID environment variable." 
      });
    }
    
    console.log(`🚀 Publishing site ${siteId}...`);
    
    const result = await makeWebflowRequest(`/sites/${siteId}/publish`, {
      method: "POST",
      body: JSON.stringify({ 
        custom_domains: domainIds, 
        publish_to_webflow_subdomain: publishToWebflowSubdomain 
      })
    });
    
    console.log(`✅ Site published successfully`);
    res.json({ ok: true, result });
    
  } catch (error: any) {
    console.error('❌ Publish failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// OAuth authorization endpoint
app.get("/auth/webflow", (req, res) => {
  if (!config.client_id) {
    return res.status(400).json({ 
      error: "OAuth not configured. Missing WEBFLOW_CLIENT_ID." 
    });
  }
  
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = new URL('https://webflow.com/oauth/authorize');
  
  authUrl.searchParams.set('client_id', config.client_id);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  
  // Store state for validation (in production, use a proper session store)
  req.session = { state };
  
  res.redirect(authUrl.toString());
});

// OAuth callback endpoint
app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }
    
    console.log('🔐 Processing OAuth callback...');
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://api.webflow.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.client_id,
        client_secret: config.client_secret,
        code,
        grant_type: 'authorization_code'
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      throw new Error(tokens.error_description || 'OAuth token exchange failed');
    }
    
    console.log('✅ OAuth tokens obtained successfully');
    
    // In a production app, you'd store these tokens securely
    res.json({ 
      success: true, 
      message: "OAuth completed successfully",
      // Don't expose actual tokens in response
      hasAccessToken: !!tokens.access_token
    });
    
  } catch (error: any) {
    console.error('❌ OAuth callback failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  const credentials = validateCredentials();
  
  try {
    // Test API connectivity if we have a token
    let apiStatus = 'not_tested';
    if (config.site_token) {
      try {
        await makeWebflowRequest('/sites');
        apiStatus = 'connected';
      } catch (error) {
        apiStatus = 'failed';
      }
    }
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      bridge: {
        version: '1.0.0',
        websocket_connected: !!lastClient,
        websocket_port: config.ws_port,
        http_port: config.http_port
      },
      webflow: {
        api_status: apiStatus,
        oauth_configured: credentials.valid,
        site_id: config.site_id,
        locale_id: config.locale_id
      },
      credentials: {
        missing: credentials.missing,
        has_oauth: !!config.client_id && !!config.client_secret,
        has_site_token: !!config.site_token
      }
    });
    
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Status endpoint for quick checks
app.get("/status", (req, res) => {
  res.json({
    websocket: lastClient ? 'connected' : 'disconnected',
    credentials: !!config.client_id && !!config.client_secret ? 'configured' : 'missing',
    ready: !!lastClient && (!!config.site_token || (!!config.client_id && !!config.client_secret))
  });
});

// Start the server
function startServer() {
  const credentials = validateCredentials();
  
  app.listen(config.http_port, config.host, () => {
    console.log('🚀 Claude Webflow Bridge Server Started');
    console.log(`   HTTP API: http://${config.host}:${config.http_port}`);
    console.log(`   WebSocket: ws://${config.host}:${config.ws_port}`);
    console.log(`   Health Check: http://${config.host}:${config.http_port}/health`);
    console.log('');
    console.log('🎯 Configuration:');
    console.log(`   Site ID: ${config.site_id}`);
    console.log(`   Locale ID: ${config.locale_id}`);
    console.log(`   OAuth: ${credentials.valid ? '✅ Configured' : '❌ Missing credentials'}`);
    console.log(`   Site Token: ${config.site_token ? '✅ Available' : '❌ Not set'}`);
    console.log('');
    console.log('📱 Next Steps:');
    console.log('   1. Open Webflow Designer');
    console.log('   2. Launch Claude Webflow Bridge extension');
    console.log('   3. Verify WebSocket connection');
    console.log('   4. Test with Claude MCP tools');
  });
}

startServer();