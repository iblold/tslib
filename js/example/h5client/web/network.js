/*
 * @Description: 
 * @Date: 2018-12-17 14:38:23
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-17 15:45:31
 */

 WebSocket = WebSocket || window.WebSocket || window.MozWebSocket;

 /**在线状态 */
 const LineState = {
     None: 0,
     Connecting: 1,
     OffLine: 2,
     OnLine: 3
 }

 /**websocket客户端 */
 const WsClient = function(connectTimeout, reconnInterval){
     this.m_ws = null;
     this.m_url = null;
     this.m_rpcid = 0;
     this.m_rpcs = {};
     this.m_sendQueue = [];
     this.m_lostBreathTimes = 0;
     this.m_breathTimer = null;
     this.m_lineState = LineState.None;
     this.m_router = {};
     this.m_callbacks = {};
     this.m_connectTimeout = connectTimeout || 5000;
     this.m_reconnInterval = reconnInterval || -1;

     /**
      * 连接服务器
      * @param url websocket url ws://url:port/protocol
      * @param cb 连接回调 err=>{}
      */
     this.connect = function(url, cb){
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
                    if(cb) 
                        cb('connect time out');
                }
            }, this.m_connectTimeout);
            
			this.m_ws.onopen = (ws)=>{
                clearTimeout(timer);
                if (this.m_lineState == LineState.Connecting){
                    this.m_lineState = LineState.OnLine;
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

     /**自动重连 */
     this.reConnect = function(){
        this.connect(this.m_url, (err)=>{
            if (!err){
                console.log('reconnect ok!');
            }
        });
     }

     /**断开连接 */
     this.close = function(){
        if (this.m_lineState == LineState.OnLine){
            this.m_ws.close();
            clearInterval(this.m_breathTimer);
		}
     }

     /**错误响应函数 */
     this.onError = function(err){
        this.on('error', err);
     }

     /**数据响应函数 */
     this.onData = function(msg){
		if (typeof msg.data == 'object'){

            let buffer;
            let fileReader = new FileReader();
            fileReader.onload = (event)=>{
                buffer = event.target.result;

                let dt = new DataView(buffer);
                let flag = dt.getUint16(0, true);
                if (flag != 0x1234){
                    this.onError('recv error packet. ' + flag);
                    return;
                }
                let size = dt.getUint32(2, true);
                let unzSize = dt.getUint32(6, true);
                
                let msgbuff = buffer.slice(10, buffer.byteLength);
                let strbuff = null;
                
                if (unzSize > 0){
                    let inflate = new Zlib.Inflate(new Uint8Array(msgbuff));
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

            };
            fileReader.readAsArrayBuffer(msg.data);
		}
     }

     /**断线响应函数 */
     this.onEnd = function(){
         if (this.m_lineState == LineState.OnLine){
             this.on('disconnect');
             this.m_lineState = LineState.OffLine;
         }

         if (this.reconnInterval > 0){
            setTimeout(()=>{
                this.reConnect();
            }, this.reconnInterval);
         }
     }

     /**呼吸 */
     this.breath = function(){
		if (this.m_lineState == LineState.online){
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

     /**发送消息
      * @param msg 消息
      */
     this.send = function(msg){
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
		
		// 缓存消息， 用作断线重连后的重发。
		this.m_sendQueue.push({msg: ub, tm: new Date().getTime()});
		if (this.m_sendQueue.length > 30)
			this.m_sendQueue.shift();
     }

     /**
      * 设置消息分发回调函数
      * @param packetType 消息类型或者带cmd字段的对象
      * @cb 回调函数
      */
     this.router = function(packetType, cb){
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
      * @param params 如果是函数则设置，否则调用
      */
     this.on = function(event, ...params){
        if (typeof params[0] == 'function'){
            this.m_callbacks[event] = params[0];
            return this;
        } else {
            let cb = this.m_callbacks[event];
            if(cb){
                cb.apply(null, params);
            }
        }
     }
 } 
