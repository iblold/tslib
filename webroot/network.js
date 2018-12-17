/*
 * @Description: 
 * @Date: 2018-12-17 14:38:23
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-17 15:45:31
 */

 const WebSocket = WebSocket || window.WebSocket || window.MozWebSocket;

 const LineState = {
     None: 0,
     OffLine: 1,
     OnLine: 2
 }

 const WsClient = WsClient || window.WsClient || function(){
     this.m_ws = null;
     this.m_url = null;
     this.m_rpcid = 0;
     this.m_rpcs = {};
     this.m_sendQueue = [];
     this.m_lostBreathTimes = 0;
     this.m_breathTimer = null;
     this.m_lineState = LineState.None;
     this.m_router = {};

     this.connect = function(url, cb){
         let params = url.match(/(ws:\/\/[\w\.:]+)\/*([\w\-\.]*)/);
         if (params && params.length == 3){
            this.m_url = url;
			this.m_lineState = LineState.OffLine;
			this.m_ws = new WebSocket(url, params[2]);
			this.m_ws.onmessage = this.onData.bind(this);
			this.m_ws.onerror = this.onError.bind(this);
            this.m_ws.onclose = this.onEnd.bind(this);
            
            let timer = setTimeout(()=>{
				clearTimeout(timer);
				this.m_state = LineState.None;
                if(cb) 
                    cb('connect time out');
            }, 5000);
            
			this.m_ws.onopen = (ws)=>{
                if (this.m_lineState == LineState.OffLine){
                    this.m_state = LineState.OnLine;
                    clearTime(timer);
                    if (cb) 
                        cb(null, this);
                    // 心跳， 每分钟一次
                    this.m_breathTimer = setInterval(this.breath.bind(this), 1000 * 60);
                } else {
                    this.close();
                }
			}	
         } else {
             if (cb){
                 cb('connect failed!');
             }
         }
     }

     this.close = function(){
        if (this.m_state == LineState.OnLine){
            this.m_ws.close();
            clearInterval(this.m_breathTimer);
		}
     }

     this.onError = function(err){
        this.on('error', err);
     }

     this.onData = function(msg){
		if (typeof msg.data == 'object'){
			let dt = new DataView(msg.data);
			let flag = dt.getUint16(0, true);
			if (flag != 0x1234){
				this.onError('recv error packet. ' + flag);
				return;
			}
			let size = dt.getUint32(2, true);
			let unzSize = dt.getUint32(6, true);
			
			let msgbuff = msg.data.slice(10, msg.data.byteLength);
			let strbuff = null;
			
			if (unzSize > 0){
                let inflate = new Zlib.Inflate(msgbuff)
				strbuff = new Uint8Array(inflate.decompress());
			}else{
				strbuff = new Uint8Array(msgbuff);
			}
			
			let str = utf8Array2utf16Str(strbuff);
			let packet = JSON.parse(str);
			
			if (packet){
				if(packet.rpcid != null && this.m_rpcs[packet.rpcid]){
					this.m_rpcs[packet.rpcid](packet);
				} else if(packet.cmd){
                    if (this.m_router[packet.cmd])
                        this.m_router[packet.cmd](packet);
				}
			}
		}
     }

     this.onEnd = function(){
         if (this.m_lineState == LineState.OnLine){
             this.on('disconnect');
             this.m_lineState = LineState.OffLine;
             this.reConnect();
         }
     }

     this.breath = function(){
		if (this.m_state == LineState.online){
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

     this.rpc = function(param, cb){
        if(this.m_lineState == LineState.OnLine){
            if (this.m_rpcid++ > 0xffffff) 
			    this.m_rpcid = 0;
		
            let msg = param;
            
            let rpcid = this.m_rpcid;
            if (typeof cb == 'function'){
                
                let ht = setTimeout(() => {
                    clearTimeout(ht);
                    cb('timeout', null);
                    delete this.m_rpcs[rpcid];
                }, 5000);

                this.m_rpcs[rpcid] = res => {
                    clearTimeout(ht);
                    cb(null, res);
                    delete this.m_rpcs[rpcid];
                };
                
                msg.rpcid = rpcid;
                this.send(msg);
            }
        } else {
            cb('offline', null);
        }
     }

     this.send = function(msg){
        if (!this.m_ws){
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
		
		// 缓存消息， 用作断线重连后的重发。
		this.m_sendQueue.push({msg: ub, tm: new Date().getTime()});
		if (this.m_sendQueue.length > 30)
			this.m_sendQueue.shift();
     }

     this.router = function(msg, cb){
         if(typeof msg == 'string'){
             this.m_router[msg] = cb;
         } else if (msg.cmd){
             this.m_router[msg.cmd] = cb;
         }
     }

 } 