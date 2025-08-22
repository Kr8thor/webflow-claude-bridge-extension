/* global webflow */
declare const webflow: any;

type AnyElement = any;

type BuildNode = {
  tag: string;                       
  oid?: string;                      
  text?: string;
  attrs?: Record<string, string>;
  styles?: Record<string, string>;   
  children?: BuildNode[];
};

type Ops =
  | { op: "CREATE_PAGE"; name: string; slug?: string }
  | { op: "BUILD_TREE"; parent: "selected" | "pageRoot"; tree: BuildNode }
  | { op: "SET_TEXT_BY_OID"; oid: string; selector?: string; text: string }
  | { op: "APPLY_STYLE"; style: { name: string; properties: Record<string,string>; parentStyleName?: string }, oids: [string, string?][] }
  | { op: "ADD_IMAGE"; parentOid: [string, string?]; asset: { byId?: string }; alt?: string }
  | { op: "TEST_CONNECTION" };

type Task = { ops: Ops[] };

class WebflowBridge {
  private ws: WebSocket | null = null;
  private wsStatus: HTMLElement;
  private bridgeStatus: HTMLElement;
  private logEl: HTMLElement;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  constructor() {
    this.wsStatus = document.getElementById('ws')!;
    this.bridgeStatus = document.getElementById('bridge-status')!;
    this.logEl = document.getElementById('log')!;
    
    this.init();
  }

  private init() {
    this.log('🚀 Claude Webflow Bridge Extension initializing...');
    this.updateStatus('extension-status', 'loaded', 'connected');
    
    // Check if webflow API is available
    if (typeof webflow !== 'undefined') {
      this.log('✅ Webflow Designer API detected');
    } else {
      this.log('⚠️ Webflow Designer API not available - extension may be running outside Designer');
    }

    this.connectWebSocket();
    this.setupHeartbeat();
  }

  private connectWebSocket() {
    try {
      this.log(`🔌 Attempting WebSocket connection (attempt ${this.reconnectAttempts + 1})...`);
      
      // Try multiple WebSocket URLs for flexibility
      const wsUrls = [
        "ws://127.0.0.1:8787",
        "ws://localhost:8787",
        "wss://127.0.0.1:8787"
      ];

      const wsUrl = wsUrls[0]; // Start with first URL
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.log(`✅ WebSocket connected to ${wsUrl}`);
        this.updateStatus('ws', 'connected', 'connected');
        this.updateStatus('bridge-status', 'connected', 'connected');
        this.reconnectAttempts = 0;
        
        // Send test connection
        this.sendTest();
      };

      this.ws.onclose = (event) => {
        this.log(`❌ WebSocket disconnected (Code: ${event.code}, Reason: ${event.reason})`);
        this.updateStatus('ws', 'disconnected', 'disconnected');
        this.updateStatus('bridge-status', 'disconnected', 'disconnected');
        
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        this.log(`🚨 WebSocket error: ${error}`);
        this.updateStatus('ws', 'error', 'disconnected');
      };

      this.ws.onmessage = async (evt) => {
        try {
          const payload: Task = JSON.parse(evt.data);
          this.log(`📥 Received task with ${payload.ops.length} operations`);
          
          const result = await this.executeTask(payload);
          this.sendResponse({ ok: true, result });
        } catch (e: any) {
          this.log(`❌ Error executing task: ${e?.message || e}`);
          this.sendResponse({ ok: false, error: e?.message || String(e) });
        }
      };

    } catch (error) {
      this.log(`🚨 Failed to create WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.log(`⏳ Reconnecting in ${this.reconnectDelay / 1000}s...`);
      
      setTimeout(() => {
        this.connectWebSocket();
      }, this.reconnectDelay);
      
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10000);
    } else {
      this.log(`🔄 Max reconnection attempts reached. Please restart the bridge server.`);
      this.updateStatus('bridge-status', 'failed', 'disconnected');
    }
  }

  private setupHeartbeat() {
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendTest();
      }
    }, 30000); // Heartbeat every 30 seconds
  }

  private sendTest() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ops: [{ op: "TEST_CONNECTION" }] }));
    }
  }

  private sendResponse(response: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  private updateStatus(elementId: string, text: string, className: string) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
      element.className = `status-value ${className}`;
    }
  }

  private log(...args: any[]) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.log(...args);
    this.logEl.textContent += `[${timestamp}] ${message}\n`;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private async executeTask(task: Task): Promise<any> {
    const results = [];
    
    for (const op of task.ops) {
      try {
        const result = await this.executeOperation(op);
        results.push({ op: op.op, success: true, result });
        this.log(`✅ ${op.op} completed successfully`);
      } catch (error) {
        this.log(`❌ ${op.op} failed: ${error}`);
        results.push({ op: op.op, success: false, error: String(error) });
      }
    }
    
    return results;
  }

  private async executeOperation(op: Ops): Promise<any> {
    if (!webflow) {
      throw new Error('Webflow Designer API not available');
    }

    switch (op.op) {
      case "TEST_CONNECTION":
        return { status: "connected", timestamp: Date.now() };

      case "CREATE_PAGE":
        const page = await webflow.createPage();
        await page.setName(op.name);
        if (op.slug) await page.setSlug(op.slug);
        await webflow.switchPage(page);
        return { pageId: page.id, name: op.name, slug: op.slug };

      case "BUILD_TREE":
        const parentElement = await this.getParentElement(op.parent);
        const built = this.buildWithBuilder(op.tree);
        await parentElement.append(built);
        return { success: true, parentType: op.parent };

      case "SET_TEXT_BY_OID":
        const target = await this.findByOid(op.oid, op.selector);
        if (!target) throw new Error(`Element with OID ${op.oid} not found`);
        
        if (target?.textContent) {
          await target.setTextContent(op.text);
        } else {
          const kids = target?.children ? await target.getChildren() : [];
          const str = kids?.find((k: any) => k.type === "String");
          if (str && 'setText' in str) {
            await str.setText(op.text);
          } else {
            throw new Error('Could not set text content');
          }
        }
        return { oid: op.oid, text: op.text };

      case "APPLY_STYLE":
        const parentStyle = op.style.parentStyleName ? await webflow.createStyle(op.style.parentStyleName) : null;
        const style = await webflow.createStyle(op.style.name);
        await style.setProperties(op.style.properties);
        if (parentStyle) await style.setParent?.(parentStyle);
        
        for (const [oid, sel] of op.oids) {
          const el = await this.findByOid(oid, sel);
          if (el?.styles) await el.setStyles([style]);
        }
        return { styleName: op.style.name, appliedTo: op.oids.length };

      case "ADD_IMAGE":
        const imageParent = await this.findByOid(op.parentOid[0], op.parentOid[1]);
        if (!imageParent?.children) throw new Error('Parent element not found');
        
        const img = await imageParent.append(webflow.elementPresets.Image);
        if (img?.type === "Image") {
          if (op.asset?.byId) {
            const asset = await webflow.getAssetById(op.asset.byId);
            await img.setAsset(asset);
          }
          if (op.alt) await img.setAltText?.(op.alt);
        }
        return { success: true, alt: op.alt };

      default:
        throw new Error(`Unknown operation: ${(op as any).op}`);
    }
  }

  private async getParentElement(kind: "selected" | "pageRoot"): Promise<AnyElement> {
    if (kind === "selected") {
      const el = await webflow.getSelectedElement();
      if (el?.children) return el;
    }
    const root = await webflow.getRootElement();
    if (!root?.children) throw new Error("No valid parent found");
    return root;
  }

  private buildWithBuilder(spec: BuildNode) {
    const b = webflow.elementBuilder(webflow.elementPresets.DOM);
    b.setTag(spec.tag);
    if (spec.styles) {
      b.setStyles([spec.styles]);
    }
    if (spec.oid) b.setAttribute("data-oid", spec.oid);
    if (spec.attrs) Object.entries(spec.attrs).forEach(([k, v]) => b.setAttribute(k, v));
    if (spec.text) b.setTextContent(spec.text);
    
    for (const child of spec.children ?? []) {
      const c = b.append(webflow.elementPresets.DOM);
      this.buildChildElement(c, child);
    }
    
    return b;
  }

  private buildChildElement(builder: any, spec: BuildNode) {
    builder.setTag(spec.tag);
    if (spec.oid) builder.setAttribute("data-oid", spec.oid);
    if (spec.attrs) Object.entries(spec.attrs).forEach(([k, v]) => builder.setAttribute(k, v));
    if (spec.styles) builder.setStyles([spec.styles]);
    if (spec.text) builder.setTextContent(spec.text);
    
    if (spec.children?.length) {
      for (const child of spec.children) {
        const childBuilder = builder.append(webflow.elementPresets.DOM);
        this.buildChildElement(childBuilder, child);
      }
    }
  }

  private async findByOid(oid: string, subSelector?: string): Promise<AnyElement | null> {
    const all = await webflow.getAllElements();
    const matches: AnyElement[] = [];
    
    for (const el of all) {
      if ('getCustomAttribute' in el) {
        const val = await el.getCustomAttribute('data-oid');
        if (val === oid) matches.push(el);
      }
    }
    
    if (!subSelector) return matches[0] ?? null;
    
    // Simple descendant finder
    const chain = subSelector.split('>').map(s => s.trim()).filter(Boolean);
    let currentParents = matches;
    
    for (const piece of chain) {
      const next: AnyElement[] = [];
      for (const p of currentParents) {
        if (p?.children) {
          const kids: AnyElement[] = await p.getChildren();
          for (const k of kids) {
            if (k?.type === "DOM") {
              const tag = await k.getTag?.();
              if (!piece || piece.toLowerCase() === tag?.toLowerCase()) {
                next.push(k);
              }
            }
          }
        }
      }
      currentParents = next;
    }
    
    return currentParents[0] ?? null;
  }
}

// Initialize the bridge when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new WebflowBridge();
});

// Also initialize immediately if DOM is already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WebflowBridge();
  });
} else {
  new WebflowBridge();
}