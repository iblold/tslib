/******************************************************
 * @Description: 
 * @Date: 2018-12-14 21:05:40
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-17 14:55:02
 *******************************************************/
 import * as tcpnet from 'net';
 import * as udpnet from 'dgram';
 import * as http from 'http';
 import * as websocket from 'websocket';
 import * as zlib from 'zlib';
 import { BaseFn } from './basefunc';

 /** 最大消息长度 */
 export const MaxPacketSize = 32 * 1024;

 /** 网络连接类型 */
 export class NetType{
     static None = 0;
     static Tcp = 1;
     static Udp = 2;
     static WebSocket = 3;
 }

 /** NetBase类 */
 class NetBase{
     m_type: NetType;
     private m_callbacks: Map<string, any>; 

     constructor(type: NetType){
         this.m_type = type;
         this.m_callbacks = new Map<string, any>();
     } 

     /**
      * 定义或者调用回调函数
      * 默认回调：
      * disconnect, 断线事件
      * error, 发生错误
      * connected, 连接完成, 对应connect()
      * start, 服务器启动事件
      * newconn, 新连接完成事件, 服务器
      * incomming, 新连接请求事件
      * @param name 回调函数名称
      * @param params 调用参数，如果参数是函数，则为定义，否则是调用
      */
     on(name: string, ...params: any[]){
        if (params.length == 1 && typeof params[0] == 'function'){
            this.m_callbacks.set(name, params[0]);
            return this;
        } else {
            let cb = this.m_callbacks.get(name);
            if (cb){
                return cb.apply(null, params);
            }
        }
        return null;
     }
 } 

 /** 服务器基类 */
 export abstract class Server extends NetBase{
     /** 客户端列表 */
     m_clients: any;
     m_router: any;

     /**
      * 构造函数
      * @param type 网络类型
      */
     constructor(type: NetType){
         super(type);
         this.m_type = type;
         this.m_clients = [];
         this.m_router = {};
     }

     /**
      * 定义消息分发函数
      * @param msg 消息对象或者消息类型 
      * @param cb 消息接收函数
      */
     router(packetType: any, cb: (client: any, params: any)=>void){
        if (typeof packetType == 'string'){
            this.m_router[packetType] = cb;
        } else {
            this.m_router[packetType.cmd] = cb;
        }
        return this;
     }

     /**
      * 处理接收到的消息
      * @param msg 接收到的消息
      */
     dispatcher(client: any, msg: any){
        let cb = this.m_router[msg.cmd||''];
        if(cb) cb(client, msg);
     }

     /**
      * 响应连接接入事件
      * @param socket 连入的链接
      */
     abstract onIncomming(socket: any): boolean;

     /**
      * 启动服务器
      * @param port 端口
      */
     abstract start(port: number): void;
     
     /**
      * 响应连接断开事件
      * @param client 发生断开的连接
      */
     onDisconnect(client: any){
         let i = this.m_clients.indexOf(client);
         if (i >= 0){
             this.on('disconnect', client);
             this.m_clients.splice(i, 1);
         }
     }

     /**
      * 定义远程调用响应函数
      * @param msg 消息类型或者带有cmd字段的对象
      * @param cb 处理此类型消息的回掉函数
      */
     defRpc(msg: any, cb: (client: Client, param: any)=>any){
        this.router(msg, (client: Client, param: any)=>{
            let ret = cb(client, param);
            if (ret != null && param.rpcid != null){
                ret.rpcid = param.rpcid;
                client.sendMsg(ret);
            }
        });
        return this;
     }
 }

 /** 在线状态 */
 export class LineState{
     /** 未知状态 */
     static None = 0;
     /** 离线 */
     static OnLine = 1;
     /** 在线 */
     static OffLine = 2;
 }

 /** 客户端基类 */
 export abstract class Client extends NetBase{
     /**所属服务器 */
     m_server: Server|null;
     /**在线状态 */
     m_lineState: LineState;
     /**连接上的时间，毫秒 */
     m_connectedTime: number;
     /**发送队列 */
     m_sendQueue: any;
     /**rpc调用队列 */
     m_rpcQueue: any;
     /**消息分发函数列表 */
     m_router: any;
     /**最后接收到消息的时间， 毫秒 */
     m_lastRecvTime: number;
     /**远端地址 */
     m_remoteAddr: string;

     constructor(type: NetType, server: Server|null = null){
        super(type);
        this.m_server = server;
        this.m_lineState = LineState.None;
        this.m_connectedTime = 0;
        this.m_sendQueue = {};
        this.m_rpcQueue = {};
        this.m_router = {};
        this.m_lastRecvTime = 0;
        this.m_remoteAddr = '';
     }

     /**
      * 包装网络消息
      * @param msg 消息内容
      * @param cb 完成后的回调
      * @param ziped 是否启用压缩
      */
     private makeMsgBuff(msg: object|string, cb: (buffer: Buffer|null)=>void, ziped: boolean) {
         if (typeof msg == 'object') {
             msg = JSON.stringify(msg);
         }
     
         let strBuf = Buffer.from(msg);
     
         // buff struct
         // flag 0x1234 | size 4 | uncomp size 4 |data | 
         if (strBuf.length > 128 && ziped == true) {
             let level;
             if (strBuf.length < 512) {
                 level = 1;
             } else if (strBuf.length < 4096) {
                 level = 3;
             } else {
                 level = 5;
             }
     
             // 大于512字节的消息压缩传输
             zlib.deflate(strBuf, { level: level }, (err: Error|null, comp: any) => {
                 if (err){
                    cb(null);
                 } else {
                    let size = 10 + comp.length;
                    let buff = Buffer.alloc(size);
                    buff.writeUInt16LE(0x1234, 0);
                    buff.writeUInt32LE(size, 2);
                    buff.writeUInt32LE(strBuf.length, 6);
                    comp.copy(buff, 10, 0);
        
                    cb(buff);
                 }
             });
         } else {
             let size = 10 + strBuf.length;
             if (MaxPacketSize < size) {
                 this.onError(new Error('net packet size error, size: ' + size));
             }
     
             let buff = Buffer.alloc(size);
             buff.writeUInt16LE(0x1234, 0);
             buff.writeUInt32LE(size, 2);
             buff.writeUInt32LE(0, 6);
             strBuf.copy(buff, 10, 0);
     
             cb(buff);
         }
     }

     /**
      * 检查消息头是否合法
      * @param buffer 消息缓存
      */
     checkMsg(buffer: Buffer){
        return buffer.readUInt16LE(0) == 0x1234;
     }
     
     /**
      * 连接到服务器
      * @param host 地址
      * @param port 端口
      * @param cb 回调
      */
     abstract connectTo(host: string, port: number, cb: ()=>void): void;

     /**
      * 网络消息响应函数
      * @param buffer 网络消息
      */
     abstract onData(buffer: any): void;

     /**
      * 发送消息
      * @param buffer 消息缓存
      * @param end 发送后是否断开
      */
     abstract send(buffer: Buffer, end: boolean): void;
     
     /**关闭连接 */
     abstract close(): void;

     /**
      * 绑定默认事件响应函数
      * @param socket 连接句柄
      */
     abstract bindFuncs(socket: any): void;

     /**
      * 响应错误事件
      * @param err 错误内容
      */
     onError(err: Error|null){
         if (this.m_server){
             this.m_server.on('error', this, err);
         } else {
             this.on('error', err);
         }
     }

     /**响应连接成功事件 */
     onConnected(){
         if (this.m_server){
             this.m_server.on('connected', this);
         } else {
             this.on('connected');
         }
         this.m_lineState = LineState.OnLine;
     }
    
     /**响应断开事件 */
     onEnd(){
       
        if (this.m_server){
            this.m_server.onDisconnect(this);
        } else {
            this.on('disconnect');
        }
        this.m_lineState = LineState.OffLine;
     }
    
     /**
      * 连接到服务器
      * @param host 地址
      * @param port 端口
      */
     connect(host: string, port: number){
         if (this.m_lineState == LineState.OnLine){
            this.onError(new Error('connect_online'));
            return;
         }
            
         this.m_lineState = LineState.OffLine;
         let timer = setTimeout(() => {
            this.m_lineState = LineState.None;
            this.onError(new Error('connect_timeout'));
         }, BaseFn._second(30));

         this.connectTo(host, port, ()=>{
             clearTimeout(timer);
             if (this.m_lineState == LineState.OffLine){
                 this.m_lineState = LineState.OnLine;
                 this.m_connectedTime = BaseFn.getTimeMS();
                 this.onConnected();
             } else {
                 this.close();
             }
         });
     }

     /**
      * 发送消息
      * @param msg 消息内容 
      */
     sendMsg(msg: object|string){
         if (this.m_lineState != LineState.OnLine){
            this.onError(new Error('tcpclient offline!'));
            return;
         }
            
         let packet: any = {};
         let sid = BaseFn.globalID();
         this.m_sendQueue[sid] = packet;
         this.makeMsgBuff(msg, (buff: Buffer|null)=>{
             if (buff){
                packet.state = 1;
                packet.buffer = buff;
             } else {
                 delete this.m_sendQueue[sid];
             }

             for(let key in this.m_sendQueue){
                 let v: any = this.m_sendQueue[key];
                 if (v.state == 1){
                    this.send(v.buffer, false);
                    delete this.m_sendQueue[key];
                 } else {
                    break;   
                 }
             }
         }, true);
     }

     /**
      * 发送消息并且关闭连接
      * @param msg 消息内容
      */
     sendAndClose(msg: Object){
        if (this.m_lineState != LineState.OnLine){
            this.onError(new Error('tcpclient offline!'));
            return;
         }

         this.makeMsgBuff(msg, (buff: Buffer|null)=>{
            if(buff) this.send(buff, true);
         }, true);
     }

     /**
      * 远程调用
      * @param param 调用参数
      * @param cb 调用结果回调
      */
     rpc(param: any, cb: (err: Error|null, result: any)=>void){
        if (this.m_lineState != LineState.OnLine){
            this.onError(new Error('tcpclient offline!'));
            return;
        }

        let sid = BaseFn.globalID();
        param.rpcid = sid;

        let timer: any = setTimeout(()=>{
            clearTimeout(timer);
            timer = -1;
            delete this.m_rpcQueue[sid];
            cb(new Error('timeout'), null);
        }, BaseFn._second(10));

        this.m_rpcQueue[sid] = (result: any)=>{
            if (timer != -1){
                clearTimeout(timer);
                cb(null, result);
                delete this.m_rpcQueue[sid];
            }
        };

        this.sendMsg(param);
     }

     /**
      * 定义消息分发
      * @param packetType 消息类型
      * @param cb 回调函数
      */
     router(packetType: any, cb: (result: any)=>void){
        if (typeof packetType == 'string'){
            this.m_router[packetType] = cb;
        } else if (packetType.cmd){
            this.m_router[packetType.cmd] = cb;
        }
        return this;
     }

     /**
      * 消息分发函数
      * @param buffer 消息
      */
     dispatcher(buffer: any){
         let str = '';
         if (typeof buffer != 'string'){
            str = buffer.toString('utf8');
         } else {
            str = buffer;
         }

        let jsonmsg = null;
        try{
            jsonmsg = JSON.parse(str);
        } catch(err) {
            this.onError(new Error('json parse recv packet failed!'));
        }  
        
        let rpcid = jsonmsg.rpcid;

        // 如果是rpc调用结果
        if (rpcid && this.m_rpcQueue[rpcid]) {
            this.m_rpcQueue[rpcid](jsonmsg);
            return;
        }

        // 消息分发
        if (this.m_server) {
            this.m_server.dispatcher(this, jsonmsg);
        } else {
            if (jsonmsg.cmd && this.m_router[jsonmsg.cmd]){
                this.m_router[jsonmsg.cmd](jsonmsg);
            }
        }
     }
 }

 /** TCP服务器 */
 export class TcpServer extends Server{
     m_server: tcpnet.Server | null;

     constructor(){
         super(NetType.Tcp);
         this.m_server = null;
     }

     /**
      * 启动服务器
      * @param port 端口
      */
     start(port: Number){
         this.m_server = tcpnet.createServer(this.onIncomming.bind(this));

         this.m_server.on('error', err=>{
             this.on('error', null, err);
         });

         this.m_server.listen(port, ()=>{
            this.on('start');
         });
     }

     /**
      * 响应连接接入事件
      * @param socket 连入的链接
      */
     onIncomming(socket: tcpnet.Socket){
        let accept = this.on('duan', socket);
        if (accept == true || accept == null){
            let conn = new TcpClient(socket);
            this.m_clients.push(conn);
            this.on('newconn', conn);
            return true;
        }
        return false;
     }
 }

 /** TCP客户端 */
 export class TcpClient extends Client{
     m_socket: tcpnet.Socket|null;
     m_recvBuffer: Buffer;
     m_recvUsed: number;
     constructor(socket: tcpnet.Socket|null = null, server: TcpServer|null = null){
         super(NetType.Tcp, server);
         this.m_socket = socket;
         this.m_recvBuffer = Buffer.alloc(MaxPacketSize);
         this.m_recvUsed = 0;
         if (socket){
             this.bindFuncs(socket);
             this.m_connectedTime = BaseFn.getTimeMS();
             this.m_lineState = LineState.OnLine;
             this.m_remoteAddr = socket.remoteAddress + ':' + socket.remotePort;
        }
     }
     
     bindFuncs(socket: tcpnet.Socket){
        socket.on('error', this.onError.bind(this))
        .on('data', this.onData.bind(this))
        .on('end', this.onEnd.bind(this))
     }

     connectTo(host: string, port: number, cb: ()=>void){
        this.m_socket = tcpnet.connect(port, host, ()=>{
            cb();
            this.m_remoteAddr = host + ':' + port;
        });
        
        this.bindFuncs(this.m_socket);
     }

     send(buffer: Buffer, end: boolean){
         if (this.m_socket){
             end ? this.m_socket.end(buffer) : this.m_socket.write(buffer);
         }
     }

     close(){
         if (this.m_socket)
            this.m_socket.end();
     }
 
     onData(buffer: Buffer){
        this.m_lastRecvTime = BaseFn.getTimeMS();

        // 数据写入接收缓冲
        buffer.copy(this.m_recvBuffer, this.m_recvUsed);
        this.m_recvUsed += buffer.length;

        // 收到错误消息包，断开此链接
        if (!this.checkMsg(this.m_recvBuffer)) {
            this.onError(new Error('recive error packet'));
            this.close();
        } else {

            // 当前包大小
            let cursize = this.m_recvBuffer.readUInt32LE(2);
            // 收到半包，继续等待
            if (cursize > this.m_recvUsed) return;

            let offset = 0;
            while (offset < this.m_recvUsed) {
                // 取出一个完整包
                let msg = this.m_recvBuffer.slice(offset, offset + cursize);
                let unzSize = msg.readUInt32LE(6);
                if (unzSize > 0) {
                    zlib.inflate(msg.slice(10), (err, buff) => {
                        if (!err) {
                            this.dispatcher(buff);
                        } else {
                            this.onError(err);
                        }
                    });
                } else {
                    this.dispatcher(msg.slice(10));
                }

                offset += cursize;
                if (offset >= this.m_recvUsed) {
                    this.m_recvUsed = 0;
                    return;
                } else {
                    // 不够读出下一个包体大小
                    if (offset + 6 > this.m_recvUsed) {
                        let size = this.m_recvUsed - offset;
                        BaseFn.moveBufferSelf(this.m_recvBuffer, { begin: offset, end: this.m_recvUsed }, { begin: 0, end: size });
                        this.m_recvUsed = size;
                    } else {
                        cursize = this.m_recvBuffer.readUInt32LE(offset + 2);

                        // 只剩下半包可读
                        if (offset + cursize > this.m_recvUsed) {
                            let size = this.m_recvUsed - offset;
                            BaseFn.moveBufferSelf(this.m_recvBuffer, { begin: offset, end: this.m_recvUsed }, { begin: 0, end: size });
                            this.m_recvUsed = size;
                            return;
                        }

                    }
                }
            }
        }
     }

 }

 /*export class UdpServer extends Server{

 }

 export class UdpClient extends Client{

 }*/

 /** websocket服务器 */
 export class WsServer extends Server {
     m_httpServer: http.Server|null;
     m_wsServer: websocket.server|null;
     m_protocol: string;

     constructor(protocol: string){
         super(NetType.WebSocket);
         this.m_httpServer = null;
         this.m_wsServer = null;
         this.m_protocol = protocol;
     }

    start(port: number){
        this.m_httpServer = http.createServer();

        this.m_httpServer.on("error", err => {
            this.on('error', null, err);
        });

        //在指定的端口监听服务
        this.m_httpServer.listen(port, () => {
            this.on('start');
        });

        try {
            // websocket server
            this.m_wsServer = new websocket.server({
                'httpServer': this.m_httpServer,
                autoAcceptConnections: false
            });
        } catch (err) {
            this.on('error', null, err);
            return;
        }

        // 连接请求
        this.m_wsServer.on('request', this.onIncomming.bind(this));
    }
    
    onIncomming(request: websocket.request){

        if (request.requestedProtocols.indexOf(this.m_protocol) === -1) {
            request.reject();
            this.on('error', new Error('client reject. ws protocol wrong. want ' + this.m_protocol
                + ' get ' + request.requestedProtocols));
            return false;
        }

        let accept = this.on('incomming', request);
        if (accept == true || accept == null){
            let socket = request.accept(this.m_protocol, request.origin);
            let client = new WsClient(socket, this);
            this.m_clients.push(client);
            this.on('newconn', client);
            return true;
        }

        request.reject();
        return false;
    }
 }

 /** websocket客户端 */
 export class WsClient extends Client {
     m_socket: websocket.connection|null;
     m_url: string;
    constructor(socket: websocket.connection|null = null, server: Server|null = null){
        super(NetType.WebSocket, server);
        this.m_socket = socket;
        this.m_url = '';
        if (socket){
            this.bindFuncs(socket);
            this.m_lineState = LineState.OnLine;
        }
    }

    bindFuncs(connection: websocket.connection){
        connection.on('error', this.onError.bind(this))
        .on('close', this.onEnd.bind(this))
        .on('message', this.onData.bind(this));
    }

    connectTo(host: string, port: number|null, cb: ()=>void){

        let tmp = host.match(/(ws:\/\/[\w\.:]+)\/*([\w\-\.]*)/);
        if (!tmp || tmp.length != 3) {
            this.onError(new Error('websocket connect failed. url error: ' + host));
            return;
        }

        let client = new websocket.client();

        client.on('connect', connection=>{
            this.m_socket = connection;
            this.m_remoteAddr = host;
            this.bindFuncs(connection);
            cb();
        })
        .on('connectFailed',  err=>{
             this.onError(err);
        });

        client.connect(tmp[1], tmp[2]);
    }

    send(buffer: Buffer, end: boolean){
        if (this.m_socket){
            if (end == true){
                 this.m_socket.sendBytes(buffer);
                 this.m_socket.close();
            } else {
                 this.m_socket.sendBytes(buffer);
            }
        }
    }

    close(){
        if (this.m_socket)
           this.m_socket.close();
    }
    
    onData(msg: websocket.IMessage){
        this.m_lastRecvTime = BaseFn.getTimeMS();
        if (msg.type === 'binary') {
            let buff = msg.binaryData;
            if (buff){
                if (!this.checkMsg(buff)){
                    this.onError(new Error('recive error packet'));
                    this.close();
                    return;
                }

                let unzSize = buff.readUInt32LE(6);
                if (unzSize > 0) {
                    zlib.inflate(buff.slice(10), (err, buff) => {
                        if (!err) {
                            this.dispatcher(buff);
                        } else {
                            this.onError(new Error('recive error packet'));
                        }
                    });
                } else {
                    this.dispatcher(buff.slice(10));
                }
            }
        } /*else if (msg.type == 'utf8' && msg.utf8Data){
            this.dispatcher(msg.utf8Data);
        }*/
    }
    
 }
