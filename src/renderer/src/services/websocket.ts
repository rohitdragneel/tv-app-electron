export class WebSocketService {
    private ws: WebSocket | null = null;
    private url: string;
    private onMessage: (data: any) => void;
    private onStatusChange?: (status: 'connecting' | 'connected' | 'error') => void;
    private reconnectInterval: number = 5000;
    private reconnectTimer: any = null;

    constructor(url: string, onMessage: (data: any) => void, onStatusChange?: (status: any) => void) {
        this.url = url;
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
    }

    setMessageHandler(handler: (data: any) => void) {
        this.onMessage = handler;
    }

    private isConnecting: boolean = false;

    connect() {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
        this.isConnecting = true;

        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        console.log(`Connecting to WebSocket: ${this.url}`);
        this.onStatusChange?.('connecting');
        this.ws = new WebSocket(this.url);

        const socketInstance = this.ws;

        this.ws.onopen = () => {
            if (this.ws !== socketInstance) return;
            console.log('WebSocket connected');
            this.onStatusChange?.('connected');
            this.isConnecting = false;
        };

        this.ws.onmessage = (event) => {
            if (this.ws !== socketInstance) return;
            try {
                const data = JSON.parse(event.data);
                this.onMessage(data);
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };

        this.ws.onclose = () => {
            if (this.ws !== socketInstance) return;
            console.log('WebSocket closed, scheduling reconnect...');
            this.isConnecting = false;
            this.ws = null;
            this.onStatusChange?.('connecting');
            this.scheduleReconnect();
        };

        this.ws.onerror = (e) => {
            if (this.ws !== socketInstance) return;
            console.error('WebSocket error:', e);
            this.isConnecting = false;
            this.onStatusChange?.('error');
        };
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectInterval);
    }

    send(data: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    disconnect() {
        this.isConnecting = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
