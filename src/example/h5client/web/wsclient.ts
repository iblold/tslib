
 /** 在线状态 */
 class LineState{
    /**未知状态 */
    static None = 0;
    /**连接中 */
    static Connecting= 1;
    /**离线 */
    static OnLine = 2;
    /**在线 */
    static OffLine = 3;
}

type CbMap =  {[key: string]: (msg:any)=>any};

class WsClient{
    m_ws: any;
    m_url: string;
    m_rpcid: number;
    //m_sendQueue = [];
    m_lostBreathTimes: number;
    m_breathTimer: any;
    m_lineState = LineState.None;
    /**rpc调用队列 */
    m_rpcQueue: CbMap;
    /**消息分发函数列表 */
    m_router: CbMap;
    m_callbacks: CbMap;
    m_connectTimeout = 0; 
    m_reconnInterval = -1;
    
    /**
     * @param connectTimeout 连接超时时长， 毫秒
     * @param reconnInterval 断线重连时长， -1不重连， 毫秒
     */
    constructor(connectTimeout: number, reconnInterval: number){
        this.m_ws = null;
        this.m_url = '';
        this.m_rpcid = 0;
        this.m_rpcQueue = {};
       // this.m_sendQueue = [];
        this.m_lostBreathTimes = 0;
        this.m_breathTimer = null;
        this.m_lineState = LineState.None;
        this.m_router = {};
        this.m_callbacks = {};
        this.m_connectTimeout = connectTimeout || 5000;
        this.m_reconnInterval = reconnInterval || -1;
    }

    /**
     * 连接服务器
     * @param url websocket url ws://url:port/protocol
     */
    connect(url: string){
        // 解析url
        let params = url.match(/(ws:\/\/[\w\.:]+)\/*([\w\-\.]*)/);
        if (params && params.length == 3){
           this.m_url = url;
           this.m_lineState = LineState.Connecting;
           this.m_ws = new WebSocket(params[1], params[2]);
           this.m_ws.onmessage = this.onData.bind(this);
           this.m_ws.onerror = this.onError.bind(this);
           this.m_ws.onclose = this.onEnd.bind(this);
           
           // 连接超时定时器
           let timer = setTimeout(()=>{
               clearTimeout(timer);
               if (this.m_lineState == LineState.Connecting){
                   this.m_lineState = LineState.None;
                   this.onError(new Error('time out'));
               }
           }, this.m_connectTimeout);
           
           this.m_ws.onopen = ()=>{
               clearTimeout(timer);
               if (this.m_lineState == LineState.Connecting){
                   this.m_lineState = LineState.OnLine;
                   this.on('connected');
                   // 心跳， 每分钟一次
                   this.m_breathTimer = setInterval(this.breath.bind(this), 1000 * 60);
               } else {
                   this.close();
               }
           }	
        } else {
            this.onError(new Error('host url pares failed.'));
        }
    }

    /**自动重连 */
    reConnect(){
        clearInterval(this.m_breathTimer);
        this.connect(this.m_url);
    }

     /**断开连接 */
    close(){
        if (this.m_lineState == LineState.OnLine){
            this.m_ws.close();
            clearInterval(this.m_breathTimer);
		}
    }

    /**错误响应函数 */
    onError(error: Error){
        this.on('error', error);
    }

    /**数据响应函数 */
    onData(msg: any){
		if (typeof msg.data == 'object'){

            let buffer;
            let fileReader = new FileReader();
            fileReader.onload = (event: any)=>{
                
                buffer = event.target.result;

                let dt = new DataView(buffer);
                let flag = dt.getUint16(0, true);
                if (flag != 0x1234){
                    this.onError(new Error('recv error packet. ' + flag));
                    return;
                }
                let size = dt.getUint32(2, true);
                let unzSize = dt.getUint32(6, true);
                
                let msgbuff = buffer.slice(10, buffer.byteLength);
                let strbuff: any;
                
                if (unzSize > 0){
                    let inflate = new Zlib.Inflate(new Uint8Array(msgbuff));
                    strbuff = new Uint8Array(inflate.decompress());
                }else{
                    strbuff = new Uint8Array(msgbuff);
                }
                
                let str = utf8Array2utf16Str(strbuff);
                let packet = JSON.parse(str);
                if (packet){
                    if(packet.rpcid != null && this.m_rpcQueue[packet.rpcid]){
                        this.m_rpcQueue[packet.rpcid](packet);
                    } else if(packet.cmd){
                        if (this.m_router[packet.cmd])
                            this.m_router[packet.cmd](packet);
                    }
                }

            };
            fileReader.readAsArrayBuffer(msg.data);
		}
    }

    /**断线响应函数 */
    onEnd(){
        if (this.m_lineState == LineState.OnLine){
            this.on('disconnect');
            this.m_lineState = LineState.OffLine;
        }

        if (this.m_reconnInterval > 0){
           setTimeout(()=>{
               this.reConnect();
           }, this.m_reconnInterval);
        }
    }

    /**呼吸 */
    breath(){
        if (this.m_lineState == LineState.OnLine){
            this.rpc({cmd:'breath', localTime: Math.floor(new Date().getTime() / 1000)}, (err, res)=>{
				if (err){
					// 3分钟没心跳认为断线
					if (this.m_lostBreathTimes++ >= 3){
						this.close();
					}else{
						this.m_lostBreathTimes = 0;
					}
				}
			});
		}
    }

    /**远程调用
     * @param param 调用参数
     * @param cb 调用返回回调 (err, result)=>{}
     */
    rpc(param: any, cb: (error: Error|null, msg: any)=>void){
        if(this.m_lineState == LineState.OnLine){
            if (this.m_rpcid++ > 0xffffff) 
			    this.m_rpcid = 0;
		
            let msg = param;
            
            let rpcid = this.m_rpcid;
            if (typeof cb == 'function'){
                
                let ht = setTimeout(() => {
                    clearTimeout(ht);
                    cb(new Error('timeout'), null);
                    delete this.m_rpcQueue[rpcid];
                }, 5000);

                this.m_rpcQueue[rpcid] = (result) => {
                    clearTimeout(ht);
                    cb(null, result);
                    delete this.m_rpcQueue[rpcid];
                };
                
                msg.rpcid = rpcid;
                this.send(msg, false);
            }
        } else {
            cb(new Error('offline'), null);
        }
    }

    /**发送消息
     * @param msg 消息
     */
    send(msg: any, end: boolean){
        if (!this.m_ws || this.m_lineState != LineState.OnLine){
			return;
        }
        
        let str = JSON.stringify(msg);
		
		let buff = [0x34, 0x12, 0, 0, 0, 0, 0, 0, 0, 0];
		utf16Str2utf8Array(str, buff);
		
		let size = buff.length;
		let ub = new Uint8Array(buff);
		ub[5] = (size & 0xff000000) >> 24;
		ub[4] = (size & 0xff0000) >> 16;
		ub[3] = (size & 0xff00) >> 8;
		ub[2] = size & 0xff;
		this.m_ws.send(ub);
    }

    /**
     * 设置消息分发回调函数
     * @param packetType 消息类型或者带cmd字段的对象
     * @cb 回调函数
     */
    router(packetType: any, cb: (msg: any)=>void){
        if(typeof packetType == 'string'){
            this.m_router[packetType] = cb;
        } else if (packetType.cmd){
            this.m_router[packetType.cmd] = cb;
        }
        return this;
    }

    /**
    * 设置事件回调或者调用
    * @param event 事件名称
    * disconnect, 断线事件
    * error, 发生错误
    * connected, 连接完成, 对应connect()
    * @param params 如果是函数则设置，否则调用
    */
    on(event: string, ...params: any[]){
        if (params.length == 1 && typeof params[0] == 'function'){
            this.m_callbacks[event] = params[0];
            return this;
        } else {
            let cb = this.m_callbacks[name];
            if (cb){
                return cb.apply(null, <any>params);
            }
        }
        return null;
    }
}

function utf16Str2utf8Array(str: string, utf8: number[]) {
    utf8 = utf8 || [];
    for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) 
			utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6), 
                      0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12), 
                      0x80 | ((charcode>>6) & 0x3f), 
                      0x80 | (charcode & 0x3f));
        }
        else {
            i++;
            charcode = 0x10000 + (((charcode & 0x3ff)<<10)
                      | (str.charCodeAt(i) & 0x3ff));
            utf8.push(0xf0 | (charcode >>18), 
                      0x80 | ((charcode>>12) & 0x3f), 
                      0x80 | ((charcode>>6) & 0x3f), 
                      0x80 | (charcode & 0x3f));
        }
    }
    return utf8;
}

function utf8Array2utf16Str(array: number[]) {
    let out = '';
    let i = 0;
    while(i < array.length) {
		let c = array[i++];
		switch(c >> 4)
		{ 
		  case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
			out += String.fromCharCode(c);
			break;
		  case 12: case 13:
			out += String.fromCharCode(((c & 0x1F) << 6) | (array[i++] & 0x3F));
			break;
		  case 14:
			out += String.fromCharCode(((c & 0x0F) << 12) |
						   ((array[i++] & 0x3F) << 6) |
						   ((array[i++] & 0x3F) << 0));
			break;
		}
    }

    return out;
}