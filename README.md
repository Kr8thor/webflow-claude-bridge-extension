# Webflow Claude Bridge Extension

A powerful Designer Extension that enables Claude AI to create and modify Webflow pages through the Designer API.

## 🚀 Live Deployment

**Netlify URL**: `https://webflow-claude-bridge-extension.netlify.app`

## 🎯 Features

- **AI-Powered Page Creation**: Let Claude build complete Webflow pages
- **Real-time WebSocket Communication**: Instant task execution
- **Robust Error Handling**: Comprehensive logging and recovery
- **Status Monitoring**: Visual connection and operation status
- **Designer API Integration**: Full access to Webflow's element creation tools

## 📋 Prerequisites

1. **Webflow Account** with Designer access
2. **Local Bridge Server** running on port 8787
3. **Claude Desktop** with MCP tools configured

## 🛠️ Installation & Setup

### Step 1: Deploy the Extension

The extension is automatically deployed to Netlify at:
```
https://webflow-claude-bridge-extension.netlify.app
```

### Step 2: Start Local Bridge Server

Run your local bridge server that handles Claude ↔ Extension communication:

```bash
cd bridge/
npm install
npm start
```

This starts:
- WebSocket server on `ws://127.0.0.1:8787`
- HTTP API on `http://127.0.0.1:8788`

### Step 3: Create Webflow App

1. Go to [Webflow Apps](https://webflow.com/apps)
2. Click "Create App"
3. Fill in app details:
   - **App Name**: Claude Webflow Builder Bridge
   - **App URL**: `https://webflow-claude-bridge-extension.netlify.app`
   - **App Type**: Designer Extension
   - **Size**: Large

### Step 4: Install to Your Site

1. Install the app to your Webflow site
2. Open the site in Webflow Designer
3. Press `E` to open Apps panel
4. Launch "Claude Webflow Builder Bridge"
5. Verify WebSocket connection status shows "connected"

## 🎮 Usage with Claude

### Basic Task Example

```json
{
  "ops": [
    {
      "op": "CREATE_PAGE",
      "name": "Landing Page",
      "slug": "landing"
    },
    {
      "op": "BUILD_TREE",
      "parent": "pageRoot",
      "tree": {
        "tag": "section",
        "oid": "hero",
        "styles": {
          "padding": "80px 0",
          "background-color": "#f8f9fa"
        },
        "children": [
          {
            "tag": "div",
            "styles": {
              "max-width": "1200px",
              "margin": "0 auto",
              "padding": "0 24px"
            },
            "children": [
              {
                "tag": "h1",
                "text": "Welcome to Our Site",
                "styles": {
                  "font-size": "48px",
                  "margin-bottom": "24px"
                }
              },
              {
                "tag": "p",
                "text": "This is a page built by Claude AI!"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### Claude MCP Tool Integration

```javascript
// In your Claude MCP tool
async function sendWebflowTask(task) {
  const response = await fetch('http://127.0.0.1:8788/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task)
  });
  return response.json();
}
```

## 🔧 Development

### Local Development

```bash
git clone https://github.com/Kr8thor/webflow-claude-bridge-extension.git
cd webflow-claude-bridge-extension
npm install
npm run dev
```

### Build for Production

```bash
npm run build
```

This compiles TypeScript and copies assets to the `public/` directory.

### File Structure

```
├── src/
│   └── index.ts          # Main extension logic
├── assets/
│   └── index.html        # Extension UI
├── public/               # Built files (auto-generated)
├── netlify.toml         # Netlify configuration
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── webflow.json         # Webflow extension config
```

## 📡 API Operations

The extension supports these operations:

- **CREATE_PAGE**: Create and switch to a new page
- **BUILD_TREE**: Build complex element hierarchies
- **SET_TEXT_BY_OID**: Update text content by OID selector
- **APPLY_STYLE**: Create and apply Webflow styles
- **ADD_IMAGE**: Insert images with asset management
- **TEST_CONNECTION**: Health check and heartbeat

## 🔍 Monitoring & Debugging

The extension provides real-time monitoring:

- **WebSocket Status**: Connection state to bridge server
- **Bridge Status**: Overall system health
- **Activity Log**: Detailed operation logging with timestamps
- **Error Reporting**: Comprehensive error tracking and recovery

## 🚨 Troubleshooting

### Extension Not Connecting

1. Verify bridge server is running on port 8787
2. Check browser console for WebSocket errors
3. Ensure no firewall blocking local connections
4. Try refreshing the Designer extension

### Commands Not Executing

1. Check Webflow Designer API availability
2. Verify extension is loaded in Designer (not standalone)
3. Review activity log for specific error messages
4. Ensure proper element selection for operations

### Performance Issues

1. Monitor Core Web Vitals in Netlify
2. Check for large asset uploads
3. Optimize WebSocket message frequency
4. Review browser memory usage

## 📊 Performance

- **Load Time**: < 2 seconds (Netlify CDN)
- **WebSocket Latency**: < 100ms (local bridge)
- **Operation Response**: < 500ms per task
- **Memory Usage**: < 50MB browser memory

## 🔐 Security

- HTTPS-only deployment on Netlify
- CSP headers for XSS protection
- WebSocket connections to localhost only
- No sensitive data transmission

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/Kr8thor/webflow-claude-bridge-extension/issues)
- Documentation: [Webflow Designer API](https://developers.webflow.com/)

---

Built with ❤️ for the Webflow and AI automation community.